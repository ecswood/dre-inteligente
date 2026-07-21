import { useState, useEffect } from 'react';
import { BarChart3, Settings, LogOut, ClipboardList, CreditCard } from 'lucide-react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import MappingEditor from './components/MappingEditor';
import TransactionsList from './components/TransactionsList';
import UserSettings from './components/UserSettings';
import CardStatementImport from './components/CardStatementImport';
import { DEFAULT_MAPPING, type DREData } from './utils/dreParser';

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'cardImport' | 'settings'>('dashboard');
  
  // Mapeamento carregado do LocalStorage ou padrão do DRE parser
  const [mapping, setMapping] = useState<Record<string, { category: string; action: 'include' | 'exclude' }>>({});
  const [unmappedAccounts, setUnmappedAccounts] = useState<string[]>([]);
  const [dreData, setDreData] = useState<DREData | null>(null);
  const [dreDatabase, setDreDatabase] = useState<Record<string, DREData>>({});
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);

  // Carregar sessão e mapeamentos iniciais
  useEffect(() => {
    const session = localStorage.getItem('app_user_session');
    if (session) {
      setUserEmail(session);
    }

    const savedMapping = localStorage.getItem('isp_dre_mapping');
    if (savedMapping) {
      try {
        setMapping(JSON.parse(savedMapping));
      } catch (e) {
        console.error("Erro ao ler mapeamento do localStorage, usando padrão.", e);
        setMapping({ ...DEFAULT_MAPPING });
      }
    } else {
      setMapping({ ...DEFAULT_MAPPING });
      localStorage.setItem('isp_dre_mapping', JSON.stringify(DEFAULT_MAPPING));
    }

    // Carregar banco de dados de DREs anteriores
    const savedDb = localStorage.getItem('isp_dre_database');
    if (savedDb) {
      try {
        const parsedDb = JSON.parse(savedDb);
        setDreDatabase(parsedDb);
        // Selecionar o mês mais recente por padrão
        const keys = Object.keys(parsedDb).sort();
        if (keys.length > 0) {
          setDreData(parsedDb[keys[keys.length - 1]]);
        }
      } catch (e) {
        console.error("Erro ao carregar banco de dados local", e);
      }
    }
  }, []);

  const handleLoginSuccess = (email: string) => {
    setUserEmail(email);
    localStorage.setItem('app_user_session', email);
  };

  const handleLogout = () => {
    if (window.confirm("Deseja realmente sair do sistema?")) {
      setUserEmail(null);
      localStorage.removeItem('app_user_session');
      setDreData(null);
      setActiveTab('dashboard');
    }
  };

  const handleSaveMapping = (newMapping: Record<string, { category: string; action: 'include' | 'exclude' }>) => {
    setMapping(newMapping);
    localStorage.setItem('isp_dre_mapping', JSON.stringify(newMapping));
    
    // Limpar o vetor de contas pendentes, pois agora foram salvas
    setUnmappedAccounts([]);
    
    // Forçar recálculo se houver dados da planilha carregados
    if (dreData) {
      // Como não temos o file de volta, o usuário pode re-carregar ou podemos avisar
      // Porém, para maior comodidade, se o usuário já tiver carregado e editado os mapeamentos,
      // sugerimos recarregar a planilha no dashboard.
      setDreData(null);
      setActiveTab('dashboard');
      alert("Mapeamento atualizado! Por favor, recarregue o arquivo Excel para ver os resultados calculados com as novas regras.");
    }
  };

  const handleSaveDREMonth = (data: DREData) => {
    const updatedDb = { ...dreDatabase, [data.monthId]: data };
    setDreDatabase(updatedDb);
    localStorage.setItem('isp_dre_database', JSON.stringify(updatedDb));
    setDreData(data);
  };

  const handleFoundUnmapped = (unmapped: string[]) => {
    setUnmappedAccounts(unmapped);
  };

  // Se não estiver logado, renderizar login
  if (!userEmail) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Navigation Topbar */}
      <header className="dashboard-header">
        <div className="header-brand">
          <div className="user-avatar" style={{ background: '#2563eb', width: '32px', height: '32px', fontSize: '13px' }}>
            ISP
          </div>
          <div>
            <h1>DRE Inteligente</h1>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '-2px' }}>
              Telecom / Provedores
            </span>
          </div>
        </div>

        <nav className="header-nav">
          <button 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart3 size={16} />
            <span>Dashboard</span>
          </button>
          
          <button
            className={`nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            <ClipboardList size={16} />
            <span>Extrato Detalhado</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'cardImport' ? 'active' : ''}`}
            onClick={() => setActiveTab('cardImport')}
          >
            <CreditCard size={16} />
            <span>Importar Fatura de Cartão</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            style={{ position: 'relative' }}
          >
            <Settings size={16} />
            <span>Configurações</span>
            {unmappedAccounts.length > 0 && (
              <span style={{
                position: 'absolute',
                top: '2px',
                right: '4px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#f59e0b'
              }} />
            )}
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="user-badge">
            <div className="user-avatar">
              {userEmail.substring(0, 2).toUpperCase()}
            </div>
            <span className="user-name">{userEmail}</span>
          </div>
          <button className="btn-logout" onClick={handleLogout} title="Sair do Sistema">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Panel Content */}
      <main className="dashboard-main">
        {activeTab === 'dashboard' && (
          <Dashboard 
            mapping={mapping} 
            onFoundUnmapped={handleFoundUnmapped}
            onViewMappingTab={() => setIsMappingModalOpen(true)}
            dreData={dreData}
            setDreData={setDreData}
            dreDatabase={dreDatabase}
            onSaveDREMonth={handleSaveDREMonth}
            onDeleteDREMonth={(monthId) => {
              if (window.confirm("Tem certeza que deseja excluir o histórico deste mês?")) {
                const updatedDb = { ...dreDatabase };
                delete updatedDb[monthId];
                setDreDatabase(updatedDb);
                localStorage.setItem('isp_dre_database', JSON.stringify(updatedDb));
                if (dreData?.monthId === monthId) {
                  const keys = Object.keys(updatedDb).sort();
                  if (keys.length > 0) {
                    setDreData(updatedDb[keys[keys.length - 1]]);
                  } else {
                    setDreData(null);
                  }
                }
              }
            }}
          />
        )}

        {activeTab === 'transactions' && (
          dreData ? (
            <TransactionsList transactions={dreData.transactions} />
          ) : (
            <div className="table-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <ClipboardList size={48} style={{ color: 'var(--primary)', marginBottom: '16px', opacity: 0.5 }} />
              <h3>Nenhum dado importado</h3>
              <p style={{ marginTop: '8px' }}>Por favor, faça o upload de uma planilha de caixa na aba <b>Dashboard</b> para visualizar o extrato detalhado.</p>
              <button className="btn-primary" onClick={() => setActiveTab('dashboard')} style={{ width: 'auto', margin: '20px auto 0 auto', padding: '10px 20px' }}>
                Ir para o Dashboard
              </button>
            </div>
          )
        )}

        {activeTab === 'cardImport' && (
          <CardStatementImport
            dreDatabase={dreDatabase}
            mapping={mapping}
            onSaveDREMonth={handleSaveDREMonth}
          />
        )}

        {activeTab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <UserSettings loggedInUser={userEmail} />
            
            {/* Card informativo de Mapeamento De/Para */}
            <div className="table-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Mapeamento de Contas (De/Para)</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Configure a tradução automática das contas do seu ERP para a estrutura de DRE.
                  </p>
                </div>
                <button 
                  className="btn-primary" 
                  onClick={() => setIsMappingModalOpen(true)}
                  style={{ width: 'auto', padding: '10px 20px' }}
                >
                  Gerenciar Mapeamentos
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <MappingEditor 
        mapping={mapping} 
        onSave={handleSaveMapping} 
        unmappedAccounts={unmappedAccounts}
        isOpen={isMappingModalOpen}
        onClose={() => setIsMappingModalOpen(false)}
      />
    </div>
  );
}
