# Finanças do PV

Assistente financeiro conversacional para uso diário, via Telegram. Em vez de abrir planilhas ou apps complexos, você registra gastos em linguagem natural e recebe respostas inteligentes sobre saldo, categorias, contas fixas, boletos e compras parceladas.

> "comprei uma máquina de lavar, 3668 em 5x no nubank" → lançamento parcelado, categorizado e vinculado à fatura certa, sem preencher formulário nenhum.

## Sumário

- [Visão do produto](#visão-do-produto)
- [Diferenciais e mercado](#diferenciais-e-mercado)
- [Como funciona](#como-funciona)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Pipeline de interpretação (LLM 1 + LLM 2)](#pipeline-de-interpretação-llm-1--llm-2)
- [Comandos do bot](#comandos-do-bot)
- [Roadmap](#roadmap)
- [Do MVP ao SaaS](#do-mvp-ao-saas)
- [Status do projeto](#status-do-projeto)

## Visão do produto

O diferencial está em unir **simplicidade de uso** com **inteligência de análise**. A IA interpreta mensagens livres, organiza os lançamentos automaticamente, pede somente as informações que faltam e mantém o histórico pronto para dashboards, previsões e busca semântica no futuro.

O produto resolve três dores centrais:

- registrar gastos sem esforço;
- ter previsibilidade financeira;
- centralizar tudo em um fluxo conversacional contínuo.

A visão de longo prazo é evoluir de um bot que registra despesas para uma camada financeira pessoal inteligente — capaz de lembrar vencimentos, identificar padrões de consumo, apoiar decisões e gerar insights acionáveis. Um copiloto financeiro pessoal, não apenas uma ferramenta de anotação.

## Diferenciais e mercado

Pesquisa inicial mapeou soluções parecidas (Finny, Telegram Budget Bot/MyShell, budgetmoneybot, TeleExpense, AI Budget Assistant, além de bots open source). A maioria para no registro de despesas e em gráficos simples. O espaço em aberto para o Finanças do PV é a combinação de:

- conversa natural em português;
- fluxo socrático para completar dados faltantes (pergunta só o que falta, no máximo 3 ciclos);
- classificação inteligente de cartões, boletos, parcelas e contas fixas;
- previsibilidade financeira (previsto vs. real);
- evolução futura para dashboard e busca semântica sobre observações.

A proposta é virar um **sistema de organização financeira diária**, não apenas um lançador de despesas.

## Como funciona

Exemplo de fluxo ponta a ponta:

1. Usuário manda no Telegram: *"paguei 150 de luz ontem no cartão nubank pf, é uma conta fixa"*.
2. O bot extrai valor, data, categoria, forma de pagamento e cartão via LLM 1.
3. Se algo essencial estiver faltando, o bot pergunta — uma pergunta consolidada por vez, no máximo 3 ciclos.
4. Categoria e mantra são normalizados (regra em código primeiro; LLM 2 só em casos ambíguos, ~15–20% dos casos).
5. O lançamento é salvo e o bot confirma em uma linha.

Dar baixa em algo pendente também é texto livre: *"paguei a Vivo, deu 229"* casa com o pendente "Vivo" do mês e marca como pago.

## Arquitetura

Decisão de stack consolidada (MVP pessoal, até 10 usuários, custo de infraestrutura ~R$0/mês fora LLM):

```
┌─────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│   Telegram  │ ───▶ │  Cloudflare Workers   │ ───▶ │  Cloudflare D1   │
│  (webhook)  │ ◀─── │  (grammY handler)     │ ◀─── │  (SQLite edge)   │
└─────────────┘      └──────────┬───────────┘      └─────────────────┘
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │  Provider abstraído   │
                      │  (Anthropic/OpenAI/   │
                      │   OpenRouter)         │
                      │  LLM 1 → LLM 2        │
                      └──────────────────────┘
```

| Camada | Decisão | Custo |
|---|---|---|
| Canal de mensagens | Telegram Bot API | R$0 |
| Compute / runtime | Cloudflare Workers | R$0 (free tier) |
| Framework do bot | [grammY](https://grammy.dev/) | R$0 (open source) |
| Banco de dados | Cloudflare D1 (SQLite edge-native) | R$0 (free tier) |
| Estado conversacional pendente | Tabela `pending_conversations` no D1 (substitui Redis) | R$0 |
| Camada de LLM | Abstração multi-provider (Anthropic direto / OpenAI / OpenRouter) via env var | ver seção de custos abaixo |
| Jobs agendados | Cloudflare Cron Triggers | R$0 (free tier) |

**Custo total estimado (10 usuários):** ~R$15–20/mês, cobrível pelos créditos já existentes em OpenAI/OpenRouter por 1,5–2 meses antes de precisar desembolsar.

### Por que Telegram, não WhatsApp

Telegram permite texto livre sem limite de janela de resposta, sem aprovação de templates e sem custo por mensagem — critério decisivo contra o custo de R$0,03–R$0,31/mensagem + BSP obrigatório do WhatsApp Business API. Reavaliar WhatsApp só se a base de usuários não tiver Telegram instalado.

### Por que Cloudflare Workers + D1, não Render/Supabase/Neon

Critério decisivo: cold start. Um bot de Telegram precisa responder rápido; qualquer solução que hiberne gera timeout percebido pelo usuário.

| Plataforma | Cold start |
|---|---|
| Cloudflare Workers | <10ms (sempre quente) |
| Cloudflare D1 | ~0ms (mesma borda do Worker) |
| Neon (free) | 300–800ms |
| Supabase (free) | ~30s (pausa após 7 dias sem query) |
| Render (free web service) | 30–60s |

Trade-off aceito: SQLite (D1) tem menos recursos que um Postgres completo (sem `pgvector`, limite de 10GB por banco) — irrelevante neste estágio. Caminho de evolução natural: migrar para Postgres (Neon ou Supabase) quando o volume ou a busca semântica justificarem.

### Camada de LLM: abstração multi-provider

`callLLM` suporta 3 providers — Anthropic direto, OpenAI, OpenRouter — com seleção via variável de ambiente (`LLM1_PROVIDER`, `LLM2_PROVIDER`), sem alterar código para trocar. Estratégia: consumir primeiro créditos já parados (OpenAI, OpenRouter) antes de gastar dinheiro novo na Anthropic API direta.

Ao trocar de provider, o modelo subjacente (Claude Haiku/Sonnet) se mantém sempre que possível — a abstração troca transporte/faturamento, não a qualidade da extração.

## Modelo de dados

> Nota: o desenho relacional abaixo (schema, nomes de tabela, regras de fatura) foi consolidado em Postgres e permanece válido conceitualmente — a decisão final de infraestrutura migrou o banco para Cloudflare D1 (SQLite), mantendo o mesmo modelo lógico.

Tabelas centrais, todas com `user_id` desde o início (multi-tenant por coluna, mesmo com um único usuário no MVP):

| Tabela | Papel |
|---|---|
| `users` | usuário (chat_id do Telegram, timezone) |
| `cards` | cartões como entidades CRUD: nome, bandeira, dia de fechamento, dia de vencimento, limite |
| `categories` / `mantras` | taxonomias do usuário (nomes em português, como dado) |
| `recurring_bills` | contas fixas e assinaturas — substitui "arrastar linhas todo mês" |
| `installment_purchases` | compra-mãe de uma compra parcelada; gera N `transactions` |
| `card_invoices` | fatura — **entidade derivada**, calculada a partir das compras do ciclo, nunca lançada manualmente |
| `transactions` | tabela central; entradas e saídas, com competência (`accrual_date`) e caixa (`due_date`) separados |

Regras-chave de fluxo de caixa (evitam dupla contagem):

- `transaction` com `payment_method = 'card'` não entra no fluxo de caixa do mês — ela compõe a fatura.
- Quem entra no fluxo de caixa é a `card_invoice` (conta a pagar derivada, com vencimento do cartão).
- Categorias/mantras são analisados no nível da transação (competência), independente da fatura (caixa) — duas visões sem esforço extra.

Atribuição de fatura é uma função pura e testável (`invoice_for(purchase_date, card)`), que calcula ciclo de fechamento e vencimento a partir do dia de fechamento/vencimento do cartão.

## Pipeline de interpretação (LLM 1 + LLM 2)

```
Telegram → Worker
  1. LLM 1 (rápido/barato, Haiku): intent + campos → JSON
  2. Validação em código (não em LLM):
     - valor e descrição presentes? data default = hoje
     - parcelado: installments_count presente?
     - cartão citado existe em `cards` (match por nome/alias)?
     - categoria bate com `categories`/sinônimos? mantra inferível por regra?
  3. Se categoria/mantra ambíguos → LLM 2 (só nesses casos, ~15-20% do histórico)
  4. Se falta campo obrigatório → pergunta consolidada (máx. 3 ciclos)
  5. Persistir + confirmação de 1 linha
```

Inferência de mantra por regra cobre ~95% do histórico antes de chamar o LLM 2 (ex.: "dízimo, doação" → Doar; "TotalPass, academia, terapia" → Se Pagar; default → Pagas as Contas).

**Status em validação:** ainda não está fechado se as 2 chamadas de LLM são necessárias para o volume do MVP, ou se o LLM 1 sozinho (com prompt incluindo categorias + few-shot) já resolve ~90%+ dos casos. Critério de decisão: rodar o MVP por 1–2 semanas e comparar taxa de acerto antes de simplificar ou manter o pipeline em duas camadas.

## Comandos do bot

Interface do usuário em português; só o código fala inglês.

```
texto livre            → pipeline LLM (registrar entrada/saída/parcelado/boleto, dar baixa, consultar)
/status                → painel do mês: previsto vs real, por categoria, por mantra, faturas abertas
/fatura [cartao]       → fatura aberta: total parcial, itens, fechamento, vencimento, % do limite
/pendentes             → contas não pagas do mês, ordenadas por vencimento
/cartao add|edit|del|list
/categoria add|edit|del|list
/desfazer              → cancela o último lançamento
```

## Roadmap

Roadmap imediato do MVP:

1. **Semana 1** — schema + seeds (cards, categories, mantras extraídos da planilha atual) + `invoice_for()` com testes unitários.
2. **Semana 2** — webhook Telegram + LLM 1 + validação em código + persistência de entradas e saídas simples.
3. **Semana 3** — parcelas (geração das N transações), contas recorrentes + materialização mensal, dar baixa.
4. **Semana 4** — `/status`, `/fatura`, `/pendentes`, lembretes diários. Rodar em paralelo com a planilha por 1 mês.

**Critério de aposentadoria da planilha:** um fechamento de mês inteiro em que `/status` bate com a planilha, sem ajuste manual.

## Do MVP ao SaaS

Fases de evolução, sem quebrar a base do produto:

1. Validar o bot e o backend para uso próprio.
2. Estruturar dados com schema estável e consciência de multi-tenant (já existe desde o início via `user_id`).
3. Criar dashboards e lembretes.
4. Adicionar personalização por usuário (categorias, cartões, regras próprias).
5. Implementar planos e cobrança (assinatura mensal escalonada — individual, familiar, autônomo, premium com IA avançada).
6. Abrir para primeiros clientes pagantes.

Recursos com potencial de monetização: personalização de categorias/cartões, lembretes de vencimento, visão de contas fixas e variáveis, dashboards de previsibilidade, busca semântica sobre histórico, automações (Telegram, iOS Shortcuts, etc.).

| Fase | Usuários | Mudança de stack |
|---|---|---|
| MVP | até 100 | nenhuma |
| Early traction | ~500 | nenhuma (D1 ainda comporta) |
| Scaling | 1.000–10.000 | Workers pago; possível migração para Postgres se precisar de features relacionais avançadas ou passar de 10GB por banco |
| SaaS multi-tenant | 10.000+ | sharding de D1 por tenant ou migração completa para Postgres com RLS; reavaliar WhatsApp e Turso |

## Status do projeto

Projeto em fase de design técnico, pré-implementação. Decisões em aberto que não bloqueiam o MVP:

- [ ] Rodar teste comparativo LLM 1 sozinho vs. pipeline LLM 1 + LLM 2 e decidir se simplifica.
- [ ] Confirmar acesso ao D1 a partir do Worker (binding nativo `env.DB` vs. ORM como Drizzle).
- [ ] Definir se `pending_conversations` usa TTL via Cron ou verificação `expires_at` na leitura.
- [ ] Avaliar Turso como alternativa a D1 apenas se "um banco por usuário" virar prioridade.
- [ ] Validar qualidade de extração em português ao trocar para GPT-4o-mini (fase 2 do plano de créditos).

---

Projeto pessoal de [Paulo Vitor](mailto:paulovitor2123@gmail.com).
