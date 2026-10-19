(() => {
  const socket = io();
  const $ = (id) => document.getElementById(id);
  const homeView=$('homeView'), roomView=$('roomView'), createPanel=$('createPanel'), joinPanel=$('joinPanel');
  let state=null, privateRole=null, toastTimer=null, countdownTimer=null, soundOn=true, audioCtx=null;
  const esc = (s='') => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function beep(freq=520,duration=.07){ if(!soundOn)return; try{ audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)(); const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.start();o.stop(audioCtx.currentTime+duration);}catch(_){} }
  function toast(message,type='error'){const el=$('toast');el.textContent=message;el.className='toast show '+type;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='toast',3000);if(type==='error')beep(180,.12);else beep(650,.06);}
  function openPanel(which){createPanel.classList.toggle('hidden',which!=='create');joinPanel.classList.toggle('hidden',which!=='join');}
  $('showCreate').addEventListener('click',()=>openPanel('create'));
  $('showJoin').addEventListener('click',()=>openPanel('join'));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.add('hidden')));
  $('createButton').addEventListener('click',()=>{const name=$('createName').value.trim();if(!name)return toast('Escribe tu nombre primero.');socket.emit('create-room',{name});});
  $('joinButton').addEventListener('click',()=>{const name=$('joinName').value.trim(),code=$('roomCode').value.trim().toUpperCase();if(!name)return toast('Escribe tu nombre primero.');if(code.length<4)return toast('Escribe un código de sala válido.');socket.emit('join-room',{name,code});});
  $('roomCode').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6));
  $('createName').addEventListener('keydown',e=>{if(e.key==='Enter')$('createButton').click()});
  $('joinName').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinButton').click()});
  $('roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')$('joinButton').click()});
  $('copyCode').addEventListener('click',async()=>{if(!state)return;try{await navigator.clipboard.writeText(state.code);toast('Código copiado. Pásaselo a tus amigos.','success')}catch(_){toast('Tu código es: '+state.code,'success')}});
  $('startButton').addEventListener('click',()=>socket.emit('start-game'));
  $('leaveButton').addEventListener('click',()=>{if(confirm('¿Seguro que quieres salir de la sala?')){socket.emit('leave-room');state=null;privateRole=null;homeView.classList.remove('hidden');roomView.classList.add('hidden');openPanel(null);}});
  $('soundToggle').addEventListener('click',()=>{soundOn=!soundOn;$('soundToggle').textContent=soundOn?'♫':'♩';toast(soundOn?'Sonido activado':'Sonido desactivado','success')});
  socket.on('private-role',r=>{privateRole=r;beep(r.role==='infiltrado'?280:740,.13)});
  socket.on('toast',data=>toast(data.message,data.type||'error'));
  socket.on('connect',()=>{});
  socket.on('disconnect',()=>toast('Se perdió la conexión. Intentando reconectar…'));
  socket.on('state',s=>{state=s;homeView.classList.add('hidden');roomView.classList.remove('hidden');render();});
  function playerById(id){return state?.players.find(p=>p.id===id)}
  function render(){if(!state)return;
    $('roomTitle').textContent=state.phase==='lobby'?'Tu escuadrón.':state.phase==='gameover'?'Fin de la partida.':'Que empiece el juego.';
    $('roomEyebrow').textContent='SALA PRIVADA / '+(state.phase==='lobby'?'EN ESPERA':state.phase==='gameover'?'PARTIDA TERMINADA':'RONDA '+String(state.round).padStart(2,'0'));
    $('copyCode').innerHTML=esc(state.code)+' <span>▣</span>';
    $('playerCount').textContent=`Jugadores (${state.players.length}/8)`;
    $('roomStatus').innerHTML=`<i></i> ${state.phase==='lobby'?'EN ESPERA':state.phase==='clues'?'PISTAS':state.phase==='voting'?'VOTACIÓN':state.phase==='results'?'RESULTADOS':'FINALIZADO'}`;
    $('playersGrid').innerHTML=state.players.map((p,i)=>`<div class="player-card"><div class="player-top"><span>PLAYER 0${i+1}</span><span>${p.host?'<b class="host-tag">HOST</b>':p.connected?'●':'○'}</span></div><div class="avatar">${esc(p.name.slice(0,1).toUpperCase())}</div><div><div class="player-name">${esc(p.name)}${p.id===state.me?.id?' (tú)':''}</div><div class="player-sub">${state.phase==='lobby'?'LISTO PARA JUGAR':`${p.score} PTS`}</div></div></div>`).join('')+Array.from({length:Math.max(0,8-state.players.length)},()=>'<div class="empty-slot">＋ ESPERANDO</div>').join('');
    $('waitingText').textContent=state.players.length<2?`Falta ${2-state.players.length} jugador para empezar.`:state.players.length===2?'Modo duelo activado: ya pueden empezar.':state.hostId===state.me?.id?'Ya estáis. ¡Dale cuando quieras!':'Ya podéis empezar. Esperando al anfitrión…';
    $('startButton').disabled=!state.canStart||state.hostId!==state.me?.id;
    $('startButton').innerHTML=state.players.length<2?`Falta 1 jugador`:'Empezar partida <span>↗</span>';
    $('lobbyControls').classList.toggle('hidden',state.phase!=='lobby');
    $('gameArea').classList.toggle('hidden',state.phase==='lobby');
    if(state.phase!=='lobby')renderGame();
  }
  function renderGame(){const area=$('gameArea'); if(!state)return;
    if(state.phase==='gameover'){
      const ranking=[...state.players].sort((a,b)=>b.score-a.score);
      area.innerHTML=`<div class="end-screen"><div class="trophy">✳</div><div class="eyebrow" style="justify-content:center">FIN DE LA PARTIDA / ARCHIVO CERRADO</div><h2>Se acabó el teatro.</h2><p>Estas son las personas que mejor jugaron sus cartas.</p><table class="score-table">${ranking.map((p,i)=>`<tr><td>${i===0?'✦':String(i+1).padStart(2,'0')} &nbsp; ${esc(p.name)}${p.id===state.hostId?' · HOST':''}</td><td>${p.score} PTS</td></tr>`).join('')}</table>${state.hostId===state.me?.id?'<button class="button button-primary" id="playAgain">Jugar otra vez ↗</button>':'<p>El anfitrión puede iniciar otra partida.</p>'}</div>`;
      $('playAgain')?.addEventListener('click',()=>socket.emit('play-again'));return;
    }
    const seconds=state.deadline?Math.max(0,Math.ceil((state.deadline-Date.now())/1000)):null;
    const timer=`<span class="timer ${seconds!==null&&seconds<=10?'urgent':''}" id="countdown">${seconds===null?'EN CURSO':`◷ ${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}</span>`;
    const roundHead=`<div class="game-topline"><span class="round-tag">RONDA ${String(state.round).padStart(2,'0')} / ${state.maxRounds}</span>${timer}</div>`;
    if(state.phase==='clues'){
      const orderPlayer=playerById(state.clueOrder[state.clueIndex]);const myTurn=state.clueOrder[state.clueIndex]===state.me?.id;const role=privateRole||{role:state.me?.role,word:state.me?.word,category:state.me?.category};
      const roleCard=role.role==='infiltrado'?`<div class="secret-card"><div class="secret-label">TU IDENTIDAD / MANTÉN LA CALMA</div><div class="secret-word infiltrator">Eres el infiltrado.</div><div class="secret-category">Categoría general: ${esc(role.category||state.me?.category||'???')}. Escucha y disimula.</div></div>`:`<div class="secret-card"><div class="secret-label">TU PALABRA SECRETA / NO LA REVELES</div><div class="secret-word">${esc(role.word||state.me?.word||'Cargando…')}</div><div class="secret-category">Categoría: ${esc(role.category||state.me?.category||'???')}</div></div>`;
      area.innerHTML=roundHead+`<h2 class="phase-title">Di algo. No demasiado.</h2><p class="phase-desc">Cada persona tiene que dar una pista corta relacionada con su palabra. El infiltrado tendrá que improvisar. No digas la palabra exacta.</p>`+roleCard+`<div class="turn-banner ${myTurn?'':'wait'}">${myTurn?'✳ ES TU TURNO. Escribe una pista breve.':`⌁ Turno de ${esc(orderPlayer?.name||'otro jugador')}. Presta atención.`}</div>${myTurn?'<form class="clue-form" id="clueForm"><input id="clueInput" maxlength="80" placeholder="Escribe tu pista…" autocomplete="off" required><button class="button button-primary" type="submit">Enviar ↗</button></form>':''}<div class="eyebrow" style="margin-top:24px">PISTAS DEL GRUPO (${state.clues.length}/${state.players.length})</div><div class="clue-list">${state.clues.length?state.clues.map(c=>`<div class="clue-row"><div class="clue-avatar">${esc(c.name.slice(0,1).toUpperCase())}</div><div class="clue-body"><div class="clue-name">${esc(c.name)} ${c.id===state.me?.id?'· TÚ':''}</div><div class="clue-text">${esc(c.text)}</div></div></div>`).join(''):'<p class="phase-desc">Todavía no hay pistas. El silencio también es sospechoso.</p>'}</div>`;
      $('clueForm')?.addEventListener('submit',e=>{e.preventDefault();const input=$('clueInput');if(input.value.trim()){socket.emit('submit-clue',{text:input.value});input.disabled=true;beep(600,.05)}});
    } else if(state.phase==='voting'){
      const already=state.voted.includes(state.me?.id);const role=privateRole||{role:state.me?.role,word:state.me?.word};
      area.innerHTML=roundHead+`<h2 class="phase-title">¿Quién está improvisando?</h2><p class="phase-desc">Repasa las pistas y elige a la persona que crees que es el infiltrado. No puedes votarte a ti mismo. ${already?'Tu voto ya está registrado.':''}</p><div class="clue-list">${state.clues.map(c=>`<div class="clue-row"><div class="clue-avatar">${esc(c.name.slice(0,1).toUpperCase())}</div><div class="clue-body"><div class="clue-name">${esc(c.name)}</div><div class="clue-text">${esc(c.text)}</div></div></div>`).join('')}</div><div class="eyebrow" style="margin:24px 0 12px">EMITE TU VOTO</div><div class="vote-grid">${state.players.filter(p=>p.id!==state.me?.id).map(p=>`<button class="vote-card" data-vote="${esc(p.id)}" ${already?'disabled':''}><div class="avatar">${esc(p.name.slice(0,1).toUpperCase())}</div><div style="min-width:0"><b>${esc(p.name)}</b><span>${already?'VOTO CERRADO':'VOTAR A ESTA PERSONA'}</span></div></button>`).join('')}</div>${already?'<div class="turn-banner">✓ Voto registrado. Esperando al resto del grupo…</div>':''}`;
      area.querySelectorAll('[data-vote]').forEach(b=>b.addEventListener('click',()=>{if(confirm(`¿Votar por ${playerById(b.dataset.vote)?.name||'este jugador'}? No podrás cambiar tu voto.`)){socket.emit('vote',{playerId:b.dataset.vote});beep(330,.09)}}));
    } else if(state.phase==='results'){
      const r=state.result||{};const imp=playerById(r.infiltratorId);const accused=playerById(r.accusedId);const ranking=[...state.players].sort((a,b)=>b.score-a.score);
      area.innerHTML=roundHead+`<div class="result-banner ${r.caught?'':'bad'}"><h3>${r.caught?'✳ ¡Infiltrado descubierto!':'☻ El infiltrado escapó.'}</h3><p>${esc(r.message||'La ronda ha terminado.')}${r.tie?' Hubo empate o nadie recibió votos.':''}</p></div><div class="result-role"><div class="role-card highlight"><span>EL INFILTRADO ERA</span><b>${esc(imp?.name||'Desconocido')}</b></div><div class="role-card"><span>LA PALABRA ERA</span><b>${esc(r.word||'—')}</b></div></div>${accused?`<p class="phase-desc">El grupo votó principalmente por <b>${esc(accused.name)}</b>.</p>`:''}<div class="eyebrow">MARCADOR ACTUAL</div><table class="score-table">${ranking.map((p,i)=>`<tr><td>${i===0?'✦':String(i+1).padStart(2,'0')} &nbsp; ${esc(p.name)}</td><td>${p.score} PTS</td></tr>`).join('')}</table>${state.hostId===state.me?.id?`<button class="button button-primary" id="nextRound">${state.round>=state.maxRounds?'Ver resultados finales':'Siguiente ronda'} <span>↗</span></button>`:'<div class="turn-banner wait">Esperando a que el anfitrión continúe…</div>'}`;
      $('nextRound')?.addEventListener('click',()=>socket.emit('next-round'));
    }
    startCountdown();
  }
  function startCountdown(){clearInterval(countdownTimer);if(!state?.deadline)return;countdownTimer=setInterval(()=>{const el=$('countdown');if(!el||!state?.deadline){clearInterval(countdownTimer);return;}const s=Math.max(0,Math.ceil((state.deadline-Date.now())/1000));el.textContent=`◷ ${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;el.classList.toggle('urgent',s<=10);},250);}
})();
