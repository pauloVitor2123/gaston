INSERT OR IGNORE INTO users (telegram_chat_id, name, timezone)
VALUES (6069762694, 'Paulo Vitor', 'America/Sao_Paulo');

INSERT OR IGNORE INTO cards (user_id, name, aliases, brand, closing_day, due_day) VALUES
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Nubank PF', '["nubank","nu","roxinho","nubank pf"]', 'Mastercard', 13, 20),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Nubank PJ', '["nubank pj","nu pj","pj"]', 'Mastercard', 31, 7);

INSERT OR IGNORE INTO categories (user_id, name, synonyms) VALUES
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Alimentação', '["alimentação","comida"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Transporte',  '["transporte"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Saúde',       '["farmácia","remédio","médico","consulta"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Lazer',       '["cinema","bar","streaming","jogo"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Educação',    '["curso","livro","faculdade"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Moradia',     '["aluguel","condomínio","luz","água","internet","trena","botijão","manutenção da casa","reparo em casa","ferramenta de casa"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Serviços',    '["assinatura","academia"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Vestuário',   '["roupa","meia","camisa","calça","tênis","sapato","calçado"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Cuidados Pessoais', '["barbearia","cabeleireiro","salão","cosméticos","higiene","perfume"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Presentes',   '["presente","lembrancinha","aniversário"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Pet',         '["ração","veterinário","pet shop","petshop","tosa","cachorro","gato"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Outros',      '[]');

INSERT OR IGNORE INTO categories (user_id, name, synonyms, parent_id) VALUES
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'App',         '["uber","99","ônibus","táxi","metrô","transporte público"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Combustível', '["gasolina","etanol","álcool","gnv","gás","diesel","eletricidade","recarga elétrica","recarga do carro","combustível","abastecer","abasteci","posto"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Manutenção',  '["manutenção","mecânico","revisão","troca de óleo","pneu","freio","oficina","peça","alinhamento","balanceamento"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Lavagem',     '["lavagem","lava jato","lavajato","lava rápido","higienização"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Pedágio',     '["pedágio","sem parar","tag"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Estacionamento', '["estacionamento","zona azul","flanelinha"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Aluguel do carro', '["aluguel do carro","locadora","kovi","localiza","movida"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Seguro',      '["seguro","franquia"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Documentação', '["ipva","licenciamento","multa","detran"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Mercado',     '["mercado","supermercado","feira","hortifruti"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Alimentação' AND parent_id IS NULL)),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Restaurante', '["restaurante","lanche","almoço","ifood","bar","padaria"]',
    (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Alimentação' AND parent_id IS NULL));

UPDATE categories
SET synonyms = '["aluguel","condomínio","luz","água","internet","trena","botijão","manutenção da casa","reparo em casa","ferramenta de casa"]'
WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Moradia' AND parent_id IS NULL;

UPDATE categories
SET synonyms = '["gasolina","etanol","álcool","gnv","gás","diesel","eletricidade","recarga elétrica","recarga do carro","combustível","abastecer","abasteci","posto"]'
WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Combustível'
  AND parent_id = (SELECT id FROM categories WHERE user_id = (SELECT id FROM users WHERE telegram_chat_id = 6069762694) AND name = 'Transporte' AND parent_id IS NULL);

INSERT OR IGNORE INTO platforms (user_id, name, synonyms) VALUES
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Uber',    '["uber","uber x","uberx"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), '99',      '["99","99pop","99 pop","noventa e nove"]'),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'InDrive', '["indrive","in drive","indriver"]');

INSERT OR IGNORE INTO mantras (user_id, name, target_percent) VALUES
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Pagas as Contas', 0.45),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Se Pagar',        0.30),
  ((SELECT id FROM users WHERE telegram_chat_id = 6069762694), 'Doar',            0.10);
