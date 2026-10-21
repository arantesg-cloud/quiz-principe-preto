'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const seed = require('./questions.json');
const PORT = Number(process.env.PORT || 3000);
const APP_SECRET = process.env.APP_SECRET || 'somente-desenvolvimento-trocar-segredo';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'configurar-senha-admin';
const hasPostgres = Boolean(process.env.DATABASE_URL);
const pool = hasPostgres ? new (require('pg').Pool)({connectionString:process.env.DATABASE_URL,ssl:process.env.DB_SSL === 'true'? {rejectUnauthorized:false}:undefined,max:12}) : null;
const dataPath = path.join(process.env.DATA_DIR || __dirname, 'data-local.json');
let queue=Promise.resolve();
let localState;
const defaults=()=>({codes:{},banks:JSON.parse(JSON.stringify(seed))});
function safeInit(){if(!localState){try {localState=JSON.parse(fs.readFileSync(dataPath,'utf8'));}catch {localState=defaults();}}return localState;}
async function init(){
 if(pool){await pool.query('CREATE TABLE IF NOT EXISTS simulado_state (id integer PRIMARY KEY, payload jsonb NOT NULL)');
 await pool.query('INSERT INTO simulado_state (id,payload) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(defaults())]);}
 else {safeInit(); console.warn('MODO ARQUIVO LOCAL: no Render gratuito, o arquivo pode ser perdido ao reiniciar. Configure DATABASE_URL.');}
 if(ADMIN_PASSWORD==='configurar-senha-admin' || APP_SECRET==='somente-desenvolvimento-trocar-segredo')console.warn('ATENÇÃO: configure ADMIN_PASSWORD e APP_SECRET para uso público.');
}
async function transaction(fn,writing=true){
 if(pool){const conn=await pool.connect();try {await conn.query('BEGIN');const r=await conn.query(`SELECT payload FROM simulado_state WHERE id=1 ${writing?'FOR UPDATE':''}`);const s=r.rows[0].payload;const out=await fn(s);if(writing)await conn.query('UPDATE simulado_state SET payload=$1::jsonb WHERE id=1',[JSON.stringify(s)]);await conn.query('COMMIT');return out;}catch(e){await conn.query('ROLLBACK');throw e;}finally{conn.release();}}
 const run=async()=>{const s=safeInit();const out=await fn(s);if(writing){const temp=dataPath+'.tmp';fs.writeFileSync(temp,JSON.stringify(s));fs.renameSync(temp,dataPath);}return out;};
 const result=queue.then(run,run);queue=result.catch(()=>{});return result;
}
const originOk=r=>!r.headers.origin || (new URL(r.headers.origin).host===r.headers.host);
function json(res,code,body,headers={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body));}
const fail=(status,error)=>Object.assign(new Error(error),{status});
async function body(req){let str='';for await(const ch of req){str+=ch;if(str.length>200000)throw fail(413,'Dados muito extensos.');}try{return str?JSON.parse(str):{};}catch{throw fail(400,'Formato JSON inválido.');}}
const digest=str=>crypto.createHmac('sha256',APP_SECRET).update(str).digest('hex');
function sign(code){return Buffer.from(code,'utf8').toString('base64url')+'.'+digest(code);}
function studentCode(req){const c=/(?:^|;\s*)saresp_auth=([^;]+)/.exec(req.headers.cookie||'');if(!c)return null;const [b,hash]=decodeURIComponent(c[1]).split('.');if(!b||!hash)return null;let code;try{code=Buffer.from(b,'base64url').toString('utf8');}catch{return null;}const expected=digest(code);if(hash.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(expected)))return null;return code;}
function admin(req){const given=String(req.headers['x-admin-password']||'');if(!given)return false;const x=Buffer.from(digest(given));const y=Buffer.from(digest(ADMIN_PASSWORD));return crypto.timingSafeEqual(x,y);}
const randCode=()=>Array.from({length:10},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
const validDay=d=>['dia1','dia2'].includes(d);
const validGrade=g=>['6','7','9'].includes(String(g));
const nameClean=v=>String(v||'').trim().replace(/\s+/g,' ').slice(0,90);
const publicQuestion=q=>({area:q.area,habilidade:q.habilidade,texto:q.texto,enunciado:q.enunciado,alternativas:q.alternativas});
function validBank(arr){return Array.isArray(arr)&&arr.length>=1&&arr.length<=100 && arr.every(q=>q&&typeof q==='object'&&typeof q.area==='string'&&q.area.length<=90&&typeof q.enunciado==='string'&&q.enunciado.length>3&&q.enunciado.length<=3000&&typeof q.texto==='string'&&q.texto.length<=5000&&typeof q.habilidade==='string'&&q.habilidade.length<=300&&Array.isArray(q.alternativas)&&q.alternativas.length===4&&q.alternativas.every(x=>typeof x==='string'&&x.length>0&&x.length<=1000)&&Number.isInteger(q.correta)&&q.correta>=0&&q.correta<=3);}
function totals(bank,ans){const acertos={};const total={};for(let i=0;i<bank.length;i++){const a=bank[i].area;total[a]=(total[a]||0)+1;if(ans[String(i)]===bank[i].correta)acertos[a]=(acertos[a]||0)+1;}return {total:bank.length,acertos:Object.values(acertos).reduce((x,y)=>x+y,0),areas:Object.keys(total).map(area=>({area,total:total[area],acertos:acertos[area]||0}))};}
const limits=new Map();function throttle(req){const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0];const now=Date.now();let s=limits.get(ip);if(!s||now-s.t>60000){s={t:now,n:0};limits.set(ip,s);}s.n++;if(s.n>900)throw fail(429,'Muitas tentativas. Aguarde um minuto.');if(limits.size>3000)limits.clear();}
async function handle(req,res){
 const pathname=new URL(req.url,'http://localhost').pathname;const method=req.method;
 if(method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,persistente:hasPostgres});
 if(pathname==='/api/config'&&method==='GET')return json(res,200,{grades:['6','7','9'],dias:['dia1','dia2'],persistente:hasPostgres});
 if(pathname.startsWith('/api/')){
  if(method==='POST'){if(!originOk(req))throw fail(403,'Origem inválida.');throttle(req);}
  if(pathname==='/api/student/start'&&method==='POST'){
   const p=await body(req);const code=String(p.codigo||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const nome=nameClean(p.nome);if(nome.length<2||!code)throw fail(400,'Informe seu nome e o código individual.');
   const result=await transaction(s=>{const c=s.codes[code];if(!c)throw fail(404,'Código não encontrado. Verifique com o professor.');if(c.status==='done')throw fail(409,'Esse código já teve a prova finalizada. Não é possível realizar outra tentativa.');if(c.status==='active'&&c.nome.toLocaleLowerCase('pt-BR')!==nome.toLocaleLowerCase('pt-BR'))throw fail(409,'Este código já está em uso. Solicite apoio ao professor.');if(c.status==='new'){c.status='active';c.nome=nome;c.startedAt=new Date().toISOString();c.index=0;c.answers={};}return {ok:true};});
   return json(res,200,result,{'Set-Cookie':`saresp_auth=${encodeURIComponent(sign(code))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${(req.headers['x-forwarded-proto']==='https')?'; Secure':''}`});
  }
  if(pathname==='/api/student/state'&&method==='GET'){
   const code=studentCode(req);if(!code)throw fail(401,'Informe seu código para iniciar.');return json(res,200,await transaction(s=>{const c=s.codes[code];if(!c||c.status==='new')throw fail(401,'Acesso não iniciado.');const bank=s.banks[c.grade]?.[c.day]||[];return {nome:c.nome,turma:c.turma,grade:c.grade,day:c.day,index:c.index,total:bank.length,concluida:c.status==='done',question:c.status==='done'?null:publicQuestion(bank[c.index]),answerCount:Object.keys(c.answers).length};},false));
  }
  if(pathname==='/api/student/answer'&&method==='POST'){
   const code=studentCode(req);if(!code)throw fail(401,'Entre com seu código novamente.');const p=await body(req);
   const result=await transaction(s=>{const c=s.codes[code];if(!c||c.status!=='active')throw fail(409,'Esta avaliação não está disponível ou já foi finalizada.');const bank=s.banks[c.grade]?.[c.day]||[];if(!Number.isInteger(p.index)||p.index!==c.index||p.index>=bank.length)throw fail(409,'Esta questão já foi registrada. Atualize a página.');if(!Number.isInteger(p.resposta)||p.resposta<0||p.resposta>3)throw fail(400,'Escolha uma alternativa válida.');if(Object.prototype.hasOwnProperty.call(c.answers,String(c.index)))throw fail(409,'A resposta desta questão já foi confirmada.');c.answers[String(c.index)]=p.resposta;c.index++;if(c.index===bank.length){c.status='done';c.completedAt=new Date().toISOString();}return {ok:true,concluida:c.status==='done'};});return json(res,200,result);
  }
  if(pathname==='/api/admin/login'&&method==='POST'){const p=await body(req);if(String(p.senha||'')!==ADMIN_PASSWORD)throw fail(401,'Senha incorreta.');return json(res,200,{ok:true});}
  if(!admin(req))throw fail(401,'Acesso exclusivo da equipe responsável.');
  if(pathname==='/api/admin/overview'&&method==='GET'){
   return json(res,200,await transaction(s=>{
    const entries=Object.entries(s.codes).map(([codigo,c])=>{const banco=s.banks[c.grade][c.day];const stats=totals(banco,c.answers||{});return {codigo,nome:c.nome||'',turma:c.turma||'',grade:c.grade,day:c.day,status:c.status,iniciada:c.startedAt||'',finalizada:c.completedAt||'',respondidas:Object.keys(c.answers||{}).length,...stats};});
    const byQuestion={};for(const e of entries.filter(x=>x.status==='done')){const c=s.codes[e.codigo];const key=c.grade+'-'+c.day;const bank=s.banks[c.grade][c.day];if(!byQuestion[key])byQuestion[key]=bank.map((q,i)=>({numero:i+1,area:q.area,habilidade:q.habilidade,acertos:0,erros:0}));bank.forEach((q,i)=>{if(c.answers[i]===q.correta)byQuestion[key][i].acertos++;else byQuestion[key][i].erros++;});}
    return {entradas:entries.sort((a,b)=>a.grade.localeCompare(b.grade)||a.turma.localeCompare(b.turma)||a.nome.localeCompare(b.nome)),byQuestion,persistente:hasPostgres,banks:Object.fromEntries(Object.entries(s.banks).map(([g,b])=>[g,Object.fromEntries(Object.entries(b).map(([day,qs])=>[day,qs.length]))]))};
   },false));
  }
  if(pathname==='/api/admin/generate'&&method==='POST'){
   const p=await body(req);const grade=String(p.grade),day=String(p.day),turma=nameClean(p.turma).slice(0,40),count=Number(p.quantidade);
   if(!validGrade(grade)||!validDay(day)||!Number.isInteger(count)||count<1||count>100)throw fail(400,'Escolha ano, dia e quantidade entre 1 e 100.');
   return json(res,200,await transaction(s=>{if(!s.banks[grade]?.[day]?.length)throw fail(400,'Não há questões nesse caderno.');const codes=[];for(let i=0;i<count;i++){let code;do{code=randCode();}while(s.codes[code]);s.codes[code]={grade,day,turma,nome:'',status:'new',index:0,answers:{},createdAt:new Date().toISOString()};codes.push(code);}return {codigos:codes};}));
  }
  if(pathname==='/api/admin/bank'&&method==='GET'){
   const url=new URL(req.url,'http://localhost');const grade=url.searchParams.get('grade'),day=url.searchParams.get('day');if(!validGrade(grade)||!validDay(day))throw fail(400,'Ano ou dia inválido.');return json(res,200,await transaction(s=>({questoes:s.banks[grade][day]}),false));
  }
  if(pathname==='/api/admin/bank'&&method==='POST'){
   const p=await body(req);const grade=String(p.grade),day=String(p.day);if(!validGrade(grade)||!validDay(day)||!validBank(p.questoes))throw fail(400,'Banco inválido. Cada questão precisa de area, habilidade, texto, enunciado, 4 alternativas e correta (0 a 3).');
   return json(res,200,await transaction(s=>{const used=Object.values(s.codes).some(c=>c.grade===grade&&c.day===day&&c.status!=='new');if(used)throw fail(409,'Não é possível substituir este banco: já existem provas iniciadas ou concluídas.');s.banks[grade][day]=p.questoes;return {ok:true,total:p.questoes.length};}));
  }
  throw fail(404,'Recurso não encontrado.');
 }
 if(method!=='GET'&&method!=='HEAD')throw fail(405,'Método inválido.');
 let file= pathname==='/'?'/index.html':pathname;
 if(!['/index.html','/app.js','/style.css'].includes(file))throw fail(404,'Página não encontrada.');
 const pathnameFile=path.join(__dirname,'public',file.slice(1));
 const mimes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
 res.writeHead(200,{'Content-Type':mimes[path.extname(file)],'X-Content-Type-Options':'nosniff','Cache-Control':file==='/index.html'?'no-store':'public, max-age=120','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});res.end(fs.readFileSync(pathnameFile));
}
if(require.main===module){init().then(()=>http.createServer((req,res)=>{handle(req,res).catch(err=>{if(!err.status)console.error('Server error:',err);json(res,err.status||500,{erro:err.status?err.message:'Erro temporário no servidor. Tente novamente.'});});}).listen(PORT,'0.0.0.0',()=>console.log('Simulado SARESP em http://localhost:'+PORT))).catch(err=>{console.error('Erro no banco de dados',err);process.exit(1);});}
module.exports={init,handle,validBank,totals};