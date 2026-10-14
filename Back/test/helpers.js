const { once } = require('node:events');
const { createApp } = require('../app');

async function serveApp(t, database) {
  const server = createApp(database).listen(0, '127.0.0.1');
  await once(server, 'listening');

  t.after(async () => {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server.closeAllConnections();
    await closed;
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return async function request(path) {
    const response = await fetch(`${baseUrl}${path}`);
    return { status: response.status, body: await response.json() };
  };
}

module.exports = { serveApp };
