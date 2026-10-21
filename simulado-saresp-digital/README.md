# Simulado SARESP Digital 2026 — E.E. PEI Deputado José Costa

Site escolar **não oficial**, inspirado na experiência de responder provas digitais. Inclui 72 itens demonstrativos autorais, divididos por ano e dia: 6º, 7º e 9º anos, 12 questões por dia.

## Funcionalidades

- Uma questão por página/tela, com alternativas A–D.
- Modal de confirmação antes de registrar, sem possibilidade de alterar a resposta confirmada.
- Código individual de 10 caracteres, uso único para um simulado. Quem interrompe consegue retomar com o mesmo nome e código.
- Painel do professor protegido por senha, geração de códigos, acompanhamento por turma, habilidades com mais erros e exportação CSV.
- Banco de questões editável em JSON, antes do início da aplicação.
- Layout responsivo para computador, celular e tablet.
- Servidor registra e corrige as respostas, sem enviar o gabarito ao navegador do estudante.

## Iniciar localmente

É necessário Node.js 20 ou superior.

```bash
npm install
ADMIN_PASSWORD='defina-uma-senha-forte' APP_SECRET='defina-um-segredo-longo-aleatorio' npm start
```

Abra `http://localhost:3000`. Para entrar no painel da equipe, clique em **Área do professor** no rodapé ou acesse `/?professor`.

Os dados locais são guardados no arquivo `data-local.json`, criado automaticamente. **Nunca publique usando o armazenamento local efêmero de hospedagem gratuita:** ele pode ser apagado quando a instância reiniciar.

## Publicar em Render (com PostgreSQL persistente)

1. Crie um Postgres no Render e copie a **Internal Database URL** no painel seguro do Render.
2. Crie um serviço Web do tipo Node ligado a este diretório do repositório.
3. Defina build `npm install`, start `npm start` e as variáveis de ambiente:

   - `DATABASE_URL`: URI interna do seu PostgreSQL;
   - `ADMIN_PASSWORD`: senha longa, exclusiva, criada pela equipe escolar;
   - `APP_SECRET`: segredo criptográfico aleatório longo e fixo, mantido em sigilo;
   - `NODE_ENV`: `production`.

4. Teste `/api/health`: precisa apresentar `"persistente":true`.

**Importante:** em 21/10/2026, a modalidade gratuita de PostgreSQL do Render expira em 30 dias. Para manter resultados após essa data, é necessário migrar para um banco durável ou atualizar o plano antes da expiração. Não registre dados de alunos sem considerar a LGPD e a política de proteção de dados da escola. Não use CPF ou RA como código.

## Como usar

1. Entre na **Área do professor** com a senha configurada no ambiente do servidor.
2. Se desejar, clique em **Carregar banco** e edite as questões demonstrativas usando JSON. Salve **antes** de iniciar qualquer prova do respectivo caderno.
3. Gere códigos selecionando ano, dia, turma e quantidade.
4. Distribua a cada estudante **um código diferente para cada caderno/dia**.
5. O estudante informa o nome e o código, responde uma questão de cada vez e confirma cada resposta.
6. Após a conclusão, consulte o acompanhamento do professor e exporte o CSV.

### Modelo de questão JSON

```json
{
  "area": "Linguagens",
  "habilidade": "Identificar a finalidade do texto",
  "texto": "Leia o texto-base aqui.",
  "enunciado": "Qual é a finalidade deste texto?",
  "alternativas": ["Opção A", "Opção B", "Opção C", "Opção D"],
  "correta": 1
}
```

O valor `correta` começa em zero (`0=A`, `1=B`, `2=C`, `3=D`). As questões de cada caderno são uma lista desses objetos. Antes de qualquer aplicação, revise o gabarito e alinhe as questões ao Mapa de Referência SARESP pretendido.

**Regras de acesso:** o código identifica uma tentativa, e não certifica biologicamente a identidade de uma pessoa. O professor precisa entregar códigos individualmente. O estudante não poderá alterar uma resposta já registrada nem começar nova prova com o mesmo código. Uma tentativa interrompida pode continuar de onde parou.

## Referências

- [Diário Oficial de São Paulo — Resolução SEDUC nº 94/2026](https://www.doe.sp.gov.br/executivo/secretaria-da-educacao/resolucao-seduc-n-94-de-9-de-outubro-de-2026-20261009112412202195308). Define, no Anexo, a divisão dos cadernos e o formato digital para 6º/7º anos e impresso para 9º ano em 2026.

Este site não reproduz a interface proprietária nem os itens oficiais da VUNESP/SARESP. É uma ferramenta escolar de preparação.