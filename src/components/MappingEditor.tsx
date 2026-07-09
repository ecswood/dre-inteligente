import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, ShieldAlert, CheckCircle2, X, Activity } from 'lucide-react';
import { DEFAULT_MAPPING } from '../utils/dreParser';

interface MappingEditorProps {
  mapping: Record<string, { category: string; action: 'include' | 'exclude' }>;
  onSave: (newMapping: Record<string, { category: string; action: 'include' | 'exclude' }>) => void;
  unmappedAccounts: string[];
  isOpen: boolean;
  onClose: () => void;
}

const DRE_CATEGORIES = [
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

export default function MappingEditor({ mapping, onSave, unmappedAccounts, isOpen, onClose }: MappingEditorProps) {
  const [localMapping, setLocalMapping] = useState<Record<string, { category: string; action: 'include' | 'exclude' }>>({ ...mapping });
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'unmapped' | 'excluded'>('all');
  
  // Estado para nova conta manual
  const [newErpAccount, setNewErpAccount] = useState('');
  const [newDreCategory, setNewDreCategory] = useState(DRE_CATEGORIES[0]);
  const [newAction, setNewAction] = useState<'include' | 'exclude'>('include');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Manter localMapping sincronizado caso a prop externa mapping mude
  useEffect(() => {
    if (isOpen) {
      setLocalMapping({ ...mapping });
    }
  }, [mapping, isOpen]);

  if (!isOpen) return null;

  // Agregar contas pendentes (que vieram da planilha mas não estão no mapeamento)
  const allAccounts = { ...localMapping };
  unmappedAccounts.forEach(acc => {
    if (!allAccounts[acc]) {
      allAccounts[acc] = { category: "NÃO MAPEADO", action: 'include' };
    }
  });

  const handleCategoryChange = (account: string, category: string) => {
    const updated = { ...localMapping };
    const currentAction = updated[account]?.action || 'include';
    
    updated[account] = {
      category: category,
      action: category === "EXCLUÍDO DA DRE" ? 'exclude' : currentAction
    };
    
    setLocalMapping(updated);
  };

  const handleActionChange = (account: string, action: 'include' | 'exclude') => {
    const updated = { ...localMapping };
    const currentCategory = updated[account]?.category || DRE_CATEGORIES[0];
    
    updated[account] = {
      category: action === 'exclude' ? "EXCLUÍDO DA DRE" : (currentCategory === "EXCLUÍDO DA DRE" ? DRE_CATEGORIES[0] : currentCategory),
      action
    };
    
    setLocalMapping(updated);
  };

  const handleDelete = (account: string) => {
    const updated = { ...localMapping };
    delete updated[account];
    setLocalMapping(updated);
  };

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newErpAccount.trim()) return;

    const updated = { ...localMapping };
    updated[newErpAccount.trim()] = {
      category: newAction === 'exclude' ? "EXCLUÍDO DA DRE" : newDreCategory,
      action: newAction
    };

    setLocalMapping(updated);
    setNewErpAccount('');
    setNotification({ type: 'success', message: `Conta '${newErpAccount.trim()}' adicionada temporariamente.` });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleResetToDefault = () => {
    if (window.confirm("Deseja realmente redefinir todos os mapeamentos para os padrões de fábrica do sistema? Suas alterações serão perdidas.")) {
      setLocalMapping({ ...DEFAULT_MAPPING });
      setNotification({ type: 'success', message: "Mapeamentos restaurados para o padrão." });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleSave = () => {
    // Validar se há alguma conta marcada como NÃO MAPEADO
    const hasUnmapped = Object.values(localMapping).some(val => val.category === "NÃO MAPEADO");
    
    if (hasUnmapped) {
      setNotification({ type: 'error', message: "Por favor, mapeie todas as contas pendentes antes de salvar." });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    onSave(localMapping);
    setNotification({ type: 'success', message: "Configurações de mapeamento salvas com sucesso!" });
    setTimeout(() => {
      setNotification(null);
      onClose();
    }, 1200);
  };

  // Filtrar as contas para exibição
  const filteredAccounts = Object.entries(allAccounts).filter(([account, info]) => {
    const matchesSearch = account.toLowerCase().includes(search.toLowerCase()) || 
                          info.category.toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (filterTab === 'unmapped') {
      return info.category === 'NÃO MAPEADO' || unmappedAccounts.includes(account);
    }
    
    if (filterTab === 'excluded') {
      return info.action === 'exclude';
    }
    
    return true;
  });

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
        maxWidth: '900px',
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
              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Mapeador de Contas ERP (De/Para)</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Traduza o plano de contas exportado do seu sistema ERP nas categorias oficiais da DRE
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" style={{ padding: '6px', borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          
          {notification && (
            <div className="error-message" style={{
              background: notification.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
              borderColor: notification.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              color: notification.type === 'success' ? '#34d399' : '#f87171',
              marginBottom: '20px'
            }}>
              {notification.type === 'success' ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
              <span>{notification.message}</span>
            </div>
          )}

          {/* Formulário para Adicionar Conta Manual */}
          <form onSubmit={handleAddAccount} style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            display: 'grid',
            gridTemplateColumns: '1fr 240px 140px auto',
            gap: '12px',
            alignItems: 'end'
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '11px', marginBottom: '6px' }}>Nova Conta ERP (como aparece na planilha)</label>
              <input 
                type="text" 
                placeholder="Ex: 02.03.02.30 : Assinatura Netflix" 
                value={newErpAccount}
                onChange={(e) => setNewErpAccount(e.target.value)}
                style={{ padding: '8px 12px' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '11px', marginBottom: '6px' }}>Categoria DRE</label>
              <select 
                value={newDreCategory} 
                onChange={(e) => setNewDreCategory(e.target.value)}
                disabled={newAction === 'exclude'}
                style={{ padding: '8px 12px' }}
              >
                {DRE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: '11px', marginBottom: '6px' }}>Ação</label>
              <select 
                value={newAction} 
                onChange={(e) => setNewAction(e.target.value as any)}
                style={{ padding: '8px 12px' }}
              >
                <option value="include">Incluir</option>
                <option value="exclude">Excluir</option>
              </select>
            </div>
            <button type="submit" className="btn-primary" style={{ padding: '8px 16px', height: '36px', width: 'auto' }}>
              <Plus size={14} />
              <span>Adicionar</span>
            </button>
          </form>

          {/* Barra de Filtro e Busca */}
          <div className="search-bar-wrapper" style={{ marginBottom: '20px' }}>
            <div className="search-input-wrapper" style={{ flex: 1 }}>
              <Search className="search-input-icon" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por conta ERP ou categoria DRE..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: '8px 12px 8px 36px', fontSize: '13px' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <button 
                type="button"
                className={`btn-secondary ${filterTab === 'all' ? 'active' : ''}`}
                onClick={() => setFilterTab('all')}
                style={{ 
                  padding: '5px 12px', 
                  fontSize: '12px',
                  border: 'none', 
                  borderRadius: '6px',
                  background: filterTab === 'all' ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' : 'none',
                  color: filterTab === 'all' ? '#ffffff' : 'var(--text-muted)',
                  fontWeight: 600,
                  boxShadow: filterTab === 'all' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none'
                }}
              >
                Todos ({Object.keys(allAccounts).length})
              </button>
              <button 
                type="button"
                className={`btn-secondary ${filterTab === 'unmapped' ? 'active' : ''}`}
                onClick={() => setFilterTab('unmapped')}
                style={{ 
                  padding: '5px 12px', 
                  fontSize: '12px',
                  border: 'none', 
                  borderRadius: '6px',
                  background: filterTab === 'unmapped' ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' : 'none',
                  color: filterTab === 'unmapped' ? '#ffffff' : 'var(--text-muted)',
                  fontWeight: 600,
                  boxShadow: filterTab === 'unmapped' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none'
                }}
              >
                Pendentes ({Object.keys(allAccounts).filter(acc => allAccounts[acc].category === "NÃO MAPEADO" || unmappedAccounts.includes(acc)).length})
              </button>
              <button 
                type="button"
                className={`btn-secondary ${filterTab === 'excluded' ? 'active' : ''}`}
                onClick={() => setFilterTab('excluded')}
                style={{ 
                  padding: '5px 12px', 
                  fontSize: '12px',
                  border: 'none', 
                  borderRadius: '6px',
                  background: filterTab === 'excluded' ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' : 'none',
                  color: filterTab === 'excluded' ? '#ffffff' : 'var(--text-muted)',
                  fontWeight: 600,
                  boxShadow: filterTab === 'excluded' ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none'
                }}
              >
                Excluídos ({Object.values(allAccounts).filter(info => info.action === 'exclude').length})
              </button>
            </div>
          </div>

          {/* Lista de Mapeamentos */}
          <div className="mapping-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '45vh' }}>
            {filteredAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Nenhum mapeamento encontrado para o filtro ativo.
              </div>
            ) : (
              filteredAccounts.map(([account, info]) => {
                const isUnmapped = info.category === "NÃO MAPEADO";
                return (
                  <div 
                    key={account} 
                    className="mapping-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 300px 110px',
                      gap: '16px',
                      padding: '12px 16px',
                      background: isUnmapped ? 'rgba(245, 158, 11, 0.03)' : 'rgba(255, 255, 255, 0.01)',
                      border: '1px solid',
                      borderColor: isUnmapped ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-color)',
                      borderRadius: '10px',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={account}>
                        {account}
                      </span>
                      {isUnmapped && (
                        <span style={{ fontSize: '10px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <ShieldAlert size={12} />
                          <span>Esta conta foi encontrada na planilha mas não possui categoria!</span>
                        </span>
                      )}
                    </div>
                    
                    <select 
                      value={info.action === 'exclude' ? "EXCLUÍDO DA DRE" : info.category}
                      onChange={(e) => handleCategoryChange(account, e.target.value)}
                      disabled={info.action === 'exclude'}
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        color: isUnmapped ? '#fbbf24' : 'var(--text-main)',
                        borderColor: isUnmapped ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-color)'
                      }}
                    >
                      {isUnmapped && <option value="NÃO MAPEADO">⚠️ SELECIONE A CATEGORIA DRE</option>}
                      {info.action === 'exclude' && <option value="EXCLUÍDO DA DRE">🚫 EXCLUÍDO DA DRE</option>}
                      {DRE_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button 
                        type="button"
                        className={`badge-pill ${info.action === 'include' ? 'include' : 'exclude'}`}
                        onClick={() => handleActionChange(account, info.action === 'include' ? 'exclude' : 'include')}
                        style={{ border: 'none', cursor: 'pointer', width: '70px', padding: '3px 8px', fontSize: '11px' }}
                        title={info.action === 'include' ? "Clique para excluir da DRE" : "Clique para incluir na DRE"}
                      >
                        {info.action === 'include' ? 'Incluir' : 'Excluir'}
                      </button>
                      
                      <button 
                        type="button"
                        className="btn-icon" 
                        onClick={() => handleDelete(account)}
                        title="Excluir mapeamento"
                        style={{ padding: '4px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

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
            type="button"
            className="btn-secondary" 
            onClick={handleResetToDefault} 
            style={{ width: 'auto', padding: '10px 20px', borderColor: 'rgba(59, 130, 246, 0.2)', color: 'var(--primary-hover)' }}
          >
            Redefinir Padrão
          </button>
          <div style={{ flex: 1 }} />
          <button 
            type="button"
            className="btn-secondary" 
            onClick={onClose} 
            style={{ width: 'auto', padding: '10px 20px' }}
          >
            Cancelar
          </button>
          <button 
            type="button"
            className="btn-primary" 
            onClick={handleSave} 
            style={{ width: 'auto', padding: '10px 24px' }}
          >
            Salvar Alterações
          </button>
        </div>

      </div>
    </div>
  );
}
