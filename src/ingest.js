'use strict';
// Free, key-less sources only. Each source fails independently; sources load concurrently.
const {skillsIn}=require('./engine');const {upsertOpp}=require('./db');
const dec=s=>String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
const strip=h=>dec(dec(h)).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function extract(text){const t=strip(text),req=Object.keys(skillsIn(t)).slice(0,8);let yrs=0,m;const re=/(\d+)\s*\+?\s*(?:years?|yrs?)/gi;while((m=re.exec(t))){const n=+m[1];if(n>0&&n<=15){yrs=n;break}}
const deg=/ph\.?d/i.test(t)&&/required|must/i.test(t)?5:/master'?s? degree/i.test(t)?4:/bachelor'?s?( degree)?|b\.?sc/i.test(t)?3:0;
return{required:req,min_years:yrs,min_deg:deg,description:t.slice(0,2000)}}
const base=(source,id,type)=>({key:source+':'+id,type,source,status:'open',last_checked:Date.now()});
const abs=(u,b)=>/^https?:\/\//.test(u||'')?u:(u?b+u:'');
function parseRss(xml){const items=[],re=/<item>([\s\S]*?)<\/item>/g;let m;const tag=(s,t)=>{const x=new RegExp('<'+t+'[^>]*>([\\s\\S]*?)</'+t+'>','i').exec(s);return x?x[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g,'').trim():''};
while((m=re.exec(xml)))items.push({title:tag(m[1],'title'),link:tag(m[1],'link')||tag(m[1],'guid'),description:tag(m[1],'description'),region:tag(m[1],'region')});return items}
const N={
greenhouse:(j,c)=>({...base('greenhouse:'+c,j.id,'job'),title:j.title,org:c,url:j.absolute_url,location:j.location&&j.location.name||null,...extract(j.content)}),
lever:(j,c)=>({...base('lever:'+c,j.id,'job'),title:j.text,org:c,url:j.hostedUrl,location:j.categories&&j.categories.location||null,...extract(j.descriptionPlain||j.description)}),
remotive:j=>({...base('remotive',j.id,'job'),title:j.title,org:j.company_name,url:j.url,location:j.candidate_required_location||null,...extract(j.description)}),
remoteok:j=>({...base('remoteok',j.id,'job'),title:j.position,org:j.company,url:abs(j.url,'https://remoteok.com'),location:j.location||'Remote',...extract((j.description||'')+' '+(j.tags||[]).join(' ')+' '+(j.position||''))}),
arbeitnow:j=>({...base('arbeitnow',j.slug,'job'),title:j.title,org:j.company_name,url:j.url,location:(j.remote?'Remote · ':'')+(j.location||''),...extract((j.description||'')+' '+(j.tags||[]).join(' ')+' '+(j.title||''))}),
jobicy:j=>({...base('jobicy',j.id,'job'),title:j.jobTitle,org:j.companyName,url:j.url,location:j.jobGeo||null,...extract((j.jobDescription||j.jobExcerpt||'')+' '+(j.jobTitle||''))}),
weworkremotely:it=>{const p=it.title.split(': '),title=p.length>1?p.slice(1).join(': '):it.title;return{...base('weworkremotely',it.link,'job'),title,org:p.length>1?p[0]:'',url:it.link,location:it.region||'Remote',...extract(it.description+' '+title)}}};
const WWR=['https://weworkremotely.com/remote-jobs.rss','https://weworkremotely.com/categories/remote-programming-jobs.rss','https://weworkremotely.com/categories/remote-design-jobs.rss','https://weworkremotely.com/categories/remote-customer-support-jobs.rss','https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss'];
const H={headers:{'user-agent':'HiddenRole/1.0'}};
async function getJson(url,f){const r=await f(url,H);if(!r.ok)throw new Error(url+' -> '+r.status);return r.json()}
async function getText(url,f){const r=await f(url,H);if(!r.ok)throw new Error(url+' -> '+r.status);return r.text()}
async function runIngest(db,cfg,f=fetch){const start=Date.now(),out={added:0,errors:[],sources:{}},tasks=[],add=(s,fn)=>tasks.push([s,fn]);
for(const c of cfg.greenhouse||[])add('greenhouse:'+c,async()=>((await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c)}/jobs?content=true`,f)).jobs||[]).map(j=>N.greenhouse(j,c)));
for(const c of cfg.lever||[])add('lever:'+c,async()=>(await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(c)}?mode=json`,f)).map(j=>N.lever(j,c)));
if(cfg.remotive)add('remotive',async()=>((await getJson('https://remotive.com/api/remote-jobs',f)).jobs||[]).map(N.remotive));
if(cfg.remoteok)add('remoteok',async()=>(await getJson('https://remoteok.com/api',f)).filter(j=>j&&j.id&&j.position).map(N.remoteok));
if(cfg.arbeitnow)add('arbeitnow',async()=>{let all=[];for(const pg of[1,2,3]){try{all=all.concat(((await getJson('https://www.arbeitnow.com/api/job-board-api?page='+pg,f)).data||[]).map(N.arbeitnow))}catch(e){if(pg===1)throw e;break}}return all});
if(cfg.jobicy)add('jobicy',async()=>((await getJson('https://jobicy.com/api/v2/remote-jobs?count=50',f)).jobs||[]).map(N.jobicy));
if(cfg.weworkremotely)add('weworkremotely',async()=>{const res=await Promise.allSettled(WWR.map(u=>getText(u,f)));const all=[];for(const r of res)if(r.status==='fulfilled')all.push(...parseRss(r.value).map(N.weworkremotely));if(!all.length)throw new Error('weworkremotely: no feed available');return all});
const res=await Promise.allSettled(tasks.map(([,fn])=>fn()));
res.forEach((r,i)=>{const src=tasks[i][0];if(r.status==='rejected'){out.errors.push(src+': '+(r.reason&&r.reason.message||'failed'));return}
const list=r.value.slice(0,500);out.sources[src]=list.length;
db.transaction(()=>{for(const o of list)if(o.title&&/^https?:\/\//.test(o.url||'')){upsertOpp(db,o);out.added++}
// a job that disappeared from its source feed is closed
db.prepare("UPDATE opportunities SET status='closed' WHERE source=? AND last_checked<?").run(src,start)})()});
return out}
module.exports={runIngest,extract,N,strip,parseRss};
