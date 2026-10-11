'use strict';
const express=require('express'),multer=require('multer'),crypto=require('crypto'),path=require('path'),fs=require('fs');
const {coach}=require('./coach'),{open,row,upsertOpp,expire}=require('./db'),{analyze,SK}=require('./engine'),{runIngest}=require('./ingest');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function hashPw(pw,salt){return crypto.scryptSync(pw,salt,64).toString('hex')}
function createApp(env=process.env,deps={}){
const db=open(env.DB_PATH||path.join(__dirname,'..','data','hiddenrole.db'));
const app=express();app.set('trust proxy',env.TRUST_PROXY?1:0);app.disable('x-powered-by');
const ephemeral=!!env.VERCEL||env.EPHEMERAL==='1';
const adminEmail=(env.ADMIN_EMAIL||'').toLowerCase(),secure=env.COOKIE_SECURE==='1';
// seed curated programs (only keys that do not exist yet, so maintainer edits and checks are never overwritten)
{const has=db.prepare('SELECT 1 FROM opportunities WHERE key=?');for(const p of require('./data/programs.json'))if(!has.get(p.key))upsertOpp(db,{...p,source:'curated',status:'unknown',last_checked:null})}
// live jobs on demand (key-less public feeds), refreshed at most every 6h; a failed feed never breaks analysis
const fetchImpl=deps.fetch||globalThis.fetch,onDemand=ephemeral||env.INGEST_ON_DEMAND==='1';let lastIngest=0,ingesting=null;
async function ensureJobs(){if(!onDemand||(lastIngest&&Date.now()-lastIngest<216e5))return;
if(!ingesting)ingesting=(async()=>{try{await runIngest(db,require('../companies.json'),(u,o)=>fetchImpl(u,{...o,signal:AbortSignal.timeout(8000)}))}catch(e){}lastIngest=Date.now();ingesting=null})();await ingesting}
// headers + same-origin check for state-changing requests
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});
if(!['GET','HEAD','OPTIONS'].includes(req.method)){const o=req.get('origin');if(o&&new URL(o).host!==req.get('host'))return res.status(403).json({error:'Bad origin'})}next()});
app.use(express.json({limit:'1mb'}));
const hits=new Map();const limit=(name,max,ms)=>(req,res,next)=>{const k=name+req.ip,now=Date.now(),a=(hits.get(k)||[]).filter(t=>now-t<ms);if(a.length>=max)return res.status(429).json({error:'Too many requests. Try again later.'});a.push(now);hits.set(k,a);next()};
const cookie=(req,n)=>((req.headers.cookie||'').split(/;\s*/).find(c=>c.startsWith(n+'='))||'').slice(n.length+1);
app.use((req,res,next)=>{const t=cookie(req,'hr_session');req.user=null;if(t){const r=db.prepare('SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(sha(t),Date.now());if(r)req.user=r}next()});
const need=(req,res,next)=>req.user?next():res.status(401).json({error:'Login required'});
const ev=(uid,name)=>db.prepare('INSERT INTO events(user_id,name,created_at) VALUES(?,?,?)').run(uid||null,name,Date.now());
function startSession(res,uid){const tok=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(tok),uid,Date.now()+30*864e5);res.append('Set-Cookie',`hr_session=${tok}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30*86400}${secure?'; Secure':''}`)}
const cred=b=>{const e=String(b&&b.email||'').trim().toLowerCase(),p=String(b&&b.password||'');return/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)&&e.length<255&&p.length>=8&&p.length<=200?{e,p}:null};
app.use(['/api/register','/api/login'],(req,res,next)=>ephemeral?res.status(503).json({error:'Accounts need a persistent database and are not available on this hosting.'}):next());
app.post('/api/register',limit('auth',20,9e5),(req,res)=>{const c=cred(req.body);if(!c)return res.status(400).json({error:'Valid email and a password of 8+ characters required'});
if(db.prepare('SELECT 1 FROM users WHERE email=?').get(c.e))return res.status(409).json({error:'Email already registered'});
const salt=crypto.randomBytes(16).toString('hex'),id=db.prepare('INSERT INTO users(email,salt,hash) VALUES(?,?,?)').run(c.e,salt,hashPw(c.p,salt)).lastInsertRowid;startSession(res,id);res.json({email:c.e})});
app.post('/api/login',limit('auth',20,9e5),(req,res)=>{const c=cred(req.body),u=c&&db.prepare('SELECT * FROM users WHERE email=?').get(c.e);
const ok=u&&crypto.timingSafeEqual(Buffer.from(hashPw(c.p,u.salt),'hex'),Buffer.from(u.hash,'hex'));if(!ok)return res.status(401).json({error:'Wrong email or password'});startSession(res,u.id);res.json({email:u.email})});
app.post('/api/logout',(req,res)=>{const t=cookie(req,'hr_session');if(t)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(t));res.append('Set-Cookie','hr_session=; Max-Age=0; Path=/');res.json({ok:true})});
app.get('/api/me',(req,res)=>res.json({ephemeral,user:req.user&&{email:req.user.email,admin:!!adminEmail&&req.user.email===adminEmail}}));
app.delete('/api/me',need,(req,res)=>{db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);res.append('Set-Cookie','hr_session=; Max-Age=0; Path=/');res.json({ok:true})});
// CV text extraction
const up=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
async function toText(file,body){if(!file)return String(body.text||'');const b=file.buffer;
if(b.slice(0,4).toString()==='%PDF'){const {extractText,getDocumentProxy}=await import('unpdf');const d=await getDocumentProxy(new Uint8Array(b));return (await extractText(d,{mergePages:true})).text}
if(b.slice(0,2).toString()==='PK'){const m=require('mammoth');return (await m.extractRawText({buffer:b})).value}
if(b.includes(0))throw Object.assign(new Error('Unsupported file type. Use PDF, DOCX or text.'),{status:415});return b.toString('utf8')}
app.post('/api/analyze',limit('analyze',20,36e5),up.single('file'),async(req,res)=>{try{
const text=(await toText(req.file,req.body||{})).slice(0,20000);
if(text.replace(/\s/g,'').length<40)return res.status(422).json({error:'Not enough text found. Scanned/image PDFs are not supported: paste the text instead.'});
await ensureJobs();
const opps=db.prepare("SELECT * FROM opportunities WHERE status!='closed'").all().map(row);
const out=analyze(text,{query:String(req.body.query||'').slice(0,200),country:String(req.body.country||'').slice(0,80)},opps);
if(req.user&&String(req.body.store)==='1')db.prepare('INSERT INTO cvs(user_id,text,delete_after) VALUES(?,?,?)').run(req.user.id,text,Date.now()+30*864e5);
ev(req.user&&req.user.id,'analysis_done');res.json(out)}catch(e){res.status(e.status||(e.code==='LIMIT_FILE_SIZE'?413:400)).json({error:e.status?e.message:e.code==='LIMIT_FILE_SIZE'?'File too large (5 MB max)':'Could not read this file'})}});
app.post('/api/coach',limit('coach',30,36e5),up.single('file'),async(req,res)=>{try{
const text=(await toText(req.file,req.body||{})).slice(0,20000);
if(text.replace(/\s/g,'').length<40)return res.status(422).json({error:'Not enough text found. Scanned/image PDFs are not supported: paste the text instead.'});
let answers=[];try{answers=JSON.parse(req.body.answers||'[]')}catch(e){}
const out=coach(text,{jd:String(req.body.jd||'').slice(0,12000),answers:Array.isArray(answers)?answers:[]});
ev(req.user&&req.user.id,'coach_done');res.json(out)}catch(e){res.status(e.status||(e.code==='LIMIT_FILE_SIZE'?413:400)).json({error:e.status?e.message:e.code==='LIMIT_FILE_SIZE'?'File too large (5 MB max)':'Could not read this file'})}});
app.get('/api/opportunities',(req,res)=>{const q='%'+String(req.query.q||'').toLowerCase()+'%',t=req.query.type?String(req.query.type):null;
res.json(db.prepare("SELECT id,type,title,org,url,source,status,last_checked,deadline FROM opportunities WHERE status!='closed' AND lower(title||' '||org) LIKE ? AND (? IS NULL OR type=?) ORDER BY id DESC LIMIT 100").all(q,t,t))});
const STATES=['saved','applied','interview','offer','rejected'];
app.get('/api/saved',need,(req,res)=>res.json(db.prepare('SELECT s.opp_id,s.state,s.notes,o.title,o.org,o.url,o.type,o.status FROM saved s JOIN opportunities o ON o.id=s.opp_id WHERE s.user_id=? ORDER BY s.rowid DESC').all(req.user.id)));
app.post('/api/saved',need,(req,res)=>{const id=+req.body.opportunity_id,st=req.body.state||'saved';if(!STATES.includes(st)||!db.prepare('SELECT 1 FROM opportunities WHERE id=?').get(id))return res.status(400).json({error:'Invalid opportunity or state'});
db.prepare('INSERT INTO saved(user_id,opp_id,state,notes) VALUES(?,?,?,?) ON CONFLICT(user_id,opp_id) DO UPDATE SET state=excluded.state,notes=CASE WHEN excluded.notes!=\'\' THEN excluded.notes ELSE notes END').run(req.user.id,id,st,String(req.body.notes||'').slice(0,500));ev(req.user.id,st==='saved'?'saved':'state_'+st);res.json({ok:true})});
app.delete('/api/saved/:id',need,(req,res)=>{db.prepare('DELETE FROM saved WHERE user_id=? AND opp_id=?').run(req.user.id,+req.params.id);res.json({ok:true})});
app.get('/api/admin/stats',need,(req,res)=>{if(!adminEmail||req.user.email!==adminEmail)return res.status(403).json({error:'Forbidden'});
const c=n=>db.prepare('SELECT COUNT(*) n FROM events WHERE name=?').get(n).n;res.json({users:db.prepare('SELECT COUNT(*) n FROM users').get().n,analyses:c('analysis_done'),saved:c('saved'),opportunities:db.prepare("SELECT status,COUNT(*) n FROM opportunities GROUP BY status").all()})});
app.post('/api/admin/ingest',need,async(req,res)=>{if(!adminEmail||req.user.email!==adminEmail)return res.status(403).json({error:'Forbidden'});res.json(await runIngest(db,JSON.parse(fs.readFileSync(path.join(__dirname,'..','companies.json'),'utf8'))))});
app.use(express.static(path.join(__dirname,'..','public')));
app.use((req,res)=>res.status(404).json({error:'Not found'}));
app.use((err,req,res,next)=>res.status(500).json({error:'Server error'}));
const timers=[];
app.locals.start=()=>{expire(db);timers.push(setInterval(()=>expire(db),36e5).unref());
if(env.INGEST_ENABLED==='1')timers.push(setInterval(()=>runIngest(db,JSON.parse(fs.readFileSync(path.join(__dirname,'..','companies.json'),'utf8'))).catch(()=>{}),216e5).unref())};
app.locals.db=db;return app}
module.exports={createApp};
