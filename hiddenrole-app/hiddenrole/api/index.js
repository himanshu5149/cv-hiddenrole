'use strict';
// Vercel serverless entry. Serverless disks are read-only and not shared, so this runs in stateless mode:
// CV analysis, career coach and program search work; accounts/tracker are disabled (see README).
const {createApp}=require('../src/hiddenrole');
module.exports=createApp({...process.env,DB_PATH:process.env.DB_PATH||'/tmp/hiddenrole.db',EPHEMERAL:'1',TRUST_PROXY:'1',COOKIE_SECURE:'1'});
