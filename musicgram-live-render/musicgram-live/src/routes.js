import express from 'express';
import * as elance from './controllers/elance.js';

const router = express.Router();

const requireAuth = (req, res, next) => {
  if (req?.session?.user?.id) return next();
  return res.redirect('/login');
};

// HOME (feed)
router.get('/', requireAuth, elance.home);

// DISCOVER
router.get('/discover', requireAuth, elance.discover);

// NETWORK
router.get('/network', requireAuth, elance.network);

// FOLLOW / UNFOLLOW
router.post('/u/:id/follow', requireAuth, elance.follow);
router.post('/u/:id/unfollow', requireAuth, elance.unfollow);

// LIKES & COMMENTS
router.post('/p/:id/like', requireAuth, elance.like);
router.post('/p/:id/unlike', requireAuth, elance.unlike);
router.post('/p/:id/comment', requireAuth, elance.comment);

export default router;
