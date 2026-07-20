import { useState } from 'react';
import { UploadCloud, CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react';
import { parseSicrediCsv, type CardStatement, type CardStatementItem } from '../utils/cardStatementParser';
import { reconciliarFatura } from '../utils/cardReconciliation';
import {
  loadCardMerchantMapping,
  saveCardMerchantMapping,
  sugerirPlanoDeContas,
  normalizeDescricao
} from '../utils/cardMerchantMapping';
import { encontrarLancamentoFatura } from '../utils/findCardLedgerEntry';
import { substituirLancamentoFatura, type CardImportItem } from '../utils/cardInvoiceReplacement';
import type { DREData, Transaction } from '../utils/dreParser';

interface CardStatementImportProps {
  dreDatabase: Record<string, DREData>;
  mapping: Record<string, { category: string; action: 'include' | 'exclude' }>;
  onSaveDREMonth: (data: DREData) => void;
}

interface ReviewRow {
  item: CardStatementItem;
  planoDeContas: string;
}

const TOLERANCIA = 0.01;

export default function CardStatementImport({ dreDatabase, mapping, onSaveDREMonth }: CardStatementImportProps) {
  const [statement, setStatement] = useState<CardStatement | null>(null);
  const [candidatos, setCandidatos] = useState<Transaction[]>([]);
  const [lancamentoEscolhido, setLancamentoEscolhido] = useState<Transaction | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const planosDeConta = Object.keys(mapping);

  const resetar = () => {
    setStatement(null);
    setCandidatos([]);
    setLancamentoEscolhido(null);
    setRows([]);
    setErro(null);
  };

  const handleFile = async (file: File) => {
    resetar();
    setSucesso(null);

    try {
      const text = await file.text();
      const parsed = parseSicrediCsv(text);

      const reconciliacao = reconciliarFatura(parsed);
      if (reconciliacao.status === 'erro') {
        setErro(
          `Não bateu a conta da fatura: soma dos itens R$ ${reconciliacao.somaItens.toFixed(2)} ` +
          `vs total R$ ${parsed.valorTotal.toFixed(2)}. Revise o arquivo antes de importar.`
        );
        return;
      }

      const itensCompletos = reconciliacao.itemEncargos
        ? [...parsed.itens, reconciliacao.itemEncargos]
        : parsed.itens;
      const statementCompleto: CardStatement = { ...parsed, itens: itensCompletos };
      setStatement(statementCompleto);

      const todasTransacoes = Object.values(dreDatabase).flatMap(d => d.transactions);
      const encontrados = encontrarLancamentoFatura(todasTransacoes, parsed.valorTotal);
      setCandidatos(encontrados);

      if (encontrados.length === 1) {
        setLancamentoEscolhido(encontrados[0]);
      }

      const merchantMapping = loadCardMerchantMapping();
      const novasRows: ReviewRow[] = itensCompletos.map(item => ({
        item,
        planoDeContas: sugerirPlanoDeContas(item.descricao, merchantMapping) || ''
      }));
      setRows(novasRows);
    } catch (err: any) {
      setErro(err.message || 'Erro ao processar o arquivo. Verifique se o formato está correto.');
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handlePlanoChange = (index: number, planoDeContas: string) => {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, planoDeContas } : row)));
  };

  const somaClassificada = rows.reduce((acc, row) => acc + row.item.valor, 0);
  const totalBate = statement ? Math.abs(somaClassificada - statement.valorTotal) <= TOLERANCIA : false;
  const todosClassificados = rows.length > 0 && rows.every(row => row.planoDeContas !== '');
  const podeConfirmar = !!statement && !!lancamentoEscolhido && totalBate && todosClassificados;

  const dreDoMes = lancamentoEscolhido
    ? Object.values(dreDatabase).find(d => d.transactions.some(t => t.codigo === lancamentoEscolhido.codigo))
    : undefined;

  const handleConfirmar = () => {
    if (!statement || !lancamentoEscolhido || !dreDoMes) return;

    const itensParaSubstituir: CardImportItem[] = rows.map(row => ({
      data: row.item.data,
      descricao: row.item.descricao,
      valor: row.item.valor,
      planoDeContas: row.planoDeContas
    }));

    const dreAtualizado = substituirLancamentoFatura(
      dreDoMes,
      lancamentoEscolhido.codigo,
      itensParaSubstituir,
      statement.dataVencimento,
      mapping
    );

    onSaveDREMonth(dreAtualizado);

    const merchantMapping = loadCardMerchantMapping();
    rows.forEach(row => {
      merchantMapping[normalizeDescricao(row.item.descricao)] = {
        planoDeContas: row.planoDeContas,
        updatedAt: new Date().toISOString()
      };
    });
    saveCardMerchantMapping(merchantMapping);

    setSucesso(`Fatura importada! ${rows.length} itens substituíram o lançamento cheio em ${dreDoMes.monthLabel}.`);
    resetar();
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="table-card">
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Importar Fatura de Cartão</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Sobe o CSV da fatura Sicredi pra quebrar o lançamento cheio do cartão nos itens individuais.
        </p>

        <div
          className="uploader-card"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
          }}
        >
          <UploadCloud size={32} className="uploader-icon" />
          <p>Arraste o CSV da fatura aqui ou clique para selecionar</p>
          <input type="file" accept=".csv" onChange={onFileChange} />
        </div>

        {erro && (
          <div className="alert-card" style={{ marginTop: '16px' }}>
            <AlertTriangle size={18} />
            <span>{erro}</span>
          </div>
        )}

        {sucesso && (
          <div className="alert-card alert-info" style={{ marginTop: '16px' }}>
            <CheckCircle2 size={18} />
            <span>{sucesso}</span>
          </div>
        )}
      </div>

      {statement && candidatos.length === 0 && (
        <div className="alert-card">
          <AlertTriangle size={18} />
          <span>
            Não encontrei nenhum lançamento de fatura de cartão de R$ {formatCurrency(statement.valorTotal)}
            {' '}no caixa carregado. Confira se o mês certo já foi importado no Dashboard.
          </span>
        </div>
      )}

      {statement && candidatos.length > 1 && (
        <div className="table-card">
          <h4 style={{ marginBottom: '12px' }}>Mais de um lançamento bateu com o valor da fatura — escolha qual substituir:</h4>
          {candidatos.map(c => (
            <div key={c.codigo} className="mapping-row">
              <span>{c.historico} — {formatCurrency(c.saida || 0)} — {c.dataCadastro}</span>
              <button className="btn-secondary" onClick={() => setLancamentoEscolhido(c)}>
                {lancamentoEscolhido?.codigo === c.codigo ? 'Selecionado' : 'Selecionar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {statement && lancamentoEscolhido && (
        <div className="table-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h4>Revisão dos itens</h4>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Substituindo lançamento de {formatCurrency(lancamentoEscolhido.saida || 0)} em {lancamentoEscolhido.dataCadastro}
              </span>
            </div>
            <span className={`badge-pill ${totalBate ? '' : 'alert-info'}`}>
              Total da fatura: {formatCurrency(statement.valorTotal)} | Soma classificada: {formatCurrency(somaClassificada)}
              {totalBate ? ' ✓' : ' ✗'}
            </span>
          </div>

          <table className="dre-table">
            <thead>
              <tr className="table-header-row">
                <th>Data</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Plano de Contas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td>{row.item.data}</td>
                  <td>{row.item.descricao}</td>
                  <td>{formatCurrency(row.item.valor)}</td>
                  <td>
                    <select
                      value={row.planoDeContas}
                      onChange={e => handlePlanoChange(index, e.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {planosDeConta.map(pc => (
                        <option key={pc} value={pc}>{pc}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            className="btn-primary"
            disabled={!podeConfirmar}
            onClick={handleConfirmar}
            style={{ marginTop: '16px', width: 'auto', padding: '10px 24px' }}
          >
            <CreditCard size={16} style={{ marginRight: '6px' }} />
            Confirmar e substituir no DRE
          </button>
        </div>
      )}
    </div>
  );
}
