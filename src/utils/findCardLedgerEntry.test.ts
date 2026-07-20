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
