export function setupSockets(io, sessionMiddleware){
  io.use((socket,next)=> sessionMiddleware(socket.request,{},next));
  const online = new Map(); // userId -> count of sockets

  io.on('connection', (socket) => {
    const sess = socket.request.session;
    const user = sess?.user;
    if(!user){ socket.disconnect(true); return; }

    // presence
    online.set(user.id, (online.get(user.id)||0) + 1);
    io.emit('presence', { userId:user.id, online:true });

    socket.on('join', room => socket.join(room));

    socket.on('chat:send', async ({ threadId, body }) => {
      if(!threadId || !body) return;
      const { pool } = await import('./db.js');
      const t = (await pool.query('select * from threads where id=$1', [threadId])).rows[0];
      if(!t || (t.user_a!==user.id && t.user_b!==user.id)) return;
      const row = (await pool.query('insert into messages(thread_id,from_user_id,body) values($1,$2,$3) returning *', [threadId, user.id, body])).rows[0];
      io.to('thread:'+threadId).emit('chat:newMessage', row);
    });

    socket.on('disconnect', () => {
      const left = (online.get(user.id)||1) - 1;
      if(left <= 0){ online.delete(user.id); io.emit('presence', { userId:user.id, online:false }); }
      else online.set(user.id, left);
    });
  });
}
