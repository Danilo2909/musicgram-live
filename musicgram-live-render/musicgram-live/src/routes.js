import express from 'express';
import * as elance from './controllers/elance.js';

const router = express.Router();

const requireAuth = (req, res, next) => {
  if (req?.session?.user?.id) return next();
  return res.redirect('/login');
};

// ---------- Auth provisória ----------
router.get('/login', (req, res) => res.render('login', { title: 'Entrar · Elance' }));
router.post('/login', express.urlencoded({ extended: true }), (req, res, next) => {
  const id = parseInt(req.body.user_id || '1', 10) || 1;
  const username = (req.body.username || 'demo').trim() || 'demo';
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.user = { id, username };
    req.session.save(err2 => {
      if (err2) return next(err2);
      return res.redirect('/');
    });
  });
});
router.get('/logout', (req, res) => { req.session.destroy?.(()=>{}); res.redirect('/login'); });

// ---------- Debug endpoints ----------
router.get('/me', (req,res)=> res.json({ user: req.session?.user || null }));
router.get('/db', async (req,res,next)=>{
  try {
    const { default: pool } = await import('./db/pool.js'); // dynamic import to avoid cache issues
    const ok = await pool.query('select 1');
    res.json({ db: 'ok', rows: ok.rows });
  } catch (e) {
    next(e);
  }
});

// ---------- App ----------
router.get('/', requireAuth, elance.home);
router.get('/discover', requireAuth, elance.discover);
router.get('/network', requireAuth, elance.network);

router.post('/u/:id/follow', requireAuth, elance.follow);
router.post('/u/:id/unfollow', requireAuth, elance.unfollow);

router.post('/p/:id/like', requireAuth, elance.like);
router.post('/p/:id/unlike', requireAuth, elance.unlike);
router.post('/p/:id/comment', requireAuth, elance.comment);

export default router;
