import express from 'express';
import * as elance from './controllers/elance.js';

const router = express.Router();

const requireAuth = (req, res, next) => {
  if (req?.session?.user?.id) return next();
  return res.redirect('/login');
};

// ---------- Auth provisória ----------
router.get('/login', (req, res) => {
  res.render('login', { title: 'Entrar · Elance' });
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const id = parseInt(req.body.user_id || '1', 10) || 1;
  const username = (req.body.username || 'demo').trim() || 'demo';
  req.session.user = { id, username };
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  req.session.destroy?.(()=>{});
  res.redirect('/login');
});

// ---------- Elance core ----------
router.get('/', requireAuth, elance.home);
router.get('/discover', requireAuth, elance.discover);
router.get('/network', requireAuth, elance.network);

router.post('/u/:id/follow', requireAuth, elance.follow);
router.post('/u/:id/unfollow', requireAuth, elance.unfollow);

router.post('/p/:id/like', requireAuth, elance.like);
router.post('/p/:id/unlike', requireAuth, elance.unlike);
router.post('/p/:id/comment', requireAuth, elance.comment);

export default router;
