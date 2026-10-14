const express = require('express');
const path = require('node:path');
const { readConfig } = require('./src/config');
const { createPool } = require('./src/database/pool');
const { describeConnectionError } = require('./src/database/errors');
const { createCatalogRouter } = require('./src/routes/catalog-routes');

function createApp(pool) {
  const app = express();

  app.get('/api/health', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      await pool.query('SELECT 1');
      response.json({ status: 'ok', database: 'connected' });
    } catch (error) {
      console.error(`Verificação de conexão falhou: ${describeConnectionError(error)}`);
      response.status(503).json({ status: 'error', database: 'unavailable' });
    }
  });

  app.use('/api', createCatalogRouter(pool));
  app.use(express.static(path.join(__dirname, 'public')));
  return app;
}

async function startServer() {
  const config = readConfig();
  const pool = createPool(config.database);
  let server;

  try {
    await pool.query('SELECT 1');
    const app = createApp(pool);
    server = await new Promise((resolve, reject) => {
      const candidate = app.listen(config.port, (error) => {
        candidate.off('error', reject);
        if (error) reject(error);
        else resolve(candidate);
      });
      candidate.once('error', reject);
    });
  } catch (error) {
    await pool.end();
    throw error;
  }

  let closing = false;
  function shutdown() {
    if (closing) return;
    closing = true;

    const timeout = setTimeout(() => {
      console.error('O encerramento do servidor excedeu o tempo limite.');
      process.exit(1);
    }, 10000);
    timeout.unref();

    server.close(async (error) => {
      try {
        await pool.end();
        if (error) {
          console.error('Falha ao encerrar o servidor HTTP.');
          process.exitCode = 1;
        }
      } catch {
        console.error('Falha ao encerrar as conexões PostgreSQL.');
        process.exitCode = 1;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.log('Conexão com PostgreSQL confirmada.');
  console.log(`Servidor rodando em http://localhost:${config.port}`);
  return { server, pool, shutdown };
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(`Não foi possível iniciar o backend: ${describeConnectionError(error)}`);
    process.exitCode = 1;
  });
}

module.exports = { createApp, startServer };
