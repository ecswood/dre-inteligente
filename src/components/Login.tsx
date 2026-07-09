import React, { useState } from 'react';
import { LogIn, Key, Mail, ShieldAlert } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (email: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Por favor, preencha todos os campos.");
      return;
    }

    // Login tradicional
    // Credenciais padrão do sistema
    if (email === 'admin' && password === '123') {
      onLoginSuccess(email);
      return;
    }
    
    // Credenciais cadastradas localmente pelo painel de controle
    const usersRaw = localStorage.getItem('app_users');
    const users = usersRaw ? JSON.parse(usersRaw) : {};
    
    if (users[email] && users[email] === password) {
      onLoginSuccess(email);
      return;
    }
    
    setError("Credenciais inválidas. Verifique seu usuário e senha.");
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        {/* Logo local ou logo padrão em SVG */}
        <img className="login-logo" src="/logo.png" alt="ISP Logo" onError={(e) => {
          // Fallback se logo.png falhar
          (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/%3E%3C/svg%3E";
        }} />
        
        <h2>Portal Financeiro</h2>
        <p>Entre para classificar lançamentos e ver a DRE</p>

        {error && (
          <div className="error-message">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Usuário / E-mail</label>
            <div className="input-wrapper">
              <Mail className="input-icon" size={18} />
              <input 
                type="text" 
                placeholder="admin ou seu e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Senha</label>
            <div className="input-wrapper">
              <Key className="input-icon" size={18} />
              <input 
                type="password" 
                placeholder="******"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary">
            <LogIn size={18} />
            <span>Entrar</span>
          </button>
        </form>

        <div style={{ marginTop: '24px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
          <span>Padrão: <b>admin</b> / <b>123</b></span>
        </div>
      </div>
    </div>
  );
}
