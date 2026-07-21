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
  const lancamentoOriginal = dreData.transactions.find(t => t.codigo === codigoLancamentoOriginal);
  const sinalSaida = lancamentoOriginal && lancamentoOriginal.saida !== null && lancamentoOriginal.saida < 0 ? -1 : 1;

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
      saida: sinalSaida * item.valor,
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
