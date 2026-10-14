const assert = require('node:assert/strict');
const test = require('node:test');
const { serveApp } = require('./helpers');

test('parâmetros inválidos são recusados antes de acessar o banco', async (t) => {
  let queryCount = 0;
  const request = await serveApp(t, {
    async query() {
      queryCount += 1;
      throw new Error('Não deve consultar o banco para parâmetros inválidos.');
    },
  });

  const queries = [
    'categoria_id=sem-id',
    'categoria_id=11111111-1111-1111-1111-111111111111',
    'categoria_id=0',
    'categoria_id=-1',
    'categoria_id=1.5',
    'categoria_id=2147483648',
    'categoria_id=1&categoria_id=2',
    'categoria_id%5B%5D=1',
    'busca=primeira&busca=segunda',
    'busca%5B%5D=texto',
    `busca=${'x'.repeat(161)}`,
    'limite=0',
    'limite=101',
    'limite=-1',
    'limite=1.5',
    'limite=abc',
    'limite=',
    'limite=1&limite=2',
    'limite%5B%5D=1',
    'deslocamento=-1',
    'deslocamento=1.5',
    'deslocamento=abc',
    'deslocamento=',
    'deslocamento=9007199254740992',
    'deslocamento=0&deslocamento=1',
    'deslocamento%5B%5D=0',
  ];

  for (const query of queries) {
    await t.test(query, async () => {
      const { status, body } = await request(`/api/estabelecimentos?${query}`);
      assert.equal(status, 400);
      assert.equal(typeof body.erro?.mensagem, 'string');
      assert.equal(queryCount, 0, 'Entrada inválida não deve executar SQL.');
    });
  }
});

test('IDs inteiros válidos e filtros vazios chegam ao banco', async (t) => {
  let queryCount = 0;
  const request = await serveApp(t, {
    async query() {
      queryCount += 1;
      throw new Error('Falha proposital depois da validação.');
    },
  });

  for (const query of [
    'categoria_id=1',
    'categoria_id=2147483647',
    'categoria_id=',
    'categoria_id=%20%20',
    'busca=',
    'busca=%20%20',
    `busca=%20%20${'x'.repeat(160)}%20%20`,
    'limite=100&deslocamento=9007199254740991',
  ]) {
    const before = queryCount;
    const { status } = await request(`/api/estabelecimentos?${query}`);
    assert.equal(status, 503);
    assert.ok(queryCount > before);
  }
});

test('falhas do banco retornam 503 sem expor detalhes internos', async (t) => {
  const internalMessage = 'password=senha-interna host=servidor-interno SQL=SELECT segredo';
  const request = await serveApp(t, {
    async query() {
      throw new Error(internalMessage);
    },
  });

  for (const path of ['/api/estabelecimentos', '/api/categorias']) {
    const { status, body } = await request(path);
    assert.equal(status, 503);
    assert.equal(body.erro?.codigo, 'BANCO_INDISPONIVEL');
    assert.equal(typeof body.erro?.mensagem, 'string');
    assert.ok(!JSON.stringify(body).includes('senha-interna'));
    assert.ok(!JSON.stringify(body).includes('servidor-interno'));
    assert.ok(!JSON.stringify(body).includes('SELECT segredo'));
  }
});
