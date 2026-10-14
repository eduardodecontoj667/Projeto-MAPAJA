const assert = require('node:assert/strict');
const { randomInt, randomUUID } = require('node:crypto');
const test = require('node:test');
const { readConfig } = require('../src/config');
const { createPool } = require('../src/database/pool');
const { serveApp } = require('./helpers');

// Estes testes usam o banco configurado pela aplicação. Todas as inserções
// ficam em uma única conexão/transação, desfeita com ROLLBACK mesmo em falhas.
async function insertFixtures(client) {
  const marker = `t${randomUUID().replaceAll('-', '')}`;
  // IDs explícitos evitam avançar sequências SERIAL, que não são revertidas
  // pelo ROLLBACK do PostgreSQL.
  const baseId = randomInt(1_000_000_000, 1_999_999_900);
  const ids = {
    categoryA: baseId, categoryB: baseId + 1, categoryEmpty: baseId + 2,
    subcategoryA1: baseId + 3, subcategoryA2: baseId + 4, subcategoryB: baseId + 5,
    alpha: baseId + 6, beta: baseId + 7, gamma: baseId + 8, inactive: baseId + 9,
    literal: baseId + 10, similar: baseId + 11, injection: baseId + 12,
    userA: baseId + 13, userB: baseId + 14,
    ratingA: baseId + 15, ratingB: baseId + 16,
  };

  await client.query(
    `INSERT INTO public.categorias (id_categoria, nome) VALUES ($1, $2), ($3, $4), ($5, $6)`,
    [ids.categoryA, `${marker} Comércio`, ids.categoryB, `${marker} Alimentação`,
      ids.categoryEmpty, `${marker} Vazio`],
  );
  await client.query(
    `INSERT INTO public.subcategorias (id_subcategoria, id_categoria, nome)
     VALUES ($1, $2, $3), ($4, $2, $5), ($6, $7, $8)`,
    [ids.subcategoryA1, ids.categoryA, `${marker} Farmácia`, ids.subcategoryA2,
      `${marker} Mercado`, ids.subcategoryB, ids.categoryB, `${marker} Restaurante`],
  );

  const businesses = [
    ['alpha', 'Alfa Loja', true, `${marker} descricao-unica`],
    ['beta', 'Beta Loja', true, null],
    ['gamma', 'Gama Loja', true, null],
    ['inactive', 'Inativo Loja', false, null],
    ['literal', 'Literal !%_', true, null],
    ['similar', 'Literal XX', true, null],
    ['injection', "Texto ' OR 1=1 --", true, null],
  ];
  for (const [key, name, active, description] of businesses) {
    await client.query(
      `INSERT INTO public.estabelecimentos
       (id_estabelecimento, nome, endereco, cep, latitude, longitude, horario_funcionamento,
        telefone, descricao, ativo, cidade, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [ids[key], `${marker} ${name}`, 'Rua do Teste, 123', '01000-000',
        -23.551234, -46.633456, key === 'alpha' ? '09:00–18:00' : null,
        key === 'alpha' ? '11999990000' : null,
        description, active, 'São Paulo', 'SP'],
    );
  }

  for (const [businessKey, subcategoryKey] of [
    ['alpha', 'subcategoryA1'], ['alpha', 'subcategoryA2'], ['alpha', 'subcategoryB'],
    ['beta', 'subcategoryA1'], ['gamma', 'subcategoryB'], ['inactive', 'subcategoryA1'],
    ['literal', 'subcategoryB'], ['similar', 'subcategoryB'], ['injection', 'subcategoryB'],
  ]) {
    await client.query(
      `INSERT INTO public.estabelecimento_subcategoria (id_estabelecimento, id_subcategoria)
       VALUES ($1, $2)`,
      [ids[businessKey], ids[subcategoryKey]],
    );
  }
  await client.query(
    `INSERT INTO public.usuarios (id_usuario, nome, email, senha_hash)
     VALUES ($1, $2, $3, $4), ($5, $2, $6, $4)`,
    [ids.userA, `${marker} Usuário`, `${marker}a@example.invalid`, 'fixture-sem-login',
      ids.userB, `${marker}b@example.invalid`],
  );
  await client.query(
    `INSERT INTO public.avaliacoes (id_avaliacao, id_usuario, id_estabelecimento, nota)
     VALUES ($1, $2, $3, 5), ($4, $5, $3, 2)`,
    [ids.ratingA, ids.userA, ids.alpha, ids.ratingB, ids.userB],
  );

  return { ids, marker };
}

function pathFor(query) {
  return `/api/estabelecimentos?${new URLSearchParams(query)}`;
}

test('catálogo público com PostgreSQL real e fixtures revertidas', async (t) => {
  const pool = createPool(readConfig().database);
  let client;
  let fixtures;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    fixtures = await insertFixtures(client);
    const { ids, marker } = fixtures;
    const request = await serveApp(t, client);

    await t.test('categorias e subcategorias são agrupadas sem duplicação', async () => {
      const { status, body } = await request('/api/categorias');
      assert.equal(status, 200);
      assert.ok(Array.isArray(body.dados));
      const category = body.dados.find((item) => item.id === ids.categoryA);
      assert.equal(category.nome, `${marker} Comércio`);
      assert.deepEqual(new Set(category.subcategorias.map((item) => item.id)),
        new Set([ids.subcategoryA1, ids.subcategoryA2]));
      assert.equal(category.subcategorias.length, 2);
      assert.deepEqual(body.dados.find((item) => item.id === ids.categoryEmpty).subcategorias, []);
    });

    await t.test('lista apenas ativos e converte coordenadas e avaliações para números', async () => {
      const { status, body } = await request(pathFor({ busca: marker }));
      assert.equal(status, 200);
      assert.equal(body.dados.length, 6);
      assert.deepEqual(body.paginacao, { limite: 100, deslocamento: 0, total: 6 });
      assert.ok(body.dados.every((item) => item.id !== ids.inactive));
      const alpha = body.dados.find((item) => item.id === ids.alpha);
      assert.equal(alpha.latitude, -23.551234);
      assert.equal(alpha.longitude, -46.633456);
      assert.equal(alpha.nota_media, 3.5);
      assert.equal(alpha.total_avaliacoes, 2, 'Relações N:N não podem multiplicar as avaliações.');
      assert.equal(alpha.endereco, 'Rua do Teste, 123');
      assert.equal(alpha.cep, '01000-000');
      assert.equal(alpha.horario_funcionamento, '09:00–18:00');
      assert.equal(alpha.telefone, '11999990000');
      assert.equal(alpha.cidade, 'São Paulo');
      assert.equal(alpha.estado, 'SP');
      assert.equal(alpha.descricao, `${marker} descricao-unica`);
      const beta = body.dados.find((item) => item.id === ids.beta);
      assert.equal(beta.nota_media, null);
      assert.equal(beta.total_avaliacoes, 0);
    });

    await t.test('busca ignora maiúsculas e espaços externos e inclui descrições', async () => {
      for (const busca of [`  ${marker.toUpperCase()} ALFA  `, `${marker} descricao-unica`]) {
        const { status, body } = await request(pathFor({ busca }));
        assert.equal(status, 200);
        assert.deepEqual(body.dados.map((item) => item.id), [ids.alpha]);
      }
    });

    await t.test('nomes de categorias e subcategorias são pesquisáveis', async () => {
      const { body: bySubcategory } = await request(pathFor({ busca: `${marker} Mercado` }));
      assert.deepEqual(bySubcategory.dados.map((item) => item.id), [ids.alpha]);
      const { body: byCategory } = await request(pathFor({ busca: `${marker} Comércio` }));
      assert.deepEqual(new Set(byCategory.dados.map((item) => item.id)), new Set([ids.alpha, ids.beta]));
    });

    await t.test('filtrar categoria preserva todas as categorias e subcategorias do local', async () => {
      const { status, body } = await request(pathFor({ categoria_id: ids.categoryA, busca: marker }));
      assert.equal(status, 200);
      assert.deepEqual(new Set(body.dados.map((item) => item.id)), new Set([ids.alpha, ids.beta]));
      const alpha = body.dados.find((item) => item.id === ids.alpha);
      assert.equal(alpha.categorias.length, 2);
      assert.deepEqual(new Set(alpha.categorias.map((item) => item.id)),
        new Set([ids.categoryA, ids.categoryB]));
      const categoryA = alpha.categorias.find((item) => item.id === ids.categoryA);
      assert.equal(categoryA.subcategorias.length, 2);
      assert.deepEqual(new Set(categoryA.subcategorias.map((item) => item.id)),
        new Set([ids.subcategoryA1, ids.subcategoryA2]));
      assert.equal(alpha.categorias.find((item) => item.id === ids.categoryB).subcategorias.length, 1);
    });

    await t.test('busca e filtro de categoria são combinados', async () => {
      const { status, body } = await request(pathFor({ categoria_id: ids.categoryA, busca: `${marker} Alfa` }));
      assert.equal(status, 200);
      assert.deepEqual(body.dados.map((item) => item.id), [ids.alpha]);
      assert.equal(body.paginacao.total, 1);
      const { body: outsideCategory } = await request(pathFor({ categoria_id: ids.categoryA, busca: `${marker} Gama` }));
      assert.deepEqual(outsideCategory.dados, []);
      assert.equal(outsideCategory.paginacao.total, 0);
    });

    await t.test('paginação mantém total dos registros mesmo depois da última página', async () => {
      const first = await request(pathFor({ busca: marker, limite: '2', deslocamento: '0' }));
      const second = await request(pathFor({ busca: marker, limite: '2', deslocamento: '2' }));
      assert.equal(first.body.dados.length, 2);
      assert.equal(second.body.dados.length, 2);
      assert.deepEqual(second.body.paginacao, { limite: 2, deslocamento: 2, total: 6 });
      assert.ok(second.body.dados.every((item) => !first.body.dados.some((other) => other.id === item.id)));
      const { status, body } = await request(pathFor({ busca: marker, limite: '2', deslocamento: '100' }));
      assert.equal(status, 200);
      assert.deepEqual(body.dados, []);
      assert.deepEqual(body.paginacao, { limite: 2, deslocamento: 100, total: 6 });
    });

    await t.test('categoria sem locais retorna estado vazio válido', async () => {
      const { status, body } = await request(pathFor({ categoria_id: ids.categoryEmpty }));
      assert.equal(status, 200);
      assert.deepEqual(body, { dados: [], paginacao: { limite: 100, deslocamento: 0, total: 0 } });
    });

    await t.test('percentual, sublinhado e texto com sintaxe SQL são buscados literalmente', async () => {
      for (const [busca, expectedId] of [
        [`${marker} Literal !%_`, ids.literal],
        [`${marker} Texto ' OR 1=1 --`, ids.injection],
      ]) {
        const { status, body } = await request(pathFor({ busca }));
        assert.equal(status, 200);
        assert.deepEqual(body.dados.map((item) => item.id), [expectedId]);
        assert.equal(body.paginacao.total, 1);
      }
    });
  } finally {
    try {
      if (client) {
        try {
          if (transactionStarted) await client.query('ROLLBACK');
          if (fixtures) {
            const cleanup = await client.query(
              `SELECT (
                (SELECT COUNT(*) FROM public.categorias WHERE id_categoria = ANY($1::integer[])) +
                (SELECT COUNT(*) FROM public.subcategorias WHERE id_subcategoria = ANY($1::integer[])) +
                (SELECT COUNT(*) FROM public.estabelecimentos WHERE id_estabelecimento = ANY($1::integer[])) +
                (SELECT COUNT(*) FROM public.usuarios WHERE id_usuario = ANY($1::integer[])) +
                (SELECT COUNT(*) FROM public.avaliacoes WHERE id_avaliacao = ANY($1::integer[])) +
                (SELECT COUNT(*) FROM public.estabelecimento_subcategoria WHERE id_estabelecimento = ANY($1::integer[]))
              )::integer AS registros`,
              [Object.values(fixtures.ids)],
            );
            assert.equal(cleanup.rows[0].registros, 0, 'O ROLLBACK deve remover todas as fixtures.');
          }
        } finally {
          client.release();
        }
      }
    } finally {
      await pool.end();
    }
  }
});
