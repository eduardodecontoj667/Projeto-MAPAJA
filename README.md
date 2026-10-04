# Projeto-MAPAJA
Projeto que estamos realizando na faculdade,
# MapaJá

Projeto de extensão para facilitar a localização de serviços essenciais em Concórdia.

## Estado atual

Protótipo web com mapa Leaflet e servidor Express. Cadastro de pontos no mapa é experimental; integração com banco de dados, autenticação e regras de acesso ainda precisam ser implementadas.

## Executar localmente

Instale o Node.js com npm. No terminal, a partir da pasta do projeto:

```powershell
cd Back
npm ci
node app.js
```

Abra http://localhost:3000 no Chrome ou Edge e mantenha o terminal aberto. Para encerrar o servidor, pressione Ctrl + C.

## Estrutura

- `Back/app.js`: servidor Express.
- `Back/public/index.html`: interface do mapa.
- `Back/package.json` e `Back/package-lock.json`: dependências do projeto.

Os arquivos do banco de dados não estão incluídos nesta pasta do projeto.

A pasta Frontend cont�m a interface j� existente no reposit�rio. O servidor atual entrega Back/public; a integra��o entre as duas interfaces ainda est� pendente.
