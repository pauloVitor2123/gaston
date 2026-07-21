-- Seeds iniciais (DADOS, não schema).
-- Aplicar com:
--   wrangler d1 execute gaston-db --local  --file=src/db/seeds.sql
--   wrangler d1 execute gaston-db --remote --file=src/db/seeds.sql
-- Idempotente: INSERT OR IGNORE não duplica em re-execução.

-- Usuário inicial (Paulo Vitor).
-- TODO(Fase 8): telegram_chat_id real é conhecido quando o usuário fala com o bot.
-- Placeholder = 1; atualizar com o chat_id verdadeiro antes de usar em produção.
INSERT OR IGNORE INTO users (id, telegram_chat_id, name, timezone)
VALUES (1, 1, 'Paulo Vitor', 'America/Sao_Paulo');

-- Cartões (Nubank PF: fecha dia 13, vence dia 20 | Nubank PJ: fecha último dia, vence dia 7)
INSERT OR IGNORE INTO cards (user_id, name, aliases, brand, closing_day, due_day) VALUES
  (1, 'Nubank PF', '["nubank","nu","roxinho","nubank pf"]', 'Mastercard', 13, 20),
  (1, 'Nubank PJ', '["nubank pj","nu pj","pj"]', 'Mastercard', 31, 7);

-- Categorias (nomes em PT — dado do usuário)
INSERT OR IGNORE INTO categories (user_id, name, synonyms) VALUES
  (1, 'Alimentação', '["comida","almoço","lanche","mercado","restaurante"]'),
  (1, 'Transporte',  '["uber","99","gasolina","ônibus","combustível"]'),
  (1, 'Saúde',       '["farmácia","remédio","médico","consulta"]'),
  (1, 'Lazer',       '["cinema","bar","streaming","jogo"]'),
  (1, 'Educação',    '["curso","livro","faculdade"]'),
  (1, 'Moradia',     '["aluguel","condomínio","luz","água","internet"]'),
  (1, 'Serviços',    '["assinatura","academia"]'),
  (1, 'Outros',      '[]');

-- Mantras (método pessoal; % alvo do orçamento)
INSERT OR IGNORE INTO mantras (user_id, name, target_percent) VALUES
  (1, 'Pagas as Contas', 0.45),
  (1, 'Se Pagar',        0.30),
  (1, 'Doar',            0.10);
