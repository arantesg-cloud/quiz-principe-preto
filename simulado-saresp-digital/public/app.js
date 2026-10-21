'use strict';
const $=id=>document.getElementById(id);
const VIEWS=['login','exam','end','admin-login','admin'];
let currentQuestion=null,currentIndex=0,currentTotal=0,selection=null,adminData=null;
let adminPass=sessionStorage.getItem('simulado_admin_pw')||'';
const labels=['A','B','C','D'];
const view=name=>{VIEWS.forEach(x=>{$('view-'+x).hidden=x!==name;});$('headerBadge').hidden=name!=='exam';window.scrollTo({top:0,behavior:'instant'});};
function displayMessage(id,msg,ok=false){const el=$(id);el.textContent=msg;el.classList.toggle('ok',ok);el.hidden=!msg;}
async function api(url,options={}){const res=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(adminPass&&url.includes('/admin/')?{'x-admin-password':adminPass}:{}),...(options.headers||{})},...options});let result;try{result=await res.json();}catch{throw new Error('O servidor não respondeu corretamente. Verifique a conexão.');}if(!res.ok)throw new Error(result.erro||'Não foi possível completar a operação.');return result;}
const post=(url,data)=>api(url,{method:'POST',body:JSON.stringify(data)});
function titleFor(grade,day){const a=grade==='9'?(day==='dia1'?'Linguagens e Matemática':'Ciências da Natureza e Ciências Humanas'):(day==='dia1'?'Linguagens e Ciências da Natureza':'Matemática e Ciências Humanas');return `${grade}º ano · ${day==='dia1'?'1º dia':'2º dia'} · ${a}`;}
function renderQuestion(data){
 if(data.concluida){$('endText').textContent=`${data.nome}, você concluiu o simulado do ${data.grade}º ano com ${data.total} respostas registradas. Elas não podem ser alteradas.`;view('end');return;}
 if(!data.question){displayMessage('loginMessage','Caderno ainda não disponível. Consulte o professor.');view('login');return;}
 currentQuestion=data.question;currentIndex=data.index;currentTotal=data.total;selection=null;
 $('examTitle').textContent=`${data.grade}º ano • ${data.day==='dia1'?'Caderno do 1º dia':'Caderno do 2º dia'}`;
 $('examStudent').textContent=`Estudante: ${data.nome}  ·  ${data.turma||'Turma não informada'}`;
 $('examPosition').textContent=String(data.index+1).padStart(2,'0')+' / '+String(data.total).padStart(2,'0');
 $('questionNumber').textContent='QUESTÃO '+String(data.index+1).padStart(2,'0');
 $('questionArea').textContent=data.question.area;
 $('questionText').textContent=data.question.texto||'Leia o enunciado com atenção.';
 $('questionText').hidden=!data.question.texto;
 $('questionStatement').textContent=data.question.enunciado;
 const f=$('answerList');f.querySelectorAll('label').forEach(e=>e.remove());
 data.question.alternativas.forEach((alt,i)=>{
  const label=document.createElement('label');label.className='answer';
  const input=document.createElement('input');input.type='radio';input.name='option';input.value=String(i);input.setAttribute('aria-label','Alternativa '+labels[i]);
  const letter=document.createElement('span');letter.className='letter';letter.textContent=labels[i];
  const text=document.createElement('span');text.className='answer-value';text.textContent=alt;
  input.addEventListener('change',()=>{selection=i;f.querySelectorAll('label').forEach(l=>l.classList.remove('selected'));label.classList.add('selected');$('confirmButton').disabled=false;});
  label.append(input,letter,text);f.append(label);
 });
 $('confirmButton').disabled=true;$('answeredCount').textContent=String(data.answerCount);
 const progress=Math.round(100*data.answerCount/data.total);
 $('progressBar').style.width=progress+'%';$('progressWrap').setAttribute('aria-valuenow',String(progress));
 const small=$('miniProgress');small.replaceChildren();for(let i=0;i<data.total;i++){const tick=document.createElement('span');if(i<data.answerCount)tick.classList.add('complete');small.append(tick);}
 displayMessage('examError','');$('headerBadge').textContent=`${data.grade}º ANO`;
 view('exam');
}
async function loadStudent(){try{const r=await api('/api/student/state');renderQuestion(r);}catch(e){view('login');}}
$('studentForm').addEventListener('submit',async event=>{
 event.preventDefault();displayMessage('loginMessage','');const btn=$('startButton');btn.disabled=true;
 try{await post('/api/student/start',{nome:$('studentName').value,codigo:$('studentCode').value});await loadStudent();}catch(e){displayMessage('loginMessage',e.message);}finally{btn.disabled=false;}
});
$('studentCode').addEventListener('input',event=>{event.target.value=event.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');});
$('confirmButton').addEventListener('click',()=>{if(selection===null)return;$('chosenLetter').textContent=labels[selection];$('confirmDialog').showModal();});
$('cancelAnswer').addEventListener('click',()=>$('confirmDialog').close());
$('submitAnswer').addEventListener('click',async()=>{
 if(selection===null)return;const btn=$('submitAnswer');btn.disabled=true;
 try{await post('/api/student/answer',{index:currentIndex,resposta:selection});$('confirmDialog').close();const data=await api('/api/student/state');renderQuestion(data);}catch(e){$('confirmDialog').close();displayMessage('examError',e.message);try{await loadStudent();}catch{}}finally{btn.disabled=false;}
});
$('adminLink').addEventListener('click',()=>{if(adminPass){loadAdmin().catch(()=>{adminPass='';sessionStorage.removeItem('simulado_admin_pw');view('admin-login');});}else view('admin-login');});
$('backToStudents').addEventListener('click',()=>loadStudent());
$('adminLoginForm').addEventListener('submit',async event=>{
 event.preventDefault();const pw=$('adminPass').value;
 try{await post('/api/admin/login',{senha:pw});adminPass=pw;sessionStorage.setItem('simulado_admin_pw',pw);displayMessage('adminLoginMessage','');await loadAdmin();}catch(e){displayMessage('adminLoginMessage',e.message);}
});
$('adminLogout').addEventListener('click',()=>{adminPass='';sessionStorage.removeItem('simulado_admin_pw');$('adminPass').value='';view('admin-login');});
$('adminRefresh').addEventListener('click',()=>loadAdmin());
const statusLabels={new:'Não iniciou',active:'Em andamento',done:'Concluído'};
function cell(row,text,isStrong=false){const td=document.createElement('td');if(isStrong){const strong=document.createElement('strong');strong.textContent=text;td.append(strong);}else td.textContent=text;row.append(td);return td;}
async function loadAdmin(){
 displayMessage('adminMessage','');const data=await api('/api/admin/overview');adminData=data;const entries=data.entradas;
 $('adminWarning').hidden=data.persistente;
 $('statCodes').textContent=entries.length;
 $('statWaiting').textContent=entries.filter(x=>x.status==='new').length;
 $('statActive').textContent=entries.filter(x=>x.status==='active').length;
 $('statDone').textContent=entries.filter(x=>x.status==='done').length;
 const tbody=$('studentTable').querySelector('tbody');tbody.replaceChildren();
 if(!entries.length){const r=document.createElement('tr');const c=cell(r,'Nenhum código criado. Gere os primeiros códigos acima.');c.colSpan=8;tbody.append(r);}
 entries.forEach(e=>{const r=document.createElement('tr');cell(r,e.codigo,true);cell(r,e.nome||'—');cell(r,e.turma||'—');cell(r,e.grade+'º');cell(r,e.day==='dia1'?'1º dia':'2º dia');const td=document.createElement('td');const chip=document.createElement('span');chip.className='status-chip '+(e.status==='active'?'active':e.status==='done'?'done':'');chip.textContent=statusLabels[e.status];td.append(chip);r.append(td);cell(r,`${e.respondidas}/${e.total}`);cell(r,e.status==='done'?`${e.acertos}/${e.total}`:'—');tbody.append(r);});
 const difficulty=Object.entries(data.byQuestion).flatMap(([key,qs])=>qs.map(q=>({...q,gradeDay:key}))).filter(x=>x.erros>0).sort((a,b)=>b.erros-a.erros||a.acertos-b.acertos).slice(0,12);
 const target=$('difficulties');target.replaceChildren();
 if(!difficulty.length){const p=document.createElement('p');p.className='subtext';p.textContent='As dificuldades aparecerão depois que os estudantes concluírem seus simulados.';target.append(p);}
 for(const q of difficulty){const div=document.createElement('div');div.className='difficulty-item';const a=document.createElement('strong');a.textContent=q.gradeDay.replace('-dia',' • Dia ');const b=document.createElement('span');b.textContent=`Questão ${q.numero} · ${q.area} · ${q.habilidade}`;const c=document.createElement('span');c.textContent=`${q.erros} erro(s) de ${q.erros+q.acertos}`;div.append(a,b,c);target.append(div);}
 view('admin');
}
$('generateForm').addEventListener('submit',async event=>{event.preventDefault();try{const r=await post('/api/admin/generate',{grade:$('genGrade').value,day:$('genDay').value,turma:$('genClass').value,quantidade:Number($('genCount').value)});$('newCodes').hidden=false;$('codeList').value=r.codigos.join('\n');displayMessage('adminMessage',`${r.codigos.length} código(s) gerado(s). Entregue um a cada estudante.`,true);await loadAdmin();}catch(e){displayMessage('adminMessage',e.message);}});
$('copyCodes').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('codeList').value);$('copyCodes').textContent='Copiado ✓';setTimeout(()=>$('copyCodes').textContent='Copiar códigos',1600);}catch{$('codeList').select();document.execCommand('copy');}});
const csvEscape=val=>{let s=String(val??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
function downloadFile(content,name,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('downloadCSV').addEventListener('click',()=>{if(!adminData)return;const header=['Código','Estudante','Turma','Ano','Dia','Situação','Respondidas','Total','Acertos','Data de início','Data de conclusão','Acertos por área'];const rows=adminData.entradas.map(x=>[x.codigo,x.nome,x.turma,x.grade,x.day,statusLabels[x.status],x.respondidas,x.total,x.status==='done'?x.acertos:'',x.iniciada,x.finalizada,x.areas.map(a=>`${a.area}: ${a.acertos}/${a.total}`).join(' | ')]);const csv='\uFEFF'+[header,...rows].map(line=>line.map(csvEscape).join(';')).join('\r\n');downloadFile(csv,'resultados-simulado-saresp-2026.csv','text/csv;charset=utf-8');});
async function loadBank(){try{const grade=$('bankGrade').value,day=$('bankDay').value;const data=await api(`/api/admin/bank?grade=${grade}&day=${day}`);$('bankJSON').value=JSON.stringify(data.questoes,null,2);$('bankCount').textContent=`${data.questoes.length} questão(ões) cadastrada(s) para este caderno.`;displayMessage('adminMessage','');}catch(e){displayMessage('adminMessage',e.message);}}
$('loadBank').addEventListener('click',loadBank);
$('downloadBank').addEventListener('click',()=>{if(!$('bankJSON').value.trim()){displayMessage('adminMessage','Carregue um banco de questões primeiro.');return;}downloadFile($('bankJSON').value,`questoes-${$('bankGrade').value}-${$('bankDay').value}.json`,'application/json');});
$('saveBank').addEventListener('click',async()=>{try{const questoes=JSON.parse($('bankJSON').value);const data=await post('/api/admin/bank',{grade:$('bankGrade').value,day:$('bankDay').value,questoes});displayMessage('adminMessage',`${data.total} questões salvas com sucesso!`,true);$('bankCount').textContent=`${data.total} questões cadastradas.`;}catch(e){displayMessage('adminMessage','Não foi possível salvar: '+e.message);}});
const params=new URLSearchParams(location.search);
if(params.has('professor')||params.has('admin')){if(adminPass)loadAdmin().catch(()=>view('admin-login'));else view('admin-login');}
else loadStudent();