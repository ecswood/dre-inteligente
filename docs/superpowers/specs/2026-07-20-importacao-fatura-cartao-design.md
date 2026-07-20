# Importação de Fatura de Cartão de Crédito (Sicredi) — Design

> **Para quem for implementar:** use a skill `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` pra executar o plano tarefa por tarefa.

**Objetivo:** hoje o pagamento da fatura do cartão de crédito entra na DRE como um único lançamento cheio ("FATURA CARTAO CREDITO"), inteiro classificado em "Despesas Administrativas (Gerais)". Isso esconde a composição real do gasto (internet, seguro, combustível, assinaturas de software, retiradas pessoais, etc.). Esta feature importa o extrato detalhado da fatura (CSV exportado do Sicredi), sugere o plano de contas de cada item individual com base no que já foi classificado antes, deixa o usuário revisar/confirmar, e substitui o lançamento cheio pelos itens individuais no mês correto da DRE.

**Arquitetura:** nova tela no portal DRE Inteligente ("Importar Fatura de Cartão"). Client-side, sem backend — segue o mesmo modelo do restante do app (estado em `localStorage`). Fluxo: upload do CSV → parsing → localizar o lançamento cheio correspondente no DRE do mês → sugerir plano de contas por item (novo mapeamento comerciante→plano de contas, aprendido ao longo do tempo) → tela de revisão com conferência de totais → confirmar → substituir no `DREData` daquele mês.

**Stack:** React 19 + TypeScript, mesmo padrão de `dreParser.ts`/`MappingEditor.tsx` já existentes. Sem novas dependências externas necessárias (parsing de CSV é simples o suficiente pra fazer com split manual, dado o formato irregular do arquivo — ver seção de parsing).

## Global Constraints

- **Sem backend/banco de dados** — todo o estado novo (mapeamento comerciante→plano de contas, histórico de faturas já importadas) fica em `localStorage`, mesmo modelo do resto do app. Isso é uma decisão de arquitetura já estabelecida do projeto (ver skill `dre-ops`) — não introduzir persistência de servidor sem alinhar com o Edison antes.
- **Regime de caixa, não competência**: todo item de uma fatura importada é registrado no **mês do lançamento cheio que está sendo substituído** (data de vencimento/débito da fatura), nunca na data de compra original do item (que pode ser meses antes, no caso de parcelas). O CSV mostra a data da compra só como referência visual na tela de revisão — não é usada para decidir o mês na DRE.
- **Reaproveita o plano de contas existente**: a sugestão por item aponta para um dos planos de conta já cadastrados em `isp_dre_mapping.json`/`DEFAULT_MAPPING` (mesmos códigos usados pelos lançamentos do caixa). Não existe uma categoria DRE "paralela" só para itens de cartão — o mapeamento plano de contas → categoria DRE que já existe continua sendo a única fonte de verdade.
- **Itens pessoais entram como Pró-Labore, não são excluídos**: gastos pessoais feitos no cartão da empresa são classificados no plano de contas já existente `02.03.02.07 : Pro-Labore` (`6.1 Despesas Administrativas (Pessoal)`, `action: include`) — contam como despesa de pessoal de verdade na DRE, igual pró-labore direto. Não existe opção de "excluir por ser pessoal" nesta feature.
- **Conferência de total obrigatória antes de confirmar**: a substituição do lançamento cheio só é permitida quando a soma dos itens classificados bater exatamente com o "Valor Total" da fatura (ver seção de reconciliação/Encargos abaixo). Enquanto não bater, o botão de confirmar fica desabilitado.
- **Um cartão pode ter mais de um "bloco" no mesmo CSV** (titular adicional) — todos os itens de todos os blocos de uma mesma fatura entram na mesma substituição, já que representam o mesmo pagamento único que sai da conta.

---

## Formato de entrada (CSV do Sicredi)

Arquivo de texto UTF-8 com BOM, separado por `;`, sem ser um CSV tabular estrito (linhas de cabeçalho/resumo com formato próprio, blocos por cartão, linhas em branco entre seções). Estrutura observada (ver `/home/edison/sicredi_1784580966.csv` como referência real):

```
 Associado ;NOME DA EMPRESA;;;;
 Cooperativa ;NNNN;;;;
 Conta Corrente ;NNNNN-N;;;;
 Cartão Sicredi Visa Empresarial;;;;;
NNNN.NNXX.XXXX.NNNN ; CNPJ;;;;

 Data de Vencimento ;DD/MM/AAAA;;;;
 Valor Total (R$) ;"R$ N.NNN,NN";;;;
 Pagamento Mínimo (R$) ;"R$ N.NNN,NN";;;;
 Situação ;Fechada;;;;

 Resumo de Despesas ;;;;;
 Total da fatura anterior (R$) ;"R$ N.NNN,NN";;;;
 (-) Pagamentos / Creditos (R$) ;"R$ -N.NNN,NN";;;;
 (+) Encargos (R$) ;"R$ NN,NN";;;;
 (+) Despesas / Debitos no Brasil (R$) ;"R$ N.NNN,NN";;;;
 (+) Despesas / Debitos no exterior (R$) ;"R$ N.NNN,NN";;;;
 (=) Total desta fatura (R$) ;"R$ N.NNN,NN";;;;

 Histórico de Despesas ;;;;;
Cartão ;NNNN.NNXX.XXXX.NNNN;NOME DO TITULAR;;;;

 Data ; Descrição ; Parcela ; Valor ; Valor em Dólar ;;
DD/MM/AAAA;DESCRIÇÃO DO ITEM;(NN/NN);"R$ N.NNN,NN";"U$ N,NN"
...

Cartão ;NNNN.NNXX.XXXX.NNNN;OUTRO TITULAR;;;;

 Data ; Descrição ; Parcela ; Valor ; Valor em Dólar ;;
DD/MM/AAAA;DESCRIÇÃO DO ITEM;;"R$ N.NNN,NN";
...
```

### Regras de parsing

- **Cabeçalho/resumo**: extrair por rótulo de linha (ex: a linha cujo primeiro campo, após `trim()`, é `"Data de Vencimento"` dá a data de vencimento no segundo campo; `"Valor Total (R$)"` dá o valor total; `"(+) Encargos (R$)"` dá o valor de encargos). Valores vêm entre aspas, prefixados por `"R$ "`, com separador de milhar `.` e decimal `,` (ex: `"R$ 7.491,06"` → `7491.06`).
- **Blocos de cartão**: uma linha cujo primeiro campo (trim) começa com `"Cartão"` inicia um novo bloco/titular. A linha seguinte não-vazia com `"Data"`/`"Descrição"`/`"Parcela"`/`"Valor"` é o cabeçalho de colunas daquele bloco (ignorada, só serve de delimitador).
- **Linhas de item**: qualquer linha cujo primeiro campo bate com o padrão `DD/MM/AAAA` é um item. Campos: `Data`, `Descrição` (trim, colapsar espaços múltiplos), `Parcela` (string livre tipo `(03/06)`, ignorada para o cálculo — o valor já é o da parcela), `Valor` (mesmo parsing de moeda do cabeçalho), `Valor em Dólar` (opcional, só exibição).
- **Valores negativos** (ex: `Pag Fat Deb Cc`, `-R$ 5.416,05`) são pagamentos/créditos, não despesas — excluídos automaticamente da lista de itens a classificar (não aparecem na tela de revisão, não entram na soma a conferir).
- Linhas vazias, linhas de cabeçalho de coluna e linhas de resumo são ignoradas na extração de itens.

---

## Reconciliação de totais (Encargos)

A soma dos itens com `Data` (excluindo os negativos) frequentemente **não bate exatamente** com o `"Valor Total (R$)"` do cabeçalho — a diferença corresponde ao `"(+) Encargos (R$)"` do resumo, que é um valor agregado (juros/tarifas) sem quebra em itens individuais.

Regra: `diferença = ValorTotal - somaItensPositivos`. Se `diferença > 0` (com tolerância de arredondamento de R$ 0,01), o sistema cria automaticamente um item sintético adicional:

```
{ descrição: "Encargos financeiros da fatura", valor: diferença, data: <data de vencimento> }
```

com plano de contas já pré-sugerido `"02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL"` (já mapeado para `6.3 Despesas Financeiras (Encargos)`), editável como qualquer outro item. Se `diferença` for zero (dentro da tolerância), nenhum item sintético é criado.

Se a diferença for negativa ou maior que o valor de Encargos do resumo (sinal de que o parsing perdeu algo), a tela de revisão mostra um alerta e não permite confirmar — pede pra revisar o arquivo.

---

## Localização do lançamento a substituir

Dado o `DREData` do mês (já carregado no `isp_dre_database` via upload do `caixahistorico.xlsx`), buscar em `transactions` um lançamento cujo:
- `planoDeContas` seja um dos conhecidos como fatura de cartão: `"02.02.03.04 : FATURA CARTAO CREDITO"` ou `"02.03.04 : Cartão de Credito"` (lista extensível — novos códigos de cartão podem ser adicionados no futuro sem mudar a lógica).
- `saida` bata com o `Valor Total` da fatura importada (tolerância de R$ 0,01).

**Resultado único encontrado**: mostrar pro usuário pra confirmar ("Encontrei o lançamento de R$ X em DD/MM — é esse?") antes de prosseguir.

**Nenhum ou mais de um candidato**: listar os lançamentos de plano de contas de cartão daquele mês (ou de todos os meses carregados, se não houver no mês esperado) e pedir que o usuário aponte manualmente qual substituir.

---

## Mapeamento comerciante → plano de contas (aprendizado)

Nova estrutura em `localStorage`, chave `isp_card_merchant_mapping`:

```typescript
type CardMerchantMapping = Record<string, { planoDeContas: string; updatedAt: string }>;
// chave: descrição do item normalizada (trim + colapsar espaços + uppercase)
// valor: um dos planos de conta já existentes em DEFAULT_MAPPING/isp_dre_mapping.json
```

Ao processar os itens de uma fatura:
1. Para cada item, normalizar a descrição e buscar em `isp_card_merchant_mapping`.
2. **Encontrado**: pré-preencher o plano de contas sugerido (editável).
3. **Não encontrado**: verificar contra um pequeno conjunto de padrões nativos (sem precisar perguntar), cobrindo casos genéricos de fatura de cartão que já têm plano de contas óbvio no mapeamento existente:
   - descrição contém `"IOF"` → sugerir `"DÉB.IOF : 02.03.09"`
   - descrição contém `"JUROS"` ou `"MORA"` ou `"MULTA"` → sugerir `"02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL"`
   - item sintético de Encargos (seção anterior) → mesma sugestão, `"02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL"` (já vem pré-preenchida na criação do item, não depende desta etapa)
4. **Ainda não encontrado**: nenhuma sugestão — campo em branco, usuário escolhe manualmente na tela de revisão (dropdown com todos os planos de conta do mapeamento atual, incluindo o de Pro-Labore pros itens pessoais).
5. **Ao confirmar a importação**: para todo item cujo plano de contas final (escolhido ou aceito) seja diferente do que já estava salvo (ou que seja novo), gravar/atualizar `isp_card_merchant_mapping[descriçãoNormalizada]`. Isso faz a sugestão "aprender" — na próxima fatura, o mesmo comerciante já vem pré-preenchido.

Este mapeamento é **separado** do `isp_dre_mapping` (plano de contas → categoria DRE) — ele só resolve descrição de item de cartão → plano de contas. O caminho plano de contas → categoria DRE continua sendo feito pelo mapeamento que já existe, sem duplicação de regra.

---

## Tela de importação

### Passo 1 — Upload
Input de arquivo (`.csv`), aceita o formato descrito acima.

### Passo 2 — Localizar fatura
Mostra o candidato a lançamento substituído (ou pede escolha manual, conforme seção acima) com confirmação explícita do usuário antes de prosseguir.

### Passo 3 — Revisão dos itens
Tabela com uma linha por item (já incluindo o item sintético de Encargos, se houver):

| Data (compra, só referência) | Descrição | Valor | Valor em Dólar (se houver) | Plano de Contas sugerido | Plano de Contas final (dropdown editável) |

No topo: resumo `Total da fatura: R$ X | Soma classificada: R$ Y` com indicação visual clara (verde se bater, vermelho se não). Botão **"Confirmar e substituir no DRE"** desabilitado enquanto:
- Algum item não tiver plano de contas escolhido, ou
- A soma não bater com o total da fatura (tolerância R$ 0,01).

### Passo 4 — Confirmação e substituição
Ao confirmar:
1. Remove o lançamento cheio original (`FATURA CARTAO CREDITO`/`Cartão de Credito`) do `DREData.transactions` daquele mês.
2. Adiciona um `Transaction` por item da fatura (todos com `dataCadastro`/`dataCompetencia` = data de vencimento/débito da fatura, `planoDeContas` = escolhido, `saida` = valor, `historico` = descrição original do item, `categoriaDRE` derivada do mapeamento plano de contas → categoria DRE já existente).
3. Recalcula os totais/linhas da DRE daquele mês (reaproveitando a mesma lógica de agregação de `parseCaixaExcel`, refatorada se necessário para ser chamável sobre uma lista de transações já pronta, não só a partir de um Excel).
4. Salva o `DREData` atualizado de volta no `isp_dre_database`.
5. Grava/atualiza o mapeamento comerciante → plano de contas (seção anterior).

---

## Testes

- Parsing do CSV: extrai corretamente cabeçalho (valor total, encargos, data de vencimento), múltiplos blocos de cartão, itens com e sem parcela/valor em dólar, ignora linha de pagamento negativa.
- Reconciliação: soma bate exato → nenhum item sintético; soma menor que o total → cria item de Encargos com o valor certo; diferença negativa ou maior que os encargos do resumo → bloqueia com alerta.
- Localização do lançamento: encontra único candidato por plano de contas + valor; múltiplos candidatos ou nenhum → exige escolha manual.
- Mapeamento comerciante → plano de contas: item já visto antes vem pré-preenchido; item novo vem em branco (exceto padrões nativos de IOF/juros); ao confirmar, grava o mapeamento novo/atualizado.
- Substituição no DRE: lançamento cheio original é removido, itens novos aparecem com o mês correto (data da fatura, não data de compra), totais da DRE recalculados batem com o valor total da fatura.

## Fora de escopo

- Autenticação/backend real — continua tudo em `localStorage`, por navegador.
- Suporte a outros bancos/bandeiras de cartão além do formato Sicredi descrito.
- Qualquer tratamento diferenciado para parcelas além de tratar o valor da parcela como o valor a classificar (não há necessidade de rastrear o total da compra original nem parcelas futuras).
- Edição retroativa de faturas já importadas (reimportar substituindo uma importação anterior) — se necessário no futuro, é uma decisão de arquitetura separada.
