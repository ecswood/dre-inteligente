import { useState, useEffect } from 'react';
import { ShieldCheck, UserPlus, Trash2, Users, CheckCircle, AlertTriangle } from 'lucide-react';

interface UserSettingsProps {
  loggedInUser: string;
}

export default function UserSettings({ loggedInUser }: UserSettingsProps) {
  const [users, setUsers] = useState<Record<string, string>>({});
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Carregar usuários cadastrados do localStorage
  useEffect(() => {
    const rawUsers = localStorage.getItem('app_users');
    if (rawUsers) {
      try {
        setUsers(JSON.parse(rawUsers));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleRegisterUser = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);

    const usernameTrimmed = newUsername.trim();
    if (!usernameTrimmed || !newUserPassword) {
      setError("Por favor, preencha o nome do usuário e a senha.");
      return;
    }

    if (usernameTrimmed === 'admin') {
      setError("O usuário 'admin' já existe como padrão do sistema.");
      return;
    }

    if (users[usernameTrimmed]) {
      setError("Este usuário já está cadastrado.");
      return;
    }

    const updatedUsers = { ...users, [usernameTrimmed]: newUserPassword };
    localStorage.setItem('app_users', JSON.stringify(updatedUsers));
    setUsers(updatedUsers);
    
    setNewUsername('');
    setNewUserPassword('');
    setSuccess(`Usuário '${usernameTrimmed}' cadastrado com sucesso!`);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleDeleteUser = (userToDelete: string) => {
    if (userToDelete === loggedInUser) {
      alert("Você não pode deletar o usuário que está logado no momento.");
      return;
    }

    if (window.confirm(`Deseja realmente remover o acesso do usuário '${userToDelete}'?`)) {
      const updatedUsers = { ...users };
      delete updatedUsers[userToDelete];
      
      localStorage.setItem('app_users', JSON.stringify(updatedUsers));
      setUsers(updatedUsers);
      
      setSuccess(`Usuário '${userToDelete}' removido com sucesso.`);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleClearCache = () => {
    if (window.confirm("Deseja apagar os dados da sessão local e todos os usuários cadastrados? Você será deslogado.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleClearDREDatabase = () => {
    if (window.confirm("Deseja apagar apenas o histórico de planilhas DRE importadas? Seus usuários e mapeamentos serão mantidos.")) {
      localStorage.removeItem('isp_dre_database');
      window.location.reload();
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Painel de Configurações do Sistema */}
      <div className="chart-card">
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          Configurações do Aplicativo
        </h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }}>Privacidade e Segurança</span>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Processamento feito localmente no navegador do usuário
              </span>
            </div>
            <span className="badge-pill include" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={12} />
              <span>Seguro</span>
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }}>Limpar Histórico de Planilhas</span>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Apaga apenas as DREs importadas dos meses anteriores, mantendo os usuários e regras de mapeamento
              </span>
            </div>
            <button className="btn-secondary" style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.2)', background: 'rgba(245, 158, 11, 0.05)' }} onClick={handleClearDREDatabase}>
              Limpar DREs
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }}>Limpar Sessão Local</span>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Apaga as preferências de e-mail e credenciais de login salvas na máquina
              </span>
            </div>
            <button className="btn-secondary" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)' }} onClick={handleClearCache}>
              Limpar Armazenamento
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }}>Versão do Sistema</span>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Informações da compilação ativa
              </span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>v1.0.0 (React + Vite)</span>
          </div>
        </div>
      </div>

      {/* Painel de Cadastro e Gerenciamento de Usuários */}
      <div className="chart-card">
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users size={18} style={{ color: 'var(--primary)' }} />
          <span>Controle de Usuários</span>
        </h3>

        {success && (
          <div className="error-message" style={{ background: 'var(--success-bg)', borderColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', marginBottom: '16px' }}>
            <CheckCircle size={18} />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="error-message" style={{ marginBottom: '16px' }}>
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Formulário para cadastrar novo usuário */}
        <form onSubmit={handleRegisterUser} style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: '12px',
          alignItems: 'end',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-color)',
          padding: '16px',
          borderRadius: '10px',
          marginBottom: '20px'
        }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '10px' }}>Novo Usuário</label>
            <input 
              type="text" 
              placeholder="Ex: financeiro" 
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              style={{ padding: '8px 12px 8px 12px', fontSize: '13px' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: '10px' }}>Senha</label>
            <input 
              type="password" 
              placeholder="******" 
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              style={{ padding: '8px 12px 8px 12px', fontSize: '13px' }}
            />
          </div>
          <button type="submit" className="btn-primary" style={{ padding: '8px 16px', height: '36px' }}>
            <UserPlus size={14} />
            <span>Cadastrar</span>
          </button>
        </form>

        {/* Lista de usuários cadastrados */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usuários com Acesso</label>
          
          {/* Usuário padrão do sistema */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600 }}>admin</span>
              <span className="badge-pill include" style={{ fontSize: '8px', padding: '1px 6px' }}>Padrão</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Acesso Total</span>
          </div>

          {/* Usuários cadastrados no localStorage */}
          {Object.keys(users).length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
              Nenhum outro usuário cadastrado localmente.
            </div>
          ) : (
            Object.keys(users).map(user => (
              <div key={user} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>{user}</span>
                  {user === loggedInUser && <span className="badge-pill include" style={{ fontSize: '8px', padding: '1px 6px', background: 'var(--primary-glow)', color: 'var(--primary-hover)' }}>Você</span>}
                </div>
                {user !== loggedInUser ? (
                  <button 
                    className="btn-icon" 
                    onClick={() => handleDeleteUser(user)}
                    title="Excluir usuário"
                    style={{ padding: '4px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ativo</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
