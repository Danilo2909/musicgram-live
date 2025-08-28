import express from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from './db.js';
import { hashPassword, checkPassword, requireAuth } from './auth.js';

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 60_000, limit: 60 });

const getUserByName = async (username) => {
  const q = await pool.query('select * from users where lower(username)=lower($1)', [username]);
  return q.rows[0];
};
const relRow = async (a, b) => {
  const r = await pool.query(`
    select
      exists(select 1 from follows where follower_id=$1 and following_id=$2) as a_follows_b,
      exists(select 1 from follows where follower_id=$2 and following_id=$1) as b_follows_a
  `, [a,b]);
  return r.rows[0];
};

// Home (feed)
router.get('/', async (req,res) => {
  const me = req.session.user;
  let posts = [];
  if(me){
    posts = (await pool.query(`
      select p.*, u.username, u.avatar_url
      from posts p
      join follows f on f.following_id=p.user_id
      join users u on u.id=p.user_id
      where f.follower_id=$1
      order by p.created_at desc
      limit 50
    `,[me.id])).rows;
  } else {
    posts = (await pool.query(`
      select p.*, u.username, u.avatar_url
      from posts p join users u on u.id=p.user_id
      order by p.created_at desc
      limit 20
    `)).rows;
  }
  res.render('index', { posts });
});

// Explore
router.get('/explore', async (req,res)=>{
  const posts = (await pool.query(`
    select p.*, u.username from posts p
    join users u on u.id=p.user_id
    order by p.created_at desc limit 60
  `)).rows;
  res.render('explore', { posts });
});

// Auth
router.get('/login', (req,res)=> res.render('login'));
router.post('/login', authLimiter, async (req,res)=>{
  const { username, password } = req.body;
  const u = await getUserByName(username||'');
  if(!u || !(await checkPassword(password||'', u.password_hash))){
    return res.status(400).render('login', { error: 'Usuário ou senha inválidos' });
  }
  req.session.user = { id:u.id, username:u.username, name:u.name, avatar_url:u.avatar_url };
  await pool.query('update users set last_seen=now() where id=$1', [u.id]);
  res.redirect('/');
});
router.get('/register', (req,res)=> res.render('register'));
router.post('/register', authLimiter, async (req,res)=>{
  const { username, name, password } = req.body;
  if(!username || !name || !password) return res.status(400).render('register', { error:'Preencha todos os campos' });
  try{
    const hash = await hashPassword(password);
    const q = await pool.query('insert into users(username,name,password_hash) values($1,$2,$3) returning id,username,name,avatar_url', [username.toLowerCase(), name, hash]);
    req.session.user = q.rows[0];
    res.redirect('/');
  }catch{
    res.status(400).render('register', { error:'Usuário já existe' });
  }
});
router.post('/logout', (req,res)=> req.session.destroy(()=> res.redirect('/login')) );

// Postar
router.get('/create', requireAuth, (req,res)=> res.render('create'));
router.post('/create', requireAuth, async (req,res)=>{
  const { image_url, caption } = req.body;
  if(!image_url || !/^https?:\/\//i.test(image_url)) return res.status(400).render('create', { error:'Informe uma URL de imagem válida (http/https).' });
  await pool.query('insert into posts(user_id,image_url,caption) values($1,$2,$3)', [req.session.user.id, image_url, caption||'']);
  res.redirect('/');
});

// Post + comentários
router.get('/post/:id', async (req,res)=>{
  const id = +req.params.id;
  const post = (await pool.query('select p.*, u.username from posts p join users u on u.id=p.user_id where p.id=$1', [id])).rows[0];
  if(!post) return res.status(404).send('Post não encontrado');
  const comments = (await pool.query('select c.*, u.username from comments c join users u on u.id=c.user_id where c.post_id=$1 order by c.created_at asc', [id])).rows;
  res.render('post', { post, comments });
});
router.post('/post/:id/comment', requireAuth, async (req,res)=>{
  const id = +req.params.id;
  const text = (req.body.text||'').trim();
  if(text) await pool.query('insert into comments(post_id,user_id,text) values($1,$2,$3)', [id, req.session.user.id, text]);
  res.redirect('/post/'+id);
});

// Perfil + follow/unfollow
router.get('/profile/:username', async (req,res)=>{
  const u = await getUserByName(req.params.username);
  if(!u) return res.status(404).send('Usuário não encontrado');
  const posts = (await pool.query('select * from posts where user_id=$1 order by created_at desc', [u.id])).rows;
  let relationship = { iFollow:false, followsMe:false, friends:false };
  const me = req.session.user;
  if(me){
    const r = await relRow(me.id, u.id);
    relationship = { iFollow: r.a_follows_b, followsMe: r.b_follows_a, friends: r.a_follows_b && r.b_follows_a };
  }
  const stats = (await pool.query(`
    select
      (select count(*)::int from follows where following_id=$1) as followers,
      (select count(*)::int from follows where follower_id=$1) as following,
      (select count(*)::int from posts where user_id=$1) as posts
  `,[u.id])).rows[0];
  res.render('profile', { profile:u, posts, relationship, stats });
});
router.post('/follow/:username', requireAuth, async (req,res)=>{
  const other = await getUserByName(req.params.username);
  if(other && other.id !== req.session.user.id){
    await pool.query('insert into follows(follower_id,following_id) values($1,$2) on conflict do nothing', [req.session.user.id, other.id]);
  }
  res.redirect('/profile/'+req.params.username);
});
router.post('/unfollow/:username', requireAuth, async (req,res)=>{
  const other = await getUserByName(req.params.username);
  if(other && other.id !== req.session.user.id){
    await pool.query('delete from follows where follower_id=$1 and following_id=$2', [req.session.user.id, other.id]);
  }
  res.redirect('/profile/'+req.params.username);
});

// Mensagens
router.get('/messages', requireAuth, async (req,res)=>{
  const me = req.session.user.id;
  const threads = (await pool.query(`
    select t.*,
      case when t.user_a=$1 then u2.username else u1.username end as other_username,
      (select body from messages m where m.thread_id=t.id order by created_at desc limit 1) as last_body,
      (select count(*)::int from messages m where m.thread_id=t.id and m.from_user_id<>$1 and m.read_at is null) as unread
    from threads t
    join users u1 on u1.id=t.user_a
    join users u2 on u2.id=t.user_b
    where t.user_a=$1 or t.user_b=$1
    order by t.id desc
  `,[me])).rows;
  res.render('messages', { threads });
});
router.post('/messages/start/:username', requireAuth, async (req,res)=>{
  const other = await getUserByName(req.params.username);
  if(!other) return res.status(404).send('Usuário não encontrado');
  const me = req.session.user.id;
  const a = Math.min(me, other.id), b = Math.max(me, other.id);
  const t = (await pool.query(`
    insert into threads(user_a,user_b) values($1,$2)
    on conflict (least(user_a,user_b), greatest(user_a,user_b)) do update set user_a=excluded.user_a
    returning id
  `,[a,b])).rows[0];
  res.redirect('/chat/'+t.id);
});
router.get('/chat/:threadId', requireAuth, async (req,res)=>{
  const me = req.session.user.id;
  const id = +req.params.threadId;
  const t = (await pool.query('select * from threads where id=$1', [id])).rows[0];
  if(!t || (t.user_a!==me && t.user_b!==me)) return res.status(403).send('Acesso negado');
  res.render('chat', { threadId:id });
});

// REST auxiliar
router.get('/api/threads/:id/messages', requireAuth, async (req,res)=>{
  const id = +req.params.id;
  const rows = (await pool.query('select * from messages where thread_id=$1 order by created_at asc limit 200', [id])).rows;
  res.json(rows);
});
router.post('/api/threads/:id/read', requireAuth, async (req,res)=>{
  const id = +req.params.id;
  const me = req.session.user.id;
  await pool.query('update messages set read_at=now() where thread_id=$1 and from_user_id<>$2 and read_at is null', [id, me]);
  res.json({ ok:true });
});

router.get('/discover', async (req, res) => {
  res.render('discover', { });
});

router.get('/projects', requireAuth, (req, res) => {
  res.render('create');
});

export default router;
