'use strict';
// Free, key-less sources only: Greenhouse + Lever public job boards and Remotive's public API.
const {skillsIn,SK}=require('./engine');const {upsertOpp}=require('./db');
const dec=s=>String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
const strip=h=>dec(dec(h)).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function extract(text){const t=strip(text),req=Object.keys(skillsIn(t)).slice(0,8);let yrs=0,m;const re=/(\d+)\s*\+?\s*(?:years?|yrs?)/gi;while((m=re.exec(t))){const n=+m[1];if(n>0&&n<=15){yrs=n;break}}
const deg=/ph\.?d/i.test(t)&&/required|must/i.test(t)?5:/master'?s? degree/i.test(t)?4:/bachelor'?s?( degree)?|b\.?sc/i.test(t)?3:0;
return{required:req,min_years:yrs,min_deg:deg,description:t.slice(0,2000)}}
const base=(source,id,type)=>({key:source+':'+id,type,source,status:'open',last_checked:Date.now()});
const N={
greenhouse:(j,c)=>({...base('greenhouse:'+c,j.id,'job'),title:j.title,org:c,url:j.absolute_url,location:j.location&&j.location.name||null,...extract(j.content)}),
lever:(j,c)=>({...base('lever:'+c,j.id,'job'),title:j.text,org:c,url:j.hostedUrl,location:j.categories&&j.categories.location||null,...extract(j.descriptionPlain||j.description)}),
remotive:j=>({...base('remotive',j.id,'job'),title:j.title,org:j.company_name,url:j.url,location:j.candidate_required_location||null,...extract(j.description)})};
async function getJson(url,f){const r=await f(url,{headers:{'user-agent':'HiddenRole/1.0'}});if(!r.ok)throw new Error(url+' -> '+r.status);return r.json()}
async function runIngest(db,cfg,f=fetch){const start=Date.now(),out={added:0,errors:[]};
const jobs=[];
for(const c of cfg.greenhouse||[])try{const d=await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(c)}/jobs?content=true`,f);jobs.push([`greenhouse:${c}`,(d.jobs||[]).map(j=>N.greenhouse(j,c))])}catch(e){out.errors.push(e.message)}
for(const c of cfg.lever||[])try{const d=await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(c)}?mode=json`,f);jobs.push([`lever:${c}`,d.map(j=>N.lever(j,c))])}catch(e){out.errors.push(e.message)}
if(cfg.remotive)try{const d=await getJson('https://remotive.com/api/remote-jobs',f);jobs.push(['remotive',(d.jobs||[]).slice(0,300).map(N.remotive)])}catch(e){out.errors.push(e.message)}
for(const[src,list]of jobs){db.transaction(()=>{for(const o of list)if(o.title&&/^https?:\/\//.test(o.url||'')){upsertOpp(db,o);out.added++}
// a job that disappeared from its source feed is closed
db.prepare("UPDATE opportunities SET status='closed' WHERE source=? AND last_checked<?").run(src,start)})()}
return out}
module.exports={runIngest,extract,N,strip};
