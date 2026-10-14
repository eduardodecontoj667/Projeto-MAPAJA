const path = require('node:path');

class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.code = 'CONFIG_ERROR';
  }
}

function requiredValue(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigurationError(`Preencha ${name} em Back/.env.`);
  }
  return value.trim();
}

function readPort(name, fallback) {
  const value = process.env[name] ?? String(fallback);
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError(`${name} deve ser uma porta entre 1 e 65535.`);
  }
  return port;
}

function readConfig() {
  try {
    // Caminho fixo: funciona com npm start e com node Back/app.js.
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new ConfigurationError('Não foi possível ler Back/.env.');
    }
  }

  const password = process.env.PGPASSWORD;
  if (typeof password !== 'string' || password.length === 0) {
    throw new ConfigurationError('Preencha PGPASSWORD em Back/.env com a senha do PostgreSQL.');
  }

  return {
    port: readPort('PORT', 3000),
    database: {
      host: requiredValue('PGHOST'),
      port: readPort('PGPORT', 5432),
      database: requiredValue('PGDATABASE'),
      user: requiredValue('PGUSER'),
      password,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 5000,
    },
  };
}

module.exports = { readConfig, ConfigurationError };
