'use strict';
// Education + experience parsing. Never counts degree dates as work experience; "pursuing" degrees are not completed degrees.
const MON='jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec',MI={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
const D='(?:(?:('+MON+')[a-z]*\\.?,?\\s+|(\\d{1,2})[\\/.-])?((?:19|20)\\d{2}))';
const RANGE=new RegExp(D+'\\s*(?:-|–|—|to|until|till)\\s*(?:'+D+'|(present|current|currently|now|ongoing|till date|to date|today))','gi');
const DEGW=/\b(bachelor|master|b\.?\s?sc|m\.?\s?sc|bca|bba|mba|bbs|diploma|degree|gpa|cgpa|graduat\w*|b\.?\s?tech|m\.?\s?tech|mbbs|ph\.?\s?d|certificate in)\b|\+2/i,INST=/\b(university|college|campus|school|institute)\b/i,JOBW=/\b(engineer|developer|manager|intern|assistant|teacher|lecturer|professor|nurse|officer|analyst|executive|consultant|trainer|coordinator|designer|accountant|administrator|supervisor|technician)\b/i;
function firstRange(tail){const m=new RegExp(RANGE.source,'i').exec(tail);return m?{end:m.index+m[0].length,now:!!m[7],endYear:m[6]?+m[6]:0}:null}
function degreeInfo(t,now=new Date()){const Y=now.getFullYear();
const P=[[5,/\bph\.?\s?d\b|\bdoctorate\b|\bdoctor of philosophy\b/gi],
[4,/\bmaster'?s?(?=\s+(?:of|in|degree|program|programme|course)\b)|\bm\.?\s?sc\b|\bmba\b|\bm\.?\s?tech\b|\bmca\b|\bmbs\b|\bmph\b/gi],[4,/\bM\.?A\.?(?=\s+in\b)|\bM\.?Ed\b/g],
[3,/\bbachelor'?s?\b|\bb\.?\s?sc\b|\bb\.?\s?tech\b|\bbca\b|\bbba\b|\bbbs\b|\bbim\b|\bbsn\b|\bmbbs\b|\bb\.?\s?com\b|\bundergraduate degree\b/gi],[3,/\bB\.?E\.?(?=\s+in\b|\s*\()|\bB\.?A\.?(?=\s+in\b|\s*\()|\bB\.?Ed\b/g],
[2,/\bdiploma\b|\+2\b|\bplus two\b|\bhigher secondary\b|\bhsc\b|\ba-levels?\b/gi],[1,/\bslc\b|\bhigh school\b|\bsecondary school\b|\bssc\b|\bmatric(?:ulation)?\b/gi]];
let deg=0,prog=0;
for(const[lv,re]of P){re.lastIndex=0;let m;while((m=re.exec(t))){const tail=t.slice(m.index,m.index+160),r=firstRange(tail),seg=tail.slice(0,r?r.end:100);
const pro=/\b(pursuing|currently|ongoing|expected|in progress|studying|enrolled|final year|(?:1st|2nd|3rd|4th|first|second|third|fourth) (?:year|semester))\b/i.test(seg)||!!(r&&(r.now||r.endYear>Y));
if(pro)prog=Math.max(prog,lv);else deg=Math.max(deg,lv)}}
return{deg,prog:prog>deg?prog:0}}
function yearsInfo(t,now=new Date()){const Y=now.getFullYear(),M=now.getMonth(),re=new RegExp(RANGE.source,'gi'),iv=[];let m,prevEnd=0;
while((m=re.exec(t))){const s0=m.index,e0=s0+m[0].length,before=t.slice(Math.max(prevEnd,s0-70),s0),after=t.slice(e0,e0+40);prevEnd=e0;
if(DEGW.test(before)||(INST.test(before)&&!JOBW.test(before))||/^[^\n]{0,40}?\b(bachelor|master|b\.?\s?sc|m\.?\s?sc|bca|bba|mba|diploma|degree|gpa|cgpa)\b/i.test(after))continue;
const sy=+m[3],sm=m[1]?MI[m[1].toLowerCase()]:(m[2]&&+m[2]>=1&&+m[2]<=12?+m[2]-1:0);let ey,em;
if(m[7]){ey=Y;em=M}else{ey=+m[6];em=m[4]?MI[m[4].toLowerCase()]:(m[5]&&+m[5]>=1&&+m[5]<=12?+m[5]-1:0)}
if(ey>Y+1||sy<1960||ey<sy)continue;const s=sy*12+sm;let e=ey*12+em;if(!m[7]&&!m[4]&&!m[5]&&ey===sy)e=s+6;if(e<=s||e-s>600)continue;iv.push([s,e])}
iv.sort((a,b)=>a[0]-b[0]);let tot=0,cur=null;for(const[s,e]of iv){if(!cur)cur=[s,e];else if(s<=cur[1])cur[1]=Math.max(cur[1],e);else{tot+=cur[1]-cur[0];cur=[s,e]}}if(cur)tot+=cur[1]-cur[0];
const dates=Math.round(tot/6)/2;let stated=0,x;
const R1=/(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:\w+\s+){0,2}?(?:experience|exp\b|working|professional|industry)/gi,R2=/\bexperience\s*(?:of|:|-)?\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/gi;
while((x=R1.exec(t)))stated=Math.max(stated,+x[1]);while((x=R2.exec(t)))stated=Math.max(stated,+x[1]);
return{years:Math.max(dates,stated),dates,stated}}
module.exports={degreeInfo,yearsInfo};
