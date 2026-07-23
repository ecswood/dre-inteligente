# Backend de Verdade para o DRE Inteligente — Design

## Contexto e motivação

O DRE Inteligente hoje é 100% client-side: usuários/senha, mapeamento De/Para
de contas e histórico de DREs importados por mês ficam todos salvos no
`localStorage` do navegador de quem está usando. Isso já causou um incidente
real: o fallback fixo `admin`/`123` foi removido do código numa sessão
anterior e, como não existe nenhum servidor com esses dados, ninguém
conseguia mais entrar em um navegador/aparelho novo — não havia como
consultar, resetar ou recuperar credencial nenhuma remotamente.

Este documento especifica um backend real (API + banco de dados) para
substituir o `localStorage` como fonte de verdade, resolvendo esse problema
de raiz e permitindo acesso de qualquer aparelho com dados compartilhados
entre a equipe.

## Objetivo

Migrar as três coisas que hoje vivem em `localStorage` — usuários, mapeamento
De/Para, histórico de DREs por mês — para um banco de dados real por trás de
uma API, com login por usuário/senha com hash e token JWT. O parsing de
planilhas Excel (SheetJS) continua 100% client-side, sem mudança nenhuma —
só a camada de persistência muda.

## Fora de escopo

- Migrar os dados que já existem hoje no `localStorage` de qualquer
  navegador — o banco novo começa vazio (decisão do Edison). O mapeamento De/Para
  volta para o padrão de fábrica já embutido no código (`DEFAULT_MAPPING` em
  `src/utils/dreParser.ts`), que continua existindo como valor inicial.
- Papéis/permissões (admin vs usuário comum) — qualquer usuário autenticado
  continua podendo cadastrar/remover outros usuários, igual a hoje.
- O gerador standalone `dre_generator.py` (Python, roda fora do portal web) —
  não é afetado por esta mudança.
- Multi-tenant — continua sendo uma única empresa (SNI Telecom), sem conceito
  de múltiplas organizações como no SNILog.

## Arquitetura

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Frontend (pm2)      │  HTTPS │  sni_nginx (container)    │
│  vite preview :5173  │◄──────►│  dre.snitelecom.com.br    │
│  (sem mudança de      │        │   /       → :5173 (host)  │
│   processo/deploy)    │        │   /api/   → dre_backend   │
└─────────────────────┘        └──────────┬───────────────┘
                                            │ snilog_sni_network
                                 ┌──────────▼───────────────┐
                                 │  dre_backend (container)  │
                                 │  Express + TypeScript      │
                                 │  :4000                     │
                                 │  better-sqlite3 → /data     │
                                 └────────────────────────────┘
```

- O frontend continua exatamente como está hoje: processo `pm2` rodando
  `vite preview`, sem Docker. Nenhuma mudança de deploy do frontend.
- Backend novo é um container Docker (`dre_backend`), entra na rede externa
  `snilog_sni_network` (mesma rede de StoneChat/SNILog/NetManager/Cofre), pra
  o `sni_nginx` conseguir alcançá-lo pelo nome do serviço.
- Banco SQLite persistido em volume Docker nomeado (`dre_backend_data`),
  igual ao padrão do NetManager/Cofre (volume só nos dados, não no código).
- Nginx compartilhado (`/home/edison/fontes/SNILog/nginx/default.conf`) ganha
  um novo `location /api/` dentro do server block existente de
  `dre.snitelecom.com.br`, proxiando para `http://dre_backend:4000/api/`.

## Estrutura de pastas

```
dre-inteligente/
  backend/                       — NOVO
    src/
      server.ts                  — bootstrap do Express, monta rotas
      db.ts                      — conexão better-sqlite3 + criação de tabelas
      auth/
        hash.ts                  — wrappers de bcrypt (hash/compare)
        jwt.ts                   — assinar/verificar token
        middleware.ts            — requireAuth (valida Authorization: Bearer)
      routes/
        authRoutes.ts            — /api/auth/register, /api/auth/login, /api/auth/bootstrap-status
        userRoutes.ts            — /api/users (GET/POST/DELETE)
        mappingRoutes.ts         — /api/mapping (GET/PUT)
        dreRoutes.ts             — /api/dre (GET), /api/dre/:monthId (PUT/DELETE)
    Dockerfile
    package.json
    tsconfig.json
    .env.example                 — JWT_SECRET, PORT (sem valores reais)
  docker-compose.yml              — NOVO, só o serviço dre_backend
  src/                             — frontend existente, só os arquivos abaixo mudam:
    components/Login.tsx          — troca localStorage por chamadas de API; remove fallback admin/123
    components/UserSettings.tsx   — troca localStorage por chamadas de API
    App.tsx                       — troca localStorage (mapping/dre_database) por chamadas de API
    services/api.ts               — NOVO: cliente HTTP fino (fetch + Authorization header)
```

## Modelo de dados (SQLite)

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE mapping_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,              -- JSON: Record<string, {category, action}>
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dre_history (
  month_id TEXT PRIMARY KEY,       -- ex: "2026-06"
  month_label TEXT NOT NULL,
  data TEXT NOT NULL,               -- JSON: DREData completo (lines/transactions/unmapped/totals)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`mapping_config` é uma tabela de linha única (singleton, `id` sempre 1) — o
mapeamento é uma configuração compartilhada por toda a equipe, não por
usuário. `dre_history` guarda o `DREData` inteiro como um blob JSON por mês,
espelhando exatamente a forma que já existe hoje em `isp_dre_database` no
`localStorage` — evita reescrever a lógica de cálculo/parsing, que continua
100% no frontend.

## API

Todas as rotas abaixo (exceto `register`, `login` e `bootstrap-status`)
exigem header `Authorization: Bearer <token>`. Resposta de erro padrão:
`{ "error": "mensagem" }` com o status HTTP apropriado (400/401/404/409).

### Autenticação

| Método | Rota | Body | Retorno | Regra |
|---|---|---|---|---|
| GET | `/api/auth/bootstrap-status` | — | `{ hasUsers: boolean }` | Pública |
| POST | `/api/auth/register` | `{ username, password }` | `{ token, username }` | Só funciona se `users` estiver vazia (409 se já houver algum usuário) |
| POST | `/api/auth/login` | `{ username, password }` | `{ token, username }` | 401 se usuário não existe ou senha não confere |

Token JWT: payload `{ username }`, expira em 7 dias, assinado com
`JWT_SECRET` (variável de ambiente, gerada na hora do deploy, nunca
commitada).

### Usuários

| Método | Rota | Body | Retorno |
|---|---|---|---|
| GET | `/api/users` | — | `[{ username, created_at }]` |
| POST | `/api/users` | `{ username, password }` | `{ username, created_at }` (409 se já existir) |
| DELETE | `/api/users/:username` | — | 204 (400 se `:username` for o mesmo do token — não pode se autoexcluir, igual à regra atual do front) |

### Mapeamento De/Para

| Método | Rota | Body | Retorno |
|---|---|---|---|
| GET | `/api/mapping` | — | `Record<string, {category, action}>` (se não houver linha em `mapping_config`, retorna `DEFAULT_MAPPING` do backend, que espelha o mesmo objeto do frontend) |
| PUT | `/api/mapping` | `Record<string, {category, action}>` | mesmo objeto salvo |

### Histórico de DRE

| Método | Rota | Body | Retorno |
|---|---|---|---|
| GET | `/api/dre` | — | `Record<string, DREData>` (todos os meses) |
| PUT | `/api/dre/:monthId` | `DREData` | `DREData` salvo (upsert) |
| DELETE | `/api/dre/:monthId` | — | 204 |

## Fluxo de login / bootstrap (primeiro acesso)

1. Ao carregar, o frontend chama `GET /api/auth/bootstrap-status`.
2. Se `hasUsers: false` → mostra formulário de "Criar primeiro acesso"
   (username + senha + confirmar senha) em vez da tela de login normal.
   Envia para `POST /api/auth/register`, que só aceita porque a tabela
   `users` está vazia.
3. Se `hasUsers: true` → mostra a tela de login normal, chamando
   `POST /api/auth/login`.
4. Em ambos os casos, sucesso retorna `{ token, username }`. O frontend
   guarda o token em `localStorage` na chave `app_jwt` (substitui
   `app_user_session`, que guardava só o e-mail em texto puro) e usa esse
   token em todas as chamadas subsequentes via header `Authorization: Bearer`.
5. Logout: remove `app_jwt` do `localStorage`, sem chamada ao backend
   (JWT sem estado — expira sozinho em 7 dias).
6. O fallback fixo `admin`/`123` é removido de `Login.tsx` nesta migração —
   deixa de existir qualquer credencial hardcoded no código.

## Segurança

- Senhas: `bcrypt` (custo 10, padrão da lib), nunca texto puro em lugar
  nenhum — nem no banco, nem em log.
- `JWT_SECRET`: gerado como string aleatória no deploy (`openssl rand -hex 32`
  ou equivalente), guardado em `backend/.env` (gitignored), nunca hardcoded
  nem commitado.
- CORS: como o frontend e o backend ficam atrás do mesmo domínio
  (`dre.snitelecom.com.br`, diferenciado só pelo path `/api/`), não é
  necessário CORS cross-origin — nginx já entrega os dois sob a mesma
  origem.
- Rate limiting / lockout de tentativas de login: fora de escopo por ora
  (ferramenta interna, poucos usuários) — pode ser adicionado depois se
  virar necessidade.

## Testes

Backend (Vitest — mesma stack de teste já usada no restante do repo, ver
`"test": "vitest run"` em `package.json`):
- Bootstrap: registro só funciona com tabela vazia; segunda tentativa de
  registro retorna 409.
- Login: credenciais corretas retornam token; erradas retornam 401.
- Middleware de auth: rota protegida sem token retorna 401; com token
  inválido/expirado retorna 401; com token válido passa.
- CRUD de usuários: criar, listar, excluir; excluir a si mesmo retorna 400.
- CRUD de mapeamento: GET sem dado salvo retorna o padrão; PUT persiste e
  GET subsequente reflete a mudança.
- CRUD de histórico de DRE: PUT cria/atualiza um mês; GET retorna todos;
  DELETE remove um mês específico.

Frontend: os testes existentes (`*.test.ts` em `src/utils/`) não são afetados
(parsing continua client-side). `Login.tsx`/`UserSettings.tsx`/`App.tsx`
passam a depender de `fetch` — a implementação deve mockar `services/api.ts`
nos componentes que hoje não têm teste automatizado, sem necessidade de subir
testes novos de UI que não existiam antes desta migração.

## Deploy

1. `docker-compose.yml` novo em `dre-inteligente/` (repo raiz), com o serviço
   `dre_backend`:
   ```yaml
   services:
     dre_backend:
       build: ./backend
       container_name: dre_backend
       restart: unless-stopped
       environment:
         - JWT_SECRET=${JWT_SECRET}
         - PORT=4000
       volumes:
         - dre_backend_data:/data
       networks:
         - snilog_sni_network
   networks:
     snilog_sni_network:
       external: true
   volumes:
     dre_backend_data:
   ```
2. `.env` (gitignored) no mesmo diretório com `JWT_SECRET` gerado.
3. `docker compose build && docker compose up -d`.
4. Adicionar ao server block de `dre.snitelecom.com.br` em
   `/home/edison/fontes/SNILog/nginx/default.conf`:
   ```nginx
   location /api/ {
       proxy_pass http://dre_backend:4000/api/;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```
   **Aviso obrigatório ao Edison antes de editar este arquivo** (config
   compartilhada com outros serviços) e `docker restart sni_nginx` depois
   (bind-mount de arquivo único — reload não basta).
5. Frontend: rebuild (`npm run build` + `pm2 restart dre-portal`) depois que
   `src/services/api.ts`, `Login.tsx`, `UserSettings.tsx` e `App.tsx` forem
   atualizados para chamar a API em vez do `localStorage`.
6. Primeiro acesso: Edison abre o site, cai na tela de "criar primeiro
   acesso" (banco vazio), cadastra seu usuário real.

## Riscos e decisões já tomadas

- **Sem migração de dados existentes** — decisão explícita do Edison. Banco
  começa vazio; mapeamento volta ao padrão de fábrica.
- **Sem papéis/permissões** — decisão explícita; mantém o modelo flat atual.
- **SQLite (não Postgres)** — proporcional ao tamanho do app (poucos
  usuários, um único "tenant"); evita subir mais um container de banco
  compartilhado.
- **JWT em localStorage** (não cookie httpOnly) — mesma prática já usada
  nos outros projetos deste ambiente; aceito para uma ferramenta interna,
  não é um requisito deste documento reforçar contra XSS além do que os
  outros projetos já fazem.
