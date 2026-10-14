const { Pool } = require('pg');
const { describeConnectionError } = require('./errors');

function createPool(databaseConfig) {
  const pool = new Pool(databaseConfig);

  pool.on('error', (error) => {
    console.error(`Conexão PostgreSQL interrompida: ${describeConnectionError(error)}`);
  });

  return pool;
}

module.exports = { createPool };
