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

  it('preserva o sinal negativo da saída quando o ERP grava saída como valor negativo (ex: -R$ 5.416,05)', () => {
    const dreData = fakeDREData([
      fakeTransaction({ codigo: 'FATURA-1', planoDeContas: '02.02.03.04 : FATURA CARTAO CREDITO', saida: -5416.05 })
    ]);
    const itens: CardImportItem[] = [
      { data: '13/06/2026', descricao: 'STARLINK INTERNET', valor: 189, planoDeContas: '02.03.02.24 : Custo do Link' },
      { data: '13/06/2026', descricao: 'ZP OLX MNICA DA088', valor: 300, planoDeContas: '02.03.02.07 : Pro-Labore' }
    ];

    const result = substituirLancamentoFatura(dreData, 'FATURA-1', itens, '13/06/2026', mapping);

    expect(result.transactions[0].saida).toBeCloseTo(-189, 2);
    expect(result.transactions[1].saida).toBeCloseTo(-300, 2);
    // A DRE continua mostrando o total como positivo (aggregateTransactions já usa Math.abs na soma)
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
