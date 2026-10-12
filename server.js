const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const QRCode=require('qrcode');
const questions=require('./questions');
const questions9=require('./questions9');
const getQuestions=room=>room.quiz==='saresp'?questions9:questions;
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static('public'));
app.get('/health',(req,res)=>res.send('ok'));
const rooms=new Map();
const SKILLS=['Compreensão leitora','Interpretação literária','Ancestralidade e identidade','Protagonismo e representatividade'];
function assessment(room){
 const students=[...room.players.values()];
 const currentQuestions=getQuestions(room);
 const qs=currentQuestions.map((q,i)=>{
  const answers=students.map(p=>p.answers[i]).filter(x=>x!==null);
  const correct=answers.filter(x=>x.correct).length;
  return {index:i+1,q:q.q,skill:q.skill,code:q.code,correct,responded:answers.length,total:students.length,rate:answers.length?Math.round(correct/answers.length*100):null};
 });
 const skills=[...new Set(currentQuestions.map(q=>q.skill))].map(skill=>{
  const subset=qs.filter(q=>q.skill===skill);
  const correct=subset.reduce((n,q)=>n+q.correct,0),responded=subset.reduce((n,q)=>n+q.responded,0);
  return {skill,correct,responded,rate:responded?Math.round(correct/responded*100):null};
 });
 return {participants:students.length,questions:qs,skills,students:students.map(p=>{
  const correct=p.answers.filter(a=>a?.correct).length,answered=p.answers.filter(a=>a!==null).length;
  return {name:p.name,correct,answered,total:currentQuestions.length,percent:Math.round(correct/currentQuestions.length*100),answers:p.answers.map(a=>a?{choice:a.choice,correct:a.correct}:null),reflections:p.reflections};
 })};
}
const safeName=x=>String(x||'').trim().slice(0,24).replace(/[<>]/g,'');
const leaderboard=room=>[...room.players.values()].map(p=>({name:p.name,score:p.score,id:p.id})).sort((a,b)=>b.score-a.score).map(({name,score},i)=>({name,score,place:i+1}));
function broadcast(room){io.to(room.pin).emit('roster',{count:room.players.size,players:leaderboard(room)});}
function questionPayload(room){const x=getQuestions(room)[room.index];return {index:room.index+1,total:getQuestions(room).length,q:x.q,a:x.a,duration:room.quiz==='saresp'?40:30,skill:x.skill,code:x.code,emoji:x.emoji||'',art:x.art||'',visual:x.visual||0};}
function reveal(room){if(room.status!=='question')return;room.status='reveal';clearTimeout(room.timer);const x=getQuestions(room)[room.index];io.to(room.pin).emit('reveal',{correct:x.c,correctText:x.a[x.c],explanation:x.e,skill:x.skill,ranking:leaderboard(room)});io.to(room.host).emit('teacherReport',assessment(room));}
function finish(room){room.status='finished';io.to(room.pin).emit('finished',{ranking:leaderboard(room)});io.to(room.host).emit('teacherReport',assessment(room));}
io.on('connection',socket=>{
 socket.on('create',async(data,cb)=>{
  const quiz=data?.quiz==='saresp'?'saresp':'prince';
  let pin;do{pin=String(Math.floor(100000+Math.random()*900000));}while(rooms.has(pin));
  const room={pin,quiz,host:socket.id,players:new Map(),index:-1,status:'lobby',timer:null,answered:new Set(),deadline:0};rooms.set(pin,room);socket.join(pin);socket.data={pin,host:true};
  const joinUrl=(process.env.PUBLIC_URL||'').replace(/\/$/,'') || undefined;
  const target=(joinUrl||socket.handshake.headers.origin||'http://localhost:3000')+(quiz==='saresp'?'/saresp.html':'/')+'?pin='+pin;
  const qr=await QRCode.toDataURL(target,{width:250,margin:1});cb({ok:true,pin,joinUrl:target,qr});
 });
 socket.on('join',({pin,name},cb)=>{
  const room=rooms.get(String(pin||''));name=safeName(name);
  if(!room)return cb({error:'Código não encontrado.'});
  if(room.status!=='lobby')return cb({error:'Esta partida já começou. Aguarde a próxima.'});
  if(!name)return cb({error:'Digite seu nome ou apelido.'});
  if(room.players.size>=100)return cb({error:'Sala cheia (máximo 100).'});
  if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return cb({error:'Escolha outro nome: esse já está em uso.'});
  socket.join(room.pin);socket.data={pin:room.pin,host:false};room.players.set(socket.id,{name,score:0,id:socket.id,answers:Array(getQuestions(room).length).fill(null),reflections:['',''],connected:true});cb({ok:true,pin:room.pin,name});broadcast(room);
 });
 socket.on('start',()=>{const r=rooms.get(socket.data?.pin);if(!r||r.host!==socket.id||r.status!=='lobby')return;r.index=0;launch(r);});
 socket.on('next',()=>{const r=rooms.get(socket.data?.pin);if(!r||r.host!==socket.id||r.status!=='reveal')return;if(r.index===getQuestions(r).length-1)finish(r);else{r.index++;launch(r);}});
 socket.on('answer',(choice,cb)=>{
  const r=rooms.get(socket.data?.pin),p=r?.players.get(socket.id);
  if(!r||!p||r.status!=='question'||r.answered.has(socket.id)||!Number.isInteger(choice)||choice<0||choice>3)return cb?.({ok:false});
  r.answered.add(socket.id);p.answers[r.index]={choice,correct:choice===getQuestions(r)[r.index].c};if(choice===getQuestions(r)[r.index].c)p.score+=1000+Math.max(0,Math.ceil((r.deadline-Date.now())/100));
  cb?.({ok:true});io.to(r.host).emit('answered',{count:r.answered.size,total:r.players.size});
  if([...r.players.values()].filter(p=>p.connected).every(p=>r.answered.has(p.id)))reveal(r);
 });
 socket.on('reflection',(answers,cb)=>{
  const r=rooms.get(socket.data?.pin),p=r?.players.get(socket.id);
  if(!r||!p||r.status!=='finished'||!Array.isArray(answers)||answers.length!==2)return cb?.({ok:false});
  p.reflections=answers.map(x=>String(x||'').trim().slice(0,500));
  io.to(r.host).emit('teacherReport',assessment(r));
  cb?.({ok:true});
 });
 socket.on('disconnect',()=>{const r=rooms.get(socket.data?.pin);if(!r)return;if(r.host===socket.id){clearTimeout(r.timer);io.to(r.pin).emit('closed');rooms.delete(r.pin);}else{const p=r.players.get(socket.id);if(r.status==='lobby')r.players.delete(socket.id);else if(p)p.connected=false;broadcast(r);if(r.status==='question'&&[...r.players.values()].filter(p=>p.connected).every(p=>r.answered.has(p.id)))reveal(r);}});
});
function launch(r){r.status='question';r.answered=new Set();const duration=r.quiz==='saresp'?40000:30000;r.deadline=Date.now()+duration;io.to(r.pin).emit('question',{...questionPayload(r),deadline:r.deadline});io.to(r.host).emit('answered',{count:0,total:r.players.size});r.timer=setTimeout(()=>reveal(r),duration);}
server.listen(process.env.PORT||3000,()=>console.log('Quiz pronto na porta '+(process.env.PORT||3000)));
