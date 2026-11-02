# ADR-005 — Pivô: o Gaston vira o caixa do motorista de aplicativo

Status: **aceito** · Data: 2026-11-02 · Contexto: o usuário roda como motorista de aplicativo e
quer usar o Gaston pra medir a operação (ganhos, custos, produtividade), não só pra registrar
gastos pessoais.

## Decisão

O Gaston deixa de ser um registrador de gastos pessoais e passa a ser o **caixa do motorista**:
registra **receitas** (com plataforma), **gastos** e **jornadas** (km, tempo online, corridas) e
mede produtividade por **semana** (seg–dom). Gastos de trabalho e pessoais ficam **no mesmo saco**:
não há marcação "trabalho × pessoal", e **lucro = receita − todos os gastos**.

O mantra **não é removido**: continua inferido e gravado, mas fica invisível ao usuário (fora do
painel, das mensagens e das respostas do agente). A remoção total (código + migration) foi
rejeitada pelo dono, pra preservar o dado sem expô-lo.

## Considered Options

- **Separar trabalho × pessoal pela categoria** (custo do veículo = trabalho, o resto = pessoal):
  deixaria o lucro e o R$/hora "honestos" (o aluguel não derruba o R$/h). Rejeitada pelo dono em
  favor da simplicidade de um saco só.
- **Só motorista** (todo gasto conta como operação): mesmo número que o escolhido, mas assume que o
  usuário não registra vida pessoal — e ele registra.

## Consequências

- O **lucro** é ruidoso: um gasto pessoal grande derruba o lucro da semana. Mitigação: a métrica
  de destaque é o ganho **bruto** por hora/km; o lucro por hora/km é secundário e calculado só na
  semana, nunca por dia.
- Se um dia quisermos separar trabalho × pessoal, o histórico não terá essa marcação; a separação
  por categoria (custo do veículo) é a saída mais barata, porque não exige dado novo.
- `/status` muda de "gastos do mês" para "resumo da semana atual"; o painel vira semanal (com aba
  Mês) e perde o filtro de intervalo livre.

Ver os termos em `CONTEXT.md` → *Motorista de aplicativo* e o plano em
[`docs/plano-pivo-motorista.md`](../plano-pivo-motorista.md).
