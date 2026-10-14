# MapaJá

Projeto de extensão para localizar serviços essenciais em Concórdia.

## Código

- `Back/app.js`: servidor Express.
- `Back/src/`: configuração, conexão PostgreSQL, consultas, validações e rotas.
- `Back/public/`: interface ativa, mapa, busca, filtros e detalhes.
- `Back/scripts/`: verificação da conexão e das tabelas.
- `Back/test/`: testes da API e integração com PostgreSQL.
- `Frontend/`: protótipo visual anterior já existente no repositório.

## Executar

Use Node.js 22 ou superior e um banco PostgreSQL já criado com as tabelas do projeto. As consultas usam o esquema aplicado, com IDs inteiros (`id_estabelecimento`, `id_categoria`, `id_subcategoria`).

```powershell
cd Back
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Preencha `Back/.env` com os dados do seu banco. O modelo usa `localhost:5432`, banco `mapaja` e usuário `postgres`; a senha deve ser preenchida apenas no `.env` local.

```powershell
npm run db:check
npm start
```

Abra http://localhost:3000. O mapa consulta os estabelecimentos ativos pela API, com busca por nome/palavras-chave e filtro por categoria. Um banco sem locais retorna uma lista vazia. O cadastro administrativo e a autenticação serão implementados nas próximas etapas.

Rotas públicas: `GET /api/health`, `GET /api/categorias` e `GET /api/estabelecimentos`. A consulta aceita `busca`, `categoria_id` inteiro positivo, `limite` de 1 a 100 e `deslocamento` inteiro maior ou igual a zero.

## Testar

```powershell
npm test
npm run test:integration
```

A suíte tem 29 testes unitários e 10 de integração. A integração usa o banco configurado no `.env` e reverte os registros de teste com `ROLLBACK`.

O repositório inclui código, recursos da interface, dependências declaradas e o modelo de configuração sem senha. O banco em si, senhas locais, `node_modules` e arquivos temporários ficam fora da publicação. Os comandos não criam tabelas nem inserem um catálogo permanente automaticamente.
