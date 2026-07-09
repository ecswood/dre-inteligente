import React, { useState } from 'react';
import { UploadCloud, FileSpreadsheet, Download, FileText, AlertTriangle, Play, HelpCircle, Activity } from 'lucide-react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import FinancialRecommendations from './FinancialRecommendations';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  ArcElement, 
  PointElement,
  LineElement,
  Title, 
  Tooltip, 
  Legend,
  Filler
} from 'chart.js';
import { parseCaixaExcel, type DREData } from '../utils/dreParser';

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  ArcElement, 
  PointElement,
  LineElement,
  Title, 
  Tooltip, 
  Legend,
  Filler
);

interface DashboardProps {
  mapping: Record<string, { category: string; action: 'include' | 'exclude' }>;
  onFoundUnmapped: (accounts: string[]) => void;
  onViewMappingTab: () => void;
  dreData: DREData | null;
  setDreData: (data: DREData | null) => void;
  dreDatabase: Record<string, DREData>;
  onSaveDREMonth: (data: DREData) => void;
  onDeleteDREMonth: (monthId: string) => void;
}

export default function Dashboard({ 
  mapping, 
  onFoundUnmapped, 
  onViewMappingTab, 
  dreData, 
  setDreData,
  dreDatabase,
  onSaveDREMonth,
  onDeleteDREMonth
}: DashboardProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isRecommendationsOpen, setIsRecommendationsOpen] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = parseCaixaExcel(arrayBuffer, mapping);
      
      onSaveDREMonth(result);
      if (result.unmapped.length > 0) {
        onFoundUnmapped(result.unmapped);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao processar o arquivo Excel. Verifique se o formato está correto.");
      setDreData(null);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const onDragLeave = () => {
    setIsDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatPct = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1 }).format(val);
  };

  const handleExportCSV = () => {
    if (!dreData) return;
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Plano de Contas;Valor (R$);% Rec. Bruta\n";
    
    dreData.lines.forEach(line => {
      const sanitizedAccount = line.account.replace(/;/g, ',');
      const sanitizedValue = line.value.toFixed(2).replace('.', ',');
      const sanitizedPct = (line.pct * 100).toFixed(1).replace('.', ',') + "%";
      csvContent += `"${sanitizedAccount}";"${sanitizedValue}";"${sanitizedPct}"\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `DRE_ISP_${fileName?.replace('.xlsx', '') || 'Dashboard'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Preparar dados para a Visão Geral DRE
  const getOverviewChartData = () => {
    if (!dreData) return { labels: [], datasets: [] };
    const { totals } = dreData;
    return {
      labels: ['Receita Bruta', 'Receita Líquida (ROL)', 'Custos CSP', 'Despesas OPEX', 'EBITDA', 'Result. Líquido'],
      datasets: [
        {
          label: 'Valor (R$)',
          data: [
            totals.receitaBruta,
            totals.rol,
            totals.csp,
            totals.opex,
            totals.ebitda,
            totals.liquido
          ],
          backgroundColor: [
            'rgba(59, 130, 246, 0.75)',  // Azul
            'rgba(16, 185, 129, 0.75)',  // Verde
            'rgba(245, 158, 11, 0.75)',   // Laranja
            'rgba(239, 68, 68, 0.75)',   // Vermelho
            'rgba(139, 92, 246, 0.75)',  // Roxo
            'rgba(236, 72, 153, 0.75)'   // Rosa
          ],
          borderColor: [
            '#3b82f6',
            '#10b981',
            '#f59e0b',
            '#ef4444',
            '#8b5cf6',
            '#ec4899'
          ],
          borderWidth: 1.5,
          borderRadius: 8,
        }
      ]
    };
  };

  // Preparar dados para o Gráfico de Custos (CSP)
  const getChartCostsData = () => {
    if (!dreData) return { labels: [], datasets: [] };
    const costsLines = dreData.lines.filter(l => 
      l.account.includes("4.1") || 
      l.account.includes("4.2") || 
      l.account.includes("4.5")
    );
    
    return {
      labels: costsLines.map(l => l.account.trim().split(" : ").pop() || l.account.trim()),
      datasets: [
        {
          label: 'Custos (R$)',
          data: costsLines.map(l => l.value),
          backgroundColor: 'rgba(59, 130, 246, 0.65)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 6,
        }
      ]
    };
  };

  // Preparar dados para o Gráfico de Despesas (OPEX)
  const getChartOpexData = () => {
    if (!dreData) return { labels: [], datasets: [] };
    const opexLines = dreData.lines.filter(l => 
      l.account.includes("6.1") || 
      l.account.includes("6.3") || 
      l.account.includes("6.4")
    );
    
    return {
      labels: opexLines.map(l => l.account.trim().split(" : ").pop() || l.account.trim()),
      datasets: [
        {
          data: opexLines.map(l => l.value),
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',
            'rgba(16, 185, 129, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(139, 92, 246, 0.7)',
            'rgba(236, 72, 153, 0.7)',
            'rgba(20, 184, 166, 0.7)'
          ],
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
        }
      ]
    };
  };

  // Preparar dados para o Gráfico de Histórico
  const getHistoricalChartData = () => {
    const months = Object.keys(dreDatabase).sort();
    const labels = months.map(mId => dreDatabase[mId].monthLabel.replace(' de ', '/'));
    const receitaData = months.map(mId => dreDatabase[mId].totals.receitaBruta);
    const ebitdaData = months.map(mId => dreDatabase[mId].totals.ebitda);
    const liquidoData = months.map(mId => dreDatabase[mId].totals.liquido);

    return {
      labels,
      datasets: [
        {
          label: 'Receita Bruta',
          data: receitaData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true
        },
        {
          label: 'EBITDA',
          data: ebitdaData,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Lucro Líquido',
          data: liquidoData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true
        }
      ]
    };
  };
  const handleLoadSample = async () => {
    try {
      const response = await fetch('/caixahistorico.xlsx');
      if (!response.ok) throw new Error("Planilha de demonstração não encontrada!");
      const blob = await response.blob();
      handleFile(new File([blob], "caixahistorico_demonstracao.xlsx"));
    } catch (err: any) {
      setError("Não foi possível carregar a demonstração: " + err.message);
    }
  };

  return (
    <div>
      {/* Uploader Card */}
      {!dreData && (
        <div 
          className={`uploader-card ${isDragActive ? 'drag-active' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => document.getElementById('excel-file-input')?.click()}
        >
          <input 
            type="file" 
            id="excel-file-input"
            accept=".xlsx, .xls"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <div className="uploader-icon">
            <UploadCloud size={28} />
          </div>
          <div>
            <h3>Arraste e solte o arquivo do caixa aqui</h3>
            <p>ou clique para selecionar do seu computador (Suporta arquivos .xlsx e .xls do seu ERP)</p>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={(e) => { e.stopPropagation(); handleLoadSample(); }}
            >
              <Play size={14} />
              <span>Carregar Planilha de Demonstração (Histórico Local)</span>
            </button>
            {Object.keys(dreDatabase).length > 0 && (
              <button 
                type="button" 
                className="btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  const keys = Object.keys(dreDatabase).sort();
                  setDreData(dreDatabase[keys[keys.length - 1]]);
                }}
                style={{ width: 'auto', padding: '10px 18px' }}
              >
                Voltar ao Painel Histórico
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="error-message" style={{ marginBottom: '24px' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {dreData && dreData.unmapped.length > 0 && (
        <div className="alert-card">
          <div className="alert-info">
            <AlertTriangle size={20} />
            <span>
              <b>Atenção:</b> Encontramos <b>{dreData.unmapped.length}</b> contas do ERP sem mapeamento na DRE.
            </span>
          </div>
          <button className="btn-secondary" onClick={onViewMappingTab} style={{ background: '#fbbf24', color: '#111827', border: 'none' }}>
            Mapear Contas Pendentes
          </button>
        </div>
      )}

      {dreData && (
        <div>
          {/* Month Selector dropdown */}
          {Object.keys(dreDatabase).length > 0 && (
            <div className="table-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', padding: '16px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>Mês de Referência:</span>
                <select 
                  value={dreData.monthId} 
                  onChange={(e) => setDreData(dreDatabase[e.target.value])}
                  style={{
                    background: 'rgba(10, 15, 30, 0.8)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    padding: '8px 16px',
                    fontSize: '14px',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {Object.keys(dreDatabase).sort().map(mId => (
                    <option key={mId} value={mId}>
                      {dreDatabase[mId].monthLabel}
                    </option>
                  ))}
                </select>
              </div>
              <button 
                className="btn-secondary" 
                onClick={() => onDeleteDREMonth(dreData.monthId)}
                style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '12px', padding: '6px 14px' }}
              >
                Excluir Mês Atual do Banco
              </button>
            </div>
          )}

          {/* Historical Trend Chart (Only if 2 or more months are loaded) */}
          {Object.keys(dreDatabase).length >= 2 && (
            <div className="chart-card" style={{ marginBottom: '30px' }}>
              <div className="chart-title">
                <Activity size={18} style={{ color: 'var(--success)' }} />
                <span>Evolução Histórica Multi-Mensal (Receitas vs. EBITDA vs. Lucro)</span>
              </div>
              <div className="chart-container" style={{ height: '300px' }}>
                <Line 
                  data={getHistoricalChartData()}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { 
                        display: true,
                        labels: { color: '#9ca3af', font: { family: 'Outfit', weight: 'bold' } }
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw as number)}`
                        }
                      }
                    },
                    scales: {
                      x: { grid: { display: false }, ticks: { color: '#9ca3af' } },
                      y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } }
                    }
                  }}
                />
              </div>
            </div>
          )}
          {/* File summary bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={20} className="text-muted" style={{ color: 'var(--success)' }} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>{fileName}</span>
              <span className="badge-pill include" style={{ fontSize: '10px', padding: '2px 8px' }}>Processado</span>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn-primary" 
                onClick={() => setIsRecommendationsOpen(true)}
                style={{ width: 'auto', padding: '8px 18px', fontSize: '13px', background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)', boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)' }}
              >
                <Activity size={14} />
                <span>Análise e Recomendações</span>
              </button>
              <button className="btn-secondary" onClick={() => { setDreData(null); setFileName(null); }}>
                Carregar Outro Arquivo
              </button>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="kpi-grid">
            <div className="kpi-card" style={{ '--card-gradient': 'linear-gradient(90deg, #3b82f6, #60a5fa)' } as any}>
              <div className="kpi-header">
                <span>Receita Bruta</span>
                <span title="Soma de todos os faturamentos de SVA, SCM e taxas"><HelpCircle size={14} /></span>
              </div>
              <div className="kpi-value">{formatCurrency(dreData.totals.receitaBruta)}</div>
              <div className="kpi-footer">
                <span className="text-muted">Total Entradas</span>
                <span className="kpi-trend neutral">100%</span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--card-gradient': 'linear-gradient(90deg, #10b981, #34d399)' } as any}>
              <div className="kpi-header">
                <span>Receita Líquida (ROL)</span>
                <span title="Receita Bruta subtraída dos impostos incidentes (DARF)"><HelpCircle size={14} /></span>
              </div>
              <div className="kpi-value">{formatCurrency(dreData.totals.rol)}</div>
              <div className="kpi-footer">
                <span className="text-muted">Base Operacional</span>
                <span className="kpi-trend up">{formatPct(dreData.totals.rol / dreData.totals.receitaBruta)}</span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--card-gradient': 'linear-gradient(90deg, #f59e0b, #fbbf24)' } as any}>
              <div className="kpi-header">
                <span>Custos ISP (CSP)</span>
                <span title="Custos diretos para entregar a internet (Link, Postes, Infra)"><HelpCircle size={14} /></span>
              </div>
              <div className="kpi-value" style={{ color: 'var(--text-main)' }}>{formatCurrency(dreData.totals.csp)}</div>
              <div className="kpi-footer">
                <span className="text-muted">Links & Postes</span>
                <span className="kpi-trend down" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                  {formatPct(dreData.totals.csp / dreData.totals.receitaBruta)}
                </span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--card-gradient': 'linear-gradient(90deg, #ef4444, #f87171)' } as any}>
              <div className="kpi-header">
                <span>Despesas (OPEX)</span>
                <span title="Despesas fixas administrativas, folha de pagamento e financeiras"><HelpCircle size={14} /></span>
              </div>
              <div className="kpi-value">{formatCurrency(dreData.totals.opex)}</div>
              <div className="kpi-footer">
                <span className="text-muted">Administrativo</span>
                <span className="kpi-trend down">
                  {formatPct(dreData.totals.opex / dreData.totals.receitaBruta)}
                </span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--card-gradient': 'linear-gradient(90deg, #8b5cf6, #a78bfa)' } as any}>
              <div className="kpi-header">
                <span>EBITDA</span>
                <span title="Resultado operacional antes de depreciação e juros de dívidas"><HelpCircle size={14} /></span>
              </div>
              <div className="kpi-value" style={{ color: dreData.totals.ebitda >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatCurrency(dreData.totals.ebitda)}
              </div>
              <div className="kpi-footer">
                <span className="text-muted">Lucratividade</span>
                <span className={`kpi-trend ${dreData.totals.ebitda >= 0 ? 'up' : 'down'}`}>
                  {formatPct(dreData.totals.ebitda / dreData.totals.receitaBruta)}
                </span>
              </div>
            </div>

            <div className="kpi-card" style={{ '--card-gradient': 'linear-gradient(90deg, #ec4899, #f472b6)' } as any}>
              <div className="kpi-header">
                <span>Result. Líquido</span>
                <span title="Resultado líquido final acumulado (Lucro ou Prejuízo)"><HelpCircle size={14} /></span>
              </div>
              <div className="kpi-value" style={{ color: dreData.totals.liquido >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {formatCurrency(dreData.totals.liquido)}
              </div>
              <div className="kpi-footer">
                <span className="text-muted">Resultado Final</span>
                <span className={`kpi-trend ${dreData.totals.liquido >= 0 ? 'up' : 'down'}`}>
                  {formatPct(dreData.totals.liquido / dreData.totals.receitaBruta)}
                </span>
              </div>
            </div>
          </div>

          {/* Overview Chart - Full Width */}
          <div className="chart-card" style={{ marginBottom: '30px' }}>
            <div className="chart-title">
              <Activity size={18} style={{ color: 'var(--primary)' }} />
              <span>Visão Geral do Resultado Financeiro (DRE)</span>
            </div>
            <div className="chart-container" style={{ height: '320px' }}>
              <Bar 
                data={getOverviewChartData()} 
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (context) => `Valor: ${formatCurrency(context.raw as number)}`
                      }
                    }
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { family: 'Outfit', weight: 'bold' } } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } }
                  }
                }} 
              />
            </div>
          </div>

          {/* Charts block */}
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-title">
                <FileText size={18} style={{ color: 'var(--primary)' }} />
                <span>Composição dos Custos de Rede (CSP)</span>
              </div>
              <div className="chart-container">
                <Bar 
                  data={getChartCostsData()} 
                  options={{
                    indexAxis: 'y', // barras horizontais
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => `Valor: ${formatCurrency(context.raw as number)}`
                        }
                      }
                    },
                    scales: {
                      x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                      y: { grid: { display: false }, ticks: { color: '#9ca3af' } }
                    }
                  }} 
                />
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-title">
                <FileText size={18} style={{ color: 'var(--success)' }} />
                <span>Composição de Despesas (OPEX)</span>
              </div>
              <div className="chart-container" style={{ display: 'flex', justifyContent: 'center' }}>
                <Doughnut 
                  data={getChartOpexData()} 
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'right',
                        labels: { color: '#9ca3af', boxWidth: 12, font: { size: 10 } }
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => ` ${context.label}: ${formatCurrency(context.raw as number)}`
                        }
                      }
                    }
                  }} 
                />
              </div>
            </div>
          </div>

          {/* DRE Table Card */}
          <div className="table-card">
            <div className="table-header-row">
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Estrutura de Resultados Completa (Visão Caixa)</h3>
              <div className="table-actions">
                <button className="btn-secondary" onClick={handleExportCSV}>
                  <Download size={14} />
                  <span>Exportar CSV</span>
                </button>
                <button className="btn-secondary" onClick={() => window.print()}>
                  <FileText size={14} />
                  <span>Gerar PDF (Imprimir)</span>
                </button>
              </div>
            </div>

            <div className="dre-table-wrapper">
              <table className="dre-table">
                <thead>
                  <tr>
                    <th>Plano de Contas DRE</th>
                    <th className="col-right">Valor Financeiro</th>
                    <th className="col-right">% Rec. Bruta</th>
                  </tr>
                </thead>
                <tbody>
                  {dreData.lines.map((line, idx) => {
                    return (
                      <tr key={idx} className={`row-${line.style}`}>
                        <td>{line.account}</td>
                        <td className="col-right">
                          {line.style === 'group' && line.account.includes("DEDUÇÕES") 
                            ? formatCurrency(-line.value) 
                            : (line.style === 'subgroup' && (line.account.includes("2.1") || line.account.includes("4.") || line.account.includes("6.") || line.account.includes("8."))
                              ? `(${formatCurrency(line.value)})`
                              : formatCurrency(line.value)
                            )
                          }
                        </td>
                        <td className="col-right">
                          {line.pct !== null ? formatPct(line.pct) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          <FinancialRecommendations 
            dreData={dreData}
            isOpen={isRecommendationsOpen}
            onClose={() => setIsRecommendationsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
