const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const QRCode=require('qrcode');
const questions=require('./questions');
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static('public'));
app.get('/health',(req,res)=>res.send('ok'));
const rooms=new Map();
const safeName=x=>String(x||'').trim().slice(0,24).replace(/[<>]/g,'');
const leaderboard=room=>[...room.players.values()].map(p=>({name:p.name,score:p.score,id:p.id})).sort((a,b)=>b.score-a.score).map(({name,score},i)=>({name,score,place:i+1}));
function broadcast(room){io.to(room.pin).emit('roster',{count:room.players.size,players:leaderboard(room)});}
function questionPayload(room){const x=questions[room.index];return {index:room.index+1,total:questions.length,q:x.q,a:x.a,duration:30};}
function reveal(room){if(room.status!=='question')return;room.status='reveal';clearTimeout(room.timer);const x=questions[room.index];io.to(room.pin).emit('reveal',{correct:x.c,explanation:x.e,ranking:leaderboard(room)});}
function finish(room){room.status='finished';io.to(room.pin).emit('finished',{ranking:leaderboard(room)});}
io.on('connection',socket=>{
 socket.on('create',async(_,cb)=>{
  let pin;do{pin=String(Math.floor(100000+Math.random()*900000));}while(rooms.has(pin));
  const room={pin,host:socket.id,players:new Map(),index:-1,status:'lobby',timer:null,answered:new Set(),deadline:0};rooms.set(pin,room);socket.join(pin);socket.data={pin,host:true};
  const joinUrl=(process.env.PUBLIC_URL||'').replace(/\/$/,'') || undefined;
  const target=(joinUrl||socket.handshake.headers.origin||'http://localhost:3000')+'/?pin='+pin;
  const qr=await QRCode.toDataURL(target,{width:250,margin:1});cb({ok:true,pin,joinUrl:target,qr});
 });
 socket.on('join',({pin,name},cb)=>{
  const room=rooms.get(String(pin||''));name=safeName(name);
  if(!room)return cb({error:'Código não encontrado.'});
  if(room.status!=='lobby')return cb({error:'Esta partida já começou. Aguarde a próxima.'});
  if(!name)return cb({error:'Digite seu nome ou apelido.'});
  if(room.players.size>=100)return cb({error:'Sala cheia (máximo 100).'});
  if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return cb({error:'Escolha outro nome: esse já está em uso.'});
  socket.join(room.pin);socket.data={pin:room.pin,host:false};room.players.set(socket.id,{name,score:0,id:socket.id});cb({ok:true,pin:room.pin,name});broadcast(room);
 });
 socket.on('start',()=>{const r=rooms.get(socket.data?.pin);if(!r||r.host!==socket.id||r.status!=='lobby')return;r.index=0;launch(r);});
 socket.on('next',()=>{const r=rooms.get(socket.data?.pin);if(!r||r.host!==socket.id||r.status!=='reveal')return;if(r.index===questions.length-1)finish(r);else{r.index++;launch(r);}});
 socket.on('answer',(choice,cb)=>{
  const r=rooms.get(socket.data?.pin),p=r?.players.get(socket.id);
  if(!r||!p||r.status!=='question'||r.answered.has(socket.id)||!Number.isInteger(choice)||choice<0||choice>3)return cb?.({ok:false});
  r.answered.add(socket.id);if(choice===questions[r.index].c)p.score+=1000+Math.max(0,Math.ceil((r.deadline-Date.now())/100));
  cb?.({ok:true});io.to(r.host).emit('answered',{count:r.answered.size,total:r.players.size});
  if(r.answered.size===r.players.size)reveal(r);
 });
 socket.on('disconnect',()=>{const r=rooms.get(socket.data?.pin);if(!r)return;if(r.host===socket.id){clearTimeout(r.timer);io.to(r.pin).emit('closed');rooms.delete(r.pin);}else{r.players.delete(socket.id);broadcast(r);if(r.status==='question'&&r.answered.size>=r.players.size)reveal(r);}});
});
function launch(r){r.status='question';r.answered=new Set();r.deadline=Date.now()+30000;io.to(r.pin).emit('question',{...questionPayload(r),deadline:r.deadline});io.to(r.host).emit('answered',{count:0,total:r.players.size});r.timer=setTimeout(()=>reveal(r),30000);}
server.listen(process.env.PORT||3000,()=>console.log('Quiz pronto na porta '+(process.env.PORT||3000)));
