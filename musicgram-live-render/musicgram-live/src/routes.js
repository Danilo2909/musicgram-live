const express = require('express');
const router = express.Router();

const elance = require('./controllers/elance');

const requireAuth = (req,res,next)=>{
  if(req?.session?.user?.id) return next();
  return res.redirect('/login');
};

router.get('/',        requireAuth, elance.home);
router.get('/discover',requireAuth, elance.discover);
router.get('/network', requireAuth, elance.network);

router.post('/u/:id/follow',   requireAuth, elance.follow);
router.post('/u/:id/unfollow', requireAuth, elance.unfollow);

router.post('/p/:id/like',     requireAuth, elance.like);
router.post('/p/:id/unlike',   requireAuth, elance.unlike);
router.post('/p/:id/comment',  requireAuth, elance.comment);

module.exports = router;
