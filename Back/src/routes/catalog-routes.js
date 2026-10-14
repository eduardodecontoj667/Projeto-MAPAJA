const express = require('express');
const { createCatalogRepository } = require('../repositories/catalog-repository');
const { createCatalogService, RequestValidationError } = require('../services/catalog-service');
const { describeConnectionError } = require('../database/errors');

function createCatalogRouter(database) {
  const router = express.Router();
  const service = createCatalogService(createCatalogRepository(database));

  function handleFailure(error, response) {
    if (error instanceof RequestValidationError) {
      return response.status(400).json({
        erro: { codigo: 'REQUISICAO_INVALIDA', mensagem: error.message },
      });
    }

    console.error(`Consulta do catálogo falhou: ${describeConnectionError(error)}`);
    return response.status(503).json({
      erro: {
        codigo: 'BANCO_INDISPONIVEL',
        mensagem: 'Não foi possível consultar os locais agora. Tente novamente em instantes.',
      },
    });
  }

  router.get('/categorias', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      response.json(await service.listCategories());
    } catch (error) {
      handleFailure(error, response);
    }
  });

  router.get('/estabelecimentos', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    try {
      response.json(await service.listEstablishments(request.query));
    } catch (error) {
      handleFailure(error, response);
    }
  });

  return router;
}

module.exports = { createCatalogRouter };
