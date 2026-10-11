'use strict';
// Entry for Vercel's "Express" preset (it looks for server.js). The explicit api/index.js + vercel.json path is preferred.
require('express');
module.exports=require('./api/index.js');
