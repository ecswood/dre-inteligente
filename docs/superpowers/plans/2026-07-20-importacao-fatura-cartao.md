# Importação de Fatura de Cartão de Crédito (Sicredi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** importar o extrato detalhado da fatura do cartão Sicredi (CSV), sugerir automaticamente o plano de contas de cada item (aprendendo com o tempo), conferir os totais, e substituir o lançamento cheio da fatura no `caixahistorico` pelos itens individuais, no mês certo da DRE.

**Architecture:** nova aba "Importar Fatura de Cartão" no portal (React/TypeScript, client-side, `localStorage`). Cinco novos módulos utilitários puros (parsing do CSV, reconciliação de totais, mapeamento comerciante→plano de contas, localização do lançamento a substituir, substituição/recalculo da DRE) + um componente de UI que orquestra o fluxo, reaproveitando o padrão de upload/callback já usado por `Dashboard.tsx`. `dreParser.ts` ganha uma função nova extraída (`aggregateTransactions`) pra recalcular linhas/totais a partir de uma lista de transações já pronta, sem precisar reprocessar um Excel.

**Tech Stack:** React 19 + TypeScript + Vite 8, mesmo padrão dos componentes existentes (`className` + CSS já definido em `index.css`, ícones `lucide-react`). Vitest (novo, mínimo) só para os módulos utilitários puros — sem teste de componente/UI.

**Spec original:** `docs/superpowers/specs/2026-07-20-importacao-fatura-cartao-design.md`

## Global Constraints

- Sem backend/banco de dados — tudo em `localStorage`, mesmo modelo do resto do app.
- Todo item importado é registrado no **mês do lançamento cheio que está sendo substituído** (data de vencimento/débito da fatura) — nunca na data de compra original do CSV.
- Sugestão de classificação sempre aponta pra um plano de contas **já existente** no mapeamento atual (`Object.keys(mapping)`) — nunca uma categoria DRE "paralela".
- Itens pessoais são classificados no plano de contas já existente `"02.03.02.07 : Pro-Labore"` (`6.1 Despesas Administrativas (Pessoal)`, `action: include`) — **sem exclusão**, contam como despesa de pessoal de verdade.
- Confirmação da importação só é permitida quando a soma dos itens classificados bater exatamente (tolerância R$ 0,01) com o "Valor Total" da fatura.
- Planos de conta de fatura de cartão reconhecidos para localizar o lançamento a substituir: `"02.02.03.04 : FATURA CARTAO CREDITO"` e `"02.03.04 : Cartão de Credito"` (strings exatas do mapeamento real).
- Sugestões nativas (sem precisar aprender): descrição contendo `"IOF"` → `"DÉB.IOF : 02.03.09"`; descrição contendo `"JUROS"`, `"MORA"` ou `"MULTA"` → `"02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL"`.
- Item sintético de Encargos (quando sobra diferença entre soma dos itens e valor total da fatura) vem pré-classificado em `"02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL"`.
- Rebuild + `pm2 restart dre-portal` obrigatório para qualquer mudança de código entrar no ar (`vite preview` serve `dist/` já compilado) — ver skill `dre-ops`.
- Commit em português, um por tarefa completa.

---

### Task 1: Configuração do Vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/utils/smoke.test.ts`

**Interfaces:**
- Produz: comando `npm test` rodando Vitest em modo não-interativo (`vitest run`).

- [ ] **Passo 1: Adicionar a dependência e o script**

Em `package.json`, adicionar ao `devDependencies`:

```json
    "vitest": "^3.2.0"
```

E ao bloco `scripts`, adicionar:

```json
    "test": "vitest run"
```

- [ ] **Passo 2: Instalar**

```bash
cd /home/edison/dre-inteligente
npm install
```

Esperado: instala sem erro. Se a versão `^3.2.0` do vitest não resolver por incompatibilidade de peer deps com React 19/Vite 8, ajustar para a versão mais recente compatível disponível no registry e repetir.

- [ ] **Passo 3: Configurar o Vitest no `vite.config.ts`**

Conteúdo final do arquivo (troca o import de `defineConfig` de `'vite'` para `'vitest/config'` — só esse módulo tipa o campo `test`, senão o TypeScript acusa erro nele):

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  preview: {
    allowedHosts: ['dre.snitelecom.com.br', '147.15.57.112']
  },
  test: {
    environment: 'node'
  }
})
```

- [ ] **Passo 4: Escrever um teste de fumaça pra confirmar que o Vitest roda**

Criar `src/utils/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('vitest smoke test', () => {
  it('roda de verdade', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Passo 5: Rodar e confirmar que passa**

```bash
npm test
```

Esperado: `1 passed`.

- [ ] **Passo 6: Remover o teste de fumaça e commitar só a configuração**

```bash
rm src/utils/smoke.test.ts
git add package.json package-lock.json vite.config.ts
git commit -m "$(cat <<'EOF'
Adiciona Vitest para testar a lógica de cálculo/parsing

Sem framework de teste até agora (tudo verificado manualmente). Como a
feature de importação de fatura de cartão tem bastante lógica de
parsing/reconciliação onde um erro sutil mexe direto no valor da DRE,
adiciona Vitest (config mínima) só pra essas funções puras - sem teste
de UI/componente.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extrair `aggregateTransactions` de `dreParser.ts`

**Files:**
- Modify: `src/utils/dreParser.ts`
- Create: `src/utils/dreParser.test.ts`

**Interfaces:**
- Produz: `export function aggregateTransactions(transactions: Transaction[]): { lines: DRELine[]; totals: DREData['totals'] }` — usada pela Task 7 (`cardInvoiceReplacement.ts`) pra recalcular a DRE depois de substituir o lançamento cheio pelos itens do cartão, sem precisar reprocessar nenhum Excel.
- Consome: `Transaction`, `DRELine`, `DREData` (já existentes, sem mudança de forma).

Esta é uma refatoração **sem mudança de comportamento**: hoje `parseCaixaExcel` calcula as somas por categoria dentro do mesmo laço que extrai as transações do Excel. Vamos separar em duas fases (extrair transações já categorizadas → agregar), sem mudar nenhum resultado.

- [ ] **Passo 1: Escrever teste de caracterização (captura o comportamento atual) usando um Excel mínimo gerado em memória**

Criar `src/utils/dreParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCaixaExcel, aggregateTransactions, DEFAULT_MAPPING, type Transaction } from './dreParser';

function buildFakeCaixaExcel(rows: (string | number)[][]): ArrayBuffer {
  const header = [
    'Código', 'Ponto Recebimento', 'Data de Cadastro', 'Data de Competência',
    'Modo Pagamento', 'Histórico', 'Usuário', 'Plano de Contas', 'Entrada', 'Saída'
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Caixa');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out;
}

describe('parseCaixaExcel + aggregateTransactions', () => {
  it('classifica e soma uma receita e uma despesa mapeadas', () => {
    const buffer = buildFakeCaixaExcel([
      ['1', 'Ponto A', '01/06/2026', '01/06/2026', 'PIX', 'Mensalidade Cliente X', 'user1', '01.01.01 : Mensalidade', 150, ''],
      ['2', 'Ponto A', '02/06/2026', '02/06/2026', 'Débito', 'Combustível carro', 'user1', '02.01.04.01 : Combustivel', '', 80]
    ]);

    const result = parseCaixaExcel(buffer, DEFAULT_MAPPING);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].categoriaDRE).toBe('1.2 Receita de Internet (SVA)');
    expect(result.transactions[1].categoriaDRE).toBe('4.5 Manutenção de Rede / Licenças Técnicas');
    expect(result.totals.receitaBruta).toBe(150);
    expect(result.totals.csp).toBe(80);
    expect(result.unmapped).toEqual([]);
  });

  it('marca plano de contas desconhecido como NÃO MAPEADO e não soma em nenhuma categoria', () => {
    const buffer = buildFakeCaixaExcel([
      ['1', 'Ponto A', '01/06/2026', '01/06/2026', 'PIX', 'Conta nova', 'user1', '99.99 : Conta Inexistente', '', 500]
    ]);

    const result = parseCaixaExcel(buffer, DEFAULT_MAPPING);

    expect(result.transactions[0].categoriaDRE).toBe('NÃO MAPEADO');
    expect(result.unmapped).toEqual(['99.99 : Conta Inexistente']);
    expect(result.totals.opex).toBe(0);
  });

  it('aggregateTransactions calcula os mesmos totais a partir de uma lista de transações já pronta', () => {
    const transactions: Transaction[] = [
      {
        codigo: '1', pontoRecebimento: '', dataCadastro: '01/06/2026', dataCompetencia: '01/06/2026',
        modoPagamento: 'PIX', historico: 'Mensalidade', usuario: '', planoDeContas: '01.01.01 : Mensalidade',
        entrada: 150, saida: null, categoriaDRE: '1.2 Receita de Internet (SVA)'
      },
      {
        codigo: '2', pontoRecebimento: '', dataCadastro: '02/06/2026', dataCompetencia: '02/06/2026',
        modoPagamento: 'Débito', historico: 'Combustível', usuario: '', planoDeContas: '02.01.04.01 : Combustivel',
        entrada: null, saida: 80, categoriaDRE: '4.5 Manutenção de Rede / Licenças Técnicas'
      }
    ];

    const { totals } = aggregateTransactions(transactions);

    expect(totals.receitaBruta).toBe(150);
    expect(totals.csp).toBe(80);
  });

  it('aggregateTransactions ignora transações EXCLUÍDO DA DRE e NÃO MAPEADO', () => {
    const transactions: Transaction[] = [
      {
        codigo: '1', pontoRecebimento: '', dataCadastro: '01/06/2026', dataCompetencia: '01/06/2026',
        modoPagamento: 'PIX', historico: 'Transferência', usuario: '', planoDeContas: '03.02 : TRANSFERENCIA ENTRE CONTAS',
        entrada: 1000, saida: null, categoriaDRE: 'EXCLUÍDO DA DRE'
      },
      {
        codigo: '2', pontoRecebimento: '', dataCadastro: '02/06/2026', dataCompetencia: '02/06/2026',
        modoPagamento: 'Débito', historico: 'Desconhecido', usuario: '', planoDeContas: '99.99 : X',
        entrada: null, saida: 500, categoriaDRE: 'NÃO MAPEADO'
      }
    ];

    const { totals } = aggregateTransactions(transactions);

    expect(totals.receitaBruta).toBe(0);
    expect(totals.opex).toBe(0);
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha (a função `aggregateTransactions` ainda não existe)**

```bash
npm test
```

Esperado: falha com algo como "aggregateTransactions is not a function" ou erro de import — a função ainda não é exportada por `dreParser.ts`.

- [ ] **Passo 3: Extrair a função em `dreParser.ts`**

No arquivo `src/utils/dreParser.ts`, substituir o bloco que vai desde `const sums: Record<string, { entrada: number; saida: number }> = {};` (linha ~180) até o fechamento do `dataRows.forEach` (linha ~336), inclusive toda a lógica de `sums`/`possibleCategories`/agregação que vem depois (linhas ~338-427), pelo seguinte:

Trocar (dentro de `parseCaixaExcel`, removendo a inicialização de `sums`/`possibleCategories` e a soma inline no fim do `forEach`):

```typescript
  // Mapeamento ativo
  const activeMapping = customMapping || DEFAULT_MAPPING;
  
  const transactions: Transaction[] = [];
  const unmappedSet = new Set<string>();
  
  // Mapear cabeçalhos para colunas
```

(ou seja, remove as linhas `const sums = {}`, o bloco `possibleCategories.forEach(...)` e a inicialização de `possibleCategories` — tudo isso passa a viver dentro de `aggregateTransactions`).

Dentro do `dataRows.forEach(row => { ... })`, remover o bloco final que fazia a soma (linhas ~331-335 do arquivo original):

```typescript
    // Se a categoria for válida e inclusa, somar
    if (!isExcluded && categoriaDRE !== "NÃO MAPEADO" && sums[categoriaDRE]) {
      if (entradaVal !== null) sums[categoriaDRE].entrada += entradaVal;
      if (saidaVal !== null) sums[categoriaDRE].saida += saidaVal;
    }
```

— esse bloco inteiro é removido do `forEach` (a soma agora acontece em `aggregateTransactions`, numa passada separada sobre `transactions` já pronto).

Depois do `dataRows.forEach(...)` terminar, no lugar de todo o cálculo de `getEntrada`/`getSaida`/`receitaBruta`/.../`lines` (linhas ~338-427 originais), colocar:

```typescript
  const { lines, totals } = aggregateTransactions(transactions);
  
  const { id: monthId, label: monthLabel } = extractMonthLabel(transactions);
  
  return {
    monthId,
    monthLabel,
    lines,
    transactions,
    unmapped: Array.from(unmappedSet),
    totals
  };
}
```

E adicionar a nova função exportada logo **acima** de `parseCaixaExcel` (antes de `export function parseCaixaExcel(...)`):

```typescript
const DRE_POSSIBLE_CATEGORIES = [
  "1.2 Receita de Internet (SVA)",
  "1.3 Taxas de Instalação e Adesão",
  "1.4 Outras Receitas (Equipamentos)",
  "1.4 Outras Receitas (Serviços Avulsos)",
  "1.4 Outras Receitas (Diversas)",
  "2.1 Tributos sobre Serviços (DARF)",
  "4.1 Links Dedicados / Trânsito IP",
  "4.2 Postes e Aluguel de Infraestrutura",
  "4.5 Manutenção de Rede / Licenças Técnicas",
  "6.1 Despesas Administrativas (Pessoal)",
  "6.1 Despesas Administrativas (Infra)",
  "6.1 Despesas Administrativas (Gerais)",
  "6.3 Despesas Financeiras (Taxas Boleto)",
  "6.3 Despesas Financeiras (Gerais)",
  "6.3 Despesas Financeiras (Encargos)",
  "6.4 Outras Despesas Operacionais",
  "8.1 Amortização de Empréstimos e Financiamentos"
];

export function aggregateTransactions(transactions: Transaction[]): { lines: DRELine[]; totals: DREData['totals'] } {
  const sums: Record<string, { entrada: number; saida: number }> = {};
  DRE_POSSIBLE_CATEGORIES.forEach(cat => {
    sums[cat] = { entrada: 0, saida: 0 };
  });

  transactions.forEach(t => {
    if (t.categoriaDRE !== "EXCLUÍDO DA DRE" && t.categoriaDRE !== "NÃO MAPEADO" && sums[t.categoriaDRE]) {
      if (t.entrada !== null) sums[t.categoriaDRE].entrada += t.entrada;
      if (t.saida !== null) sums[t.categoriaDRE].saida += t.saida;
    }
  });

  const getEntrada = (cat: string) => sums[cat]?.entrada || 0;
  const getSaida = (cat: string) => Math.abs(sums[cat]?.saida || 0);

  const recInternet = getEntrada("1.2 Receita de Internet (SVA)");
  const recAdesao = getEntrada("1.3 Taxas de Instalação e Adesão");
  const recEquip = getEntrada("1.4 Outras Receitas (Equipamentos)");
  const recServicos = getEntrada("1.4 Outras Receitas (Serviços Avulsos)");
  const recDiversas = getEntrada("1.4 Outras Receitas (Diversas)");
  const receitaBruta = recInternet + recAdesao + recEquip + recServicos + recDiversas;

  const deducoes = getSaida("2.1 Tributos sobre Serviços (DARF)");

  const rol = receitaBruta - deducoes;

  const cLink = getSaida("4.1 Links Dedicados / Trânsito IP");
  const cInfra = getSaida("4.2 Postes e Aluguel de Infraestrutura");
  const cManut = getSaida("4.5 Manutenção de Rede / Licenças Técnicas");
  const csp = cLink + cInfra + cManut;

  const margemContrib = rol - csp;

  const dPessoal = getSaida("6.1 Despesas Administrativas (Pessoal)");
  const dInfra = getSaida("6.1 Despesas Administrativas (Infra)");
  const dGerais = getSaida("6.1 Despesas Administrativas (Gerais)");
  const dFinBoleto = getSaida("6.3 Despesas Financeiras (Taxas Boleto)");
  const dFinGerais = getSaida("6.3 Despesas Financeiras (Gerais)");
  const dFinEncargos = getSaida("6.3 Despesas Financeiras (Encargos)");
  const dOutras = getSaida("6.4 Outras Despesas Operacionais");
  const opex = dPessoal + dInfra + dGerais + dFinBoleto + dFinGerais + dFinEncargos + dOutras;

  const ebitda = margemContrib - opex;

  const amortizacao = getSaida("8.1 Amortização de Empréstimos e Financiamentos");

  const liquido = ebitda - amortizacao;

  const getPct = (val: number) => (receitaBruta > 0 ? (val / receitaBruta) : 0);

  const lines: DRELine[] = [
    { account: "1. RECEITA OPERACIONAL BRUTA", value: receitaBruta, pct: getPct(receitaBruta), style: 'group' },
    { account: "  1.2 Receita de Internet (SVA)", value: recInternet, pct: getPct(recInternet), style: 'subgroup' },
    { account: "  1.3 Taxas de Instalação e Adesão", value: recAdesao, pct: getPct(recAdesao), style: 'subgroup' },
    { account: "  1.4 Outras Receitas (Equipamentos)", value: recEquip, pct: getPct(recEquip), style: 'subgroup' },
    { account: "  1.4 Outras Receitas (Serviços Avulsos)", value: recServicos, pct: getPct(recServicos), style: 'subgroup' },
    { account: "  1.4 Outras Receitas (Diversas)", value: recDiversas, pct: getPct(recDiversas), style: 'subgroup' },
    { account: "  (=) Total Receita Bruta", value: receitaBruta, pct: getPct(receitaBruta), style: 'total' },

    { account: "2. (-) DEDUÇÕES E TRIBUTOS", value: deducoes, pct: getPct(deducoes), style: 'group' },
    { account: "  2.1 Tributos sobre Serviços (DARF)", value: deducoes, pct: getPct(deducoes), style: 'subgroup' },
    { account: "  (=) Total Deduções", value: deducoes, pct: getPct(deducoes), style: 'total' },

    { account: "3. (=) RECEITA OPERACIONAL LÍQUIDA (ROL)", value: rol, pct: getPct(rol), style: 'net_income' },

    { account: "4. (-) CUSTOS DOS SERVIÇOS PRESTADOS (CSP)", value: csp, pct: getPct(csp), style: 'group' },
    { account: "  4.1 Links Dedicados / Trânsito IP", value: cLink, pct: getPct(cLink), style: 'subgroup' },
    { account: "  4.2 Postes e Aluguel de Infraestrutura", value: cInfra, pct: getPct(cInfra), style: 'subgroup' },
    { account: "  4.5 Manutenção de Rede / Licenças Técnicas", value: cManut, pct: getPct(cManut), style: 'subgroup' },
    { account: "  (=) Total Custos (CSP)", value: csp, pct: getPct(csp), style: 'total' },

    { account: "5. (=) MARGEM DE CONTRIBUIÇÃO / LUCRO BRUTO", value: margemContrib, pct: getPct(margemContrib), style: 'net_income' },

    { account: "6. (-) DESPESAS OPERACIONAIS (OPEX)", value: opex, pct: getPct(opex), style: 'group' },
    { account: "  6.1 Despesas Administrativas (Pessoal)", value: dPessoal, pct: getPct(dPessoal), style: 'subgroup' },
    { account: "  6.1 Despesas Administrativas (Infra)", value: dInfra, pct: getPct(dInfra), style: 'subgroup' },
    { account: "  6.1 Despesas Administrativas (Gerais)", value: dGerais, pct: getPct(dGerais), style: 'subgroup' },
    { account: "  6.3 Despesas Financeiras (Taxas Boleto)", value: dFinBoleto, pct: getPct(dFinBoleto), style: 'subgroup' },
    { account: "  6.3 Despesas Financeiras (Gerais)", value: dFinGerais, pct: getPct(dFinGerais), style: 'subgroup' },
    { account: "  6.3 Despesas Financeiras (Encargos)", value: dFinEncargos, pct: getPct(dFinEncargos), style: 'subgroup' },
    { account: "  6.4 Outras Despesas Operacionais", value: dOutras, pct: getPct(dOutras), style: 'subgroup' },
    { account: "  (=) Total Despesas (OPEX)", value: opex, pct: getPct(opex), style: 'total' },

    { account: "7. (=) RESULTADO OPERACIONAL (EBITDA)", value: ebitda, pct: getPct(ebitda), style: 'net_income' },

    { account: "8. (-) AMORTIZAÇÃO E OUTROS", value: amortizacao, pct: getPct(amortizacao), style: 'group' },
    { account: "  8.1 Amortização de Empréstimos e Financiamentos", value: amortizacao, pct: getPct(amortizacao), style: 'subgroup' },
    { account: "  (=) Total Amortização", value: amortizacao, pct: getPct(amortizacao), style: 'total' },

    { account: "9. (=) RESULTADO LÍQUIDO DO EXERCÍCIO", value: liquido, pct: getPct(liquido), style: 'net_income' }
  ];

  return {
    lines,
    totals: {
      receitaBruta,
      deducoes,
      rol,
      csp,
      margemContrib,
      opex,
      ebitda,
      amortizacao,
      liquido
    }
  };
}
```

Não mexer em mais nada do arquivo (interfaces `Transaction`/`DRELine`/`DREData`, `DEFAULT_MAPPING`, `extractMonthLabel` — tudo continua igual).

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npm test
```

Esperado: todos os testes de `dreParser.test.ts` passando.

- [ ] **Passo 5: Verificar o build**

```bash
npm run build
```

Esperado: build limpo, sem erro de tipo.

- [ ] **Passo 6: Commit**

```bash
git add src/utils/dreParser.ts src/utils/dreParser.test.ts
git commit -m "$(cat <<'EOF'
Extrai aggregateTransactions de dreParser (sem mudar comportamento)

Separa o cálculo de somas/linhas/totais da DRE (antes só acontecia
dentro do parsing do Excel) numa função pura reutilizável, que a
importação de fatura de cartão vai usar pra recalcular a DRE depois de
substituir o lançamento cheio pelos itens - sem precisar reprocessar
nenhum Excel. Comportamento de parseCaixaExcel não muda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Parser do CSV da fatura Sicredi

**Files:**
- Create: `src/utils/cardStatementParser.ts`
- Create: `src/utils/cardStatementParser.test.ts`

**Interfaces:**
- Produz: `interface CardStatementItem { data: string; descricao: string; valor: number; valorDolar: number | null }`, `interface CardStatement { dataVencimento: string; valorTotal: number; encargos: number; itens: CardStatementItem[] }`, `function parseSicrediCsv(text: string): CardStatement` — usada pela Task 8 (componente de UI) e indiretamente pela Task 4 (reconciliação, que recebe um `CardStatement`).

- [ ] **Passo 1: Escrever os testes usando o arquivo real como fixture**

Criar `src/utils/cardStatementParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSicrediCsv } from './cardStatementParser';

const FATURA_EXEMPLO = `﻿ Associado ;SOLUCAO NET INFORMATICA;;;;
 Cooperativa ;0720;;;;
 Conta Corrente ;29915-4;;;;
 Cartão Sicredi Visa Empresarial;;;;;
4960.45XX.XXXX.0000 ; 10.145.409/0001-50;;;;

 Data de Vencimento ;13/07/2026;;;;
 Valor Total (R$) ;"R$ 7.491,06";;;;
 Pagamento Mínimo (R$) ;"R$ 2.311,03";;;;
 Situação ;Fechada;;;;

 Resumo de Despesas ;;;;;
 Total da fatura anterior (R$) ;"R$ 5.416,05";;;;
 (-) Pagamentos / Creditos (R$) ;"R$ -5.416,05";;;;
 (+) Encargos (R$) ;"R$ 62,41";;;;
 (+) Despesas / Debitos no Brasil (R$) ;"R$ 6.032,66";;;;
 (+) Despesas / Debitos no exterior (R$) ;"R$ 1.395,99";;;;
 (=) Total desta fatura (R$) ;"R$ 7.491,06";;;;

 Histórico de Despesas ;;;;;
Cartão ;4960.45XX.XXXX.1699;Edison C Dos Santos;;;;

 Data ; Descrição ; Parcela ; Valor ; Valor em Dólar ;;
19/06/2026;FUNILARIA E PINTURA;(01/06);"R$ 714,70";
05/06/2026;OPENAI OPENAI COM CA     ;;"R$ 50,92";"U$ 10,00"

Cartão ;4960.45XX.XXXX.0125;Edison C Dos Santos;;;;

 Data ; Descrição ; Parcela ; Valor ; Valor em Dólar ;;
25/06/2026;STARLINK INTERNET        ;;"R$ 189,00";
16/06/2026;Pag Fat Deb Cc;;"R$ -5.416,05";
`;

describe('parseSicrediCsv', () => {
  it('extrai data de vencimento, valor total e encargos do cabeçalho', () => {
    const result = parseSicrediCsv(FATURA_EXEMPLO);

    expect(result.dataVencimento).toBe('13/07/2026');
    expect(result.valorTotal).toBeCloseTo(7491.06, 2);
    expect(result.encargos).toBeCloseTo(62.41, 2);
  });

  it('junta os itens de múltiplos blocos de cartão numa lista só', () => {
    const result = parseSicrediCsv(FATURA_EXEMPLO);

    const descricoes = result.itens.map(i => i.descricao);
    expect(descricoes).toContain('FUNILARIA E PINTURA');
    expect(descricoes).toContain('OPENAI OPENAI COM CA');
    expect(descricoes).toContain('STARLINK INTERNET');
  });

  it('ignora a linha de pagamento da fatura anterior (valor negativo)', () => {
    const result = parseSicrediCsv(FATURA_EXEMPLO);

    const descricoes = result.itens.map(i => i.descricao);
    expect(descricoes).not.toContain('Pag Fat Deb Cc');
    expect(result.itens.every(i => i.valor > 0)).toBe(true);
  });

  it('colapsa espaços múltiplos na descrição', () => {
    const result = parseSicrediCsv(FATURA_EXEMPLO);

    const openai = result.itens.find(i => i.descricao.startsWith('OPENAI'));
    expect(openai?.descricao).toBe('OPENAI OPENAI COM CA');
  });

  it('extrai o valor em dólar quando presente, null quando ausente', () => {
    const result = parseSicrediCsv(FATURA_EXEMPLO);

    const openai = result.itens.find(i => i.descricao.startsWith('OPENAI'));
    const funilaria = result.itens.find(i => i.descricao === 'FUNILARIA E PINTURA');
    expect(openai?.valorDolar).toBeCloseTo(10.00, 2);
    expect(funilaria?.valorDolar).toBeNull();
  });

  it('extrai a data e o valor de cada item corretamente', () => {
    const result = parseSicrediCsv(FATURA_EXEMPLO);

    const starlink = result.itens.find(i => i.descricao === 'STARLINK INTERNET');
    expect(starlink?.data).toBe('25/06/2026');
    expect(starlink?.valor).toBeCloseTo(189.00, 2);
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npm test
```

Esperado: falha porque `./cardStatementParser` não existe.

- [ ] **Passo 3: Implementar**

Criar `src/utils/cardStatementParser.ts`:

```typescript
export interface CardStatementItem {
  data: string;
  descricao: string;
  valor: number;
  valorDolar: number | null;
}

export interface CardStatement {
  dataVencimento: string;
  valorTotal: number;
  encargos: number;
  itens: CardStatementItem[];
}

function parseValorMonetario(raw: string): number {
  const limpo = raw.replace(/"/g, '').replace('R$', '').replace('U$', '').trim();
  return parseFloat(limpo.replace(/\./g, '').replace(',', '.'));
}

function splitCsvLine(line: string): string[] {
  return line.split(';').map(field => field.trim());
}

export function parseSicrediCsv(text: string): CardStatement {
  const semBom = text.replace(/^﻿/, '');
  const linhas = semBom.split(/\r?\n/);

  let dataVencimento = '';
  let valorTotal = 0;
  let encargos = 0;
  const itens: CardStatementItem[] = [];

  const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;

  linhas.forEach(linhaBruta => {
    const campos = splitCsvLine(linhaBruta);
    if (campos.length === 0 || !campos[0]) return;

    const rotulo = campos[0].trim();

    if (rotulo === 'Data de Vencimento') {
      dataVencimento = campos[1]?.trim() || '';
      return;
    }

    if (rotulo === 'Valor Total (R$)') {
      valorTotal = parseValorMonetario(campos[1] || '0');
      return;
    }

    if (rotulo === '(+) Encargos (R$)') {
      encargos = parseValorMonetario(campos[1] || '0');
      return;
    }

    if (dataRegex.test(rotulo)) {
      const descricao = (campos[1] || '').replace(/\s+/g, ' ').trim();
      const valor = parseValorMonetario(campos[3] || '0');
      const valorDolarRaw = campos[4]?.trim();
      const valorDolar = valorDolarRaw ? parseValorMonetario(valorDolarRaw) : null;

      if (valor > 0) {
        itens.push({ data: rotulo, descricao, valor, valorDolar });
      }
    }
  });

  return { dataVencimento, valorTotal, encargos, itens };
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npm test
```

- [ ] **Passo 5: Build**

```bash
npm run build
```

- [ ] **Passo 6: Commit**

```bash
git add src/utils/cardStatementParser.ts src/utils/cardStatementParser.test.ts
git commit -m "$(cat <<'EOF'
Adiciona parser do CSV de fatura de cartão Sicredi

Extrai data de vencimento, valor total, encargos e a lista de itens
(juntando múltiplos blocos de cartão do mesmo arquivo), ignorando a
linha de pagamento da fatura anterior (valor negativo).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Reconciliação de totais (Encargos)

**Files:**
- Create: `src/utils/cardReconciliation.ts`
- Create: `src/utils/cardReconciliation.test.ts`

**Interfaces:**
- Consome: `CardStatement`, `CardStatementItem` (Task 3).
- Produz: `interface ReconciliationResult { somaItens: number; diferenca: number; itemEncargos: CardStatementItem | null; status: 'ok' | 'erro' }`, `function reconciliarFatura(statement: CardStatement): ReconciliationResult` — usada pela Task 8 (componente de UI) pra montar a lista final de itens a classificar e decidir se o botão de confirmar pode ser habilitado.

- [ ] **Passo 1: Escrever os testes**

Criar `src/utils/cardReconciliation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { reconciliarFatura } from './cardReconciliation';
import type { CardStatement } from './cardStatementParser';

describe('reconciliarFatura', () => {
  it('não cria item de encargos quando a soma já bate exatamente com o total', () => {
    const statement: CardStatement = {
      dataVencimento: '13/07/2026',
      valorTotal: 300,
      encargos: 0,
      itens: [
        { data: '01/06/2026', descricao: 'ITEM A', valor: 200, valorDolar: null },
        { data: '02/06/2026', descricao: 'ITEM B', valor: 100, valorDolar: null }
      ]
    };

    const result = reconciliarFatura(statement);

    expect(result.somaItens).toBeCloseTo(300, 2);
    expect(result.diferenca).toBeCloseTo(0, 2);
    expect(result.itemEncargos).toBeNull();
    expect(result.status).toBe('ok');
  });

  it('cria um item sintético de Encargos quando sobra diferença dentro do valor de encargos da fatura', () => {
    const statement: CardStatement = {
      dataVencimento: '13/07/2026',
      valorTotal: 7491.06,
      encargos: 62.41,
      itens: [
        { data: '19/06/2026', descricao: 'FUNILARIA E PINTURA', valor: 7428.65, valorDolar: null }
      ]
    };

    const result = reconciliarFatura(statement);

    expect(result.itemEncargos).not.toBeNull();
    expect(result.itemEncargos?.valor).toBeCloseTo(62.41, 2);
    expect(result.itemEncargos?.descricao).toBe('Encargos financeiros da fatura');
    expect(result.status).toBe('ok');
  });

  it('marca como erro quando a diferença é negativa (soma dos itens maior que o total)', () => {
    const statement: CardStatement = {
      dataVencimento: '13/07/2026',
      valorTotal: 100,
      encargos: 0,
      itens: [
        { data: '01/06/2026', descricao: 'ITEM A', valor: 150, valorDolar: null }
      ]
    };

    const result = reconciliarFatura(statement);

    expect(result.status).toBe('erro');
    expect(result.itemEncargos).toBeNull();
  });

  it('marca como erro quando a diferença é maior que os encargos declarados no resumo', () => {
    const statement: CardStatement = {
      dataVencimento: '13/07/2026',
      valorTotal: 1000,
      encargos: 10,
      itens: [
        { data: '01/06/2026', descricao: 'ITEM A', valor: 800, valorDolar: null }
      ]
    };

    const result = reconciliarFatura(statement);

    expect(result.status).toBe('erro');
    expect(result.itemEncargos).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npm test
```

- [ ] **Passo 3: Implementar**

Criar `src/utils/cardReconciliation.ts`:

```typescript
import type { CardStatement, CardStatementItem } from './cardStatementParser';

export interface ReconciliationResult {
  somaItens: number;
  diferenca: number;
  itemEncargos: CardStatementItem | null;
  status: 'ok' | 'erro';
}

const TOLERANCIA = 0.01;

export function reconciliarFatura(statement: CardStatement): ReconciliationResult {
  const somaItens = statement.itens.reduce((acc, item) => acc + item.valor, 0);
  const diferenca = statement.valorTotal - somaItens;

  if (Math.abs(diferenca) <= TOLERANCIA) {
    return { somaItens, diferenca: 0, itemEncargos: null, status: 'ok' };
  }

  if (diferenca < 0 || diferenca > statement.encargos + TOLERANCIA) {
    return { somaItens, diferenca, itemEncargos: null, status: 'erro' };
  }

  const itemEncargos: CardStatementItem = {
    data: statement.dataVencimento,
    descricao: 'Encargos financeiros da fatura',
    valor: diferenca,
    valorDolar: null
  };

  return { somaItens, diferenca, itemEncargos, status: 'ok' };
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npm test
```

- [ ] **Passo 5: Build**

```bash
npm run build
```

- [ ] **Passo 6: Commit**

```bash
git add src/utils/cardReconciliation.ts src/utils/cardReconciliation.test.ts
git commit -m "$(cat <<'EOF'
Adiciona reconciliação de totais da fatura de cartão

Confere se a soma dos itens bate com o Valor Total da fatura. Quando
sobra diferença dentro do valor de Encargos declarado no resumo, cria
um item sintético "Encargos financeiros da fatura" pra fechar a conta.
Diferença negativa ou maior que os encargos declarados vira erro,
bloqueando a importação.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Mapeamento comerciante → plano de contas (aprendizado)

**Files:**
- Create: `src/utils/cardMerchantMapping.ts`
- Create: `src/utils/cardMerchantMapping.test.ts`

**Interfaces:**
- Produz: `type CardMerchantMapping = Record<string, { planoDeContas: string; updatedAt: string }>`, `function normalizeDescricao(descricao: string): string`, `function loadCardMerchantMapping(): CardMerchantMapping`, `function saveCardMerchantMapping(mapping: CardMerchantMapping): void`, `function sugerirPlanoDeContas(descricao: string, mapping: CardMerchantMapping): string | null` — usadas pela Task 8 (componente de UI).
- Usa `localStorage` diretamente (chave `"isp_card_merchant_mapping"`) — em teste, `localStorage` do ambiente `node` do Vitest é undefined por padrão; os testes de `load`/`save` precisam de um stub mínimo (ver Passo 1).

- [ ] **Passo 1: Escrever os testes com um stub de `localStorage`**

Criar `src/utils/cardMerchantMapping.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeDescricao,
  loadCardMerchantMapping,
  saveCardMerchantMapping,
  sugerirPlanoDeContas,
  type CardMerchantMapping
} from './cardMerchantMapping';

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; }
  });
});

describe('normalizeDescricao', () => {
  it('remove espaços extras e coloca em maiúsculas', () => {
    expect(normalizeDescricao('  Starlink   Internet  ')).toBe('STARLINK INTERNET');
  });
});

describe('loadCardMerchantMapping / saveCardMerchantMapping', () => {
  it('retorna objeto vazio quando não há nada salvo', () => {
    expect(loadCardMerchantMapping()).toEqual({});
  });

  it('salva e recupera o mapeamento', () => {
    const mapping: CardMerchantMapping = {
      'STARLINK INTERNET': { planoDeContas: '02.03.02.24 : Custo do Link', updatedAt: '2026-07-20' }
    };
    saveCardMerchantMapping(mapping);
    expect(loadCardMerchantMapping()).toEqual(mapping);
  });
});

describe('sugerirPlanoDeContas', () => {
  it('sugere o plano de contas já aprendido pro comerciante', () => {
    const mapping: CardMerchantMapping = {
      'STARLINK INTERNET': { planoDeContas: '02.03.02.24 : Custo do Link', updatedAt: '2026-07-20' }
    };
    expect(sugerirPlanoDeContas('Starlink Internet', mapping)).toBe('02.03.02.24 : Custo do Link');
  });

  it('sugere o plano de IOF nativo quando a descrição contém IOF, mesmo sem aprendizado prévio', () => {
    expect(sugerirPlanoDeContas('IOF Compra Internacional', {})).toBe('DÉB.IOF : 02.03.09');
  });

  it('sugere o plano de juros/encargos nativo quando a descrição contém JUROS, MORA ou MULTA', () => {
    expect(sugerirPlanoDeContas('Juros De Mora - Multa', {})).toBe('02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL');
  });

  it('retorna null quando não há aprendizado nem padrão nativo', () => {
    expect(sugerirPlanoDeContas('ZP OLX MNICA DA088', {})).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npm test
```

- [ ] **Passo 3: Implementar**

Criar `src/utils/cardMerchantMapping.ts`:

```typescript
export type CardMerchantMapping = Record<string, { planoDeContas: string; updatedAt: string }>;

const STORAGE_KEY = 'isp_card_merchant_mapping';

export function normalizeDescricao(descricao: string): string {
  return descricao.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function loadCardMerchantMapping(): CardMerchantMapping {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveCardMerchantMapping(mapping: CardMerchantMapping): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
}

export function sugerirPlanoDeContas(descricao: string, mapping: CardMerchantMapping): string | null {
  const chave = normalizeDescricao(descricao);

  if (mapping[chave]) {
    return mapping[chave].planoDeContas;
  }

  if (chave.includes('IOF')) {
    return 'DÉB.IOF : 02.03.09';
  }

  if (chave.includes('JUROS') || chave.includes('MORA') || chave.includes('MULTA')) {
    return '02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL';
  }

  return null;
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npm test
```

- [ ] **Passo 5: Build**

```bash
npm run build
```

- [ ] **Passo 6: Commit**

```bash
git add src/utils/cardMerchantMapping.ts src/utils/cardMerchantMapping.test.ts
git commit -m "$(cat <<'EOF'
Adiciona mapeamento comerciante -> plano de contas com aprendizado

Guarda em localStorage qual plano de contas já foi escolhido pra cada
descrição de item de cartão, pra sugerir automaticamente da próxima
vez. Padrões nativos (IOF, Juros/Mora/Multa) já vêm com sugestão sem
precisar de aprendizado prévio.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Localizar o lançamento da fatura a substituir

**Files:**
- Create: `src/utils/findCardLedgerEntry.ts`
- Create: `src/utils/findCardLedgerEntry.test.ts`

**Interfaces:**
- Consome: `Transaction` (de `dreParser.ts`).
- Produz: `const CARD_INVOICE_PLANOS_DE_CONTA: string[]`, `function encontrarLancamentoFatura(transactions: Transaction[], valorTotal: number): Transaction[]` — usada pela Task 8 (componente de UI).

- [ ] **Passo 1: Escrever os testes**

Criar `src/utils/findCardLedgerEntry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { encontrarLancamentoFatura } from './findCardLedgerEntry';
import type { Transaction } from './dreParser';

function fakeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    codigo: '1', pontoRecebimento: '', dataCadastro: '', dataCompetencia: '',
    modoPagamento: '', historico: '', usuario: '', planoDeContas: '',
    entrada: null, saida: null, categoriaDRE: '',
    ...overrides
  };
}

describe('encontrarLancamentoFatura', () => {
  it('encontra o lançamento único cujo plano de contas é de fatura de cartão e o valor bate', () => {
    const transactions: Transaction[] = [
      fakeTransaction({ codigo: 'A', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 7491.06 }),
      fakeTransaction({ codigo: 'B', planoDeContas: '01.01.01 : Mensalidade', entrada: 500 })
    ];

    const result = encontrarLancamentoFatura(transactions, 7491.06);

    expect(result).toHaveLength(1);
    expect(result[0].codigo).toBe('A');
  });

  it('também reconhece o outro plano de contas de cartão conhecido', () => {
    const transactions: Transaction[] = [
      fakeTransaction({ codigo: 'A', planoDeContas: '02.03.04 : Cartão de Credito', saida: 300 })
    ];

    const result = encontrarLancamentoFatura(transactions, 300);

    expect(result).toHaveLength(1);
  });

  it('não retorna nada quando não há lançamento de cartão com o valor esperado', () => {
    const transactions: Transaction[] = [
      fakeTransaction({ codigo: 'A', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 100 })
    ];

    const result = encontrarLancamentoFatura(transactions, 7491.06);

    expect(result).toHaveLength(0);
  });

  it('retorna todos os candidatos quando mais de um bate (valor duplicado por coincidência)', () => {
    const transactions: Transaction[] = [
      fakeTransaction({ codigo: 'A', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 300 }),
      fakeTransaction({ codigo: 'B', planoDeContas: '02.03.04 : Cartão de Credito', saida: 300 })
    ];

    const result = encontrarLancamentoFatura(transactions, 300);

    expect(result).toHaveLength(2);
  });

  it('aceita uma pequena tolerância de arredondamento no valor', () => {
    const transactions: Transaction[] = [
      fakeTransaction({ codigo: 'A', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 300.005 })
    ];

    const result = encontrarLancamentoFatura(transactions, 300);

    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npm test
```

- [ ] **Passo 3: Implementar**

Criar `src/utils/findCardLedgerEntry.ts`:

```typescript
import type { Transaction } from './dreParser';

export const CARD_INVOICE_PLANOS_DE_CONTA = [
  '02.02.03.04 : FATURA CARTAO CREDITO',
  '02.03.04 : Cartão de Credito'
];

const TOLERANCIA = 0.01;

export function encontrarLancamentoFatura(transactions: Transaction[], valorTotal: number): Transaction[] {
  return transactions.filter(t =>
    CARD_INVOICE_PLANOS_DE_CONTA.includes(t.planoDeContas) &&
    t.saida !== null &&
    Math.abs(t.saida - valorTotal) <= TOLERANCIA
  );
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npm test
```

- [ ] **Passo 5: Build**

```bash
npm run build
```

- [ ] **Passo 6: Commit**

```bash
git add src/utils/findCardLedgerEntry.ts src/utils/findCardLedgerEntry.test.ts
git commit -m "$(cat <<'EOF'
Adiciona localização do lançamento de fatura de cartão a substituir

Busca, entre as transações já carregadas, o lançamento cujo plano de
contas seja de fatura de cartão e cujo valor bata com o total da
fatura importada - retorna todos os candidatos (0, 1 ou mais) pro
componente de UI decidir o que fazer com cada caso.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Substituição do lançamento pela lista de itens

**Files:**
- Create: `src/utils/cardInvoiceReplacement.ts`
- Create: `src/utils/cardInvoiceReplacement.test.ts`

**Interfaces:**
- Consome: `DREData`, `Transaction`, `aggregateTransactions` (Task 2).
- Produz: `interface CardImportItem { data: string; descricao: string; valor: number; planoDeContas: string }`, `function substituirLancamentoFatura(dreData: DREData, codigoLancamentoOriginal: string, itens: CardImportItem[], dataFatura: string, mapping: Record<string, { category: string; action: 'include' | 'exclude' }>): DREData` — usada pela Task 8 (componente de UI).

- [ ] **Passo 1: Escrever os testes**

Criar `src/utils/cardInvoiceReplacement.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { substituirLancamentoFatura, type CardImportItem } from './cardInvoiceReplacement';
import type { DREData, Transaction } from './dreParser';

function fakeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    codigo: '1', pontoRecebimento: '', dataCadastro: '', dataCompetencia: '',
    modoPagamento: '', historico: '', usuario: '', planoDeContas: '',
    entrada: null, saida: null, categoriaDRE: '',
    ...overrides
  };
}

function fakeDREData(transactions: Transaction[]): DREData {
  return {
    monthId: '2026-07',
    monthLabel: 'Julho de 2026',
    lines: [],
    transactions,
    unmapped: [],
    totals: {
      receitaBruta: 0, deducoes: 0, rol: 0, csp: 0, margemContrib: 0,
      opex: 0, ebitda: 0, amortizacao: 0, liquido: 0
    }
  };
}

const mapping = {
  '02.02.03.04 : FATURA CARTAO CREDITO': { category: '6.1 Despesas Administrativas (Gerais)', action: 'include' as const },
  '02.03.02.24 : Custo do Link': { category: '4.1 Links Dedicados / Trânsito IP', action: 'include' as const },
  '02.03.02.07 : Pro-Labore': { category: '6.1 Despesas Administrativas (Pessoal)', action: 'include' as const }
};

describe('substituirLancamentoFatura', () => {
  it('remove o lançamento original e adiciona um item por transação da fatura', () => {
    const original = fakeTransaction({
      codigo: 'FATURA-1', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 489
    });
    const dreData = fakeDREData([original]);

    const itens: CardImportItem[] = [
      { data: '13/07/2026', descricao: 'STARLINK INTERNET', valor: 189, planoDeContas: '02.03.02.24 : Custo do Link' },
      { data: '13/07/2026', descricao: 'ZP OLX MNICA DA088', valor: 300, planoDeContas: '02.03.02.07 : Pro-Labore' }
    ];

    const result = substituirLancamentoFatura(dreData, 'FATURA-1', itens, '13/07/2026', mapping);

    expect(result.transactions.find(t => t.codigo === 'FATURA-1')).toBeUndefined();
    expect(result.transactions).toHaveLength(2);
  });

  it('usa a mesma data da fatura (não a data original do item) em todas as transações novas', () => {
    const dreData = fakeDREData([
      fakeTransaction({ codigo: 'FATURA-1', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 189 })
    ]);
    const itens: CardImportItem[] = [
      { data: '23/04/2026', descricao: 'STARLINK INTERNET', valor: 189, planoDeContas: '02.03.02.24 : Custo do Link' }
    ];

    const result = substituirLancamentoFatura(dreData, 'FATURA-1', itens, '13/07/2026', mapping);

    expect(result.transactions[0].dataCadastro).toBe('13/07/2026');
    expect(result.transactions[0].dataCompetencia).toBe('13/07/2026');
  });

  it('deriva a categoriaDRE de cada item novo a partir do mapeamento plano de contas -> categoria', () => {
    const dreData = fakeDREData([
      fakeTransaction({ codigo: 'FATURA-1', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 189 })
    ]);
    const itens: CardImportItem[] = [
      { data: '13/07/2026', descricao: 'STARLINK INTERNET', valor: 189, planoDeContas: '02.03.02.24 : Custo do Link' }
    ];

    const result = substituirLancamentoFatura(dreData, 'FATURA-1', itens, '13/07/2026', mapping);

    expect(result.transactions[0].categoriaDRE).toBe('4.1 Links Dedicados / Trânsito IP');
  });

  it('recalcula lines/totals a partir da nova lista de transações', () => {
    const dreData = fakeDREData([
      fakeTransaction({ codigo: 'FATURA-1', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 189 })
    ]);
    const itens: CardImportItem[] = [
      { data: '13/07/2026', descricao: 'STARLINK INTERNET', valor: 189, planoDeContas: '02.03.02.24 : Custo do Link' }
    ];

    const result = substituirLancamentoFatura(dreData, 'FATURA-1', itens, '13/07/2026', mapping);

    expect(result.totals.csp).toBeCloseTo(189, 2);
  });

  it('preserva monthId e monthLabel do DREData original', () => {
    const dreData = fakeDREData([
      fakeTransaction({ codigo: 'FATURA-1', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: 189 })
    ]);
    const itens: CardImportItem[] = [
      { data: '13/07/2026', descricao: 'STARLINK INTERNET', valor: 189, planoDeContas: '02.03.02.24 : Custo do Link' }
    ];

    const result = substituirLancamentoFatura(dreData, 'FATURA-1', itens, '13/07/2026', mapping);

    expect(result.monthId).toBe('2026-07');
    expect(result.monthLabel).toBe('Julho de 2026');
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```bash
npm test
```

- [ ] **Passo 3: Implementar**

Criar `src/utils/cardInvoiceReplacement.ts`:

```typescript
import { aggregateTransactions, type DREData, type Transaction } from './dreParser';

export interface CardImportItem {
  data: string;
  descricao: string;
  valor: number;
  planoDeContas: string;
}

export function substituirLancamentoFatura(
  dreData: DREData,
  codigoLancamentoOriginal: string,
  itens: CardImportItem[],
  dataFatura: string,
  mapping: Record<string, { category: string; action: 'include' | 'exclude' }>
): DREData {
  const transacoesSemOriginal = dreData.transactions.filter(t => t.codigo !== codigoLancamentoOriginal);

  const novasTransacoes: Transaction[] = itens.map((item, index) => {
    const mappingInfo = mapping[item.planoDeContas];
    const categoriaDRE = mappingInfo
      ? (mappingInfo.action === 'exclude' ? 'EXCLUÍDO DA DRE' : mappingInfo.category)
      : 'NÃO MAPEADO';

    return {
      codigo: `CARTAO-${dataFatura.replace(/\//g, '')}-${index}`,
      pontoRecebimento: '',
      dataCadastro: dataFatura,
      dataCompetencia: dataFatura,
      modoPagamento: 'Cartão de Crédito',
      historico: item.descricao,
      usuario: '',
      planoDeContas: item.planoDeContas,
      entrada: null,
      saida: item.valor,
      categoriaDRE
    };
  });

  const transactions = [...transacoesSemOriginal, ...novasTransacoes];
  const { lines, totals } = aggregateTransactions(transactions);

  return {
    monthId: dreData.monthId,
    monthLabel: dreData.monthLabel,
    lines,
    transactions,
    unmapped: dreData.unmapped,
    totals
  };
}
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```bash
npm test
```

- [ ] **Passo 5: Build**

```bash
npm run build
```

- [ ] **Passo 6: Commit**

```bash
git add src/utils/cardInvoiceReplacement.ts src/utils/cardInvoiceReplacement.test.ts
git commit -m "$(cat <<'EOF'
Adiciona substituição do lançamento de fatura pelos itens do cartão

Remove o lançamento cheio original e adiciona uma transação por item
da fatura, todas com a data de vencimento/débito (não a data de compra
original), já categorizadas via o mapeamento plano de contas ->
categoria DRE existente, e recalcula linhas/totais com
aggregateTransactions.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Componente de UI — tela de importação

**Files:**
- Create: `src/components/CardStatementImport.tsx`

**Interfaces:**
- Consome: todos os módulos das Tasks 3-7, mais `DREData`/`Transaction` de `dreParser.ts`.
- Produz: componente `export default function CardStatementImport(props: CardStatementImportProps)`, usado pela Task 9 (`App.tsx`).

Sem teste automatizado nesta task (é UI/componente — decisão já tomada de só testar a lógica pura, Tasks 2-7). Verificação é manual (build + passo a passo no navegador, Task 10).

- [ ] **Passo 1: Implementar o componente completo**

Criar `src/components/CardStatementImport.tsx`:

```typescript
import { useState } from 'react';
import { UploadCloud, CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react';
import { parseSicrediCsv, type CardStatement, type CardStatementItem } from '../utils/cardStatementParser';
import { reconciliarFatura } from '../utils/cardReconciliation';
import {
  loadCardMerchantMapping,
  saveCardMerchantMapping,
  sugerirPlanoDeContas,
  normalizeDescricao
} from '../utils/cardMerchantMapping';
import { encontrarLancamentoFatura } from '../utils/findCardLedgerEntry';
import { substituirLancamentoFatura, type CardImportItem } from '../utils/cardInvoiceReplacement';
import type { DREData, Transaction } from '../utils/dreParser';

interface CardStatementImportProps {
  dreDatabase: Record<string, DREData>;
  mapping: Record<string, { category: string; action: 'include' | 'exclude' }>;
  onSaveDREMonth: (data: DREData) => void;
}

interface ReviewRow {
  item: CardStatementItem;
  planoDeContas: string;
}

const TOLERANCIA = 0.01;

export default function CardStatementImport({ dreDatabase, mapping, onSaveDREMonth }: CardStatementImportProps) {
  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [candidatos, setCandidatos] = useState<Transaction[]>([]);
  const [lancamentoEscolhido, setLancamentoEscolhido] = useState<Transaction | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const planosDeConta = Object.keys(mapping);

  const resetar = () => {
    setStatement(null);
    setCandidatos([]);
    setLancamentoEscolhido(null);
    setRows([]);
    setErro(null);
  };

  const handleFile = async (file: File) => {
    resetar();
    setSucesso(null);

    try {
      const text = await file.text();
      const parsed = parseSicrediCsv(text);

      const reconciliacao = reconciliarFatura(parsed);
      if (reconciliacao.status === 'erro') {
        setErro(
          `Não bateu a conta da fatura: soma dos itens R$ ${reconciliacao.somaItens.toFixed(2)} ` +
          `vs total R$ ${parsed.valorTotal.toFixed(2)}. Revise o arquivo antes de importar.`
        );
        return;
      }

      const itensCompletos = reconciliacao.itemEncargos
        ? [...parsed.itens, reconciliacao.itemEncargos]
        : parsed.itens;
      const statementCompleto: CardStatement = { ...parsed, itens: itensCompletos };
      setStatement(statementCompleto);

      const todasTransacoes = Object.values(dreDatabase).flatMap(d => d.transactions);
      const encontrados = encontrarLancamentoFatura(todasTransacoes, parsed.valorTotal);
      setCandidatos(encontrados);

      if (encontrados.length === 1) {
        setLancamentoEscolhido(encontrados[0]);
      }

      const merchantMapping = loadCardMerchantMapping();
      const novasRows: ReviewRow[] = itensCompletos.map(item => ({
        item,
        planoDeContas: sugerirPlanoDeContas(item.descricao, merchantMapping) || ''
      }));
      setRows(novasRows);
    } catch (err: any) {
      setErro(err.message || 'Erro ao processar o arquivo. Verifique se o formato está correto.');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handlePlanoChange = (index: number, planoDeContas: string) => {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, planoDeContas } : row)));
  };

  const somaClassificada = rows.reduce((acc, row) => acc + row.item.valor, 0);
  const totalBate = statement ? Math.abs(somaClassificada - statement.valorTotal) <= TOLERANCIA : false;
  const todosClassificados = rows.length > 0 && rows.every(row => row.planoDeContas !== '');
  const podeConfirmar = !!statement && !!lancamentoEscolhido && totalBate && todosClassificados;

  const dreDoMes = lancamentoEscolhido
    ? Object.values(dreDatabase).find(d => d.transactions.some(t => t.codigo === lancamentoEscolhido.codigo))
    : undefined;

  const handleConfirmar = () => {
    if (!statement || !lancamentoEscolhido || !dreDoMes) return;

    const itensParaSubstituir: CardImportItem[] = rows.map(row => ({
      data: row.item.data,
      descricao: row.item.descricao,
      valor: row.item.valor,
      planoDeContas: row.planoDeContas
    }));

    const dreAtualizado = substituirLancamentoFatura(
      dreDoMes,
      lancamentoEscolhido.codigo,
      itensParaSubstituir,
      statement.dataVencimento,
      mapping
    );

    onSaveDREMonth(dreAtualizado);

    const merchantMapping = loadCardMerchantMapping();
    rows.forEach(row => {
      merchantMapping[normalizeDescricao(row.item.descricao)] = {
        planoDeContas: row.planoDeContas,
        updatedAt: new Date().toISOString()
      };
    });
    saveCardMerchantMapping(merchantMapping);

    setSucesso(`Fatura importada! ${rows.length} itens substituíram o lançamento cheio em ${dreDoMes.monthLabel}.`);
    resetar();
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="table-card">
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Importar Fatura de Cartão</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Sobe o CSV da fatura Sicredi pra quebrar o lançamento cheio do cartão nos itens individuais.
        </p>

        <div
          className="uploader-card"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
          }}
        >
          <UploadCloud size={32} className="uploader-icon" />
          <p>Arraste o CSV da fatura aqui ou clique para selecionar</p>
          <input type="file" accept=".csv" onChange={onFileChange} />
        </div>

        {erro && (
          <div className="alert-card" style={{ marginTop: '16px' }}>
            <AlertTriangle size={18} />
            <span>{erro}</span>
          </div>
        )}

        {sucesso && (
          <div className="alert-card alert-info" style={{ marginTop: '16px' }}>
            <CheckCircle2 size={18} />
            <span>{sucesso}</span>
          </div>
        )}
      </div>

      {statement && candidatos.length === 0 && (
        <div className="alert-card">
          <AlertTriangle size={18} />
          <span>
            Não encontrei nenhum lançamento de fatura de cartão de R$ {formatCurrency(statement.valorTotal)}
            {' '}no caixa carregado. Confira se o mês certo já foi importado no Dashboard.
          </span>
        </div>
      )}

      {statement && candidatos.length > 1 && (
        <div className="table-card">
          <h4 style={{ marginBottom: '12px' }}>Mais de um lançamento bateu com o valor da fatura — escolha qual substituir:</h4>
          {candidatos.map(c => (
            <div key={c.codigo} className="mapping-row">
              <span>{c.historico} — {formatCurrency(c.saida || 0)} — {c.dataCadastro}</span>
              <button className="btn-secondary" onClick={() => setLancamentoEscolhido(c)}>
                {lancamentoEscolhido?.codigo === c.codigo ? 'Selecionado' : 'Selecionar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {statement && lancamentoEscolhido && (
        <div className="table-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h4>Revisão dos itens</h4>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Substituindo lançamento de {formatCurrency(lancamentoEscolhido.saida || 0)} em {lancamentoEscolhido.dataCadastro}
              </span>
            </div>
            <span className={`badge-pill ${totalBate ? '' : 'alert-info'}`}>
              Total da fatura: {formatCurrency(statement.valorTotal)} | Soma classificada: {formatCurrency(somaClassificada)}
              {totalBate ? ' ✓' : ' ✗'}
            </span>
          </div>

          <table className="dre-table">
            <thead>
              <tr className="table-header-row">
                <th>Data</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Plano de Contas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td>{row.item.data}</td>
                  <td>{row.item.descricao}</td>
                  <td>{formatCurrency(row.item.valor)}</td>
                  <td>
                    <select
                      value={row.planoDeContas}
                      onChange={e => handlePlanoChange(index, e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {planosDeConta.map(pc => (
                        <option key={pc} value={pc}>{pc}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            className="btn-primary"
            disabled={!podeConfirmar}
            onClick={handleConfirmar}
            style={{ marginTop: '16px', width: 'auto', padding: '10px 24px' }}
          >
            <CreditCard size={16} style={{ marginRight: '6px' }} />
            Confirmar e substituir no DRE
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Passo 2: Verificar o build**

```bash
npm run build
```

Esperado: build limpo, sem erro de tipo (props, imports e tipos batendo com os módulos das Tasks 2-7).

- [ ] **Passo 3: Rodar a suíte inteira de testes de novo (garantir que nada quebrou)**

```bash
npm test
```

- [ ] **Passo 4: Commit**

```bash
git add src/components/CardStatementImport.tsx
git commit -m "$(cat <<'EOF'
Adiciona tela de importação de fatura de cartão

Upload do CSV -> reconciliação automática -> localização do lançamento
a substituir (com escolha manual se houver ambiguidade) -> revisão dos
itens com sugestão de plano de contas -> confirmação só quando o total
bate e todo item está classificado.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Integração no `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consome: `CardStatementImport` (Task 8).

- [ ] **Passo 1: Adicionar o import e o novo valor de `activeTab`**

Trocar:

```typescript
import { BarChart3, Settings, LogOut, ClipboardList } from 'lucide-react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import MappingEditor from './components/MappingEditor';
import TransactionsList from './components/TransactionsList';
import UserSettings from './components/UserSettings';
import { DEFAULT_MAPPING, type DREData } from './utils/dreParser';
```

por:

```typescript
import { BarChart3, Settings, LogOut, ClipboardList, CreditCard } from 'lucide-react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import MappingEditor from './components/MappingEditor';
import TransactionsList from './components/TransactionsList';
import UserSettings from './components/UserSettings';
import CardStatementImport from './components/CardStatementImport';
import { DEFAULT_MAPPING, type DREData } from './utils/dreParser';
```

E trocar:

```typescript
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'settings'>('dashboard');
```

por:

```typescript
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'cardImport' | 'settings'>('dashboard');
```

- [ ] **Passo 2: Extrair `handleSaveDREMonth` como função nomeada (hoje só existe inline na prop do Dashboard) e reusar no novo componente**

Trocar o bloco do `<Dashboard ... onSaveDREMonth={(data) => { ... }} ... />` (o handler inline de `onSaveDREMonth` e `onDeleteDREMonth`):

```typescript
        {activeTab === 'dashboard' && (
          <Dashboard 
            mapping={mapping} 
            onFoundUnmapped={handleFoundUnmapped}
            onViewMappingTab={() => setIsMappingModalOpen(true)}
            dreData={dreData}
            setDreData={setDreData}
            dreDatabase={dreDatabase}
            onSaveDREMonth={(data) => {
              const updatedDb = { ...dreDatabase, [data.monthId]: data };
              setDreDatabase(updatedDb);
              localStorage.setItem('isp_dre_database', JSON.stringify(updatedDb));
              setDreData(data);
            }}
            onDeleteDREMonth={(monthId) => {
```

por:

```typescript
        {activeTab === 'dashboard' && (
          <Dashboard 
            mapping={mapping} 
            onFoundUnmapped={handleFoundUnmapped}
            onViewMappingTab={() => setIsMappingModalOpen(true)}
            dreData={dreData}
            setDreData={setDreData}
            dreDatabase={dreDatabase}
            onSaveDREMonth={handleSaveDREMonth}
            onDeleteDREMonth={(monthId) => {
```

E adicionar a função nomeada `handleSaveDREMonth`, logo acima de `handleFoundUnmapped`:

```typescript
  const handleSaveDREMonth = (data: DREData) => {
    const updatedDb = { ...dreDatabase, [data.monthId]: data };
    setDreDatabase(updatedDb);
    localStorage.setItem('isp_dre_database', JSON.stringify(updatedDb));
    setDreData(data);
  };

  const handleFoundUnmapped = (unmapped: string[]) => {
    setUnmappedAccounts(unmapped);
  };
```

(substitui a declaração de `handleFoundUnmapped` que já existe, adicionando `handleSaveDREMonth` acima dela).

- [ ] **Passo 3: Adicionar o botão de navegação**

Trocar:

```typescript
          <button 
            className={`nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            <ClipboardList size={16} />
            <span>Extrato Detalhado</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
```

por:

```typescript
          <button 
            className={`nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            <ClipboardList size={16} />
            <span>Extrato Detalhado</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'cardImport' ? 'active' : ''}`}
            onClick={() => setActiveTab('cardImport')}
          >
            <CreditCard size={16} />
            <span>Importar Fatura de Cartão</span>
          </button>

          <button 
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
```

- [ ] **Passo 4: Renderizar o componente na aba nova**

Trocar:

```typescript
        {activeTab === 'settings' && (
```

por:

```typescript
        {activeTab === 'cardImport' && (
          <CardStatementImport
            dreDatabase={dreDatabase}
            mapping={mapping}
            onSaveDREMonth={handleSaveDREMonth}
          />
        )}

        {activeTab === 'settings' && (
```

- [ ] **Passo 5: Build**

```bash
npm run build
```

Esperado: limpo, sem erro de tipo.

- [ ] **Passo 6: Rodar a suíte de testes de novo**

```bash
npm test
```

- [ ] **Passo 7: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
Integra a importação de fatura de cartão na navegação do portal

Nova aba "Importar Fatura de Cartão" no menu principal, reaproveitando
o mesmo handleSaveDREMonth já usado pelo Dashboard pra persistir o DRE
atualizado no isp_dre_database.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Verificação manual, deploy e limpeza

**Files:** nenhum arquivo novo — só verificação e operação.

- [ ] **Passo 1: Rodar a suíte completa de testes uma última vez**

```bash
cd /home/edison/dre-inteligente
npm test
```

Esperado: todos os testes das Tasks 1-7 passando.

- [ ] **Passo 2: Build de produção**

```bash
npm run build
```

Esperado: build limpo.

- [ ] **Passo 3: Restart do processo**

```bash
pm2 restart dre-portal
```

- [ ] **Passo 4: Verificar que o portal está no ar**

```bash
pm2 status dre-portal
curl -sk -o /dev/null -w "%{http_code}\n" https://dre.snitelecom.com.br/
```

Esperado: `online` e `200`.

- [ ] **Passo 5: Passo a passo manual com o arquivo real**

No navegador, logado no portal:
1. Se ainda não houver um `caixahistorico.xlsx` carregado com um lançamento de fatura de cartão pro mês de julho/2026 (valor batendo com `R$ 7.491,06`), carregar um de teste no Dashboard antes de prosseguir (ou usar o arquivo real do Edison, se já tiver o lançamento correspondente).
2. Ir em "Importar Fatura de Cartão", subir `/home/edison/sicredi_1784580966.csv`.
3. Confirmar que aparece a tela de revisão com os itens da fatura, valor total R$ 7.491,06, e que o item sintético "Encargos financeiros da fatura" (R$ 62,41) aparece na lista.
4. Classificar cada item (usar o dropdown), incluindo pelo menos um item "pessoal" indo para `02.03.02.07 : Pro-Labore`.
5. Confirmar que o botão "Confirmar e substituir no DRE" só habilita depois de todo item classificado e o total batendo.
6. Confirmar a importação e verificar no Dashboard que o lançamento cheio da fatura sumiu e os itens aparecem individualmente na aba "Extrato Detalhado", já com as categorias corretas.
7. Repetir o upload do mesmo arquivo (ou de uma fatura fictícia com os mesmos comerciantes) e confirmar que os planos de conta já vêm pré-preenchidos (aprendizado funcionando).

- [ ] **Passo 6: Confirmar working tree limpo**

```bash
git status --short
```

Esperado: nada pendente (todo commit já feito ao final de cada task anterior).
