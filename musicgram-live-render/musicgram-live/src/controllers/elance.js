import pool from '../db/pool.js';

const meId = (req) => (req?.session?.user?.id) || (req?.user?.id);

function relationMissing(err) {
  return err && err.code === '42P01'; // Postgres: relation does not exist
}

/* -------------------- FEED -------------------- */
export async function home(req, res, next) {
  try {
    const me = meId(req) || 0;
    const { rows: posts } = await pool.query(`
      SELECT p.id, p.body, p.created_at,
             u.id AS author_id, COALESCE(u.name, u.username) AS author_name, u.username
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1
         OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id=$1)
      ORDER BY p.created_at DESC
      LIMIT 50`, [me]);
    return res.render('index', { posts, active:'home', title:'Elance · Home' });
  } catch (err) {
    if (relationMissing(err)) {
      // Banco sem tabelas ainda: mostra feed vazio com aviso suave
      return res.render('index', { posts: [], active:'home', title:'Elance · Home' });
    }
    return next(err);
  }
}

/* -------------------- DISCOVER -------------------- */
export async function discover(req, res, next) {
  try {
    const me = meId(req) || 0;
    const q = (req.query.q || '').trim();
    const params = [me];
    let sql = `
      SELECT u.id, COALESCE(u.name,u.username) AS name, u.username,
             COALESCE(fc.cnt,0) AS followers
      FROM users u
      LEFT JOIN (SELECT following_id, COUNT(*) cnt FROM follows GROUP BY following_id) fc
        ON fc.following_id = u.id
      WHERE u.id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.id
        )`;
    if (q) { params.push('%'+q.toLowerCase()+'%'); sql += ` AND (LOWER(u.name) LIKE $2 OR LOWER(u.username) LIKE $2)`; }
    sql += ` ORDER BY followers DESC NULLS LAST, name ASC LIMIT 20`;
    const { rows: suggested } = await pool.query(sql, params);
    return res.render('discover', { suggested, q, active:'discover', title:'Elance · Discover' });
  } catch (err) {
    if (relationMissing(err)) {
      return res.render('discover', { suggested: [], q: (req.query.q||''), active:'discover', title:'Elance · Discover' });
    }
    return next(err);
  }
}

/* -------------------- NETWORK -------------------- */
export async function network(req, res, next) {
  try {
    const me = meId(req);
    if (!me) return res.redirect('/login');
    const [following, followers] = await Promise.all([
      pool.query(`SELECT u.id, COALESCE(u.name,u.username) AS name, u.username
                  FROM follows f JOIN users u ON u.id=f.following_id
                  WHERE f.follower_id=$1 ORDER BY name ASC`, [me]),
      pool.query(`SELECT u.id, COALESCE(u.name,u.username) AS name, u.username
                  FROM follows f JOIN users u ON u.id=f.follower_id
                  WHERE f.following_id=$1 ORDER BY name ASC`, [me]),
    ]);
    return res.render('network', {
      following: following.rows, followers: followers.rows,
      active:'network', title:'Elance · Network'
    });
  } catch (err) {
    if (relationMissing(err)) {
      return res.render('network', { following: [], followers: [], active:'network', title:'Elance · Network' });
    }
    return next(err);
  }
}

/* -------------------- FOLLOW / UNFOLLOW -------------------- */
export async function follow(req, res, next) {
  try {
    const me = meId(req); const other = parseInt(req.params.id,10);
    if(!me || !other || me===other) return res.redirect('back');
    await pool.query(`INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [me, other]);
    return res.redirect('back');
  } catch (err) {
    return next(err);
  }
}

export async function unfollow(req, res, next) {
  try {
    const me = meId(req); const other = parseInt(req.params.id,10);
    if(!me || !other) return res.redirect('back');
    await pool.query(`DELETE FROM follows WHERE follower_id=$1 AND following_id=$2`, [me, other]);
    return res.redirect('back');
  } catch (err) {
    return next(err);
  }
}

/* -------------------- LIKES & COMMENTS -------------------- */
export async function like(req, res, next) {
  try {
    const me = meId(req); const postId = parseInt(req.params.id,10);
    if(!me || !postId) return res.redirect('back');
    await pool.query(`INSERT INTO likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [me, postId]);
    return res.redirect('back');
  } catch (err) { return next(err); }
}

export async function unlike(req, res, next) {
  try {
    const me = meId(req); const postId = parseInt(req.params.id,10);
    if(!me || !postId) return res.redirect('back');
    await pool.query(`DELETE FROM likes WHERE user_id=$1 AND post_id=$2`, [me, postId]);
    return res.redirect('back');
  } catch (err) { return next(err); }
}

export async function comment(req, res, next) {
  try {
    const me = meId(req); const postId = parseInt(req.params.id,10);
    const body = (req.body.body||'').trim();
    if(!me || !postId || !body) return res.redirect('back');
    await pool.query(`INSERT INTO comments(post_id,user_id,body) VALUES($1,$2,$3)`, [postId, me, body]);
    return res.redirect('back');
  } catch (err) { return next(err); }
}
