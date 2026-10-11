'use strict';
const Database=require('better-sqlite3'),fs=require('fs'),path=require('path');
function open(file){if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true});
const db=new Database(file);db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cvs(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,text TEXT NOT NULL,delete_after INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS opportunities(id INTEGER PRIMARY KEY,key TEXT UNIQUE NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,org TEXT,url TEXT NOT NULL,source TEXT NOT NULL,description TEXT,min_deg INTEGER DEFAULT 0,min_years REAL DEFAULT 0,country_scope TEXT DEFAULT '[]',required TEXT DEFAULT '[]',deadline TEXT,status TEXT DEFAULT 'unknown',last_checked INTEGER,location TEXT);
CREATE TABLE IF NOT EXISTS saved(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,opp_id INTEGER NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,state TEXT NOT NULL DEFAULT 'saved',notes TEXT DEFAULT '',PRIMARY KEY(user_id,opp_id));
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,user_id INTEGER,name TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_opp_status ON opportunities(status);`);
try{db.exec('ALTER TABLE opportunities ADD COLUMN location TEXT')}catch(e){}
return db}
const row=o=>o&&({...o,required:JSON.parse(o.required||'[]'),country_scope:JSON.parse(o.country_scope||'[]')});
function upsertOpp(db,o){db.prepare(`INSERT INTO opportunities(key,type,title,org,url,source,description,min_deg,min_years,country_scope,required,deadline,status,last_checked,location)
VALUES(@key,@type,@title,@org,@url,@source,@description,@min_deg,@min_years,@country_scope,@required,@deadline,@status,@last_checked,@location)
ON CONFLICT(key) DO UPDATE SET type=excluded.type,title=excluded.title,org=excluded.org,url=excluded.url,description=excluded.description,min_deg=excluded.min_deg,min_years=excluded.min_years,country_scope=excluded.country_scope,required=excluded.required,deadline=excluded.deadline,status=excluded.status,last_checked=excluded.last_checked,location=excluded.location`)
.run({org:'',location:null,description:'',min_deg:0,min_years:0,deadline:null,status:'open',last_checked:null,...o,country_scope:JSON.stringify(o.country_scope||[]),required:JSON.stringify(o.required||[])})}
// closes past-deadline items, and marks items not re-verified for 30 days as unknown (never closes unverified programs)
function expire(db,now=Date.now()){const today=new Date(now).toISOString().slice(0,10);
db.prepare("UPDATE opportunities SET status='closed' WHERE deadline IS NOT NULL AND deadline<?").run(today);
db.prepare("UPDATE opportunities SET status='unknown' WHERE status='open' AND last_checked IS NOT NULL AND last_checked<?").run(now-30*864e5);
db.prepare('DELETE FROM cvs WHERE delete_after<?').run(now);db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now)}
module.exports={open,row,upsertOpp,expire};
