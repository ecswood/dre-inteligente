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
