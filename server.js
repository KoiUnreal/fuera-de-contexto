const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_, res) => res.json({ ok: true }));

const W = 1200, H = 760, R = 18, SPEED = 250, BULLET_SPEED = 620;
const rooms = new Map();
const players = new Map();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const roomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();

function freshPlayer(socket, name) {
  return {
    id: socket.id, name: String(name || "Jugador").slice(0, 16),
    x: 0, y: 0, angle: 0, hp: 100, score: 0, kills: 0,
    alive: true, color: "#6ee7b7", lastShot: 0, lastDash: 0,
    keys: { up:false, down:false, left:false, right:false }, dash: false
  };
}
function publicPlayer(p) {
  return { id:p.id, name:p.name, x:p.x, y:p.y, angle:p.angle, hp:p.hp,
    score:p.score, kills:p.kills, alive:p.alive, color:p.color };
}
function roomState(room) {
  return {
    code: room.code, status: room.status, round: room.round,
    timeLeft: Math.max(0, Math.ceil((room.endsAt-Date.now())/1000)),
    players: [...room.players.values()].map(publicPlayer),
    bullets: room.bullets.map(b => ({id:b.id,x:b.x,y:b.y,angle:b.angle,owner:b.owner})),
    winner: room.winner || null
  };
}
function emitRoom(room) { io.to(room.code).emit("state", roomState(room)); }
function resetRound(room) {
  room.bullets = [];
  const ps = [...room.players.values()];
  ps.forEach((p, i) => {
    p.x = i === 0 ? 150 : W-150; p.y = H/2;
    p.hp = 100; p.alive = true;
    p.color = i === 0 ? "#6ee7b7" : "#fb7185";
    p.keys = {up:false,down:false,left:false,right:false}; p.dash = false;
  });
  room.status = ps.length === 2 ? "playing" : "waiting";
  room.endsAt = Date.now() + 90000;
  room.winner = null;
}
function finishRound(room, winner) {
  if (room.status !== "playing") return;
  room.status = "ended";
  room.winner = winner ? { id:winner.id, name:winner.name } : { id:null, name:"Empate" };
  if (winner) winner.score += 1;
  emitRoom(room);
  io.to(room.code).emit("roundOver", { winner:room.winner, scores:[...room.players.values()].map(p=>({id:p.id,name:p.name,score:p.score})) });
}

io.on("connection", socket => {
  socket.on("createRoom", ({name} = {}, cb = () => {}) => {
    const code = roomCode();
    const room = { code, players:new Map(), bullets:[], status:"waiting", round:1, endsAt:0, winner:null, nextBullet:1 };
    const p = freshPlayer(socket, name);
    room.players.set(socket.id, p); rooms.set(code, room); players.set(socket.id, code);
    socket.join(code);
    cb({ok:true, code, id:socket.id});
    emitRoom(room);
  });

  socket.on("joinRoom", ({code,name} = {}, cb = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb({ok:false,error:"No existe esa sala."});
    if (room.players.size >= 2) return cb({ok:false,error:"La arena está llena. Es una partida 1 vs 1."});
    if (room.status === "playing") return cb({ok:false,error:"La partida ya comenzó."});
    const p = freshPlayer(socket, name);
    room.players.set(socket.id, p); players.set(socket.id, code); socket.join(code);
    resetRound(room);
    cb({ok:true, code, id:socket.id});
    io.to(code).emit("notice", "¡Duelo iniciado! El primero en ganar 3 rondas se lleva la partida.");
    emitRoom(room);
  });

  socket.on("input", data => {
    const code = players.get(socket.id), room = rooms.get(code), p = room?.players.get(socket.id);
    if (!p || room.status !== "playing" || !data) return;
    const k = data.keys || {};
    p.keys = {up:!!k.up,down:!!k.down,left:!!k.left,right:!!k.right};
    if (Number.isFinite(data.angle)) p.angle = data.angle;
    if (data.dash) p.dash = true;
    if (data.shoot && Date.now()-p.lastShot > 260 && p.alive) {
      p.lastShot = Date.now();
      room.bullets.push({id:room.nextBullet++, owner:p.id, x:p.x+Math.cos(p.angle)*25, y:p.y+Math.sin(p.angle)*25, angle:p.angle, born:Date.now()});
    }
  });

  socket.on("rematch", () => {
    const code = players.get(socket.id), room = rooms.get(code);
    if (!room || room.players.size !== 2 || room.status !== "ended") return;
    if (!room.rematchVotes) room.rematchVotes = new Set();
    room.rematchVotes.add(socket.id);
    io.to(code).emit("rematchVotes", room.rematchVotes.size);
    if (room.rematchVotes.size === 2) {
      room.round = 1;
      for (const p of room.players.values()) { p.score=0; p.kills=0; }
      room.rematchVotes.clear();
      resetRound(room); emitRoom(room);
    }
  });

  socket.on("disconnect", () => {
    const code = players.get(socket.id), room = rooms.get(code);
    players.delete(socket.id);
    if (!room) return;
    room.players.delete(socket.id);
    if (room.rematchVotes) room.rematchVotes.delete(socket.id);
    if (room.players.size === 0) rooms.delete(code);
    else {
      room.status = "waiting"; room.bullets = []; room.winner = null;
      io.to(code).emit("notice", "Tu rival se desconectó. Esperando a otro jugador…");
      emitRoom(room);
    }
  });
});

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now(), dt = Math.min((now-lastTick)/1000, 0.05); lastTick = now;
  for (const room of rooms.values()) {
    if (room.status !== "playing") continue;
    for (const p of room.players.values()) {
      if (!p.alive) continue;
      let dx = (p.keys.right?1:0)-(p.keys.left?1:0);
      let dy = (p.keys.down?1:0)-(p.keys.up?1:0);
      const mag = Math.hypot(dx,dy) || 1;
      let speed = SPEED;
      if (p.dash && now-p.lastDash > 1500) { speed = 650; p.lastDash=now; }
      p.dash = false;
      p.x = clamp(p.x + dx/mag*speed*dt, R+18, W-R-18);
      p.y = clamp(p.y + dy/mag*speed*dt, R+18, H-R-18);
    }
    room.bullets = room.bullets.filter(b => {
      b.x += Math.cos(b.angle)*BULLET_SPEED*dt;
      b.y += Math.sin(b.angle)*BULLET_SPEED*dt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H || now-b.born > 1600) return false;
      for (const p of room.players.values()) {
        if (p.id === b.owner || !p.alive) continue;
        if (Math.hypot(p.x-b.x,p.y-b.y) < R+6) {
          p.hp = Math.max(0,p.hp-25);
          if (p.hp === 0) {
            p.alive = false;
            const shooter = room.players.get(b.owner);
            if (shooter) shooter.kills++;
            const other = [...room.players.values()].find(q => q.id !== p.id);
            if (other) finishRound(room, other);
          }
          return false;
        }
      }
      return true;
    });
    if (room.status === "playing" && now >= room.endsAt) {
      const ps = [...room.players.values()].sort((a,b)=>a.hp-b.hp);
      finishRound(room, ps[0].hp === ps[1].hp ? null : ps[1]);
    }
    emitRoom(room);
  }
}, 1000/30);

server.listen(PORT, "0.0.0.0", () => console.log(`Duelo Arena activo en puerto ${PORT}`));
