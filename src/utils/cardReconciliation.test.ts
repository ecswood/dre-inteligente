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
      encargos: 100,
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
