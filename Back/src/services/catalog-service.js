class RequestValidationError extends Error {}

const allowedParameters = new Set(['busca', 'categoria_id', 'limite', 'deslocamento']);

function readText(query, name, fallback = '') {
  if (query[name] === undefined) return fallback;
  if (typeof query[name] !== 'string') {
    throw new RequestValidationError(`Informe ${name} uma única vez como texto.`);
  }
  return query[name].trim();
}

function readInteger(query, name, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const text = readText(query, name, String(fallback));
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RequestValidationError(
      name === 'limite'
        ? 'limite deve ser um número inteiro entre 1 e 100.'
        : 'deslocamento deve ser um número inteiro maior ou igual a zero.',
    );
  }
  return value;
}

function parseFilters(query) {
  if (Object.keys(query).some((name) => !allowedParameters.has(name))) {
    throw new RequestValidationError('Parâmetro desconhecido. Use busca, categoria_id, limite ou deslocamento.');
  }

  const busca = readText(query, 'busca');
  if (busca.length > 160) {
    throw new RequestValidationError('A busca deve ter no máximo 160 caracteres.');
  }

  const categoriaText = readText(query, 'categoria_id');
  const categoriaId = categoriaText ? Number(categoriaText) : null;
  if (categoriaText && (!/^\d+$/.test(categoriaText)
      || !Number.isInteger(categoriaId) || categoriaId < 1 || categoriaId > 2147483647)) {
    throw new RequestValidationError('categoria_id deve ser um número inteiro positivo até 2147483647.');
  }

  return {
    busca,
    categoriaId,
    limite: readInteger(query, 'limite', 100, 1, 100),
    deslocamento: readInteger(query, 'deslocamento', 0, 0),
  };
}

function createCatalogService(repository) {
  return {
    async listCategories() {
      return { dados: await repository.listCategories() };
    },
    async listEstablishments(query) {
      return repository.listEstablishments(parseFilters(query));
    },
  };
}

module.exports = { createCatalogService, RequestValidationError };
