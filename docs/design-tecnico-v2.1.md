# Finanças do PV — Design Técnico v2.1 (schema em inglês, padrão de mercado)

Baseado na análise das 77 abas de `Controle de Despesas.xlsx` (era atual: Set/2025–Out/2026, 590 transações variáveis, 40 compras parceladas distintas, 2 cartões ativos).

Decisões travadas:
- LLM 2 com escopo reduzido: só normalização de categoria/mantra ambíguos. Coerência estrutural (parcelado → tem parcelas; boleto → tem vencimento) é validação em código no Node.
- Killer feature: `/status` (previsto vs real, por categoria, por mantra) + lembretes proativos de vencimento.
- Cartões são entidades CRUD: nome, bandeira, dia de fechamento, dia de vencimento, limite.
- Fatura (`card_invoice`) é **entidade derivada**: calculada a partir das compras do ciclo, nunca lançada manualmente.
- Nomes de tabelas/campos em inglês; valores de domínio do usuário (nomes de mantras, categorias) permanecem em português como **dados**.

Glossário PT → EN usado no schema:

| Domínio (planilha) | Schema |
|---|---|
| Lançamento | `transactions` |
| Conta fixa / assinatura | `recurring_bills` |
| Compra parcelada | `installment_purchases` |
| Fatura | `card_invoices` |
| Cartão | `cards` |
| Mantra | `mantras` (nome próprio do seu método; mantido) |
| Valor previsto / real | `expected_amount_cents` / `actual_amount_cents` |
| Dar baixa | `settle` |

---

## 1. Modelo de dados (PostgreSQL)

Já com `user_id` em tudo para não retrabalhar na fase SaaS (multi-tenant por coluna). No MVP, um único usuário.

```sql
-- =========================================================
-- USERS
-- =========================================================
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  telegram_chat_id BIGINT UNIQUE NOT NULL,
  name          TEXT,
  timezone      TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- CARDS (CRUD via bot: /cartao add|edit|del|list)
-- =========================================================
CREATE TABLE cards (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id),
  name           TEXT NOT NULL,                -- "Nubank PF", "Nubank PJ", "Itaú"
  aliases        TEXT[] DEFAULT '{}',          -- ["nubank","nu","roxinho"] p/ matching do LLM
  brand          TEXT,                         -- "Mastercard", "Visa"...
  closing_day    SMALLINT NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day        SMALLINT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  limit_cents    BIGINT,                       -- nullable; alerta de % da fatura
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
-- Seeds do MVP:
--   Nubank PF: closing_day=13, due_day=20
--   Nubank PJ: closing_day=31 (=último dia do mês), due_day=7
-- Convenção: closing_day=31 significa "último dia do mês" (28/29/30/31).

-- =========================================================
-- TAXONOMIES
-- =========================================================
CREATE TABLE categories (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL,                   -- "Comida", "Transporte", "Niko"... (dado do usuário, fica em PT)
  synonyms    TEXT[] DEFAULT '{}',             -- ["almoço","lanche"] → Comida (mata a deriva de categoria)
  UNIQUE (user_id, name)
);

CREATE TABLE mantras (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id),
  name           TEXT NOT NULL,                -- "Se Pagar","Doar","Pagas as Contas","Investir","Poupar p/ sonhos","Abundar"
  target_percent NUMERIC(5,4) NOT NULL,        -- 0.05, 0.10, 0.45, 0.20, 0.10, 0.05
  UNIQUE (user_id, name)
);

-- =========================================================
-- RECURRING BILLS (contas fixas + assinaturas)
-- Substitui o "arrastar linhas todo mês"
-- =========================================================
CREATE TABLE recurring_bills (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id),
  description       TEXT NOT NULL,             -- "Quinto Andar", "Vivo", "TotalPass"
  kind              TEXT NOT NULL CHECK (kind IN ('fixed_bill','card_subscription')),
  expected_amount_cents BIGINT NOT NULL,       -- último valor conhecido; atualizável
  due_day           SMALLINT,                  -- p/ fixed_bill (boleto/PIX/débito)
  charge_day        SMALLINT,                  -- p/ card_subscription (dia que cai no cartão)
  payment_method    TEXT,                      -- 'boleto','pix','account_balance','card'
  card_id           BIGINT REFERENCES cards(id),
  category_id       BIGINT REFERENCES categories(id),
  mantra_id         BIGINT REFERENCES mantras(id),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- INSTALLMENT PURCHASES (a compra-mãe; gera N transactions)
-- Mata o "TV 6/8" na descrição
-- =========================================================
CREATE TABLE installment_purchases (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id),
  description         TEXT NOT NULL,           -- "Máquina de Lavar"
  total_amount_cents  BIGINT NOT NULL,
  installments_count  SMALLINT NOT NULL,
  purchase_date       DATE NOT NULL,
  card_id             BIGINT REFERENCES cards(id),   -- null se boleto/PIX parcelado
  payment_method      TEXT NOT NULL,
  category_id         BIGINT REFERENCES categories(id),
  mantra_id           BIGINT REFERENCES mantras(id),
  direction           TEXT NOT NULL DEFAULT 'expense' CHECK (direction IN ('expense','income')),
  -- direction='income' cobre o padrão histórico de recebíveis parcelados ("Mãe - Rommanel 2/3")
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- CARD INVOICES (faturas; derivadas; 1 por cartão por ciclo)
-- =========================================================
CREATE TABLE card_invoices (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES users(id),
  card_id            BIGINT NOT NULL REFERENCES cards(id),
  cycle_start        DATE NOT NULL,            -- dia seguinte ao fechamento anterior
  cycle_end          DATE NOT NULL,            -- data de fechamento
  due_date           DATE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','closed','paid')),
  paid_amount_cents  BIGINT,                   -- informado pelo usuário ("paguei a fatura, 3421,75")
  paid_at            DATE,
  UNIQUE (card_id, cycle_end)
);
-- expected_amount da fatura = SUM(transactions WHERE card_invoice_id = X). Nunca armazenado.

-- =========================================================
-- TRANSACTIONS (tabela central; entradas E saídas)
-- =========================================================
CREATE TABLE transactions (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            BIGINT NOT NULL REFERENCES users(id),
  direction          TEXT NOT NULL CHECK (direction IN ('income','expense')),
  description        TEXT NOT NULL,
  expected_amount_cents BIGINT NOT NULL,       -- pode ser negativo (reembolso, ex.: "Sarah - Chá de bebê -40")
  actual_amount_cents   BIGINT,                -- null enquanto não pago/recebido
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','received','canceled')),
  accrual_date       DATE NOT NULL,            -- competência: quando o gasto aconteceu
  due_date           DATE,                     -- caixa: quando o dinheiro sai/entra (boleto, fatura, salário)
  settled_at         DATE,
  payment_method     TEXT,                     -- 'boleto','pix','account_balance','card','cash'
  card_id            BIGINT REFERENCES cards(id),
  card_invoice_id    BIGINT REFERENCES card_invoices(id),  -- preenchido se payment_method='card'
  category_id        BIGINT REFERENCES categories(id),
  mantra_id          BIGINT REFERENCES mantras(id),
  source             TEXT NOT NULL DEFAULT 'ad_hoc'
                     CHECK (source IN ('ad_hoc','recurring','installment')),
  recurring_bill_id  BIGINT REFERENCES recurring_bills(id),
  installment_purchase_id BIGINT REFERENCES installment_purchases(id),
  installment_number SMALLINT,                 -- 3 (de installment_purchases.installments_count)
  note               TEXT,                     -- texto livre; futuro: embeddings/busca semântica
  raw_message        TEXT,                     -- texto bruto do Telegram (auditoria + retreino de prompts)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tx_user_accrual ON transactions (user_id, accrual_date);
CREATE INDEX idx_tx_invoice      ON transactions (card_invoice_id);
CREATE INDEX idx_tx_status_due   ON transactions (user_id, status, due_date);
```

### Regras de fluxo de caixa (evita dupla contagem)

Extraídas direto da mecânica da planilha:

- Transaction com `payment_method = 'card'` **não entra** no fluxo de caixa do mês. Ela compõe a fatura.
- Quem entra no fluxo de caixa é a **card_invoice** (conta a pagar derivada, com `due_date` do cartão).
- Saída prevista do mês = fixed bills + parcelas não-cartão + avulsos não-cartão + **faturas com `due_date` no mês**.
- Categorias/mantras são analisados no nível da transaction (`accrual_date`), independente da fatura (caixa). Duas visões — competência e caixa — sem esforço extra.

### Atribuição de fatura (função pura, testável)

```
invoice_for(purchase_date, card):
  closing = min(card.closing_day, last_day_of_month(purchase_date))
  if purchase_date.day <= closing:
      cycle_end = date(purchase_date.year, purchase_date.month, closing)
  else:
      cycle_end = closing day no mês seguinte
  due_date = próxima ocorrência de card.due_day APÓS cycle_end
  return (cycle_end, due_date)
```

Exemplos com seus cartões:
- Nubank PF (`closing_day=13, due_day=20`): compra 12/06 → fecha 13/06, vence 20/06. Compra 14/06 → fecha 13/07, vence 20/07.
- Nubank PJ (`closing_day=31, due_day=7`): compra 15/06 → fecha 30/06, vence 07/07.

Parcelas: parcela 1 cai na fatura de `purchase_date`; parcela N cai N-1 ciclos depois.

### Jobs agendados (node-cron ou similar)

| Job | Quando | O que faz |
|---|---|---|
| `materialize_month` | dia 1, 00:05 | cria transactions `pending` a partir de `recurring_bills` ativas |
| `close_invoices` | diário | invoice com `cycle_end < today` → status `closed` |
| `due_reminders` | diário 08:00 | contas/faturas vencendo amanhã → mensagem no Telegram |
| `limit_alert` | ao inserir compra | se invoice aberta > 80% do `limit_cents` → avisa (uma vez por ciclo) |

---

## 2. Comandos do bot (MVP)

Interface do usuário permanece em português; só o código fala inglês.

```
texto livre            → pipeline LLM (registrar entrada/saída/parcelado/boleto, dar baixa, consultar)
/status                → painel do mês: previsto vs real, por categoria, por mantra, faturas abertas
/fatura [cartao]       → fatura aberta: total parcial, itens, fechamento, vencimento, % do limite
/pendentes             → contas não pagas do mês, ordenadas por vencimento
/cartao add|edit|del|list
/categoria add|edit|del|list
/desfazer              → cancela a última transaction
```

Dar baixa (`settle`) é texto livre: "paguei a Vivo, deu 229" → match no pendente "Vivo" do mês → `status='paid'`, `actual_amount_cents=22900`, desvio registrado.

---

## 3. Pipeline de interpretação

```
Telegram → Node
  1. LLM 1 (rápido/barato): intent + campos → JSON
  2. Node valida (código, não LLM):
     - log_expense: amount e description presentes? date default = hoje (tz do usuário)
     - installment: installments_count presente? date default = hoje
     - cartão citado existe em `cards` (match por name/alias)?
     - categoria bate exato com `categories`/synonyms? mantra inferível por regra?
  3. Se categoria/mantra ambíguos → LLM 2 (só nesses casos, ~15-20% pelo seu histórico)
  4. Se falta campo obrigatório → pergunta consolidada (estado no Redis, máx 3 ciclos)
  5. Persistir + confirmação de 1 linha
```

Inferência de mantra por regra (cobre ~95% do histórico antes de chamar LLM):
- default → "Pagas as Contas" (89% das variáveis)
- "dízimo, doação, ajudar" → Doar
- "pós, curso, financiamento Caixa, reserva, investimento" → Investir
- "TotalPass, academia, terapia" → Se Pagar
- "bar, cerveja, rolê, presente pra mim" → Abundar (confirmar na 1ª vez, aprender depois)

---

## 4. Prompt LLM 1 (extração — chaves JSON em inglês)

Modelo rápido (Haiku). Saída sempre JSON puro.

```text
Você extrai informações financeiras de mensagens em português brasileiro.
Hoje é {TODAY} (timezone America/Sao_Paulo).

Cartões do usuário (use exatamente estes ids):
{CARDS_JSON}   ex.: [{"id":1,"name":"Nubank PF","aliases":["nubank","nu"]},{"id":2,"name":"Nubank PJ","aliases":["pj"]}]

Categorias do usuário:
{CATEGORIES_JSON} ex.: ["Comida","Mercado","Transporte","Farmácia e Saúde","Lazer","Entretenimento","Niko","Outros"]

Classifique a INTENÇÃO (intent) da mensagem:
- "log_expense"      → gasto simples ("almoço 25", "uber 12,78 no nubank")
- "log_income"       → recebimento ("caiu o pagamento, 5000", "recebi 289 do irmão da Sarah")
- "log_installment"  → compra parcelada ("comprei uma máquina de lavar, 3668 em 5x no nubank")
- "log_bill"         → conta com vencimento futuro ("chegou o boleto da luz, 52,34, vence dia 22")
- "settle"           → pagamento de algo pendente ("paguei a Vivo, deu 229", "paguei a fatura do PJ")
- "query"            → pergunta sobre dados ("quanto gastei com comida?")
- "other"            → nada acima

Responda APENAS com JSON:
{
  "intent": "...",
  "direction": "income" | "expense" | null,
  "amount": float | null,                   // negativo se reembolso/estorno explícito
  "date": "YYYY-MM-DD" | null,              // resolver "ontem","sexta passada"; null se não citada
  "description": "...",                     // curta, ex.: "Almoço", "99 Moto"
  "payment_method": "card"|"pix"|"boleto"|"cash"|"account_balance"|null,
  "card_id": int | null,                    // só se identificou um cartão da lista
  "category": "..." | null,                 // SOMENTE da lista; null se nenhuma encaixa bem
  "installments_count": int | null,
  "due_date": "YYYY-MM-DD" | null,          // boletos
  "settle_reference": "..." | null,         // p/ settle: o que está sendo pago ("Vivo","fatura Nubank PJ")
  "actual_amount": float | null,            // p/ settle: valor efetivamente pago
  "note": "..." | null,                     // contexto extra literal do usuário
  "missing_fields": ["..."],
  "category_confidence": "high" | "low"
}

Regras:
- Não invente valores. Campo não mencionado = null + missing_fields quando obrigatório.
- "no cartão" sem especificar qual E usuário tem 2+ cartões → card_id null + missing_fields:["card"].
- Data ausente em log_expense NÃO é missing (o sistema assume hoje).
- Valores brasileiros: "1.234,56" = 1234.56; "12 conto" = 12.00.
```

## 5. Prompt LLM 2 (normalização — escopo reduzido)

Chamado apenas quando `category` é null ou `category_confidence` é "low", ou o mantra não foi resolvido por regra. Modelo mais forte (Sonnet).

```text
Você normaliza a classificação de um lançamento financeiro.

Categorias válidas (escolha OBRIGATORIAMENTE uma): {CATEGORIES_JSON}
Mantras válidos: {MANTRAS_WITH_DESCRIPTIONS}
  Se Pagar: autocuidado inegociável (academia, terapia)
  Doar: dízimo, ajudar família e amigos
  Pagas as Contas: custos fixos e variáveis do dia a dia (DEFAULT na dúvida)
  Investir: educação, financiamentos de patrimônio, reserva, aportes
  Poupar p/ sonhos: poupança com objetivo
  Abundar: prazer e experiências (bar, presente, viagem de lazer)

Exemplos de decisões anteriores deste usuário (few-shot dinâmico, das últimas classificações confirmadas):
{RECENT_EXAMPLES}

Lançamento: {LLM1_JSON}

Responda APENAS com JSON:
{
  "category": "...",             // uma da lista, a mais específica possível
  "mantra": "...",
  "confidence": "high" | "low",
  "question": "..." | null       // só se confidence=low E vale a pena perguntar; UMA pergunta curta
}
```

`{RECENT_EXAMPLES}` é a personalização barata: injete as 10 últimas classificações confirmadas do usuário. O sistema aprende o vocabulário dele (ex.: "Jaé" → Transporte; "banho" → Niko) sem fine-tuning nem embeddings — isso vem depois.

---

## 6. Roadmap imediato

1. **Semana 1**: schema no Postgres + seeds (cards, categories, mantras extraídos da planilha) + `invoice_for()` com testes unitários (casos: closing 13, closing 31, fevereiro, virada de ano).
2. **Semana 2**: webhook Telegram + LLM 1 + validação em código + persistência de `log_expense` e `log_income`. Redis para o fluxo de perguntas.
3. **Semana 3**: installments (geração das N parcelas), recurring bills + `materialize_month`, `settle`.
4. **Semana 4**: `/status`, `/fatura`, `/pendentes`, lembretes diários. Migrar os pendentes do mês corrente da planilha e rodar em paralelo por 1 mês (planilha = fonte de verdade até o bot bater os números).

Critério de aposentadoria da planilha: um fechamento de mês inteiro em que `/status` bate com a aba, sem ajuste manual.