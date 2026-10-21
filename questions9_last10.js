// Revisão concentrada do SARESP 2026, 9º ano.
// Seleciona exatamente os 10 últimos itens (27 a 36) do quiz principal.
// Mantém alternativas, comentários, imagens, níveis, tempo e áudio oficial.
const allQuestions = require('./questions9_v3');
if (allQuestions.length !== 36) throw new Error('Banco SARESP diferente de 36 itens. Revise a seleção.');
module.exports = allQuestions.slice(26, 36);
