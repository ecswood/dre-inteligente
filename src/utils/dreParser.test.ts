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
