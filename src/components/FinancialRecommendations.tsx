import { useState, useEffect } from 'react';
import { X, Activity, AlertTriangle, ShieldCheck, DollarSign, Zap, CheckCircle, Award, TrendingUp } from 'lucide-react';
import { type DREData } from '../utils/dreParser';

interface FinancialRecommendationsProps {
  dreData: DREData;
  isOpen: boolean;
  onClose: () => void;
}

export default function FinancialRecommendations({ dreData, isOpen, onClose }: FinancialRecommendationsProps) {
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);

  const loadingMessages = [
    "Iniciando auditoria dos lançamentos de caixa...",
    "Calculando margens CSP (Links e Postes) vs. faturamento bruto...",
    "Analisando custos OPEX (Folha de pessoal e despesas administrativas)...",
    "Cruzando indicadores financeiros com benchmarks de ISPs no Brasil...",
    "Estruturando plano de ação personalizado para lucratividade..."
  ];

  // Simular processo de análise do agente IA especialista
  useEffect(() => {
    if (!isOpen) return;
    
    setLoading(true);
    setLoadingStep(0);

    const interval = setInterval(() => {
      setLoadingStep(prev => {
        if (prev >= loadingMessages.length - 1) {
          clearInterval(interval);
          setLoading(false);
          return prev;
        }
        return prev + 1;
      });
    }, 600);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const { totals } = dreData;
  
  // Calcular indicadores chave
  const receita = totals.receitaBruta || 1;
  const opexMargin = (totals.opex / receita) * 100;
  const cspMargin = (totals.csp / receita) * 100;
  const deducoesMargin = (totals.deducoes / receita) * 100;
  const ebitdaMargin = (totals.ebitda / receita) * 100;
  const netMargin = (totals.liquido / receita) * 100;

  // Formatação de Moeda
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Obter Status da Saúde Financeira
  const getEbitdaStatus = () => {
    if (ebitdaMargin >= 35) return { label: 'Saudável', color: 'var(--success)', icon: <CheckCircle size={18} /> };
    if (ebitdaMargin >= 20) return { label: 'Atenção', color: 'var(--warning)', icon: <AlertTriangle size={18} /> };
    return { label: 'Crítico', color: 'var(--danger)', icon: <AlertTriangle size={18} /> };
  };

  const getNetStatus = () => {
    if (netMargin >= 10) return { label: 'Excelente', color: 'var(--success)', icon: <Award size={18} /> };
    if (netMargin >= 0) return { label: 'Marginal', color: 'var(--warning)', icon: <AlertTriangle size={18} /> };
    return { label: 'Deficitário', color: 'var(--danger)', icon: <AlertTriangle size={18} /> };
  };

  const ebitdaStatus = getEbitdaStatus();
  const netStatus = getNetStatus();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(3, 5, 10, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{
        background: '#0a0f1d',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(37, 99, 235, 0.1)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '850px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.01)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Activity size={22} style={{ color: 'var(--primary)' }} />
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Agente Especialista Financeiro (ISPs)
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Análise de Margens, Otimização Fiscal e Lucratividade
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="btn-icon" 
            style={{ padding: '6px', borderRadius: '50%' }}
            disabled={loading}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          
          {loading ? (
            /* Loading State */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '20px' }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                border: '3px solid rgba(59, 130, 246, 0.1)',
                borderTopColor: 'var(--primary)',
                animation: 'spin 1s linear infinite'
              }} />
              <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>
                  {loadingMessages[loadingStep]}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Auditoria passo a passo em andamento...
                </p>
              </div>
            </div>
          ) : (
            /* Analysis Results */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Resumo de Indicadores */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                
                <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>EBITDA Operacional</span>
                  <span style={{ display: 'block', fontSize: '18px', fontWeight: 700, marginTop: '8px' }}>{formatCurrency(totals.ebitda)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: ebitdaStatus.color, fontWeight: 600 }}>
                    {ebitdaStatus.icon}
                    <span>{ebitdaStatus.label} ({ebitdaMargin.toFixed(1)}%)</span>
                  </div>
                </div>

                <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Lucro Líquido</span>
                  <span style={{ display: 'block', fontSize: '18px', fontWeight: 700, marginTop: '8px' }}>{formatCurrency(totals.liquido)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '12px', color: netStatus.color, fontWeight: 600 }}>
                    {netStatus.icon}
                    <span>{netStatus.label} ({netMargin.toFixed(1)}%)</span>
                  </div>
                </div>

                <div style={{ padding: '16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Deduções (Impostos/Devoluções)</span>
                  <span style={{ display: 'block', fontSize: '18px', fontWeight: 700, marginTop: '8px' }}>{formatCurrency(totals.deducoes)}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', fontWeight: 500 }}>
                    Carga tributária/dedução média: <b>{deducoesMargin.toFixed(1)}%</b>
                  </span>
                </div>

              </div>

              {/* Diagnósticos Principais */}
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={16} style={{ color: 'var(--primary)' }} />
                  <span>Diagnóstico da Operação</span>
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  
                  {/* Diagnóstico de Custos CSP */}
                  <div style={{ display: 'flex', gap: '12px', padding: '14px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: cspMargin > 25 ? 'var(--danger-bg)' : 'var(--success-bg)',
                      color: cspMargin > 25 ? 'var(--danger)' : 'var(--success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <DollarSign size={16} />
                    </div>
                    <div>
                      <h5 style={{ fontSize: '13px', fontWeight: 600 }}>Eficiência Operacional de Rede (Custos CSP)</h5>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.5' }}>
                        Seus custos CSP equivalem a <b>{cspMargin.toFixed(1)}%</b> do faturamento bruto. 
                        {cspMargin > 25 ? (
                          <span> O benchmark de provedores saudáveis é abaixo de 25%. Isso indica custos elevados com links dedicados, aluguel de postes (infraestrutura) ou licenças.</span>
                        ) : (
                          <span> Seus custos de rede estão sob controle e altamente eficientes (abaixo do teto recomendado de 25%). Parabéns!</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Diagnóstico de Despesas OPEX */}
                  <div style={{ display: 'flex', gap: '12px', padding: '14px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: opexMargin > 35 ? 'var(--danger-bg)' : 'var(--success-bg)',
                      color: opexMargin > 35 ? 'var(--danger)' : 'var(--success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Activity size={16} />
                    </div>
                    <div>
                      <h5 style={{ fontSize: '13px', fontWeight: 600 }}>Eficiência Administrativa (Despesas OPEX)</h5>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.5' }}>
                        Suas despesas OPEX equivalem a <b>{opexMargin.toFixed(1)}%</b> do faturamento bruto.
                        {opexMargin > 35 ? (
                          <span> Este percentual está elevado (limite de benchmark saudável: 35%). Indica que a folha de pessoal, comissões de vendas ou despesas gerais administrativas estão consumindo a margem da empresa.</span>
                        ) : (
                          <span> Suas despesas administrativas e de vendas estão em patamar excelente (abaixo de 35% do faturamento), mostrando uma gestão de escritório eficiente.</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Planejamento Fiscal SVA */}
                  <div style={{ display: 'flex', gap: '12px', padding: '14px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: deducoesMargin > 8 ? 'var(--warning-bg)' : 'var(--success-bg)',
                      color: deducoesMargin > 8 ? 'var(--warning)' : 'var(--success)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <h5 style={{ fontSize: '13px', fontWeight: 600 }}>Carga Tributária e Planejamento Fiscal (SCM vs. SVA)</h5>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.5' }}>
                        Suas deduções fiscais e impostos representam <b>{deducoesMargin.toFixed(1)}%</b> da receita.
                        {deducoesMargin > 8 ? (
                          <span> A carga tributária sobre serviços de telecomunicação (SCM) é muito alta no Brasil. Recomendamos auditar a alocação de planos e migrar mais faturamento para Serviços de Valor Adicionado (SVA) como aplicativos, streaming e serviços de nuvem, reduzindo a incidência direta de ICMS e ISS.</span>
                        ) : (
                          <span> Sua carga de impostos está em um nível aceitável, sugerindo uma boa distribuição tributária entre SVA e SCM.</span>
                        )}
                      </p>
                    </div>
                  </div>

                </div>
              </div>

              {/* Ações Recomendadas */}
              <div style={{ padding: '20px', background: 'rgba(37, 99, 235, 0.04)', border: '1px solid rgba(37, 99, 235, 0.2)', borderRadius: '12px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#60a5fa', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={18} />
                  <span>Plano de Ação para Melhorar a Lucratividade</span>
                </h4>
                
                <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px', color: 'var(--text-main)', lineHeight: '1.5' }}>
                  
                  {cspMargin > 25 && (
                    <li>
                      <b>Renegociação de Trânsito IP / Link Dedicado:</b> Seus custos CSP estão altos. Busque cotações com novos fornecedores ou operadoras de trânsito IP de atacado. O preço do megabit no atacado no Brasil hoje deve estar abaixo de R$ 1,50 por Mbps. Reduzir esse custo pode aumentar seu EBITDA imediatamente em até 5%.
                    </li>
                  )}
                  
                  {opexMargin > 35 && (
                    <li>
                      <b>Otimização de Equipes de Campo (Field Service):</b> Custo com combustível, veículos e técnicos costuma inflar a despesa OPEX. Implemente roteirizadores automáticos para otimizar os trajetos de ativação e suporte, reduzindo o tempo ocioso e despesas de frota.
                    </li>
                  )}

                  <li>
                    <b>Migração Estratégica para SVA:</b> Para provedores enquadrados no Lucro Presumido ou Simples Nacional, alocar até 70% do plano do cliente em Serviços de Valor Adicionado (como licenças de streaming de vídeo, antivírus ou backup em nuvem) reduz substancialmente o pagamento de ICMS, convertendo despesa tributária diretamente em Lucro Líquido.
                  </li>

                  <li>
                    <b>Redução da Inadimplência com Régua de Cobrança Automatizada:</b> Automatize lembretes via WhatsApp e e-mail antes e depois do vencimento dos boletos. Provedores de internet que implementam cobrança recorrente automatizada costumam reduzir a inadimplência em até 40% no primeiro mês.
                  </li>

                  {totals.liquido < 0 && (
                    <li style={{ color: '#f87171', fontWeight: '500' }}>
                      <b>Medida de Urgência - Corte de Gastos Administrativos Desnecessários:</b> A empresa encontra-se com resultado líquido negativo ({formatCurrency(totals.liquido)}). É imperativo congelar novas contratações não operacionais, auditar e suspender softwares/licenças duplicadas e repactuar contratos de longo prazo com fornecedores de infraestrutura.
                    </li>
                  )}

                </ul>
              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          background: 'rgba(255, 255, 255, 0.01)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button 
            className="btn-primary" 
            onClick={onClose}
            disabled={loading}
            style={{ width: 'auto', padding: '10px 24px' }}
          >
            Fechar Diagnóstico
          </button>
        </div>

      </div>
    </div>
  );
}
