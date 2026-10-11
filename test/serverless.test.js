const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('http'),fs=require('fs'),path=require('path');
for(const entry of['../api/index.js','../server.js'])test('Vercel entry '+entry+' works as a plain (req,res) handler, writes only to /tmp, accounts disabled',async()=>{
process.env.VERCEL='1';fs.rmSync('/tmp/hiddenrole.db',{force:true});fs.rmSync(path.join(__dirname,'..','data'),{recursive:true,force:true});
for(const k of Object.keys(require.cache))if(/\/(api\/index|server)\.js$/.test(k))delete require.cache[k];const handler=require(entry);assert.equal(typeof handler,'function');
const srv=http.createServer((req,res)=>handler(req,res)).listen(0);const base='http://127.0.0.1:'+srv.address().port;
try{const me=await (await fetch(base+'/api/me')).json();assert.equal(me.ephemeral,true);assert.equal(me.user,null);
const reg=await fetch(base+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'a@x.io',password:'password123'})});assert.equal(reg.status,503);
const cv='Built web apps with JavaScript, React, HTML, CSS, Node.js, SQL, REST APIs, Git. Bachelor degree. 3 years of experience. Kathmandu, Nepal.';
let f=new FormData();f.append('text',cv);let r=await fetch(base+'/api/analyze',{method:'POST',body:f});assert.equal(r.status,200);assert.ok((await r.json()).matches.length>0);
f=new FormData();f.append('text',cv);f.append('jd','React and Node.js developer. React Node.js React Node.js');r=await fetch(base+'/api/coach',{method:'POST',body:f});assert.equal(r.status,200);assert.equal((await r.json()).prompts.length,8);
const o=await (await fetch(base+'/api/opportunities?q=google')).json();assert.ok(o.length>=2);
assert.ok(fs.existsSync('/tmp/hiddenrole.db'),'db in /tmp');assert.ok(!fs.existsSync(path.join(__dirname,'..','data')),'nothing written inside the project folder')}finally{srv.close();delete process.env.VERCEL}});
