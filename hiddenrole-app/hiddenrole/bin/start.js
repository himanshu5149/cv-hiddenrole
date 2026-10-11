'use strict';
const {createApp}=require('../src/hiddenrole');
const app=createApp();app.locals.start();
const port=process.env.PORT||3000;
app.listen(port,()=>console.log('HiddenRole on http://localhost:'+port));
