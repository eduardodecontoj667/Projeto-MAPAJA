const { ConfigurationError } = require('../config');

function describeConnectionError(error) {
  if (error instanceof ConfigurationError) return error.message;

  const messages = {
    '28P01': 'Senha ou usuário do PostgreSQL incorretos. Confira Back/.env.',
    '28000': 'O PostgreSQL recusou a autenticação. Confira o usuário e as permissões.',
    '3D000': 'O banco configurado em PGDATABASE não existe nesse servidor.',
    '42501': 'O usuário do PostgreSQL não tem permissão para esta operação.',
    '57P01': 'O serviço PostgreSQL encerrou a conexão.',
    ECONNREFUSED: 'O PostgreSQL não aceitou a conexão. Confira o serviço, PGHOST e PGPORT.',
    ECONNRESET: 'A conexão com o PostgreSQL foi interrompida.',
    ENOTFOUND: 'O endereço configurado em PGHOST não foi encontrado.',
    ETIMEDOUT: 'O tempo de conexão com o PostgreSQL foi excedido.',
    EADDRINUSE: 'A porta HTTP está em uso. Encerre o outro servidor ou ajuste PORT em Back/.env.',
  };

  // Mensagens do driver podem conter dados da conexão; não as exponha.
  return Object.hasOwn(messages, error?.code)
    ? messages[error.code]
    : 'Não foi possível acessar o PostgreSQL. Confira Back/.env e se o serviço está ativo.';
}

module.exports = { describeConnectionError };
