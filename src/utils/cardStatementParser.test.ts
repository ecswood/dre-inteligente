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
