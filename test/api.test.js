const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {createApp}=require('../src/hiddenrole'),{runIngest,extract}=require('../src/ingest'),{expire,upsertOpp}=require('../src/db');
let srv,base,app,cookie='';const dbf=path.join(os.tmpdir(),'hr-test-'+process.pid+'.db');
before(async()=>{app=createApp({DB_PATH:dbf,ADMIN_EMAIL:'admin@x.io'});srv=app.listen(0);base='http://127.0.0.1:'+srv.address().port});
after(()=>{srv.close();app.locals.db.close();for(const s of['','-wal','-shm'])fs.rmSync(dbf+s,{force:true})});
const call=async(m,u,body,hdr={})=>{const r=await fetch(base+u,{method:m,headers:{...(cookie?{cookie}:{}),...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{}),...hdr},body:body instanceof FormData?body:body&&JSON.stringify(body)});const sc=r.headers.get('set-cookie');if(sc&&sc.includes('hr_session=')&&!sc.includes('Max-Age=0'))cookie=sc.split(';')[0];return{s:r.status,j:await r.json().catch(()=>null)}};
test('anonymous text analysis works, validates input',async()=>{
assert.equal((await call('POST','/api/analyze',(()=>{const f=new FormData();f.append('text','short');return f})())).s,422);
const f=new FormData();f.append('text','Built web apps with JavaScript, React, HTML, CSS, Node.js, SQL, REST APIs, Git. Bachelor degree. 3 years experience.');f.append('country','Nepal');
const r=await call('POST','/api/analyze',f);assert.equal(r.s,200);assert.ok(r.j.roles.length>0);assert.ok(r.j.matches.some(m=>m.title.includes('Summer of Code')))});
test('PDF and DOCX uploads are parsed; fake files rejected',async()=>{
let f=new FormData();f.append('file',new Blob([fs.readFileSync('test/fixtures/cv.pdf')]),'cv.pdf');let r=await call('POST','/api/analyze',f);assert.equal(r.s,200);assert.ok(r.j.profile.skills.some(s=>s.id==='react'),'pdf skills');
if(fs.existsSync('test/fixtures/cv.docx')){f=new FormData();f.append('file',new Blob([fs.readFileSync('test/fixtures/cv.docx')]),'cv.docx');r=await call('POST','/api/analyze',f);assert.equal(r.s,200);assert.ok(r.j.roles.some(x=>x.title==='Healthcare Assistant'),'docx roles')}
f=new FormData();f.append('file',new Blob([Buffer.from([0,1,2,3,0,0])]),'x.bin');assert.equal((await call('POST','/api/analyze',f)).s,415)});
test('auth, tracker, isolation, delete account',async()=>{
assert.equal((await call('GET','/api/saved')).s,401);
assert.equal((await call('POST','/api/register',{email:'a@x.io',password:'short'})).s,400);
assert.equal((await call('POST','/api/register',{email:'a@x.io',password:'password123'})).s,200);
const o=(await call('GET','/api/opportunities?q=chevening')).j;assert.equal(o.length,1);
assert.equal((await call('POST','/api/saved',{opportunity_id:o[0].id,state:'applied'})).s,200);assert.equal((await call('GET','/api/saved')).j[0].state,'applied');
assert.equal((await call('POST','/api/saved',{opportunity_id:o[0].id,state:'bogus'})).s,400);
const first=cookie;cookie='';assert.equal((await call('POST','/api/register',{email:'b@x.io',password:'password123'})).s,200);assert.equal((await call('GET','/api/saved')).j.length,0,'user B must not see A data');
assert.equal((await call('GET','/api/admin/stats')).s,403);
assert.equal((await call('POST','/api/login',{email:'a@x.io',password:'wrongpass1'})).s,401);
cookie=first;assert.equal((await call('DELETE','/api/me')).s,200);cookie=first;assert.equal((await call('GET','/api/saved')).s,401);
assert.equal(app.locals.db.prepare("SELECT COUNT(*) n FROM saved WHERE user_id IN (SELECT id FROM users WHERE email='a@x.io')").get().n,0)});
test('cross-origin writes are blocked',async()=>{assert.equal((await call('POST','/api/login',{email:'a@x.io',password:'password123'},{origin:'https://evil.example'})).s,403)});
test('ingest normalises jobs, closes vanished ones; expire closes past deadlines',async()=>{
const db=app.locals.db,gh=id=>({ok:true,json:async()=>({jobs:[{id,title:'Backend Engineer',absolute_url:'https://boards.greenhouse.io/x/jobs/'+id,content:'&lt;p&gt;You know Python, SQL and REST APIs. 3+ years experience. Bachelor&amp;#39;s degree.&lt;/p&gt;'}]})});
let r=await runIngest(db,{greenhouse:['acme']},async()=>gh(1));assert.equal(r.added,1);const j=db.prepare("SELECT * FROM opportunities WHERE key='greenhouse:acme:1'").get();
assert.equal(j.min_years,3);assert.equal(j.min_deg,3);assert.ok(JSON.parse(j.required).includes('python'));
await new Promise(r=>setTimeout(r,5));r=await runIngest(db,{greenhouse:['acme']},async()=>gh(2));assert.equal(db.prepare("SELECT status FROM opportunities WHERE key='greenhouse:acme:1'").get().status,'closed');
r=await runIngest(db,{greenhouse:['bad']},async()=>({ok:false,status:404}));assert.equal(r.errors.length,1);
upsertOpp(db,{key:'t:old',type:'scholarship',title:'Old',url:'https://o.io',source:'t',deadline:'2020-01-01'});expire(db);assert.equal(db.prepare("SELECT status FROM opportunities WHERE key='t:old'").get().status,'closed');
assert.equal(extract('<b>x</b>').required.length,0)});
