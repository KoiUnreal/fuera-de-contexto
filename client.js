const socket = io();
const $ = id => document.getElementById(id);
const home = $("home"), waiting = $("waiting"), game = $("game");
const canvas = $("arena"), ctx = canvas.getContext("2d");
let myId = null, myCode = null, currentState = null, keys = {}, mouse = {x:600,y:380}, firing = false;
let dashPressed = false, lastDashUi = 0, toastTimer = null, roundVotes = 0;
const W=1200,H=760;

function show(section){[home,waiting,game].forEach(x=>x.classList.add("hidden"));section.classList.remove("hidden")}
function nameValue(){return $("playerName").value.trim() || "KOI_PLAYER"}
function reportError(msg){$("homeError").textContent=msg||""}
function callWithAck(event,data){return new Promise(resolve=>socket.emit(event,data,resolve))}
$("createBtn").onclick=async()=>{
  reportError("");
  const r=await callWithAck("createRoom",{name:nameValue()});
  if(!r?.ok)return reportError("No se pudo crear la sala. Inténtalo de nuevo.");
  myId=r.id;myCode=r.code;show(waiting);$("codeDisplay").textContent=r.code;$("hostName").textContent=nameValue();
};
$("joinBtn").onclick=async()=>{
  reportError("");
  const code=$("roomCode").value.trim().toUpperCase();
  if(code.length!==4)return reportError("Escribe un código de 4 caracteres.");
  const r=await callWithAck("joinRoom",{code,name:nameValue()});
  if(!r?.ok)return reportError(r?.error||"No se pudo entrar a la sala.");
  myId=r.id;myCode=r.code;show(game);
};
$("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4));
$("copyCode").onclick=async()=>{try{await navigator.clipboard.writeText(myCode);$("copyCode").textContent="COPIADO ✓"}catch{$("copyCode").textContent=myCode}};
$("cancelBtn").onclick=()=>location.reload();
$("nextBtn").onclick=()=>{
  if(currentState?.status==="ended"){socket.emit("rematch");$("nextBtn").textContent="ESPERANDO AL RIVAL…";$("nextBtn").disabled=true;}
};
socket.on("state",state=>{
  currentState=state;
  if(state.status==="waiting"){show(waiting);$("codeDisplay").textContent=state.code;const p=state.players.find(p=>p.id===myId);if(p)$("hostName").textContent=p.name;return;}
  show(game);
  updateHud(state);
  if(state.status==="ended")showOverlay(state);
  else {$("overlay").classList.add("hidden");$("nextBtn").disabled=false;$("nextBtn").textContent="CONTINUAR ↗";}
});
socket.on("notice",msg=>{if(!game.classList.contains("hidden"))showToast(msg);else $("waitMessage").textContent=msg;});
socket.on("roundOver",data=>{roundVotes=0;});
socket.on("rematchVotes",n=>{roundVotes=n; if(n<2){$("nextBtn").textContent=`ESPERANDO AL RIVAL… (${n}/2)`;$("nextBtn").disabled=true;}});
function updateHud(s){
  const mine=s.players.find(p=>p.id===myId), other=s.players.find(p=>p.id!==myId);
  $("p1Name").textContent=(mine?.name||"TÚ").toUpperCase();$("p1Score").textContent=mine?.score??0;
  $("p2Name").textContent=(other?.name||"RIVAL").toUpperCase();$("p2Score").textContent=other?.score??0;
  const t=s.timeLeft||0;$("timer").textContent=`${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;
  $("hpText").textContent=`${mine?.hp??100}%`;$("hpBar").style.width=`${mine?.hp??100}%`;
  $("hpBar").style.background=(mine?.hp??100)<35?"var(--red)":"var(--mint)";
  $("dashText").textContent=Date.now()-lastDashUi>1500?"DASH DISPONIBLE":"RECARGANDO";
  if(s.players.length<2){show(waiting);}
}
function showOverlay(s){
  const mine=s.players.find(p=>p.id===myId), other=s.players.find(p=>p.id!==myId);
  const winner=s.winner;
  const won=winner?.id===myId;
  $("overlayTitle").textContent=winner?.id===null?"DRAW.":won?"VICTORY.":"DEFEAT.";
  $("overlayTitle").style.color=winner?.id===null?"#f2f5f7":won?"var(--mint)":"var(--red)";
  $("overlayText").textContent=`${winner?.name||"Empate"} gana la ronda. Marcador ${mine?.score??0} — ${other?.score??0}.`;
  $("overlay").classList.remove("hidden");
  $("nextBtn").disabled=false;$("nextBtn").textContent="VOTAR REVANCHA ↗";
}
function showToast(msg){$("toast").textContent=msg;$("toast").classList.remove("hidden");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.add("hidden"),2600)}

function resizePointer(e){
  const r=canvas.getBoundingClientRect();
  mouse.x=(e.clientX-r.left)/r.width*W;mouse.y=(e.clientY-r.top)/r.height*H;
}
canvas.addEventListener("mousemove",resizePointer);
canvas.addEventListener("mousedown",e=>{resizePointer(e);firing=true;});
window.addEventListener("mouseup",()=>firing=false);
window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(["w","a","s","d"," ","arrowup","arrowdown","arrowleft","arrowright"].includes(k))e.preventDefault();
  if(k==="w"||k==="arrowup")keys.up=true;
  if(k==="s"||k==="arrowdown")keys.down=true;
  if(k==="a"||k==="arrowleft")keys.left=true;
  if(k==="d"||k==="arrowright")keys.right=true;
  if(k===" "&&!e.repeat){dashPressed=true;lastDashUi=Date.now();}
});
window.addEventListener("keyup",e=>{
  const k=e.key.toLowerCase();
  if(k==="w"||k==="arrowup")keys.up=false;
  if(k==="s"||k==="arrowdown")keys.down=false;
  if(k==="a"||k==="arrowleft")keys.left=false;
  if(k==="d"||k==="arrowright")keys.right=false;
});
window.addEventListener("blur",()=>{keys={};firing=false});

setInterval(()=>{
  if(!currentState||currentState.status!=="playing"||!myId)return;
  const mine=currentState.players.find(p=>p.id===myId);if(!mine?.alive)return;
  const angle=Math.atan2(mouse.y-mine.y,mouse.x-mine.x);
  socket.emit("input",{keys,angle,shoot:firing,dash:dashPressed});
  dashPressed=false;
},40);

function drawArena(){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle="#0d1114";ctx.fillRect(0,0,W,H);
  ctx.strokeStyle="#1b2329";ctx.lineWidth=1;
  for(let x=0;x<=W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  for(let y=0;y<=H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  // Arena edge and corner accents
  ctx.strokeStyle="#35423f";ctx.lineWidth=2;ctx.strokeRect(18,18,W-36,H-36);
  const corners=[[18,18,1,1],[W-18,18,-1,1],[18,H-18,1,-1],[W-18,H-18,-1,-1]];
  ctx.strokeStyle="#6ee7b7";ctx.lineWidth=3;
  corners.forEach(([x,y,sx,sy])=>{ctx.beginPath();ctx.moveTo(x+sx*24,y);ctx.lineTo(x,y);ctx.lineTo(x,y+sy*24);ctx.stroke()});
  // Central hazard ring
  ctx.beginPath();ctx.arc(W/2,H/2,88,0,Math.PI*2);ctx.strokeStyle="#252f34";ctx.setLineDash([5,10]);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.arc(W/2,H/2,5,0,Math.PI*2);ctx.fillStyle="#45534f";ctx.fill();
  if(!currentState){requestAnimationFrame(drawArena);return}
  for(const b of currentState.bullets||[]){
    ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fillStyle=b.owner===myId?"#a4f5d5":"#ff9cab";ctx.shadowBlur=16;ctx.shadowColor=ctx.fillStyle;ctx.fill();ctx.shadowBlur=0;
  }
  for(const p of currentState.players||[])drawPlayer(p);
  if(currentState.status==="waiting"){
    ctx.fillStyle="#0b0d10c9";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#6ee7b7";ctx.textAlign="center";ctx.font="700 24px 'Space Mono'";ctx.fillText("ESPERANDO A TU RIVAL",W/2,H/2);
  }
  requestAnimationFrame(drawArena);
}
function drawPlayer(p){
  const mine=p.id===myId, color=p.color||"#6ee7b7";
  ctx.save();ctx.translate(p.x,p.y);
  ctx.globalAlpha=p.alive?1:.28;
  // aim line
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(p.angle)*44,Math.sin(p.angle)*44);
  ctx.strokeStyle=color;ctx.globalAlpha=.38;ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=p.alive?1:.28;
  // outer ring
  ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.globalAlpha=.5;ctx.stroke();ctx.globalAlpha=p.alive?1:.28;
  // body
  ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=mine?22:14;ctx.fill();ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fillStyle="#0c1113";ctx.fill();
  ctx.beginPath();ctx.moveTo(Math.cos(p.angle)*5,Math.sin(p.angle)*5);ctx.lineTo(Math.cos(p.angle)*25,Math.sin(p.angle)*25);ctx.strokeStyle="#f4fff9";ctx.lineWidth=5;ctx.lineCap="round";ctx.stroke();
  ctx.restore();
  // name + health bar
  ctx.textAlign="center";ctx.font="700 12px 'Space Mono'";ctx.fillStyle="#eaf0f2";ctx.fillText(p.name.toUpperCase(),p.x,p.y-38);
  ctx.fillStyle="#283137";ctx.fillRect(p.x-27,p.y-30,54,4);
  ctx.fillStyle=p.hp<35?"#fb7185":color;ctx.fillRect(p.x-27,p.y-30,54*p.hp/100,4);
  if(!p.alive){ctx.fillStyle="#fb7185";ctx.font="10px 'Space Mono'";ctx.fillText("ELIMINADO",p.x,p.y+43)}
}
drawArena();
