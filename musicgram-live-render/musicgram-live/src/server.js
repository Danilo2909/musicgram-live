import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import expressLayouts from 'express-ejs-layouts';
import { pool, migrate } from './db.js';
import { attachUser } from './auth.js';
import router from './routes.js';
import { setupSockets } from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// **Importante no Render/Heroku/Nginx**
// Confia nos cabeçalhos do proxy (X-Forwarded-For / Proto) para IP real e HTTPS
app.set('trust proxy', 1);

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { path: '/socket.io' });

// Sessions (MemoryStore ok para single instance)
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' // cookie só via HTTPS em prod
  }
});

// Views + layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // src/views
app.use(expressLayouts);
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(helmet({ contentSecurityPolicy: false }));

// estáticos: ../public (irmão de src)
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.use(sessionMiddleware);
app.use(attachUser);

// Health
app.get('/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

// Rate limit (usa IP correto graças ao trust proxy)
const limiter = rateLimit({
  windowMs: 60_000, // 1 min
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
  // Se, por algum motivo, quiser ignorar X-Forwarded-For validation:
  // validate: { xForwardedForHeader: false }
});
app.use(['/login','/register','/create','/post','/api'], limiter);

// Rotas
app.use(router);

// Sockets
setupSockets(io, sessionMiddleware);

// Start
const PORT = process.env.PORT || 10000;
await migrate();
httpServer.listen(PORT, () => console.log('Running on', PORT));
