const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {coach,hasMetric,buzzFindings,bullets}=require('../src/coach');
const CV=`Asha Rai asha@mail.com
Experience
- Responsible for maintaining the company website
- Built a booking app with React and Node.js used by 300 customers, cutting phone calls by 40%
- Worked on database tasks and helped the team
- Results-driven team player passionate about leveraging synergy
Education: Bachelor of Science, 2022`;
test('numbers: real metrics count, years and tool versions do not',()=>{assert.ok(hasMetric('Served 300 customers'));assert.ok(hasMetric('Cut costs by 40%'));assert.ok(!hasMetric('Used HTML5 and CSS3 in 2022'));assert.ok(!hasMetric('Worked at Acme from 2019 to 2021 on web pages'))});
test('weak bullets get questions, never answers',()=>{const r=coach(CV);assert.ok(r.weak.length>=3);assert.ok(r.weak.every(w=>w.questions.length>=3&&w.questions.every(q=>q.endsWith('?'))));assert.ok(!r.weak.some(w=>/300 customers/.test(w.bullet)))});
test('buzzwords found with plain alternatives',()=>{const b=buzzFindings(CV);for(const k of['results-driven','team player','synergy','responsible for'])assert.ok(b.some(x=>x.phrase===k),k);assert.ok(b.every(x=>x.plain))});
test('job keywords: evidence only where CV has it; hard requirements compared',()=>{const r=coach(CV,{jd:'We need a Python developer with SQL and React experience. 3+ years experience. Python Python SQL SQL React. Docker. Bachelor degree required.'});const k=r.keywords;
const py=k.rows.find(x=>x.label==='Python'),re=k.rows.find(x=>/React/.test(x.label));assert.equal(py.state,'warn');assert.equal(re.state,'ok');assert.match(re.detail,/React/);
assert.ok(k.reqRows.some(x=>/years/.test(x.label)&&x.state==='warn'),'unstated years is a warning, not a pass or fail');assert.ok(k.reqRows.some(x=>/Degree/.test(x.label)&&x.state==='ok'));
const y=coach(CV+'\n2 years of experience in web development.',{jd:'5+ years experience. Python Python SQL SQL React React'}).keywords.reqRows;assert.equal(y[0].state,'fail')});
test('stories rank numbers and relevance first; unrelated lines suggested for cutting',()=>{const r=coach(CV,{jd:'React and Node.js developer. React Node.js React Node.js'});assert.match(r.stories.top[0].text,/booking app/);assert.ok(r.stories.cut.length>0)});
test('recruiter test is bounded and gives actionable changes',()=>{const r=coach(CV).recruiter;assert.ok(r.score>=0&&r.score<=100);assert.ok(r.top5.length>=1&&r.top5.length<=5);assert.match(r.note,/not a real recruiter/)});
test('vault never invents: every CV line is verbatim; answers are verbatim and optional',()=>{const a=[{bullet:'Worked on database tasks',question:'How many?',answer:'We had 12 tables and 3 users.'}];const r=coach(CV,{answers:a});
for(const l of r.vault.split('\n').filter(x=>/^- \[(has|needs) numbers\]/.test(x)))assert.ok(CV.includes(l.replace(/^- \[[a-z ]+\] /,'')),'line not in CV: '+l);
assert.ok(r.vault.includes('We had 12 tables and 3 users.'));assert.ok(!coach(CV).vault.includes('12 tables'));assert.match(r.vault,/Never invent/)});
test('style file is measured from the CV',()=>{const s=coach(CV).style;assert.match(s,/Average bullet length: \d+ words/);assert.match(s,/Bullets with numbers: \d+%/)});
test('8 prompts, files embedded, judge prompt tells AI to check against the file',()=>{const r=coach(CV,{jd:'Python developer role with SQL and APIs. Python SQL.'});assert.equal(r.prompts.length,8);assert.ok(r.prompts.every(p=>p.text.includes('<verified_experience>')));assert.match(r.prompts[7].text,/ONLY source of truth/);assert.ok(r.prompts[1].text.includes('Python developer role'));assert.ok(coach(CV).prompts[1].text.includes('[PASTE THE JOB DESCRIPTION HERE]'))});
test('works when the PDF text has no line breaks',()=>{const flat=CV.replace(/\n/g,' ');assert.ok(bullets(flat).length>=2)});
test('/api/coach endpoint: validation, structure, no storage',async()=>{
const {createApp}=require('../src/hiddenrole');const dbf=path.join(os.tmpdir(),'hr-coach-'+process.pid+'.db');const app=createApp({DB_PATH:dbf});const srv=app.listen(0);const base='http://127.0.0.1:'+srv.address().port;
try{let f=new FormData();f.append('text','short');assert.equal((await fetch(base+'/api/coach',{method:'POST',body:f})).status,422);
f=new FormData();f.append('text',CV);f.append('jd','Python developer with SQL and React. Python SQL React Python.');f.append('answers',JSON.stringify([{bullet:'x',question:'y',answer:'I managed 4 servers'}]));
const r=await fetch(base+'/api/coach',{method:'POST',body:f}),j=await r.json();assert.equal(r.status,200);for(const k of['stats','weak','buzz','keywords','stories','recruiter','vault','style','prompts'])assert.ok(k in j,k);assert.ok(j.vault.includes('I managed 4 servers'));assert.ok(!('internal' in j.keywords));
f=new FormData();f.append('text',CV);f.append('answers','not json');assert.equal((await fetch(base+'/api/coach',{method:'POST',body:f})).status,200);
assert.equal(app.locals.db.prepare('SELECT COUNT(*) n FROM cvs').get().n,0)}finally{srv.close();app.locals.db.close();for(const s of['','-wal','-shm'])fs.rmSync(dbf+s,{force:true})}});

// ---- regression tests for the reported bugs ----
const {skillsIn}=require('../src/engine');
const NURSE=`MANISHA THAPA | manisha@mail.com | +977 9801234567 WORK EXPERIENCE Staff Nurse, City Hospital 2019 - 2024 Administered medication to 20 patients per shift. Monitored vital signs and reported changes to doctors. Mentored junior nurses and ran in-service training for patients. Collected samples for pregnancy test and blood glucose tests. PROJECTS Community health camp: organised free screening for 150 villagers. EDUCATION BSc Nursing, 2019 SKILLS Patient care, IV therapy, communication, teamwork`;
test('headings are found in flat PDF text (WORK EXPERIENCE / PROJECTS) and in line-based text',()=>{const {detectSections}=require('../src/coach');
const f=coach(NURSE).recruiter;for(const k of['Experience','Projects','Education','Skills'])assert.ok(f.sections.includes(k),'flat: '+k);assert.ok(!f.hesitations.some(h=>/Experience or Projects/.test(h)),'must not claim experience is missing');
assert.deepEqual(detectSections('Jane\n\nWork Experience\n- did things\n\nProjects:\n- x\n\nEducation\nBSc').sort(),['education','experience','projects']);
assert.ok(!detectSections('I have 3 years of experience in sales and love projects with friends').includes('projects'))});
test('nursing CV: no fake Testing/QA from medical "tests", no tech skills',()=>{const k=Object.keys(skillsIn(NURSE));assert.ok(!k.includes('testing'));assert.ok(!k.includes('node'));assert.ok(k.includes('health'))});
test('ordinary words do not create skills (express/excel/swift/rest/audit/editor/flask)',()=>{for(const t of['Please express interest in my profile','I excel at teamwork and will excel here','Swift and accurate medication rounds','Took the rest of the shift off','Audit of infection control and a text editor','Lab flask used for samples'])assert.deepEqual(Object.keys(skillsIn(t)).filter(x=>!['comm'].includes(x)),[],t);
assert.ok(skillsIn('Built an API with Express.js and Jest tests').testing);assert.ok(skillsIn('Advanced Excel and Power BI').excel)});
test('a developer CV does not get 10/10 on a nursing job; scores stay separate',()=>{const DEV='Built web apps with JavaScript, React, Node.js, SQL and REST APIs. Bachelor degree. 3 years of experience. Used Git and GitHub. Email dev@x.io Experience Education Skills';
const JD='Registered Nurse needed. Provide patient care, administer medication, monitor patients, patient records. Valid nursing licence required. 2+ years experience. Bachelor degree.';
const a=coach(DEV,{jd:JD}).recruiter,b=coach(DEV).recruiter;assert.ok(a.scores.jobMatch<30,'job match '+a.scores.jobMatch);assert.equal(a.scores.quality.value,b.scores.quality.value,'quality must not depend on the job');assert.equal(b.scores.jobMatch,null);
assert.ok(!coach(DEV,{jd:JD}).keywords.rows.some(r=>r.label==='Testing/QA'))});
test('eligibility is separate: missing licence = verify, matching licence = ok, years short = not_met',()=>{const JD='Staff nurse role. Valid nursing licence required. 2+ years experience. Patient care, medication, patient records.';
const no=coach('Nurse. 3 years of experience. Patient care and medication rounds for patients on a busy ward every shift.',{jd:JD}).recruiter.scores.eligibility;assert.equal(no.status,'verify');
const yes=coach('Registered nurse with NMC registration and a valid nursing licence. 3 years of experience. Patient care and medication rounds for patients on a busy ward.',{jd:JD}).keywords.reqRows;assert.ok(yes.some(r=>/credential/.test(r.label)&&r.state==='ok'));
const short=coach('Nurse. 1 year of experience. Patient care and medication rounds for patients on a busy ward every shift.',{jd:JD}).recruiter;assert.equal(short.scores.eligibility.status,'not_met');assert.match(short.verdict,/Not eligible/)});
test('good bullets without numbers are not punished as poor evidence',()=>{const CV='Experience\nEducation\nSkills\n- Monitored vital signs and reported changes to the treating doctor\n- Prepared and administered prescribed medication to ward patients\n- Educated families about wound care and discharge plans\n- Coordinated with pharmacy to resolve medication shortages promptly\nme@x.io';
const r=coach(CV).recruiter;assert.ok(r.scores.quality.parts.evidence>=75,'evidence '+r.scores.quality.parts.evidence)});
test('job terms match word stems (administer ↔ Administered), not just exact words',()=>{const r=coach('Staff nurse. Administered medication and monitored patients daily on a busy surgical ward. Kept accurate records.',{jd:'We need someone to administer medication and monitor patients. Administer and monitor daily. Records, records, medication.'});
for(const w of['administer','monitor'])assert.equal(r.keywords.rows.find(x=>x.label===w).state,'ok',w)});
