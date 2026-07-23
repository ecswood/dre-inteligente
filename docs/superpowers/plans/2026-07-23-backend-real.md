# Backend Real do DRE Inteligente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `localStorage` do navegador como fonte de verdade do DRE Inteligente por um backend real (Express + SQLite), com login por usuário/senha com hash e token JWT, cobrindo usuários, mapeamento De/Para e histórico de DREs por mês.

**Architecture:** Novo container Docker `dre_backend` (Express + TypeScript + `better-sqlite3`), na rede `snilog_sni_network`, atrás de um novo `location /api/` no nginx compartilhado (`dre.snitelecom.com.br`). O frontend continua rodando via `pm2` (`vite preview`), sem mudança de processo — só passa a chamar a API em vez de `localStorage` para usuários/mapeamento/histórico. Ver spec completa em `docs/superpowers/specs/2026-07-23-backend-real-design.md`.

**Tech Stack:** Backend: Node 20, TypeScript, Express, `better-sqlite3`, `bcrypt`, `jsonwebtoken`, Vitest + Supertest. Frontend: sem mudança de stack (React 19 + Vite + TS), só novo `src/services/api.ts`.

## Global Constraints

- Todas as rotas de `/api/users`, `/api/mapping`, `/api/dre` exigem header `Authorization: Bearer <token>`; só `/api/auth/bootstrap-status`, `/api/auth/register` e `/api/auth/login` são públicas.
- `POST /api/auth/register` só pode criar usuário se a tabela `users` estiver vazia (bootstrap único, como o Cofre) — retorna 409 caso já exista qualquer usuário.
- Senhas: sempre `bcrypt` (custo 10), nunca texto puro em nenhuma camada (banco, log, resposta de API).
- JWT: payload `{ username }`, expira em 7 dias, assinado com `JWT_SECRET` lido de variável de ambiente — nunca hardcoded.
- Sem migração de dados existentes do `localStorage` — banco novo começa vazio (decisão do Edison). Mapeamento sem dado salvo retorna `{}` da API; o frontend semeia com `DEFAULT_MAPPING` (já existente em `src/utils/dreParser.ts`) e persiste via `PUT /api/mapping`.
- Sem papéis/permissões — qualquer usuário autenticado pode cadastrar/remover outros usuários (igual ao comportamento atual), exceto remover a si mesmo (400).
- Remover completamente o fallback fixo `admin`/`123` de `Login.tsx` como parte deste plano (só fazia sentido como emergência antes de existir backend de verdade).
- Não adicionar testes de componente novos (React) para `Login.tsx`/`UserSettings.tsx`/`App.tsx` — o repo não tem `@testing-library/react` instalado e a spec explicitly marca isso como fora de escopo. Os testes desta migração cobrem o backend (Vitest + Supertest) e o cliente HTTP do frontend (`src/services/api.ts`).
- Testes do backend usam SQLite em memória (`createDb(':memory:')`) — nunca tocam em arquivo de banco real.
- Editar `/home/edison/fontes/SNILog/nginx/default.conf` (nginx compartilhado) exige aviso explícito ao Edison antes e `docker restart sni_nginx` depois (não `nginx -s reload` — bind mount de arquivo único mantém o inode antigo).

---

### Task 1: Scaffold do backend + camada de banco

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.gitignore`
- Create: `backend/src/db.ts`
- Test: `backend/src/db.test.ts`

**Interfaces:**
- Produces: `createDb(dbPath: string): Database.Database` (cria/abre o arquivo e garante as 3 tabelas via `CREATE TABLE IF NOT EXISTS`) e `db` (instância singleton criada a partir de `process.env.DB_PATH`, default `./data/dre.db`) — usados por todas as rotas nas próximas tasks.

- [ ] **Step 1: Criar `backend/package.json`**

```json
{
  "name": "dre-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc -b",
    "start": "node dist/server.js",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/bcrypt": "^5.0.2",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.10.2",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "typescript": "^5.7.2",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Criar `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Criar `backend/.gitignore`**

```
node_modules/
dist/
data/
.env
```

- [ ] **Step 4: Instalar dependências**

Run: `cd backend && npm install`

- [ ] **Step 5: Escrever o teste de `db.ts` (vai falhar, arquivo ainda não existe)**

`backend/src/db.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createDb } from './db';

describe('createDb', () => {
  it('cria as tabelas users, mapping_config e dre_history', () => {
    const db = createDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row: any) => row.name);
    expect(tables).toEqual(['dre_history', 'mapping_config', 'users']);
    db.close();
  });

  it('permite reabrir o mesmo arquivo sem duplicar tabelas', () => {
    const db1 = createDb(':memory:');
    db1.exec('INSERT INTO mapping_config (id, data) VALUES (1, \'{}\')');
    db1.close();

    const db2 = createDb(':memory:');
    const row = db2.prepare('SELECT COUNT(*) as count FROM mapping_config').get() as { count: number };
    expect(row.count).toBe(0);
    db2.close();
  });
});
```

- [ ] **Step 6: Rodar o teste pra confirmar que falha**

Run: `cd backend && npx vitest run src/db.test.ts`
Expected: FAIL com "Cannot find module './db'"

- [ ] **Step 7: Implementar `backend/src/db.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export function createDb(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mapping_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dre_history (
      month_id TEXT PRIMARY KEY,
      month_label TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'dre.db');
export const db = createDb(DB_PATH);
```

- [ ] **Step 8: Rodar o teste de novo pra confirmar que passa**

Run: `cd backend && npx vitest run src/db.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 9: Commit**

```bash
cd /home/edison/dre-inteligente
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/.gitignore backend/src/db.ts backend/src/db.test.ts
git commit -m "Adiciona scaffold do backend (Express+SQLite) e camada de banco"
```

---

### Task 2: Utilitários de autenticação (hash de senha + JWT)

**Files:**
- Create: `backend/src/auth/hash.ts`
- Test: `backend/src/auth/hash.test.ts`
- Create: `backend/src/auth/jwt.ts`
- Test: `backend/src/auth/jwt.test.ts`

**Interfaces:**
- Consumes: nenhuma (utilitários independentes).
- Produces: `hashPassword(password: string): Promise<string>`, `comparePassword(password: string, hash: string): Promise<boolean>`, `signToken(payload: { username: string }): string`, `verifyToken(token: string): { username: string }` — usados pelas rotas de auth na Task 4 e pelo middleware na Task 3.

- [ ] **Step 1: Escrever o teste de `hash.ts`**

`backend/src/auth/hash.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from './hash';

describe('hashPassword / comparePassword', () => {
  it('gera um hash diferente da senha original e confirma a senha correta', async () => {
    const hash = await hashPassword('minhaSenha123');
    expect(hash).not.toBe('minhaSenha123');
    expect(await comparePassword('minhaSenha123', hash)).toBe(true);
  });

  it('rejeita uma senha incorreta', async () => {
    const hash = await hashPassword('minhaSenha123');
    expect(await comparePassword('senhaErrada', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run src/auth/hash.test.ts`
Expected: FAIL com "Cannot find module './hash'"

- [ ] **Step 3: Implementar `backend/src/auth/hash.ts`**

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run src/auth/hash.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Escrever o teste de `jwt.ts`**

`backend/src/auth/jwt.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { signToken, verifyToken } from './jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-only-for-vitest';
});

describe('signToken / verifyToken', () => {
  it('assina e verifica um payload corretamente', () => {
    const token = signToken({ username: 'edison' });
    const payload = verifyToken(token);
    expect(payload.username).toBe('edison');
  });

  it('rejeita um token adulterado', () => {
    const token = signToken({ username: 'edison' });
    expect(() => verifyToken(token + 'x')).toThrow();
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run src/auth/jwt.test.ts`
Expected: FAIL com "Cannot find module './jwt'"

- [ ] **Step 7: Implementar `backend/src/auth/jwt.ts`**

```typescript
import jwt from 'jsonwebtoken';

const EXPIRES_IN = '7d';

export interface TokenPayload {
  username: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET não configurado (variável de ambiente ausente)');
  }
  return secret;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getSecret()) as TokenPayload;
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run src/auth/jwt.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 9: Commit**

```bash
cd /home/edison/dre-inteligente
git add backend/src/auth/hash.ts backend/src/auth/hash.test.ts backend/src/auth/jwt.ts backend/src/auth/jwt.test.ts
git commit -m "Adiciona utilitários de hash de senha e JWT do backend"
```

---

### Task 3: Middleware de autenticação

**Files:**
- Create: `backend/src/auth/middleware.ts`
- Test: `backend/src/auth/middleware.test.ts`

**Interfaces:**
- Consumes: `verifyToken` da Task 2 (`./jwt`).
- Produces: `requireAuth(req, res, next)` (Express middleware) e o tipo `AuthedRequest` (extends `Request` com `username?: string`) — usados por `userRoutes`, `mappingRoutes` e `dreRoutes` nas próximas tasks.

- [ ] **Step 1: Escrever o teste do middleware**

`backend/src/auth/middleware.test.ts`:
```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Response } from 'express';
import { requireAuth, type AuthedRequest } from './middleware';
import { signToken } from './jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-only-for-vitest';
});

function mockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireAuth', () => {
  it('rejeita quando o header Authorization está ausente', () => {
    const req = { headers: {} } as AuthedRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita um token inválido', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-token' } } as AuthedRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('aceita um token válido e preenche req.username', () => {
    const token = signToken({ username: 'edison' });
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthedRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.username).toBe('edison');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run src/auth/middleware.test.ts`
Expected: FAIL com "Cannot find module './middleware'"

- [ ] **Step 3: Implementar `backend/src/auth/middleware.ts`**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt';

export interface AuthedRequest extends Request {
  username?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente' });
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run src/auth/middleware.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
cd /home/edison/dre-inteligente
git add backend/src/auth/middleware.ts backend/src/auth/middleware.test.ts
git commit -m "Adiciona middleware de autenticação JWT do backend"
```

---

### Task 4: Rotas de autenticação + servidor Express

**Files:**
- Create: `backend/src/routes/authRoutes.ts`
- Test: `backend/src/routes/authRoutes.test.ts`
- Create: `backend/src/server.ts`

**Interfaces:**
- Consumes: `createDb` (Task 1), `hashPassword`/`comparePassword` (Task 2), `signToken` (Task 2).
- Produces: `createAuthRoutes(db): Router` montado em `/api/auth` — usado por `server.ts` (este task) e pelos testes das próximas tasks para gerar tokens de teste.

- [ ] **Step 1: Escrever o teste das rotas de auth**

`backend/src/routes/authRoutes.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDb } from '../db';
import { createAuthRoutes } from './authRoutes';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-only-for-vitest';
});

function buildApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(db));
  return app;
}

describe('GET /api/auth/bootstrap-status', () => {
  it('reporta hasUsers false quando vazio e true depois de cadastrar', async () => {
    const app = buildApp();
    const before = await request(app).get('/api/auth/bootstrap-status');
    expect(before.body.hasUsers).toBe(false);

    await request(app).post('/api/auth/register').send({ username: 'edison', password: 'segredo123' });

    const after = await request(app).get('/api/auth/bootstrap-status');
    expect(after.body.hasUsers).toBe(true);
  });
});

describe('POST /api/auth/register', () => {
  it('cadastra o primeiro usuário quando a tabela está vazia', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/register').send({ username: 'edison', password: 'segredo123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.username).toBe('edison');
  });

  it('rejeita um segundo cadastro depois que já existe um usuário', async () => {
    const app = buildApp();
    await request(app).post('/api/auth/register').send({ username: 'edison', password: 'segredo123' });
    const res = await request(app).post('/api/auth/register').send({ username: 'clau', password: 'outrasenha' });
    expect(res.status).toBe(409);
  });

  it('rejeita cadastro sem username ou senha', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/register').send({ username: 'edison' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('entra com credenciais corretas', async () => {
    const app = buildApp();
    await request(app).post('/api/auth/register').send({ username: 'edison', password: 'segredo123' });
    const res = await request(app).post('/api/auth/login').send({ username: 'edison', password: 'segredo123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejeita senha incorreta', async () => {
    const app = buildApp();
    await request(app).post('/api/auth/register').send({ username: 'edison', password: 'segredo123' });
    const res = await request(app).post('/api/auth/login').send({ username: 'edison', password: 'senhaErrada' });
    expect(res.status).toBe(401);
  });

  it('rejeita usuário que não existe', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/auth/login').send({ username: 'ninguem', password: 'x' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run src/routes/authRoutes.test.ts`
Expected: FAIL com "Cannot find module './authRoutes'"

- [ ] **Step 3: Implementar `backend/src/routes/authRoutes.ts`**

```typescript
import { Router, type Request, type Response } from 'express';
import type { Database } from 'better-sqlite3';
import { hashPassword, comparePassword } from '../auth/hash';
import { signToken } from '../auth/jwt';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export function createAuthRoutes(db: Database): Router {
  const router = Router();

  router.get('/bootstrap-status', (_req: Request, res: Response) => {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    res.json({ hasUsers: row.count > 0 });
  });

  router.post('/register', async (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      return;
    }

    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    if (row.count > 0) {
      res.status(409).json({ error: 'Já existe usuário cadastrado. Peça a um usuário existente para te cadastrar.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);

    const token = signToken({ username });
    res.status(201).json({ token, username });
  });

  router.post('/login', async (req: Request, res: Response) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
    if (!user || !(await comparePassword(password, user.password_hash))) {
      res.status(401).json({ error: 'Usuário ou senha inválidos' });
      return;
    }

    const token = signToken({ username });
    res.json({ token, username });
  });

  return router;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run src/routes/authRoutes.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Implementar `backend/src/server.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import { db } from './db';
import { createAuthRoutes } from './routes/authRoutes';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', createAuthRoutes(db));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`dre-backend ouvindo na porta ${PORT}`);
});

export { app };
```

- [ ] **Step 6: Confirmar que o build TypeScript passa**

Run: `cd backend && npm run build`
Expected: sem erros, gera `backend/dist/`

- [ ] **Step 7: Commit**

```bash
cd /home/edison/dre-inteligente
git add backend/src/routes/authRoutes.ts backend/src/routes/authRoutes.test.ts backend/src/server.ts
git commit -m "Adiciona rotas de autenticação (bootstrap/register/login) e servidor Express"
```

---

### Task 5: Rotas de usuários

**Files:**
- Create: `backend/src/routes/userRoutes.ts`
- Test: `backend/src/routes/userRoutes.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `requireAuth`/`AuthedRequest` (Task 3), `hashPassword` (Task 2), `createAuthRoutes` (Task 4, só nos testes para gerar token).
- Produces: `createUserRoutes(db): Router` montado em `/api/users`.

- [ ] **Step 1: Escrever o teste das rotas de usuários**

`backend/src/routes/userRoutes.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDb } from '../db';
import { createAuthRoutes } from './authRoutes';
import { createUserRoutes } from './userRoutes';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-only-for-vitest';
});

async function buildAuthedApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(db));
  app.use('/api/users', createUserRoutes(db));

  const registerRes = await request(app).post('/api/auth/register').send({ username: 'edison', password: 'segredo123' });
  const token = registerRes.body.token as string;
  return { app, token };
}

describe('GET /api/users', () => {
  it('rejeita sem token', async () => {
    const { app } = await buildAuthedApp();
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('lista os usuários cadastrados com um token válido', async () => {
    const { app, token } = await buildAuthedApp();
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].username).toBe('edison');
  });
});

describe('POST /api/users', () => {
  it('cadastra um novo usuário', async () => {
    const { app, token } = await buildAuthedApp();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'clau', password: 'outrasenha' });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe('clau');
  });

  it('rejeita um username duplicado', async () => {
    const { app, token } = await buildAuthedApp();
    await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send({ username: 'clau', password: 'x' });
    const res = await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send({ username: 'clau', password: 'y' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/users/:username', () => {
  it('remove outro usuário', async () => {
    const { app, token } = await buildAuthedApp();
    await request(app).post('/api/users').set('Authorization', `Bearer ${token}`).send({ username: 'clau', password: 'x' });
    const res = await request(app).delete('/api/users/clau').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('rejeita remover o próprio usuário logado', async () => {
    const { app, token } = await buildAuthedApp();
    const res = await request(app).delete('/api/users/edison').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run src/routes/userRoutes.test.ts`
Expected: FAIL com "Cannot find module './userRoutes'"

- [ ] **Step 3: Implementar `backend/src/routes/userRoutes.ts`**

```typescript
import { Router, type Response } from 'express';
import type { Database } from 'better-sqlite3';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import { hashPassword } from '../auth/hash';

interface UserRow {
  username: string;
  created_at: string;
}

export function createUserRoutes(db: Database): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (_req: AuthedRequest, res: Response) => {
    const users = db.prepare('SELECT username, created_at FROM users ORDER BY created_at').all() as UserRow[];
    res.json(users);
  });

  router.post('/', async (req: AuthedRequest, res: Response) => {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
      return;
    }

    const existing = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    if (existing) {
      res.status(409).json({ error: 'Este usuário já está cadastrado.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    const created = db.prepare('SELECT username, created_at FROM users WHERE username = ?').get(username) as UserRow;
    res.status(201).json(created);
  });

  router.delete('/:username', (req: AuthedRequest, res: Response) => {
    const { username } = req.params;
    if (username === req.username) {
      res.status(400).json({ error: 'Você não pode remover o usuário que está logado no momento.' });
      return;
    }

    db.prepare('DELETE FROM users WHERE username = ?').run(username);
    res.status(204).send();
  });

  return router;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run src/routes/userRoutes.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Montar as rotas em `backend/src/server.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import { db } from './db';
import { createAuthRoutes } from './routes/authRoutes';
import { createUserRoutes } from './routes/userRoutes';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', createAuthRoutes(db));
app.use('/api/users', createUserRoutes(db));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`dre-backend ouvindo na porta ${PORT}`);
});

export { app };
```

- [ ] **Step 6: Confirmar que o build passa**

Run: `cd backend && npm run build`
Expected: sem erros

- [ ] **Step 7: Commit**

```bash
cd /home/edison/dre-inteligente
git add backend/src/routes/userRoutes.ts backend/src/routes/userRoutes.test.ts backend/src/server.ts
git commit -m "Adiciona rotas de gerenciamento de usuários (GET/POST/DELETE /api/users)"
```

---

### Task 6: Rotas de mapeamento De/Para

**Files:**
- Create: `backend/src/routes/mappingRoutes.ts`
- Test: `backend/src/routes/mappingRoutes.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 3), `createAuthRoutes` (Task 4, só nos testes).
- Produces: `createMappingRoutes(db): Router` montado em `/api/mapping`.

- [ ] **Step 1: Escrever o teste das rotas de mapeamento**

`backend/src/routes/mappingRoutes.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDb } from '../db';
import { createAuthRoutes } from './authRoutes';
import { createMappingRoutes } from './mappingRoutes';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-only-for-vitest';
});

async function buildAuthedApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(db));
  app.use('/api/mapping', createMappingRoutes(db));

  const registerRes = await request(app).post('/api/auth/register').send({ username: 'edison', password: 'segredo123' });
  const token = registerRes.body.token as string;
  return { app, token };
}

describe('GET /api/mapping', () => {
  it('retorna objeto vazio quando nada foi salvo ainda', async () => {
    const { app, token } = await buildAuthedApp();
    const res = await request(app).get('/api/mapping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('rejeita sem token', async () => {
    const { app } = await buildAuthedApp();
    const res = await request(app).get('/api/mapping');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/mapping', () => {
  it('salva o mapeamento e o GET seguinte reflete a mudança', async () => {
    const { app, token } = await buildAuthedApp();
    const mapping = { '01.01.01 : Mensalidade': { category: '1.2 Receita de Internet (SVA)', action: 'include' } };

    const putRes = await request(app).put('/api/mapping').set('Authorization', `Bearer ${token}`).send(mapping);
    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/mapping').set('Authorization', `Bearer ${token}`);
    expect(getRes.body).toEqual(mapping);
  });

  it('sobrescreve um mapeamento salvo anteriormente', async () => {
    const { app, token } = await buildAuthedApp();
    await request(app).put('/api/mapping').set('Authorization', `Bearer ${token}`).send({ a: { category: 'X', action: 'include' } });
    await request(app).put('/api/mapping').set('Authorization', `Bearer ${token}`).send({ b: { category: 'Y', action: 'exclude' } });

    const getRes = await request(app).get('/api/mapping').set('Authorization', `Bearer ${token}`);
    expect(getRes.body).toEqual({ b: { category: 'Y', action: 'exclude' } });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run src/routes/mappingRoutes.test.ts`
Expected: FAIL com "Cannot find module './mappingRoutes'"

- [ ] **Step 3: Implementar `backend/src/routes/mappingRoutes.ts`**

```typescript
import { Router, type Response } from 'express';
import type { Database } from 'better-sqlite3';
import { requireAuth, type AuthedRequest } from '../auth/middleware';

interface MappingRow {
  data: string;
}

export function createMappingRoutes(db: Database): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (_req: AuthedRequest, res: Response) => {
    const row = db.prepare('SELECT data FROM mapping_config WHERE id = 1').get() as MappingRow | undefined;
    res.json(row ? JSON.parse(row.data) : {});
  });

  router.put('/', (req: AuthedRequest, res: Response) => {
    const mapping = req.body ?? {};
    const data = JSON.stringify(mapping);
    db.prepare(
      `INSERT INTO mapping_config (id, data, updated_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(data);
    res.json(mapping);
  });

  return router;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run src/routes/mappingRoutes.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Montar as rotas em `backend/src/server.ts`**

```typescript
import express from 'express';
import cors from 'cors';
import { db } from './db';
import { createAuthRoutes } from './routes/authRoutes';
import { createUserRoutes } from './routes/userRoutes';
import { createMappingRoutes } from './routes/mappingRoutes';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', createAuthRoutes(db));
app.use('/api/users', createUserRoutes(db));
app.use('/api/mapping', createMappingRoutes(db));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`dre-backend ouvindo na porta ${PORT}`);
});

export { app };
```

- [ ] **Step 6: Confirmar que o build passa**

Run: `cd backend && npm run build`
Expected: sem erros

- [ ] **Step 7: Commit**

```bash
cd /home/edison/dre-inteligente
git add backend/src/routes/mappingRoutes.ts backend/src/routes/mappingRoutes.test.ts backend/src/server.ts
git commit -m "Adiciona rotas de mapeamento De/Para (GET/PUT /api/mapping)"
```

---

### Task 7: Rotas de histórico de DRE

**Files:**
- Create: `backend/src/routes/dreRoutes.ts`
- Test: `backend/src/routes/dreRoutes.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 3), `createAuthRoutes` (Task 4, só nos testes).
- Produces: `createDreRoutes(db): Router` montado em `/api/dre`.

- [ ] **Step 1: Escrever o teste das rotas de DRE**

`backend/src/routes/dreRoutes.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDb } from '../db';
import { createAuthRoutes } from './authRoutes';
import { createDreRoutes } from './dreRoutes';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-only-for-vitest';
});

async function buildAuthedApp() {
  const db = createDb(':memory:');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', createAuthRoutes(db));
  app.use('/api/dre', createDreRoutes(db));

  const registerRes = await request(app).post('/api/auth/register').send({ username: 'edison', password: 'segredo123' });
  const token = registerRes.body.token as string;
  return { app, token };
}

describe('GET /api/dre', () => {
  it('retorna objeto vazio quando nenhum mês foi salvo', async () => {
    const { app, token } = await buildAuthedApp();
    const res = await request(app).get('/api/dre').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('PUT /api/dre/:monthId', () => {
  it('cria um mês e o GET /api/dre reflete a mudança', async () => {
    const { app, token } = await buildAuthedApp();
    const dreData = { monthId: '2026-06', monthLabel: 'Junho de 2026', lines: [], transactions: [], unmapped: [], totals: {} };

    const putRes = await request(app).put('/api/dre/2026-06').set('Authorization', `Bearer ${token}`).send(dreData);
    expect(putRes.status).toBe(200);

    const getRes = await request(app).get('/api/dre').set('Authorization', `Bearer ${token}`);
    expect(getRes.body['2026-06']).toEqual(dreData);
  });

  it('atualiza um mês já existente no lugar', async () => {
    const { app, token } = await buildAuthedApp();
    const v1 = { monthId: '2026-06', monthLabel: 'Junho de 2026', lines: [], transactions: [], unmapped: [], totals: { rol: 100 } };
    const v2 = { monthId: '2026-06', monthLabel: 'Junho de 2026', lines: [], transactions: [], unmapped: [], totals: { rol: 200 } };

    await request(app).put('/api/dre/2026-06').set('Authorization', `Bearer ${token}`).send(v1);
    await request(app).put('/api/dre/2026-06').set('Authorization', `Bearer ${token}`).send(v2);

    const getRes = await request(app).get('/api/dre').set('Authorization', `Bearer ${token}`);
    expect(getRes.body['2026-06'].totals.rol).toBe(200);
  });
});

describe('DELETE /api/dre/:monthId', () => {
  it('remove um único mês, mantendo os outros', async () => {
    const { app, token } = await buildAuthedApp();
    const dreDataA = { monthId: '2026-06', monthLabel: 'Junho', lines: [], transactions: [], unmapped: [], totals: {} };
    const dreDataB = { monthId: '2026-07', monthLabel: 'Julho', lines: [], transactions: [], unmapped: [], totals: {} };

    await request(app).put('/api/dre/2026-06').set('Authorization', `Bearer ${token}`).send(dreDataA);
    await request(app).put('/api/dre/2026-07').set('Authorization', `Bearer ${token}`).send(dreDataB);

    const delRes = await request(app).delete('/api/dre/2026-06').set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(204);

    const getRes = await request(app).get('/api/dre').set('Authorization', `Bearer ${token}`);
    expect(Object.keys(getRes.body)).toEqual(['2026-07']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && npx vitest run src/routes/dreRoutes.test.ts`
Expected: FAIL com "Cannot find module './dreRoutes'"

- [ ] **Step 3: Implementar `backend/src/routes/dreRoutes.ts`**

```typescript
import { Router, type Response } from 'express';
import type { Database } from 'better-sqlite3';
import { requireAuth, type AuthedRequest } from '../auth/middleware';

interface DreRow {
  month_id: string;
  data: string;
}

export function createDreRoutes(db: Database): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (_req: AuthedRequest, res: Response) => {
    const rows = db.prepare('SELECT month_id, data FROM dre_history').all() as DreRow[];
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      result[row.month_id] = JSON.parse(row.data);
    }
    res.json(result);
  });

  router.put('/:monthId', (req: AuthedRequest, res: Response) => {
    const { monthId } = req.params;
    const dreData = req.body ?? {};
    const monthLabel = typeof dreData.monthLabel === 'string' ? dreData.monthLabel : monthId;
    const data = JSON.stringify(dreData);

    db.prepare(
      `INSERT INTO dre_history (month_id, month_label, data, updated_at) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(month_id) DO UPDATE SET month_label = excluded.month_label, data = excluded.data, updated_at = excluded.updated_at`
    ).run(monthId, monthLabel, data);

    res.json(dreData);
  });

  router.delete('/:monthId', (req: AuthedRequest, res: Response) => {
    const { monthId } = req.params;
    db.prepare('DELETE FROM dre_history WHERE month_id = ?').run(monthId);
    res.status(204).send();
  });

  return router;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd backend && npx vitest run src/routes/dreRoutes.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Montar as rotas em `backend/src/server.ts` (versão final do arquivo)**

```typescript
import express from 'express';
import cors from 'cors';
import { db } from './db';
import { createAuthRoutes } from './routes/authRoutes';
import { createUserRoutes } from './routes/userRoutes';
import { createMappingRoutes } from './routes/mappingRoutes';
import { createDreRoutes } from './routes/dreRoutes';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', createAuthRoutes(db));
app.use('/api/users', createUserRoutes(db));
app.use('/api/mapping', createMappingRoutes(db));
app.use('/api/dre', createDreRoutes(db));

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`dre-backend ouvindo na porta ${PORT}`);
});

export { app };
```

- [ ] **Step 6: Rodar a suíte inteira do backend e confirmar que passa**

Run: `cd backend && npm test`
Expected: PASS (todos os arquivos `*.test.ts` do backend)

- [ ] **Step 7: Confirmar que o build passa**

Run: `cd backend && npm run build`
Expected: sem erros

- [ ] **Step 8: Commit**

```bash
cd /home/edison/dre-inteligente
git add backend/src/routes/dreRoutes.ts backend/src/routes/dreRoutes.test.ts backend/src/server.ts
git commit -m "Adiciona rotas de histórico de DRE (GET/PUT/DELETE /api/dre)"
```

---

### Task 8: Dockerfile, docker-compose e configuração de deploy

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.env.example`
- Create: `docker-compose.yml` (raiz do repo `dre-inteligente/`)
- Modify: `.gitignore` (raiz do repo, garantir que `.env` da raiz também é ignorado)

**Interfaces:**
- Consumes: `backend/package.json`/`backend/src` (Tasks 1-7).
- Produces: imagem Docker `dre_backend` buildável e um `docker-compose.yml` que sobe o serviço na rede `snilog_sni_network` — consumido pela Task 13 (deploy).

- [ ] **Step 1: Criar `backend/Dockerfile`**

```dockerfile
FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

ENV DB_PATH=/data/dre.db
EXPOSE 4000

CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Criar `backend/.env.example`**

```
JWT_SECRET=changeme-generate-with-openssl-rand-hex-32
PORT=4000
```

- [ ] **Step 3: Criar `docker-compose.yml` na raiz do repo (`/home/edison/dre-inteligente/docker-compose.yml`)**

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

- [ ] **Step 4: Garantir que a raiz do repo ignora `.env`**

Verificar se `/home/edison/dre-inteligente/.gitignore` já tem uma linha `.env`; se não tiver, adicionar.

Run: `grep -qxF '.env' /home/edison/dre-inteligente/.gitignore || echo '.env' >> /home/edison/dre-inteligente/.gitignore`

- [ ] **Step 5: Testar o build da imagem localmente (sem subir ainda)**

Run: `cd /home/edison/dre-inteligente && docker build -t dre_backend_test ./backend`
Expected: build conclui sem erro (confirma que `better-sqlite3` compila com as libs instaladas na imagem)

- [ ] **Step 6: Remover a imagem de teste (não faz parte do deploy final, só validação)**

Run: `docker rmi dre_backend_test`

- [ ] **Step 7: Commit**

```bash
cd /home/edison/dre-inteligente
git add backend/Dockerfile backend/.env.example docker-compose.yml .gitignore
git commit -m "Adiciona Dockerfile e docker-compose do backend do DRE"
```

---

### Task 9: Cliente HTTP do frontend (`src/services/api.ts`)

**Files:**
- Create: `src/services/api.ts`
- Test: `src/services/api.test.ts`

**Interfaces:**
- Consumes: nenhuma (só `fetch` e `localStorage` do browser).
- Produces: `getBootstrapStatus`, `register`, `login`, `listUsers`, `createUser`, `deleteUser`, `getMapping`, `saveMapping`, `getDreHistory`, `saveDreMonth`, `deleteDreMonth`, `clearAllDreHistory` — usados por `Login.tsx` (Task 10), `UserSettings.tsx` (Task 11) e `App.tsx` (Task 12).

- [ ] **Step 1: Escrever o teste do cliente de API**

`src/services/api.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { login, listUsers, getMapping } from './api';

function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
}

beforeEach(() => {
  (globalThis as any).localStorage = createLocalStorageMock();
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('login envia as credenciais e retorna o corpo já convertido', async () => {
    const mockResponse = { ok: true, status: 200, json: async () => ({ token: 'abc', username: 'edison' }) };
    global.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

    const result = await login('edison', 'segredo123');

    expect(result).toEqual({ token: 'abc', username: 'edison' });
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
  });

  it('envia o JWT salvo como header Bearer nas chamadas autenticadas', async () => {
    localStorage.setItem('app_jwt', 'my-token');
    const mockResponse = { ok: true, status: 200, json: async () => ([]) };
    global.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

    await listUsers();

    const [, options] = (global.fetch as any).mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer my-token');
  });

  it('lança erro com a mensagem do backend quando a resposta não é ok', async () => {
    const mockResponse = { ok: false, status: 401, json: async () => ({ error: 'Token inválido ou expirado' }) };
    global.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

    await expect(getMapping()).rejects.toThrow('Token inválido ou expirado');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/services/api.test.ts`
Expected: FAIL com "Cannot find module './api'"

- [ ] **Step 3: Implementar `src/services/api.ts`**

```typescript
const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('app_jwt');
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // corpo sem JSON, mantém mensagem padrão
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface AuthResult {
  token: string;
  username: string;
}

export function getBootstrapStatus(): Promise<{ hasUsers: boolean }> {
  return apiFetch('/auth/bootstrap-status');
}

export function register(username: string, password: string): Promise<AuthResult> {
  return apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function login(username: string, password: string): Promise<AuthResult> {
  return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export interface UserRecord {
  username: string;
  created_at: string;
}

export function listUsers(): Promise<UserRecord[]> {
  return apiFetch('/users');
}

export function createUser(username: string, password: string): Promise<UserRecord> {
  return apiFetch('/users', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function deleteUser(username: string): Promise<void> {
  return apiFetch(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
}

export type Mapping = Record<string, { category: string; action: 'include' | 'exclude' }>;

export function getMapping(): Promise<Mapping> {
  return apiFetch('/mapping');
}

export function saveMapping(mapping: Mapping): Promise<Mapping> {
  return apiFetch('/mapping', { method: 'PUT', body: JSON.stringify(mapping) });
}

export function getDreHistory<T>(): Promise<Record<string, T>> {
  return apiFetch('/dre');
}

export function saveDreMonth<T>(monthId: string, data: T): Promise<T> {
  return apiFetch(`/dre/${encodeURIComponent(monthId)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteDreMonth(monthId: string): Promise<void> {
  return apiFetch(`/dre/${encodeURIComponent(monthId)}`, { method: 'DELETE' });
}

export async function clearAllDreHistory(): Promise<void> {
  const history = await getDreHistory();
  await Promise.all(Object.keys(history).map((monthId) => deleteDreMonth(monthId)));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/services/api.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
cd /home/edison/dre-inteligente
git add src/services/api.ts src/services/api.test.ts
git commit -m "Adiciona cliente HTTP do frontend pro backend novo (src/services/api.ts)"
```

---

### Task 10: `Login.tsx` — bootstrap/login via API, remove fallback admin/123

**Files:**
- Modify: `src/components/Login.tsx` (substituição completa do conteúdo)

**Interfaces:**
- Consumes: `getBootstrapStatus`, `register`, `login` de `../services/api` (Task 9).
- Produces: `onLoginSuccess(username: string)` continua com a mesma assinatura consumida por `App.tsx` (Task 12) — mas agora quem escreve `app_jwt`/`app_user_session` no `localStorage` é o próprio `Login.tsx`, antes de chamar `onLoginSuccess`.

- [ ] **Step 1: Substituir todo o conteúdo de `src/components/Login.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { LogIn, Key, Mail, ShieldAlert, UserPlus } from 'lucide-react';
import { getBootstrapStatus, login, register } from '../services/api';

interface LoginProps {
  onLoginSuccess: (username: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [mode, setMode] = useState<'loading' | 'login' | 'bootstrap'>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getBootstrapStatus()
      .then(({ hasUsers }) => setMode(hasUsers ? 'login' : 'bootstrap'))
      .catch(() => setError('Não foi possível falar com o servidor. Tente novamente em instantes.'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (mode === 'bootstrap' && password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    setSubmitting(true);
    try {
      const result = mode === 'bootstrap'
        ? await register(username, password)
        : await login(username, password);

      localStorage.setItem('app_jwt', result.token);
      localStorage.setItem('app_user_session', result.username);
      onLoginSuccess(result.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciais inválidas. Verifique seu usuário e senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <img className="login-logo" src="/logo.png" alt="ISP Logo" onError={(e) => {
          (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'/%3E%3C/svg%3E";
        }} />

        <h2>Portal Financeiro</h2>
        <p>
          {mode === 'bootstrap'
            ? 'Crie o primeiro acesso do sistema'
            : 'Entre para classificar lançamentos e ver a DRE'}
        </p>

        {error && (
          <div className="error-message">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        {mode !== 'loading' && (
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Usuário</label>
              <div className="input-wrapper">
                <Mail className="input-icon" size={18} />
                <input
                  type="text"
                  placeholder="seu usuário"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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

            {mode === 'bootstrap' && (
              <div className="form-group">
                <label>Confirmar Senha</label>
                <div className="input-wrapper">
                  <Key className="input-icon" size={18} />
                  <input
                    type="password"
                    placeholder="******"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={submitting}>
              {mode === 'bootstrap' ? <UserPlus size={18} /> : <LogIn size={18} />}
              <span>{mode === 'bootstrap' ? 'Criar acesso' : 'Entrar'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Confirmar que o TypeScript compila**

Run: `cd /home/edison/dre-inteligente && npx tsc -b`
Expected: sem erros (ou só erros pré-existentes não relacionados a este arquivo — se houver erro apontando pra `App.tsx` chamando `Login`, ele será resolvido na Task 12)

- [ ] **Step 3: Commit**

```bash
cd /home/edison/dre-inteligente
git add src/components/Login.tsx
git commit -m "Migra Login.tsx pra usar a API real (bootstrap/login), remove fallback admin/123"
```

---

### Task 11: `UserSettings.tsx` — CRUD de usuários via API

**Files:**
- Modify: `src/components/UserSettings.tsx` (substituição completa do conteúdo)

**Interfaces:**
- Consumes: `listUsers`, `createUser`, `deleteUser`, `clearAllDreHistory`, `UserRecord` de `../services/api` (Task 9).
- Produces: nenhuma mudança de props (`loggedInUser: string`, igual antes) — continua consumido por `App.tsx` sem mudança de assinatura.

- [ ] **Step 1: Substituir todo o conteúdo de `src/components/UserSettings.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { ShieldCheck, UserPlus, Trash2, Users, CheckCircle, AlertTriangle } from 'lucide-react';
import { listUsers, createUser, deleteUser, clearAllDreHistory, type UserRecord } from '../services/api';

interface UserSettingsProps {
  loggedInUser: string;
}

export default function UserSettings({ loggedInUser }: UserSettingsProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadUsers = () => {
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar usuários.'));
  };

  useEffect(() => {
    reloadUsers();
  }, []);

  const handleRegisterUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    setError(null);

    const usernameTrimmed = newUsername.trim();
    if (!usernameTrimmed || !newUserPassword) {
      setError("Por favor, preencha o nome do usuário e a senha.");
      return;
    }

    try {
      await createUser(usernameTrimmed, newUserPassword);
      reloadUsers();
      setNewUsername('');
      setNewUserPassword('');
      setSuccess(`Usuário '${usernameTrimmed}' cadastrado com sucesso!`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar o usuário.');
    }
  };

  const handleDeleteUser = async (userToDelete: string) => {
    if (userToDelete === loggedInUser) {
      alert("Você não pode deletar o usuário que está logado no momento.");
      return;
    }

    if (window.confirm(`Deseja realmente remover o acesso do usuário '${userToDelete}'?`)) {
      try {
        await deleteUser(userToDelete);
        reloadUsers();
        setSuccess(`Usuário '${userToDelete}' removido com sucesso.`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível remover o usuário.');
      }
    }
  };

  const handleClearCache = () => {
    if (window.confirm("Deseja apagar a sessão local deste navegador? Você será deslogado.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleClearDREDatabase = () => {
    if (window.confirm("Deseja apagar todo o histórico de planilhas DRE importadas do servidor? Seus usuários e mapeamentos serão mantidos.")) {
      clearAllDreHistory()
        .then(() => window.location.reload())
        .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível limpar o histórico.'));
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', maxWidth: '1200px', margin: '0 auto' }}>

      <div className="chart-card">
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          Configurações do Aplicativo
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }}>Privacidade e Segurança</span>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Usuários, mapeamento e histórico de DRE ficam salvos no servidor
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
                Apaga do servidor todas as DREs importadas dos meses anteriores, mantendo os usuários e regras de mapeamento
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
                Apaga o token de acesso salvo neste navegador (você precisará entrar de novo)
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
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>v2.0.0 (React + Vite + API)</span>
          </div>
        </div>
      </div>

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usuários com Acesso</label>

          {users.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
              Nenhum usuário cadastrado.
            </div>
          ) : (
            users.map(({ username: user }) => (
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
```

- [ ] **Step 2: Confirmar que o TypeScript compila**

Run: `cd /home/edison/dre-inteligente && npx tsc -b`
Expected: sem erros novos introduzidos por este arquivo

- [ ] **Step 3: Commit**

```bash
cd /home/edison/dre-inteligente
git add src/components/UserSettings.tsx
git commit -m "Migra UserSettings.tsx pra usar a API real de usuários e histórico de DRE"
```

---

### Task 12: `App.tsx` — mapeamento e histórico de DRE via API

**Files:**
- Modify: `src/App.tsx` (substituição completa do conteúdo)

**Interfaces:**
- Consumes: `getMapping`, `saveMapping`, `getDreHistory`, `saveDreMonth`, `deleteDreMonth` de `./services/api` (Task 9); `Login` (Task 10) e `UserSettings` (Task 11) sem mudança de props.
- Produces: nenhuma interface nova exportada (componente raiz).

- [ ] **Step 1: Substituir todo o conteúdo de `src/App.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { BarChart3, Settings, LogOut, ClipboardList, CreditCard } from 'lucide-react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import MappingEditor from './components/MappingEditor';
import TransactionsList from './components/TransactionsList';
import UserSettings from './components/UserSettings';
import CardStatementImport from './components/CardStatementImport';
import { DEFAULT_MAPPING, type DREData } from './utils/dreParser';
import { getMapping, saveMapping as apiSaveMapping, getDreHistory, saveDreMonth, deleteDreMonth } from './services/api';

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'cardImport' | 'settings'>('dashboard');

  const [mapping, setMapping] = useState<Record<string, { category: string; action: 'include' | 'exclude' }>>({});
  const [unmappedAccounts, setUnmappedAccounts] = useState<string[]>([]);
  const [dreData, setDreData] = useState<DREData | null>(null);
  const [dreDatabase, setDreDatabase] = useState<Record<string, DREData>>({});
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);

  // Carregar sessão salva (token + usuário)
  useEffect(() => {
    const token = localStorage.getItem('app_jwt');
    const session = localStorage.getItem('app_user_session');
    if (token && session) {
      setUserEmail(session);
    }
  }, []);

  // Carregar mapeamento e histórico do servidor assim que autenticado
  useEffect(() => {
    if (!userEmail) return;

    getMapping()
      .then(async (savedMapping) => {
        if (Object.keys(savedMapping).length === 0) {
          setMapping({ ...DEFAULT_MAPPING });
          await apiSaveMapping(DEFAULT_MAPPING);
        } else {
          setMapping(savedMapping);
        }
      })
      .catch((e) => console.error('Erro ao carregar mapeamento do servidor.', e));

    getDreHistory<DREData>()
      .then((parsedDb) => {
        setDreDatabase(parsedDb);
        const keys = Object.keys(parsedDb).sort();
        if (keys.length > 0) {
          setDreData(parsedDb[keys[keys.length - 1]]);
        }
      })
      .catch((e) => console.error('Erro ao carregar histórico de DRE do servidor.', e));
  }, [userEmail]);

  const handleLoginSuccess = (username: string) => {
    setUserEmail(username);
  };

  const handleLogout = () => {
    if (window.confirm("Deseja realmente sair do sistema?")) {
      localStorage.removeItem('app_jwt');
      localStorage.removeItem('app_user_session');
      setUserEmail(null);
      setDreData(null);
      setActiveTab('dashboard');
    }
  };

  const handleSaveMapping = async (newMapping: Record<string, { category: string; action: 'include' | 'exclude' }>) => {
    try {
      await apiSaveMapping(newMapping);
    } catch (e) {
      console.error('Erro ao salvar mapeamento no servidor.', e);
    }
    setMapping(newMapping);
    setUnmappedAccounts([]);

    if (dreData) {
      setDreData(null);
      setActiveTab('dashboard');
      alert("Mapeamento atualizado! Por favor, recarregue o arquivo Excel para ver os resultados calculados com as novas regras.");
    }
  };

  const handleSaveDREMonth = async (data: DREData) => {
    try {
      await saveDreMonth(data.monthId, data);
    } catch (e) {
      console.error('Erro ao salvar DRE do mês no servidor.', e);
    }
    const updatedDb = { ...dreDatabase, [data.monthId]: data };
    setDreDatabase(updatedDb);
    setDreData(data);
  };

  const handleFoundUnmapped = (unmapped: string[]) => {
    setUnmappedAccounts(unmapped);
  };

  if (!userEmail) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-container">
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
                deleteDreMonth(monthId).catch((e) => console.error('Erro ao excluir DRE do servidor.', e));
                const updatedDb = { ...dreDatabase };
                delete updatedDb[monthId];
                setDreDatabase(updatedDb);
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
```

- [ ] **Step 2: Confirmar que o TypeScript compila**

Run: `cd /home/edison/dre-inteligente && npx tsc -b`
Expected: sem erros

- [ ] **Step 3: Rodar a suíte de testes inteira do frontend**

Run: `cd /home/edison/dre-inteligente && npx vitest run`
Expected: PASS (todos os testes existentes de `src/utils/` + o novo `src/services/api.test.ts`)

- [ ] **Step 4: Confirmar que o build de produção do frontend passa**

Run: `cd /home/edison/dre-inteligente && npm run build`
Expected: sem erros, gera `dist/`

- [ ] **Step 5: Commit**

```bash
cd /home/edison/dre-inteligente
git add src/App.tsx
git commit -m "Migra App.tsx pra carregar mapeamento e histórico de DRE do backend"
```

---

### Task 13: Deploy — subir o backend, configurar nginx e liberar o acesso

Esta task é operacional (não é código-fonte com TDD) — envolve subir infraestrutura real e mexer num arquivo de nginx compartilhado com outros serviços em produção.

**Files:**
- Nenhum arquivo de código novo. Usa os artefatos das Tasks 1-12.
- Modify (fora deste repo): `/home/edison/fontes/SNILog/nginx/default.conf`

**Interfaces:**
- Consumes: `docker-compose.yml`/`backend/Dockerfile` (Task 8), `src/services/api.ts`/`Login.tsx`/`UserSettings.tsx`/`App.tsx` (Tasks 9-12).

- [ ] **Step 1: Gerar o `JWT_SECRET` e criar o `.env` da raiz (não commitar)**

Run:
```bash
cd /home/edison/dre-inteligente
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
```

- [ ] **Step 2: Subir o backend**

Run:
```bash
cd /home/edison/dre-inteligente
docker compose build && docker compose up -d
docker compose logs dre_backend --tail 20
```
Expected: log mostra `dre-backend ouvindo na porta 4000`, container `dre_backend` com status `Up`.

- [ ] **Step 3: Confirmar que o backend responde dentro da rede Docker (antes de mexer no nginx)**

Run: `docker exec sni_nginx wget -qO- http://dre_backend:4000/api/auth/bootstrap-status`
Expected: `{"hasUsers":false}`

- [ ] **Step 4: AVISAR O EDISON antes de editar o nginx compartilhado — não prosseguir sem confirmação explícita dele, já que este arquivo atende outros serviços em produção (StoneChat/SNILog/NetManager/Cofre).**

- [ ] **Step 5: Adicionar o `location /api/` no server block de `dre.snitelecom.com.br`**

Editar `/home/edison/fontes/SNILog/nginx/default.conf`, dentro do `server { server_name dre.snitelecom.com.br; ... }` já existente, adicionando (antes do `location /` existente):
```nginx
    location /api/ {
        proxy_pass http://dre_backend:4000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
```

- [ ] **Step 6: Reiniciar o `sni_nginx` de verdade (reload não basta — bind mount de arquivo único)**

Run: `docker restart sni_nginx`

- [ ] **Step 7: Confirmar que a API responde publicamente pelo domínio**

Run: `curl -sk https://dre.snitelecom.com.br/api/auth/bootstrap-status`
Expected: `{"hasUsers":false}`

- [ ] **Step 8: Rebuildar e reiniciar o frontend com as mudanças das Tasks 9-12**

Run:
```bash
cd /home/edison/dre-inteligente
export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"; nvm use 22
npm run build
pm2 restart dre-portal
```

- [ ] **Step 9: Verificação manual end-to-end**

1. Abrir `https://dre.snitelecom.com.br/` — deve mostrar a tela "Crie o primeiro acesso do sistema" (banco vazio).
2. Cadastrar o usuário real do Edison.
3. Confirmar que entra no dashboard.
4. Ir em Configurações → cadastrar um segundo usuário (ex: `clau`) → confirmar que aparece na lista.
5. Fazer logout e entrar de novo com o segundo usuário, confirmar que funciona.
6. Importar uma planilha de teste, confirmar que o DRE calcula e aparece salvo em "histórico" mesmo depois de um F5 (prova que veio do servidor, não do localStorage).

- [ ] **Step 10: Commit final (se houver qualquer ajuste feito durante a verificação manual)**

```bash
cd /home/edison/dre-inteligente
git add -A
git commit -m "Ajustes finais de deploy do backend real do DRE" --allow-empty
git push origin main
```
