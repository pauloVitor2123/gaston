INSERT OR IGNORE INTO users (telegram_chat_id, name, timezone)
VALUES (6069762694, 'Paulo Vitor', 'America/Sao_Paulo');

INSERT OR IGNORE INTO cards (user_id, name, aliases, brand, closing_day, due_day) VALUES
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Nubank PF', '["nubank","nu","roxinho","nubank pf"]', 'Mastercard', 13, 20),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Nubank PJ', '["nubank pj","nu pj","pj"]', 'Mastercard', 31, 7);

INSERT OR IGNORE INTO categories (user_id, name, synonyms) VALUES
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Alimentação', '["comida","almoço","lanche","mercado","restaurante"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Transporte',  '["uber","99","gasolina","ônibus","combustível"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Saúde',       '["farmácia","remédio","médico","consulta"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Lazer',       '["cinema","bar","streaming","jogo"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Educação',    '["curso","livro","faculdade"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Moradia',     '["aluguel","condomínio","luz","água","internet"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Serviços',    '["assinatura","academia"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Outros',      '[]');

INSERT OR IGNORE INTO mantras (user_id, name, target_percent) VALUES
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Pagas as Contas', 0.45),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Se Pagar',        0.30),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Doar',            0.10);
