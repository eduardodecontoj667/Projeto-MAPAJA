const { readConfig } = require('../src/config');
const { createPool } = require('../src/database/pool');
const { describeConnectionError } = require('../src/database/errors');

const expectedTables = [
  'usuarios',
  'categorias',
  'subcategorias',
  'estabelecimentos',
  'estabelecimento_subcategoria',
  'avaliacoes',
  'favoritos',
  'historico',
];

async function checkDatabase() {
  let pool;
  try {
    const config = readConfig();
    pool = createPool(config.database);
    await pool.query('SELECT 1');
    console.log('Conexão com PostgreSQL confirmada.');

    const result = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [expectedTables],
    );

    const existingTables = new Set(result.rows.map((row) => row.table_name));
    const missingTables = expectedTables.filter((name) => !existingTables.has(name));

    if (missingTables.length) {
      console.error(`Tabelas ausentes ou não acessíveis no schema public: ${missingTables.join(', ')}.`);
      process.exitCode = 1;
      return;
    }

    console.log('As 8 tabelas esperadas estão presentes no schema public.');
  } catch (error) {
    console.error(`Verificação do banco falhou: ${describeConnectionError(error)}`);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

checkDatabase().catch(() => {
  console.error('Não foi possível encerrar a verificação do banco.');
  process.exitCode = 1;
});
