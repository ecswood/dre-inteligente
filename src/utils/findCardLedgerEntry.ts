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
    Math.abs(Math.abs(t.saida) - valorTotal) <= TOLERANCIA
  );
}
