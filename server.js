const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'Fuera de Contexto' }));

const rooms = new Map();
const WORDS = [
  ['Tacos','Comida'],['Volcán','Naturaleza'],['Astronauta','Profesiones'],['Fantasma','Misterio'],['Aeropuerto','Lugares'],['Pingüino','Animales'],['Videoconsola','Tecnología'],['Boda','Eventos'],['Dentista','Profesiones'],['Acuario','Lugares'],['Cactus','Naturaleza'],['Telenovela','Entretenimiento'],['Cafetera','Objetos'],['Dragón','Fantasía'],['Montaña rusa','Lugares'],['Semáforo','Ciudad'],['Helado','Comida'],['Detective','Profesiones'],['Sirena','Fantasía'],['Biblioteca','Lugares'],['Robot','Tecnología'],['Tiburón','Animales'],['Paracaídas','Objetos'],['Festival','Eventos'],['Bruja','Fantasía'],['Champú','Objetos'],['Metro','Transporte'],['Pizza','Comida'],['Ping-pong','Deportes'],['Museo','Lugares'],['Cámara','Tecnología'],['Abogado','Profesiones'],['Luna','Espacio'],['Zoológico','Lugares'],['Patineta','Transporte'],['Chocolate','Comida'],['Pirata','Aventura'],['Cine','Entretenimiento'],['Tormenta','Naturaleza'],['Canguro','Animales']
];
const clamp = (n,min,max) => Math.max(min, Math.min(max,n));
const cleanName = (v) => String(v || '').trim().replace(/[<>]/g,'').slice(0,18);
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
function roomForSocket(socket) { return socket.data.roomCode ? rooms.get(socket.data.roomCode) : null; }
function playerList(room) { return room.players.map(p => ({ id:p.id, name:p.name, score:p.score, host:p.id===room.hostId, connected:io.sockets.sockets.has(p.id) })); }
function publicState(room, socketId) {
  const me = room.players.find(p => p.id === socketId);
  return {
    code: room.code, hostId: room.hostId, phase: room.phase, round: room.round,
    maxRounds: room.maxRounds, players: playerList(room), minPlayers: 2,
    canStart: room.players.length >= 2 && room.phase === 'lobby',
    settings: { clueSeconds: room.clueSeconds, voteSeconds: room.voteSeconds },
    me: me ? { id:me.id, name:me.name, score:me.score, role: room.phase !== 'lobby' && room.roles ? room.roles[me.id] : null, word: room.phase !== 'lobby' && room.roles ? (room.roles[me.id] === 'infiltrado' ? null : room.word) : null, category: room.phase !== 'lobby' && room.roles ? room.category : null } : null,
    clueOrder: room.clueOrder, clueIndex: room.clueIndex,
    clues: room.clues.map(c => ({ id:c.id, name:c.name, text:c.text })),
    votes: room.phase === 'results' ? room.votes : undefined,
    voteCounts: room.phase === 'results' ? room.voteCounts : undefined,
    voted: room.voted,
    deadline: room.deadline,
    result: room.result,
    hostCanAdvance: room.phase === 'results' && room.hostId === socketId
  };
}
function emitStates(room) { for (const p of room.players) io.to(p.id).emit('state', publicState(room,p.id)); }
function emitError(socket, message) { socket.emit('toast', { type:'error', message }); }
function clearTimer(room) { if (room.timer) clearTimeout(room.timer); room.timer = null; }
function startDeadline(room, seconds, callback) {
  clearTimer(room); room.deadline = Date.now() + seconds*1000;
  room.timer = setTimeout(callback, seconds*1000);
}
function beginRound(room) {
  clearTimer(room); room.round += 1; room.phase = 'clues'; room.result = null; room.votes = {}; room.voted = []; room.voteCounts = {}; room.clues = [];
  const chosen = WORDS[Math.floor(Math.random()*WORDS.length)]; room.word = chosen[0]; room.category = chosen[1];
  const shuffled = [...room.players].sort(() => Math.random()-.5); room.roles = {};
  shuffled.forEach((p,i) => room.roles[p.id] = i===0 ? 'infiltrado' : 'civil');
  room.clueOrder = [...room.players].sort(() => Math.random()-.5).map(p => p.id); room.clueIndex = 0;
  room.players.forEach(p => io.to(p.id).emit('private-role', { role:room.roles[p.id], word:room.roles[p.id]==='civil'?room.word:null, category:room.category }));
  startDeadline(room, room.clueSeconds, () => { if (room.phase==='clues') beginVoting(room); });
  emitStates(room);
}
function beginVoting(room) {
  clearTimer(room); room.phase = 'voting'; room.deadline = Date.now() + room.voteSeconds*1000;
  startDeadline(room, room.voteSeconds, () => resolveVotes(room)); emitStates(room);
}
function resolveVotes(room) {
  clearTimer(room); room.phase = 'results'; room.deadline = null;
  const counts = {}; Object.values(room.votes).forEach(id => counts[id]=(counts[id]||0)+1);
  room.voteCounts = counts;
  const max = Math.max(0,...Object.values(counts)); const leaders = Object.keys(counts).filter(id=>counts[id]===max);
  const accusedId = leaders.length===1 ? leaders[0] : null;
  const infiltratorId = Object.keys(room.roles).find(id=>room.roles[id]==='infiltrado');
  const caught = accusedId === infiltratorId;
  let reveal = 'empate';
  if (caught) { reveal='atrapado'; room.players.forEach(p=>p.score += p.id===infiltratorId ? 0 : 2); }
  else { reveal='escapó'; const imp = room.players.find(p=>p.id===infiltratorId); if (imp) imp.score += 4; }
  // Small participation point for casting a vote.
  room.players.forEach(p=>{ if(room.votes[p.id]) p.score += 1; });
  room.result = { reveal, accusedId, infiltratorId, caught, word:room.word, category:room.category, tie:!accusedId, message: caught ? '¡El grupo descubrió al infiltrado!' : 'El infiltrado se salió con la suya.' };
  emitStates(room);
}
function removePlayer(socket, disconnect=false) {
  const room = roomForSocket(socket); if (!room) return;
  room.players = room.players.filter(p=>p.id!==socket.id);
  if (!room.players.length) { clearTimer(room); rooms.delete(room.code); socket.data.roomCode=null; return; }
  if (room.hostId===socket.id) room.hostId=room.players[0].id;
  // If a player leaves mid-round, resolve gracefully by removing their role/vote/clue.
  delete room.roles?.[socket.id]; delete room.votes[socket.id];
  room.clues = room.clues.filter(c=>c.id!==socket.id); room.clueOrder = room.clueOrder.filter(id=>id!==socket.id);
  if (room.phase==='clues' && room.clueIndex>=room.clueOrder.length) beginVoting(room);
  if (room.phase==='voting' && room.players.every(p=>room.votes[p.id])) resolveVotes(room);
  emitStates(room); socket.data.roomCode=null;
  if (!disconnect) socket.leave(room.code);
}

io.on('connection', socket => {
  socket.on('create-room', ({name}={}) => {
    if (socket.data.roomCode) removePlayer(socket);
    let c; do { c=code(); } while(rooms.has(c));
    const player = { id:socket.id, name:cleanName(name)||'Jugador', score:0 };
    const room = { code:c, hostId:socket.id, players:[player], phase:'lobby', round:0, maxRounds:5, clueSeconds:60, voteSeconds:30, word:null, category:null, roles:null, clueOrder:[], clueIndex:0, clues:[], votes:{}, voted:[], voteCounts:{}, result:null, deadline:null, timer:null };
    rooms.set(c,room); socket.join(c); socket.data.roomCode=c; emitStates(room);
  });
  socket.on('join-room', ({code:raw,name}={}) => {
    const c=String(raw||'').trim().toUpperCase(); const room=rooms.get(c);
    if (!room) return emitError(socket,'No encontramos esa sala. Revisa el código.');
    if (room.phase!=='lobby') return emitError(socket,'La partida ya comenzó. Pide al anfitrión crear otra sala.');
    if (room.players.length>=8) return emitError(socket,'La sala está llena (máximo 8 jugadores).');
    if (socket.data.roomCode) removePlayer(socket);
    room.players.push({id:socket.id,name:cleanName(name)||'Jugador',score:0}); socket.join(c); socket.data.roomCode=c; emitStates(room);
  });
  socket.on('start-game', () => {
    const room=roomForSocket(socket); if(!room) return;
    if(room.hostId!==socket.id) return emitError(socket,'Solo el anfitrión puede iniciar la partida.');
    if(room.phase!=='lobby') return;
    if(room.players.length<2) return emitError(socket,'Necesitan al menos 2 jugadores para empezar.');
    room.players.forEach(p=>p.score=0); room.round=0; beginRound(room);
  });
  socket.on('submit-clue', ({text}={}) => {
    const room=roomForSocket(socket); if(!room || room.phase!=='clues') return;
    if(room.clueOrder[room.clueIndex]!==socket.id) return emitError(socket,'Todavía no es tu turno.');
    const clue=String(text||'').trim().replace(/[<>]/g,'').slice(0,80);
    if(!clue) return emitError(socket,'Escribe una pista antes de enviarla.');
    room.clues.push({id:socket.id,name:room.players.find(p=>p.id===socket.id)?.name||'Jugador',text:clue});
    room.clueIndex++;
    if(room.clueIndex>=room.clueOrder.length) beginVoting(room); else emitStates(room);
  });
  socket.on('vote', ({playerId}={}) => {
    const room=roomForSocket(socket); if(!room || room.phase!=='voting') return;
    if(room.votes[socket.id]) return emitError(socket,'Ya registraste tu voto.');
    if(!room.players.some(p=>p.id===playerId) || playerId===socket.id) return emitError(socket,'Elige a otro jugador.');
    room.votes[socket.id]=playerId; room.voted.push(socket.id);
    if(room.players.every(p=>room.votes[p.id])) resolveVotes(room); else emitStates(room);
  });
  socket.on('next-round', () => {
    const room=roomForSocket(socket); if(!room || room.phase!=='results') return;
    if(room.hostId!==socket.id) return emitError(socket,'Solo el anfitrión puede continuar.');
    if(room.round>=room.maxRounds) { room.phase='gameover'; room.deadline=null; emitStates(room); return; }
    beginRound(room);
  });
  socket.on('play-again', () => {
    const room=roomForSocket(socket); if(!room || room.phase!=='gameover') return;
    if(room.hostId!==socket.id) return emitError(socket,'Solo el anfitrión puede reiniciar.');
    room.players.forEach(p=>p.score=0); room.round=0; room.phase='lobby'; room.roles=null; room.clues=[]; room.result=null; emitStates(room);
  });
  socket.on('leave-room', () => removePlayer(socket));
  socket.on('disconnect', () => removePlayer(socket,true));
});
server.listen(PORT, () => console.log(`Fuera de Contexto listo en http://localhost:${PORT}`));
