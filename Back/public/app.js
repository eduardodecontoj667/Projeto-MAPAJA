/* A interface consulta a API pública; os dados e permissões são validados no backend. */
(() => {
  'use strict';

  const PAGE_SIZE = 100;
  const INITIAL_VIEW = [-27.23389, -52.02778];
  const elements = {
    form: document.getElementById('busca-form'),
    search: document.getElementById('busca'),
    category: document.getElementById('categoria'),
    clear: document.getElementById('limpar-filtros'),
    categoryNotice: document.getElementById('categorias-aviso'),
    categoryMessage: document.getElementById('categorias-mensagem'),
    categoryRetry: document.getElementById('repetir-categorias'),
    results: document.getElementById('resultados'),
    status: document.getElementById('resultado-status'),
    count: document.getElementById('quantidade'),
    list: document.getElementById('locais-lista'),
    empty: document.getElementById('resultados-estado'),
    emptyTitle: document.getElementById('estado-titulo'),
    emptyDescription: document.getElementById('estado-descricao'),
    retry: document.getElementById('repetir-busca'),
    more: document.getElementById('carregar-mais'),
    details: document.getElementById('detalhes'),
    detailPlaceholder: document.getElementById('detalhes-vazio'),
    detailContent: document.getElementById('detalhes-conteudo'),
    mapNotice: document.getElementById('mapa-aviso'),
    mapMessage: document.getElementById('mapa-mensagem'),
    mapRetry: document.getElementById('repetir-mapa')
  };
  const state = {
    places: [], total: 0, offset: 0, selected: null,
    filters: { search: '', category: '' }, request: null, lastAppend: false,
    map: null, markers: new Map(), tiles: null
  };
  const numberFormat = new Intl.NumberFormat('pt-BR');
  const scoreFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function coordinates(place) {
    const latitude = place.latitude;
    const longitude = place.longitude;
    return typeof latitude === 'number' && typeof longitude === 'number'
      && Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
      ? [latitude, longitude] : null;
  }

  function categories(place) {
    return Array.isArray(place.categorias) ? place.categorias : [];
  }

  function categoryLabels(place) {
    return categories(place).flatMap(category => {
      const subcategories = Array.isArray(category.subcategorias) ? category.subcategorias : [];
      return [category.nome, ...subcategories.map(subcategory => subcategory.nome)].filter(Boolean);
    });
  }

  function addressText(place) {
    const address = place.endereco || 'Endereço não informado';
    const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const normalizedAddress = normalize(address);
    const parts = [address];
    if (place.cidade && !normalizedAddress.includes(normalize(place.cidade))) parts.push(place.cidade);
    if (place.estado && !normalizedAddress.split(/[^a-z0-9]+/).includes(normalize(place.estado))) parts.push(place.estado);
    return parts.join(' · ');
  }

  function hasRating(place) {
    return place.nota_media !== null && place.nota_media !== undefined
      && Number.isFinite(Number(place.nota_media)) && Number(place.total_avaliacoes) > 0;
  }

  function ratingText(place) {
    if (!hasRating(place)) return 'Ainda sem avaliações';
    const count = Number(place.total_avaliacoes);
    return `★ ${scoreFormat.format(Number(place.nota_media))} · ${numberFormat.format(count)} ${count === 1 ? 'avaliação' : 'avaliações'}`;
  }

  function mapWarning(message) {
    elements.mapMessage.textContent = message;
    elements.mapNotice.hidden = false;
  }

  function initializeMap() {
    if (!window.L) {
      mapWarning('Não foi possível carregar o mapa. Consulte os estabelecimentos na lista.');
      return;
    }
    state.map = L.map('map').setView(INITIAL_VIEW, 13);
    state.tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);
    state.tiles.on('tileerror', () => mapWarning('O mapa base não carregou por completo. Consulte os estabelecimentos na lista.'));
    state.tiles.on('tileload', () => { elements.mapNotice.hidden = true; });
  }

  function markerIcon(selected = false) {
    // O HTML é fixo: nenhum dado recebido da API é interpolado aqui.
    return L.divIcon({
      className: 'map-pin-icon',
      html: selected ? '<div class="map-pin selected"></div>' : '<div class="map-pin"></div>',
      iconSize: [30, 38], iconAnchor: [15, 37], popupAnchor: [0, -32]
    });
  }

  function renderMarkers() {
    if (!state.map) return;
    state.markers.forEach(marker => marker.remove());
    state.markers.clear();
    state.places.forEach(place => {
      const position = coordinates(place);
      if (!position) return;
      const popup = node('div', 'map-popup');
      popup.append(node('strong', 'map-popup-title', place.nome), node('span', 'map-popup-address', addressText(place)));
      const detailsButton = node('button', 'button secondary', 'Ver detalhes');
      detailsButton.type = 'button';
      detailsButton.addEventListener('click', () => selectPlace(place.id, true));
      popup.append(detailsButton);
      const marker = L.marker(position, { icon: markerIcon(place.id === state.selected), title: place.nome, alt: place.nome })
        .addTo(state.map).bindPopup(popup);
      marker.on('click', () => selectPlace(place.id, false));
      state.markers.set(place.id, marker);
    });
    const positions = state.places.map(coordinates).filter(Boolean);
    if (positions.length) state.map.fitBounds(positions, { padding: [44, 44], maxZoom: 16, animate: false });
    else state.map.setView(INITIAL_VIEW, 13, { animate: false });
  }

  function renderList() {
    elements.list.replaceChildren();
    state.places.forEach(place => {
      const item = node('li');
      const button = node('button', 'place-card');
      button.type = 'button';
      button.dataset.id = String(place.id);
      button.setAttribute('aria-pressed', String(place.id === state.selected));
      button.setAttribute('aria-controls', 'detalhes-conteudo');
      button.append(node('span', 'place-name', place.nome));
      const labels = categoryLabels(place);
      if (labels.length) button.append(node('span', 'place-categories', labels.join(' · ')));
      button.append(node('span', 'place-address', addressText(place)));
      button.append(node('span', `rating${hasRating(place) ? '' : ' unrated'}`, ratingText(place)));
      if (!coordinates(place)) button.append(node('span', 'place-address', 'Localização indisponível no mapa'));
      button.addEventListener('click', () => selectPlace(place.id, true));
      item.append(button);
      elements.list.append(item);
    });
    elements.count.textContent = numberFormat.format(state.total);
    elements.more.hidden = state.offset >= state.total;
  }

  function resetDetails(focusList = false) {
    const selectedButton = [...elements.list.querySelectorAll('.place-card')]
      .find(button => button.dataset.id === String(state.selected));
    state.selected = null;
    elements.detailContent.replaceChildren();
    elements.detailContent.hidden = true;
    elements.detailPlaceholder.hidden = false;
    elements.details.setAttribute('aria-labelledby', 'detalhes-titulo');
    elements.list.querySelectorAll('.place-card').forEach(button => button.setAttribute('aria-pressed', 'false'));
    state.markers.forEach(marker => { marker.setIcon(markerIcon()); marker.closePopup(); });
    if (focusList) (selectedButton || elements.results).focus();
  }

  function addField(list, label, value) {
    if (!value) return;
    const row = node('div');
    const description = node('dd');
    if (value instanceof Node) description.append(value);
    else description.textContent = value;
    row.append(node('dt', '', label), description);
    list.append(row);
  }

  function safeSite(site) {
    if (typeof site !== 'string' || !site.trim()) return null;
    try {
      const url = new URL(site.trim());
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }

  function selectPlace(id, focusDetails) {
    const place = state.places.find(item => item.id === id);
    if (!place) return;
    state.selected = id;
    elements.list.querySelectorAll('.place-card').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.id === String(id))));
    state.markers.forEach((marker, markerId) => marker.setIcon(markerIcon(markerId === id)));
    elements.detailContent.replaceChildren();
    elements.detailPlaceholder.hidden = true;
    elements.detailContent.hidden = false;
    const header = node('div', 'detail-header');
    const close = node('button', 'close-details', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar detalhes do estabelecimento');
    close.addEventListener('click', () => resetDetails(true));
    header.append(node('span', '', 'CONHEÇA O LOCAL'), close);
    const title = node('h2', 'detail-name', place.nome);
    title.id = 'local-titulo';
    title.tabIndex = -1;
    elements.details.setAttribute('aria-labelledby', 'local-titulo');
    const labels = node('ul', 'detail-categories');
    categoryLabels(place).forEach(label => labels.append(node('li', '', label)));
    const fields = node('dl', 'detail-fields');
    addField(fields, 'Endereço', addressText(place));
    addField(fields, 'CEP', place.cep);
    addField(fields, 'Horário de funcionamento', place.horario_funcionamento || 'Não informado');
    if (place.telefone) {
      const phone = String(place.telefone).replace(/[^\d+]/g, '');
      if (/^\+?\d+$/.test(phone)) {
        const link = node('a', '', place.telefone);
        link.href = `tel:${phone}`;
        addField(fields, 'Telefone', link);
      } else addField(fields, 'Telefone', place.telefone);
    }
    const site = safeSite(place.site);
    if (site) {
      const link = node('a', '', 'Visitar site ↗');
      link.href = site;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `Visitar site de ${place.nome} (abre em nova aba)`);
      addField(fields, 'Site', link);
    }
    elements.detailContent.append(header, title, node('p', `rating${hasRating(place) ? '' : ' unrated'}`, ratingText(place)), labels, fields);
    if (place.descricao) {
      const description = node('div', 'detail-description');
      description.append(node('h3', '', 'Sobre o estabelecimento'), node('p', '', place.descricao));
      elements.detailContent.append(description);
    }
    const marker = state.markers.get(id);
    if (marker && focusDetails) {
      state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 15), { animate: false });
      marker.openPopup();
    }
    if (!coordinates(place)) elements.detailContent.append(node('p', 'detail-location', 'A localização deste estabelecimento não está disponível no mapa.'));
    if (focusDetails) {
      title.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 1199px)').matches) elements.details.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }

  async function fetchJSON(url, signal) {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro?.mensagem || 'Não foi possível concluir a consulta.');
    if (!Array.isArray(data.dados)) throw new Error('A resposta da consulta não pôde ser carregada.');
    return data;
  }

  async function loadCategories() {
    elements.categoryRetry.disabled = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const data = await fetchJSON('/api/categorias', controller.signal);
      elements.category.replaceChildren();
      const all = node('option', '', 'Todas as categorias');
      all.value = '';
      elements.category.append(all);
      data.dados.forEach(category => {
        const option = node('option', '', category.nome);
        option.value = category.id;
        elements.category.append(option);
      });
      elements.category.value = state.filters.category;
      elements.category.disabled = false;
      elements.categoryNotice.hidden = true;
    } catch {
      elements.category.disabled = true;
      elements.categoryMessage.textContent = 'As categorias não puderam ser carregadas. Você ainda pode buscar estabelecimentos.';
      elements.categoryNotice.hidden = false;
    } finally {
      clearTimeout(timer);
      elements.categoryRetry.disabled = false;
    }
  }

  async function loadPlaces(append = false) {
    state.request?.abort();
    const controller = new AbortController();
    state.request = controller;
    state.lastAppend = append;
    const timer = setTimeout(() => controller.abort('timeout'), 15000);
    elements.results.setAttribute('aria-busy', 'true');
    elements.status.textContent = append ? 'Carregando mais estabelecimentos…' : 'Carregando estabelecimentos…';
    elements.empty.hidden = true;
    elements.retry.hidden = true;
    elements.more.disabled = true;
    if (!append) {
      state.places = [];
      state.total = 0;
      state.offset = 0;
      resetDetails();
      renderList();
      renderMarkers();
      elements.count.textContent = '—';
    }
    const params = new URLSearchParams({ limite: PAGE_SIZE, deslocamento: state.offset });
    if (state.filters.search) params.set('busca', state.filters.search);
    if (state.filters.category) params.set('categoria_id', state.filters.category);
    try {
      const data = await fetchJSON(`/api/estabelecimentos?${params}`, controller.signal);
      if (state.request !== controller) return;
      const total = data.paginacao?.total;
      if (!Number.isSafeInteger(total) || total < 0) throw new Error('A resposta da consulta não pôde ser carregada.');
      const known = new Set(state.places.map(place => place.id));
      const next = data.dados.filter(place => !known.has(place.id));
      state.places.push(...next);
      state.offset += data.dados.length;
      state.total = total;
      renderList();
      renderMarkers();
      if (!state.places.length) {
        const filtered = Boolean(state.filters.search || state.filters.category);
        elements.emptyTitle.textContent = filtered ? 'Nenhum estabelecimento encontrado' : 'Ainda não há estabelecimentos disponíveis';
        elements.emptyDescription.textContent = filtered ? 'Experimente outro nome ou selecione uma categoria diferente.' : 'Os locais aparecerão aqui assim que estiverem disponíveis.';
        elements.empty.hidden = false;
        elements.status.textContent = 'Nenhum resultado.';
      } else {
        const withoutLocation = state.places.filter(place => !coordinates(place)).length;
        elements.status.textContent = `${numberFormat.format(state.places.length)} de ${numberFormat.format(total)} ${total === 1 ? 'estabelecimento' : 'estabelecimentos'}${withoutLocation ? ` · ${withoutLocation} sem localização no mapa` : ''}.`;
        if (!data.dados.length && state.offset < total) {
          elements.more.hidden = true;
          elements.status.textContent += ' A lista mudou durante a consulta. Busque novamente para atualizar.';
        }
      }
    } catch {
      if (state.request !== controller) return;
      elements.status.textContent = append ? 'Não foi possível carregar mais resultados. Os locais já carregados continuam disponíveis.' : 'Não foi possível carregar os estabelecimentos.';
      if (!state.places.length) {
        elements.emptyTitle.textContent = 'Não foi possível consultar os locais';
        elements.emptyDescription.textContent = controller.signal.aborted ? 'A consulta demorou mais que o esperado. Tente novamente.' : 'Verifique sua conexão e tente novamente.';
        elements.empty.hidden = false;
      }
      elements.more.hidden = true;
      elements.retry.hidden = false;
    } finally {
      clearTimeout(timer);
      if (state.request === controller) {
        elements.results.setAttribute('aria-busy', 'false');
        elements.more.disabled = false;
      }
    }
  }

  function applyFilters() {
    state.filters.search = elements.search.value.trim();
    state.filters.category = elements.category.value;
    elements.clear.hidden = !state.filters.search && !state.filters.category;
    loadPlaces();
  }

  elements.form.addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
  elements.category.addEventListener('change', applyFilters);
  elements.clear.addEventListener('click', () => {
    elements.search.value = '';
    elements.category.value = '';
    applyFilters();
  });
  elements.retry.addEventListener('click', () => loadPlaces(state.lastAppend));
  elements.more.addEventListener('click', () => loadPlaces(true));
  elements.categoryRetry.addEventListener('click', loadCategories);
  elements.mapRetry.addEventListener('click', () => {
    if (state.tiles) state.tiles.redraw();
    else window.location.reload();
  });
  initializeMap();
  loadCategories();
  loadPlaces();
})();
