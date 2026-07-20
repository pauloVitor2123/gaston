

Decisoes tecnicas consolidadas · MD
# Finanças do PV — Decisões Técnicas Consolidadas
 
**Última atualização:** 17/07/2026
**Escopo:** MVP pessoal, até 10 usuários, custo de infraestrutura ~R$0/mês (fora LLM)
 
Este documento consolida todas as decisões técnicas tomadas até agora. Substitui a necessidade de garimpar o histórico de conversa — qualquer decisão nova deve ser adicionada aqui.
 
---
 
## 1. Stack geral
 
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
 
| Camada | Decisão | Status | Custo |
|---|---|---|---|
| Canal de mensagens | Telegram Bot API | ✅ Fechado | R$0 |
| Compute / runtime | Cloudflare Workers | ✅ Fechado | R$0 (free tier) |
| Framework do bot | grammY | ✅ Fechado | R$0 (open source) |
| Banco de dados | Cloudflare D1 (SQLite) | ✅ Fechado | R$0 (free tier) |
| Estado conversacional pendente | Tabela `pending_conversations` no D1 (substitui Redis) | ✅ Fechado | R$0 |
| Camada de LLM | Abstração multi-provider (Anthropic/OpenAI/OpenRouter) via env var | ✅ Fechado | Ver seção 4 |
| Jobs agendados | Cloudflare Cron Triggers | ✅ Fechado | R$0 (free tier) |
| Quantidade de chamadas LLM por lançamento | 1 (LLM 1) sempre + 1 (LLM 2) condicional (~15-20% dos casos) | ⚠️ Em validação | — |
 
**Custo total estimado (10 usuários):** ~R$15–20/mês, cobrível pelos créditos já existentes em OpenAI/OpenRouter por 1,5–2 meses antes de precisar desembolsar.
 
---
 
## 2. Canal de mensagens: Telegram (não WhatsApp)
 
### Decisão
Usar Telegram Bot API como único canal do MVP.
 
### Justificativa
| Critério | Telegram | WhatsApp Business API |
|---|---|---|
| Custo por mensagem | R$0, ilimitado | R$0,03–R$0,31/mensagem + BSP obrigatório |
| Aprovação de conteúdo | Nenhuma | Templates precisam aprovação (48–72h) |
| Resposta em texto livre | Sim | Só dentro da janela de 24h; fora disso, só templates |
| Risco de banimento | Baixo | Alto (spam report, violação de política) |
| Custo estimado mensal (10 usuários) | ~R$28/mês (só LLM) | ~R$120–170/mês |
 
**Reavaliar WhatsApp somente se/quando** houver base de usuários e ROI que justifiquem o custo por mensagem — por exemplo, se o público-alvo não tiver Telegram instalado.
 
---
 
## 3. Infraestrutura de compute e banco: Cloudflare Workers + D1 (não Render/Supabase/Neon)
 
### Decisão
- Compute: **Cloudflare Workers** (V8 isolates).
- Banco: **Cloudflare D1** (SQLite gerenciado, edge-native).
- Redis do design original **removido** — estado de conversa pendente vira tabela no D1.
### Justificativa — cold start é o critério decisivo
| Plataforma | Cold start | Observação |
|---|---|---|
| Cloudflare Workers | <10ms | Sempre quente (V8 isolate) |
| Cloudflare D1 | ~0ms | Mesma borda do Worker, sem hop de rede |
| Neon (free) | 300–800ms | Acorda após 5 min de inatividade |
| Supabase (free) | **~30s** | Pausa após 7 dias sem query — **inviável para bot ativo** |
| Render (free web service) | 30–60s | Hiberna após 15 min de inatividade |
 
Um bot de Telegram precisa responder rápido; qualquer solução que hiberne gera timeout percebido pelo usuário. D1 + Workers elimina esse risco por completo, com free tier (5GB armazenamento, 5M rows lidas/dia, 100k rows escritas/dia) muito acima do necessário para 10 usuários.
 
### Trade-off aceito
SQLite (D1) tem menos recursos que Postgres completo (sem extensões nativas tipo `pgvector`) e limite de 10GB por banco. Irrelevante neste estágio. Caminho de evolução natural se precisar: migrar para Postgres (Neon ou Supabase) quando o volume ou a necessidade de busca semântica justificarem.
 
### Alternativas consideradas e descartadas
- **Supabase**: pausa em 7 dias de inatividade (free) = cold start de 30s, inaceitável para bot.
- **Neon**: bom produto, mas cold start de 300–800ms no free tier e exige pagar (~$19/mês) para eliminar isso — sem necessidade no estágio atual.
- **Turso**: opção interessante para arquitetura "banco por usuário" no futuro (multi-tenant físico), mas ainda mais nova/menos madura que D1. Fica como opção de reavaliação, não decisão atual.
- **PlanetScale**: sem free tier desde 2024. Descartada.
---
 
## 4. Camada de LLM: abstração multi-provider
 
### Decisão
Implementar uma camada de abstração (`callLLM`) que suporta 3 providers — **Anthropic direto, OpenAI, OpenRouter** — com seleção via variável de ambiente (`LLM1_PROVIDER`, `LLM2_PROVIDER` no `wrangler.toml`), sem necessidade de alterar código para trocar.
 
### Motivação
O usuário já possui créditos parados:
- OpenAI: US$5,00
- OpenRouter: US$4,64
Estratégia: consumir esses créditos primeiro (~1,5–2 meses de uso no volume estimado) antes de gastar dinheiro novo na Anthropic API direta.
 
### Por que não usar só a assinatura Claude.ai (Pro/Max)?
Confirmado na documentação oficial da Anthropic: **assinatura Claude.ai e uso via API/Console são produtos com billing separado**. A assinatura cobre uso de chat (claude.ai, app, Claude Code via login de navegador); não há conversão de créditos de assinatura para uso de API. É necessário criar uma API key própria no Anthropic Console, com cobrança à parte.
 
### Por que Anthropic direto (quando não estiver usando créditos) em vez de OpenRouter como padrão?
| Critério | Anthropic direto | OpenRouter |
|---|---|---|
| Custo | Tabela oficial | Mesmo preço + taxa de 5,5% |
| Prompt caching | Suporte nativo completo | Parcial/inconsistente por modelo |
| Latência | Sem overhead de roteamento | +50–150ms por chamada |
| Ponto de falha adicional | Não | Sim (terceiro na cadeia) |
 
OpenRouter só se justificaria se houvesse necessidade de comparar/trocar entre múltiplos provedores de modelos diferentes ou fallback automático — não é o caso atual (uso concentrado em Claude Haiku/Sonnet).
 
### Arquivos gerados
- `llm-provider.ts`: implementação da abstração (`callLLM`, `callLLM1`, `callLLM2`, parsing seguro de JSON) com suporte aos 3 providers.
- `wrangler.example.toml`: exemplo de configuração mostrando a troca de provider via `[vars]`.
### Plano de rotação de créditos
```
Fase 1 (atual): LLM1 via OpenRouter (anthropic/claude-haiku-4.5) — zera créditos OpenRouter
Fase 2: LLM1 via OpenAI (gpt-4o-mini) — zera créditos OpenAI
Fase 3: LLM1 via Anthropic direto (claude-haiku-4-5) — créditos acabaram, uso pago direto
```
LLM 2 permanece na Anthropic direto (Sonnet) por padrão, dado seu volume baixo (~15-20% das mensagens).
 
### Ponto de atenção
Ao trocar de provider, manter o **mesmo modelo subjacente** (Claude Haiku/Sonnet) sempre que possível — a abstração troca o transporte/faturamento, não deveria trocar a qualidade da extração. Se testar GPT-4o-mini via OpenAI direto, validar manualmente a qualidade de extração em português antes de confiar no pipeline.
 
---
 
## 5. Arquitetura de duas camadas de LLM (LLM 1 + LLM 2)
 
### Decisão atual
Manter a arquitetura de 2 chamadas:
- **LLM 1** (sempre executa): extração de campos + intent, modelo rápido/barato (Haiku).
- **LLM 2** (condicional, ~15-20% dos casos): normalização de categoria/mantra quando ambíguos, modelo mais forte (Sonnet).
### Status: em validação, não fechado
A dúvida levantada foi legítima: "2 LLMs é exagero para o volume do MVP?". Decisão: **não descartar preventivamente, validar com dado real antes de simplificar ou manter.**
 
### Argumentos a favor de manter separado
- **Prompt caching**: o prompt do LLM 1 (cartões, categorias) é estático e cacheável; misturar os exemplos few-shot dinâmicos (que mudam a cada chamada) do LLM 2 quebraria esse cache.
- **Separação de responsabilidade**: extração é tarefa mecânica; categorização com poucos exemplos é tarefa de julgamento — modelos tendem a performar melhor com um objetivo por prompt.
- **LLM 2 já é condicional**: o design já reduz o custo/latência ao só chamar em ~15-20% dos casos (não é "2 LLMs sempre").
### Argumentos a favor de simplificar para 1 chamada
- Menos latência média (elimina 1 round-trip de ~500ms-1s em 15-20% dos casos).
- Menos código, menos pontos de falha, menos parsing de JSON.
- Modelos atuais podem ser bons o bastante para extração + categorização numa única chamada, se o prompt incluir a lista de categorias.
### Critério de decisão definido
Rodar o MVP por 1-2 semanas (ou testar retroativamente com ~20-30 lançamentos da planilha antiga) e comparar:
- Quantas vezes o LLM 2 realmente dispara.
- Se ele muda a categoria/mantra para algo genuinamente melhor, ou se o LLM 1 sozinho (com prompt incluindo categorias + poucos exemplos) já chegaria ao mesmo resultado em ~90%+ dos casos.
Se a taxa de acerto do LLM 1 sozinho for alta o suficiente → eliminar LLM 2, simplificar pipeline. Caso contrário → manter os dois, pois qualidade de categorização financeira importa mais que economizar latência.
 
**Ação pendente:** rodar esse teste comparativo antes de finalizar o pipeline de produção.
 
---
 
## 6. Escopo do LLM 2 (herdado do Design Técnico v2.1, reafirmado)
 
Validação estrutural (parcelado → tem parcelas; boleto → tem vencimento) é feita em **código**, não em LLM. Isso já era uma decisão tomada antes desta rodada de conversas e permanece válida — reduz ainda mais a carga colocada nos LLMs, reforçando o racional da seção 5.
 
---
 
## 7. Caminho de evolução (quando crescer além de 10 usuários)
 
| Fase | Usuários | Mudança de stack | Custo estimado |
|---|---|---|---|
| MVP | até 100 | Nenhuma | R$0 + LLM |
| Early traction | ~500 | Nenhuma (D1 ainda comporta) | R$0–15 + LLM |
| Scaling | 1.000–10.000 | Workers pago ($5–20/mês); possível migração de dados para Postgres (Neon/Supabase) se precisar de features relacionais avançadas ou passar de 10GB por banco D1 | R$50–150/mês |
| SaaS multi-tenant | 10.000+ | Sharding de D1 por tenant ou migração completa para Postgres com RLS; reavaliar WhatsApp se a base pedir; reavaliar Turso para banco-por-tenant | Variável |
 
Código de negócio (pipeline LLM1→LLM2, `invoice_for()`, validações) muda pouco nessa evolução — a troca é majoritariamente na camada de driver/conexão de banco e no transporte de LLM (já abstraído).
 
---
 
## 8. Decisões em aberto (não bloqueiam o MVP)
 
- [ ] Rodar teste comparativo LLM 1 sozinho vs. pipeline LLM1+LLM2 (seção 5) e decidir se simplifica.
- [ ] Confirmar biblioteca de acesso ao D1 a partir do Worker (binding nativo `env.DB` é suficiente; ORM tipo Drizzle é opcional).
- [ ] Definir se `pending_conversations` usa TTL via job de limpeza (Cron) ou verificação `expires_at` na leitura.
- [ ] Avaliar Turso como alternativa a D1 apenas se o modelo de "um banco por usuário" se tornar prioridade antes de considerar Postgres.
- [ ] Validar qualidade de extração em português se/quando trocar para GPT-4o-mini (Fase 2 do plano de créditos).
---
 
## 9. Arquivos de referência já gerados
 
| Arquivo | Conteúdo |
|---|---|
| `Stack_Tecnica_MVP.md` | Primeira versão da consolidação da stack (Telegram + Workers + D1) |
| `llm-provider.ts` | Implementação da abstração multi-provider de LLM |
| `wrangler.example.toml` | Exemplo de configuração de ambiente com troca de provider |
| Este documento | Consolidação viva de todas as decisões — atualizar a cada nova decisão relevante |
 






0