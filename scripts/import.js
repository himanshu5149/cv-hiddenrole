'use strict';
// Usage: node scripts/import.js my-opportunities.json   (array of {key,type,title,org,url,description,min_deg,min_years,required,deadline,location})
const fs=require('fs'),{open,upsertOpp}=require('../src/db'),{SK}=require('../src/engine');
const file=process.argv[2];if(!file){console.error('usage: node scripts/import.js file.json');process.exit(1)}
const db=open(process.env.DB_PATH||'data/hiddenrole.db');let ok=0,bad=[];
for(const o of JSON.parse(fs.readFileSync(file,'utf8'))){const ids=(o.required||[]).flat();
if(!o.key||!o.title||!/^https?:\/\//.test(o.url||'')||ids.some(i=>!SK[i])){bad.push(o.key||o.title||'?');continue}
upsertOpp(db,{source:'curated',status:'open',last_checked:Date.now(),...o});ok++}
console.log('imported',ok,'skipped',bad.length,bad.join(', '));
