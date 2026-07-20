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
