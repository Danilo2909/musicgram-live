import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import rateLimit from 'express-rate-limit';
import expressLayouts from 'express-ejs-layouts';  //  NOVO
import { pool, migrate } from './db.js';
import { attachUser } from './auth.js';
import router from './routes.js';
import { setupSockets } from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { path:'/socket.io' });

// sessions (MemoryStore ok for single instance)
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7*24*60*60*1000 }
});

//  Views + layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));     // src/views
app.use(expressLayouts);                              //  NOVO
app.set('layout', 'layout');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(helmet({ contentSecurityPolicy: false }));

//  estáticos: garanta que aponta para ../public (irmão de src)
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.use(sessionMiddleware);
app.use(attachUser);

// health & limits
app.get('/health', async (req,res)=>{
  try{ await pool.query('select 1'); res.json({ ok:true }); }
  catch{ res.status(500).json({ ok:false }); }
});
app.use(['/login','/register','/create','/post','/api'], rateLimit({ windowMs: 60_000, limit: 120 }));

// routes
app.use(router);

// sockets
setupSockets(io, sessionMiddleware);

// start
const PORT = process.env.PORT || 10000;
await migrate();
httpServer.listen(PORT, () => console.log('Running on', PORT));

