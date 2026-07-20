import * as XLSX from 'xlsx';

export interface Transaction {
  codigo: string;
  pontoRecebimento: string;
  dataCadastro: string;
  dataCompetencia: string;
  modoPagamento: string;
  historico: string;
  usuario: string;
  planoDeContas: string;
  entrada: number | null;
  saida: number | null;
  categoriaDRE: string;
}

export interface DRELine {
  account: string;
  value: number;
  pct: number;
  style: 'group' | 'subgroup' | 'total' | 'net_income';
}

export interface DREData {
  monthId: string;
  monthLabel: string;
  lines: DRELine[];
  transactions: Transaction[];
  unmapped: string[];
  totals: {
    receitaBruta: number;
    deducoes: number;
    rol: number;
    csp: number;
    margemContrib: number;
    opex: number;
    ebitda: number;
    amortizacao: number;
    liquido: number;
  };
}

// Mapeamento padrão do Plano de Contas do ERP para as Categorias da DRE ISP
export const DEFAULT_MAPPING: Record<string, { category: string; action: 'include' | 'exclude' }> = {
  "01.01.01 : Mensalidade": { "category": "1.2 Receita de Internet (SVA)", "action": "include" },
  "01.03.01 : Mensalidade": { "category": "1.2 Receita de Internet (SVA)", "action": "include" },
  "01.01.02 : Adesão": { "category": "1.3 Taxas de Instalação e Adesão", "action": "include" },
  "01.03.02 : Adesão": { "category": "1.3 Taxas de Instalação e Adesão", "action": "include" },
  "01.05.02 : Adesão": { "category": "1.3 Taxas de Instalação e Adesão", "action": "include" },
  "01.50.02 : Equipamentos": { "category": "1.4 Outras Receitas (Equipamentos)", "action": "include" },
  "01.60.01 : Serviço de reparo e manutenção": { "category": "1.4 Outras Receitas (Serviços Avulsos)", "action": "include" },
  "01.90 : Outras Entradas": { "category": "1.4 Outras Receitas (Diversas)", "action": "include" },
  "02.12 : CASHBACKS": { "category": "1.4 Outras Receitas (Diversas)", "action": "include" },
  "02.03.02.24 : Custo do Link": { "category": "4.1 Links Dedicados / Trânsito IP", "action": "include" },
  "02.03.04.07 : ALUGUEL POSTE": { "category": "4.2 Postes e Aluguel de Infraestrutura", "action": "include" },
  "02.01.05 : Custo c/ Loc das Torres": { "category": "4.2 Postes e Aluguel de Infraestrutura", "action": "include" },
  "02.01.02.01 : Folha de Pagamento": { "category": "6.1 Despesas Administrativas (Pessoal)", "action": "include" },
  "02.01.02.05 : Consultoria Técnica": { "category": "4.5 Manutenção de Rede / Licenças Técnicas", "action": "include" },
  "02.01.03.01 : Reposição de Ferramentas": { "category": "4.5 Manutenção de Rede / Licenças Técnicas", "action": "include" },
  "02.01.04.01 : Combustivel": { "category": "4.5 Manutenção de Rede / Licenças Técnicas", "action": "include" },
  "02.10.01 : SEGURO CARRO": { "category": "4.5 Manutenção de Rede / Licenças Técnicas", "action": "include" },
  "02.03.02.15 : Fardamento": { "category": "4.5 Manutenção de Rede / Licenças Técnicas", "action": "include" },
  "01.01.03.03 : VALE ALIMENTAÇÃO": { "category": "6.1 Despesas Administrativas (Pessoal)", "action": "include" },
  "02.03.02.04 : Energia Eletrica": { "category": "6.1 Despesas Administrativas (Infra)", "action": "include" },
  "02.03.02.06 : Aluguel": { "category": "6.1 Despesas Administrativas (Infra)", "action": "include" },
  "02.03.02.07 : Pro-Labore": { "category": "6.1 Despesas Administrativas (Pessoal)", "action": "include" },
  "02.03.02.10 : Contabilidade": { "category": "6.1 Despesas Administrativas (Infra)", "action": "include" },
  "02.03.02.25 : Acessoria": { "category": "6.1 Despesas Administrativas (Infra)", "action": "include" },
  "02.03.02.26 : Diarista": { "category": "6.1 Despesas Administrativas (Infra)", "action": "include" },
  "02.03.02.27 : Água/esgoto": { "category": "6.1 Despesas Administrativas (Infra)", "action": "include" },
  "02.03.02.21 : Mat de Limpeza": { "category": "6.1 Despesas Administrativas (Infra)", "action": "include" },
  "02.10.02 : SEGURO": { "category": "6.1 Despesas Administrativas (Infra)", "action": "include" },
  "02.02.05 : DARF": { "category": "2.1 Tributos sobre Serviços (DARF)", "action": "include" },
  "02.03.02.01 : Cobrança Bancaria": { "category": "6.3 Despesas Financeiras (Taxas Boleto)", "action": "include" },
  "02.03.03.01 : Tarifas Bancarias": { "category": "6.3 Despesas Financeiras (Gerais)", "action": "include" },
  "02.03.03.05 : PAGTO JUROS CONTR ROTATIVO": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "02.03.03.06 : MANUTENCAO DE TITULOS": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "02.03.03.07 : IOF BASICO CH PJ": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "02.03.03.08 : IOF ADICIONAL PJ-CH. ESPE": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "02.03.03.09 : TARIFA COM R LIQUIDACAO": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "02.03.03.10 : JUROS UTILIZ.CH.ESPECIAL": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "02.03.03.11 : JUROS CONTA GARANTIDA": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "DÉB.IOF : 02.03.09": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "02,07 : DÉB.EMPRÉSTIMO": { "category": "8.1 Amortização de Empréstimos e Financiamentos", "action": "include" },
  "02.03.04.05 : FINANCIAMENTO VEICULO": { "category": "8.1 Amortização de Empréstimos e Financiamentos", "action": "include" },
  "02.09 : Outras Saídas": { "category": "6.4 Outras Despesas Operacionais", "action": "include" },
  "02.02.03.04 : FATURA CARTAO CREDITO": { "category": "6.1 Despesas Administrativas (Gerais)", "action": "include" },
  "02.02.11 : APLICAÇÃO FINANCEIRA": { "category": "Excluir da DRE (Transferência Patrimonial)", "action": "exclude" },
  "03.02 : TRANSFERENCIA ENTRE CONTAS": { "category": "Excluir da DRE (Transferência Patrimonial)", "action": "exclude" },
  "TRANSF.ENTRE CONTAS : 02.12": { "category": "Excluir da DRE (Transferência Patrimonial)", "action": "exclude" },
  "02.01.02.07 : Plano de Saúde": { "category": "6.1 Despesas Administrativas (Pessoal)", "action": "include" },
  "SEGURO PRESTAMISTA : 02.09": { "category": "6.3 Despesas Financeiras (Encargos)", "action": "include" },
  "02.03.04 : Cartão de Credito": { "category": "6.1 Despesas Administrativas (Gerais)", "action": "include" },
  "02.07 : DÉB.EMPRÉSTIMO": { "category": "8.1 Amortização de Empréstimos e Financiamentos", "action": "include" },
  "02.01.04.03 : Ipva": { "category": "4.5 Manutenção de Rede / Licenças Técnicas", "action": "include" },
  "02.04 : IMPOSTOS": { "category": "2.1 Tributos sobre Serviços (DARF)", "action": "include" }
};

export function extractMonthLabel(transactions: Transaction[]): { id: string; label: string } {
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  
  for (const t of transactions) {
    const dateStr = t.dataCompetencia || t.dataCadastro;
    if (dateStr && dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length >= 3) {
        const monthIdx = parseInt(parts[1], 10) - 1;
        const year = parts[2].trim().substring(0, 4);
        if (monthIdx >= 0 && monthIdx < 12 && year.length === 4) {
          const formattedMonth = String(monthIdx + 1).padStart(2, '0');
          return {
            id: `${year}-${formattedMonth}`,
            label: `${monthNames[monthIdx]} de ${year}`
          };
        }
      }
    } else if (dateStr && dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length >= 3) {
        // YYYY-MM-DD
        const year = parts[0].trim();
        const monthIdx = parseInt(parts[1], 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12 && year.length === 4) {
          const formattedMonth = String(monthIdx + 1).padStart(2, '0');
          return {
            id: `${year}-${formattedMonth}`,
            label: `${monthNames[monthIdx]} de ${year}`
          };
        }
      }
    }
  }

  const now = new Date();
  const monthIdx = now.getMonth();
  const year = now.getFullYear();
  const formattedMonth = String(monthIdx + 1).padStart(2, '0');
  return {
    id: `${year}-${formattedMonth}`,
    label: `${monthNames[monthIdx]} de ${year} (Estimado)`
  };
}

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

export function parseCaixaExcel(arrayBuffer: ArrayBuffer, customMapping?: Record<string, { category: string; action: 'include' | 'exclude' }>): DREData {
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: 'array' });
  
  // Buscar aba de Lançamentos
  const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('caixa')) || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converter para matriz
  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
  
  // Encontrar linha de cabeçalho
  let headerRowIdx = -1;
  for (let i = 0; i < rawRows.length; i++) {
    if (rawRows[i] && rawRows[i].includes('Código')) {
      headerRowIdx = i;
      break;
    }
  }
  
  if (headerRowIdx === -1) {
    throw new Error("Não foi possível encontrar a linha de cabeçalho 'Código' na planilha.");
  }
  
  const headers = rawRows[headerRowIdx];
  const dataRows = rawRows.slice(headerRowIdx + 1);
  
  // Mapeamento ativo
  const activeMapping = customMapping || DEFAULT_MAPPING;
  
  const transactions: Transaction[] = [];
  const unmappedSet = new Set<string>();

  // Mapear cabeçalhos para colunas
  const colMap = {
    codigo: headers.indexOf('Código'),
    ponto: headers.indexOf('Ponto Recebimento'),
    dataCad: headers.indexOf('Data de Cadastro'),
    dataComp: headers.indexOf('Data de Competência'),
    modo: headers.indexOf('Modo Pagamento'),
    historico: headers.indexOf('Histórico'),
    usuario: headers.indexOf('Usuário'),
    plano: headers.indexOf('Plano de Contas'),
    entrada: headers.indexOf('Entrada'),
    saida: headers.indexOf('Saída')
  };
  
  dataRows.forEach(row => {
    // Validar se a linha tem dados mínimos
    if (!row || row.length === 0) return;
    
    const plano = String(row[colMap.plano] || '').trim();
    if (!plano || plano === 'undefined' || plano === 'None' || plano === '') return;
    
    const codigo = String(row[colMap.codigo] || '');
    const ponto = String(row[colMap.ponto] || '');
    const dataCad = String(row[colMap.dataCad] || '');
    const dataComp = String(row[colMap.dataComp] || '');
    const modo = String(row[colMap.modo] || '');
    const historico = String(row[colMap.historico] || '');
    const usuario = String(row[colMap.usuario] || '');
    
    let entradaVal: number | null = null;
    let saidaVal: number | null = null;
    
    // Parse numérico
    const rawEntrada = row[colMap.entrada];
    const rawSaida = row[colMap.saida];
    
    if (rawEntrada !== undefined && rawEntrada !== null && rawEntrada !== '') {
      if (typeof rawEntrada === 'number') {
        entradaVal = rawEntrada;
      } else {
        const strVal = String(rawEntrada).replace('R$', '').trim();
        if (strVal.includes(',')) {
          const parsed = parseFloat(strVal.replace(/\./g, '').replace(',', '.'));
          if (!isNaN(parsed)) entradaVal = parsed;
        } else {
          const parsed = parseFloat(strVal);
          if (!isNaN(parsed)) entradaVal = parsed;
        }
      }
    }
    
    if (rawSaida !== undefined && rawSaida !== null && rawSaida !== '') {
      if (typeof rawSaida === 'number') {
        saidaVal = rawSaida;
      } else {
        const strVal = String(rawSaida).replace('R$', '').trim();
        if (strVal.includes(',')) {
          const parsed = parseFloat(strVal.replace(/\./g, '').replace(',', '.'));
          if (!isNaN(parsed)) saidaVal = parsed;
        } else {
          const parsed = parseFloat(strVal);
          if (!isNaN(parsed)) saidaVal = parsed;
        }
      }
    }
    
    // Se ambos forem nulos, ignorar a linha
    if (entradaVal === null && saidaVal === null) return;
    
    // Aplicar a lógica de classificação (de-para + overrides)
    let categoriaDRE = "NÃO MAPEADO";
    let isExcluded = false;
    
    // Regra de override baseada no histórico apenas para "02.09 : Outras Saídas"
    if (plano === "02.09 : Outras Saídas") {
      const histLower = historico.toLowerCase();
      if (
        histLower.includes("cheque compe sicredi") ||
        histLower.includes("aniversario") ||
        histLower.includes("churrasco") ||
        histLower.includes("bolo") ||
        histLower.includes("supermercado")
      ) {
        categoriaDRE = "6.1 Despesas Administrativas (Pessoal)";
      } else if (
        histLower.includes("dlknet") ||
        histLower.includes("teste")
      ) {
        categoriaDRE = "6.1 Despesas Administrativas (Gerais)";
      } else {
        const mappingInfo = activeMapping[plano];
        if (mappingInfo) {
          categoriaDRE = mappingInfo.category;
          isExcluded = mappingInfo.action === 'exclude';
        } else {
          unmappedSet.add(plano);
        }
      }
    } else {
      const mappingInfo = activeMapping[plano];
      if (mappingInfo) {
        categoriaDRE = mappingInfo.category;
        isExcluded = mappingInfo.action === 'exclude';
      } else {
        unmappedSet.add(plano);
        categoriaDRE = "NÃO MAPEADO";
      }
    }
    
    // Salvar transação
    transactions.push({
      codigo,
      pontoRecebimento: ponto,
      dataCadastro: dataCad,
      dataCompetencia: dataComp,
      modoPagamento: modo,
      historico,
      usuario,
      planoDeContas: plano,
      entrada: entradaVal,
      saida: saidaVal,
      categoriaDRE: isExcluded ? "EXCLUÍDO DA DRE" : categoriaDRE
    });
  });
  
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
