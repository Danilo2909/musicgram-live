import bcrypt from 'bcrypt';

export async function hashPassword(p){ return bcrypt.hash(p, 10); }
export async function checkPassword(p, hash){ return bcrypt.compare(p, hash); }

export function requireAuth(req, res, next){
  if(req.session.user) return next();
  res.redirect('/login');
}
export function attachUser(req, res, next){
  res.locals.user = req.session.user || null;
  next();
}
