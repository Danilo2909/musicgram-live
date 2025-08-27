import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export async function migrate(){
  const c = await pool.connect();
  try{
    await c.query('BEGIN');
    await c.query(`
      create table if not exists users(
        id serial primary key,
        username text unique not null,
        name text not null,
        password_hash text not null,
        bio text,
        avatar_url text,
        last_seen timestamptz default now(),
        created_at timestamptz default now()
      );
      create index if not exists idx_users_username on users(lower(username));
    `);
    await c.query(`
      create table if not exists follows(
        id serial primary key,
        follower_id int not null references users(id) on delete cascade,
        following_id int not null references users(id) on delete cascade,
        created_at timestamptz default now(),
        unique (follower_id, following_id)
      );
      create index if not exists idx_follows_follower on follows(follower_id);
      create index if not exists idx_follows_following on follows(following_id);
    `);
    await c.query(`
      create table if not exists posts(
        id serial primary key,
        user_id int not null references users(id) on delete cascade,
        image_url text not null,
        caption text,
        created_at timestamptz default now()
      );
      create index if not exists idx_posts_user_created on posts(user_id, created_at desc);
    `);
    await c.query(`
      create table if not exists comments(
        id serial primary key,
        post_id int not null references posts(id) on delete cascade,
        user_id int not null references users(id) on delete cascade,
        text text not null,
        created_at timestamptz default now()
      );
      create index if not exists idx_comments_post_created on comments(post_id, created_at);
    `);
    await c.query(`
      create table if not exists threads(
        id serial primary key,
        user_a int not null references users(id) on delete cascade,
        user_b int not null references users(id) on delete cascade,
        created_at timestamptz default now(),
        constraint uniq_pair unique (least(user_a,user_b), greatest(user_a,user_b))
      );
    `);
    await c.query(`
      create table if not exists messages(
        id serial primary key,
        thread_id int not null references threads(id) on delete cascade,
        from_user_id int not null references users(id) on delete cascade,
        body text not null,
        created_at timestamptz default now(),
        read_at timestamptz
      );
      create index if not exists idx_messages_thread_created on messages(thread_id, created_at);
    `);
    await c.query('COMMIT');
  }catch(e){
    await c.query('ROLLBACK'); throw e;
  }finally{
    c.release();
  }
}
