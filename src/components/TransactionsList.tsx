import { useState } from 'react';
import { Search, Filter, ArrowUpRight, ArrowDownLeft, FileSpreadsheet, Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { type Transaction } from '../utils/dreParser';

interface TransactionsListProps {
  transactions: Transaction[];
}

export default function TransactionsList({ transactions }: TransactionsListProps) {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Obter categorias únicas
  const categories = Array.from(new Set(transactions.map(t => t.categoriaDRE))).filter(c => c);

  // Filtrar transações
  const filtered = transactions.filter(t => {
    // 1. Busca por texto
    const matchesSearch = 
      t.historico.toLowerCase().includes(search.toLowerCase()) ||
      t.planoDeContas.toLowerCase().includes(search.toLowerCase()) ||
      t.codigo.toLowerCase().includes(search.toLowerCase());
      
    // 2. Filtro por Conta Mãe (Grupo 1, 2, 4, 6, 8)
    let matchesGroup = true;
    if (groupFilter !== 'all') {
      const cat = t.categoriaDRE;
      if (groupFilter === '1') matchesGroup = cat.startsWith('1.');
      else if (groupFilter === '2') matchesGroup = cat.startsWith('2.');
      else if (groupFilter === '4') matchesGroup = cat.startsWith('4.');
      else if (groupFilter === '6') matchesGroup = cat.startsWith('6.');
      else if (groupFilter === '8') matchesGroup = cat.startsWith('8.');
    }

    // 3. Filtro por Categoria Específica
    const matchesCategory = categoryFilter === 'all' || t.categoriaDRE === categoryFilter;
    
    // 4. Filtro por Tipo (Entrada ou Saída)
    let matchesType = true;
    if (typeFilter === 'entradas') matchesType = t.entrada !== null && t.entrada > 0;
    if (typeFilter === 'saidas') matchesType = t.saida !== null && t.saida > 0;
    
    return matchesSearch && matchesGroup && matchesCategory && matchesType;
  });

  // Paginação
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Calcular totais
  const totalEntradas = filtered.reduce((acc, t) => acc + (t.entrada || 0), 0);
  const totalSaidas = filtered.reduce((acc, t) => acc + (t.saida || 0), 0);

  // Exportar para Excel (.xlsx) usando SheetJS
  const handleExportXLS = () => {
    const dataToExport = filtered.map(t => ({
      'Data': t.dataCadastro,
      'Código': t.codigo,
      'Plano de Contas': t.planoDeContas,
      'Histórico': t.historico,
      'Entrada (R$)': t.entrada || 0,
      'Saída (R$)': t.saida || 0,
      'Categoria DRE': t.categoriaDRE
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Extrato");

    // Auto-ajustar colunas
    const maxLens = Object.keys(dataToExport[0] || {}).map(key => {
      const colValues = dataToExport.map(row => String((row as any)[key] || ''));
      return Math.max(key.length, ...colValues.map(v => v.length)) + 2;
    });
    worksheet['!cols'] = maxLens.map(l => ({ wch: l }));

    XLSX.writeFile(workbook, `Extrato_Detalhado_DRE.xlsx`);
  };

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="table-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={20} className="text-muted" style={{ color: 'var(--primary)' }} />
            <span>Extrato de Lançamentos Detalhado</span>
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Consulte, filtre e exporte lançamentos individuais do caixa.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {/* Totais do filtro */}
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginRight: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Entradas</span>
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>{formatCurrency(totalEntradas)}</span>
            </div>
            <div style={{ textAlign: 'right', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
              <span style={{ color: 'var(--text-muted)', display: 'block' }}>Saídas</span>
              <span style={{ color: 'var(--danger)', fontWeight: 700 }}>({formatCurrency(totalSaidas)})</span>
            </div>
          </div>

          {/* Ações de Exportação */}
          <div style={{ display: 'flex', gap: '8px' }} className="table-actions">
            <button className="btn-secondary" onClick={handleExportXLS}>
              <Download size={14} />
              <span>Exportar XLS</span>
            </button>
            <button className="btn-secondary" onClick={handleExportPDF}>
              <FileText size={14} />
              <span>Exportar PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="search-bar-wrapper" style={{ flexWrap: 'wrap', gap: '12px' }}>
        {/* Pesquisa por texto */}
        <div className="search-input-wrapper" style={{ minWidth: '220px', flex: '1' }}>
          <Search className="search-input-icon" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por histórico, código ou conta..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          />
        </div>

        {/* Filtro por Conta Mãe (Grupo Principal) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={13} className="text-muted" />
          <select 
            value={groupFilter} 
            onChange={(e) => { setGroupFilter(e.target.value); setCategoryFilter('all'); setCurrentPage(1); }}
            style={{ padding: '10px 12px', background: 'rgba(10, 15, 25, 0.8)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '13px' }}
          >
            <option value="all">Todas as Contas Mãe</option>
            <option value="1">1. Receita Operacional Bruta</option>
            <option value="2">2. Deduções e Tributos</option>
            <option value="4">4. Custos CSP (Rede)</option>
            <option value="6">6. Despesas OPEX (Adm/Fin)</option>
            <option value="8">8. Amortização e Financiamento</option>
          </select>
        </div>

        {/* Filtro por Categoria Específica */}
        <select 
          value={categoryFilter} 
          onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
          style={{ padding: '10px 12px', background: 'rgba(10, 15, 25, 0.8)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '13px', maxWidth: '220px' }}
        >
          <option value="all">Subcategorias DRE (Todas)</option>
          <option value="NÃO MAPEADO">⚠️ NÃO MAPEADO</option>
          <option value="EXCLUÍDO DA DRE">🚫 EXCLUÍDO DA DRE</option>
          {categories
            .filter(c => c !== "NÃO MAPEADO" && c !== "EXCLUÍDO DA DRE")
            .filter(c => {
              if (groupFilter === 'all') return true;
              return c.startsWith(groupFilter + '.');
            })
            .sort()
            .map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))
          }
        </select>

        {/* Filtro por Tipo */}
        <select 
          value={typeFilter} 
          onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
          style={{ padding: '10px 12px', background: 'rgba(10, 15, 25, 0.8)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', fontSize: '13px' }}
        >
          <option value="all">Entradas e Saídas</option>
          <option value="entradas">Apenas Entradas (+)</option>
          <option value="saidas">Apenas Saídas (-)</option>
        </select>
      </div>

      {/* Tabela de Lançamentos */}
      <div className="dre-table-wrapper" style={{ marginTop: '16px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
            Nenhuma transação encontrada com os critérios selecionados.
          </div>
        ) : (
          <>
            <table className="dre-table">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>Data</th>
                  <th style={{ width: '80px' }}>Código</th>
                  <th style={{ width: '220px' }}>Plano de Contas ERP</th>
                  <th>Histórico</th>
                  <th className="col-right" style={{ width: '130px' }}>Valor</th>
                  <th style={{ width: '260px' }}>Categoria DRE</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((t, idx) => {
                  const isEntrada = t.entrada !== null && t.entrada > 0;
                  const val = isEntrada ? t.entrada : t.saida;
                  const isUnmapped = t.categoriaDRE === "NÃO MAPEADO";
                  const isExcluded = t.categoriaDRE === "EXCLUÍDO DA DRE";
                  
                  return (
                    <tr key={idx}>
                      <td style={{ fontSize: '13px' }}>{t.dataCadastro}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t.codigo}</td>
                      <td style={{ fontSize: '13px', fontWeight: 500 }}>{t.planoDeContas}</td>
                      <td style={{ fontSize: '13px', color: 'var(--text-main)', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.historico}>
                        {t.historico}
                      </td>
                      <td className="col-right" style={{ 
                        fontWeight: 600, 
                        color: isEntrada ? 'var(--success)' : 'var(--danger)',
                        fontSize: '13px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                          {isEntrada ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                          <span>{formatCurrency(val || 0)}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge-pill ${isExcluded ? 'exclude' : (isUnmapped ? 'warning' : 'include')}`} style={{
                          background: isExcluded ? 'var(--danger-bg)' : (isUnmapped ? 'var(--warning-bg)' : 'var(--success-bg)'),
                          color: isExcluded ? 'var(--danger)' : (isUnmapped ? 'var(--warning)' : 'var(--success)'),
                          display: 'inline-block',
                          fontSize: '11px',
                          textTransform: 'none'
                        }}>
                          {t.categoriaDRE}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Paginação */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }} className="table-actions">
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Mostrando de {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filtered.length)} de <b>{filtered.length}</b> lançamentos.
                </span>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Anterior
                  </button>
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: '13px', fontWeight: 600, padding: '0 8px' }}>
                    Pág. {currentPage} de {totalPages}
                  </span>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
