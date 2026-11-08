// Run with: node --experimental-test-module-mocks scripts/test-readiness.mjs
// Requires an already-migrated disposable localhost database named readiness_*
// or accountrix_test_*. Never imports the production listener or sends email.
import http from 'node:http';
import {mock} from 'node:test';
import {spawn} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const database=process.env.ACCOUNTING_TEST_DATABASE_URL;
const address=database&&new URL(database);
if(!address||!['localhost','127.0.0.1'].includes(address.hostname)||!/^\/(readiness_|accountrix_test_)/.test(address.pathname)){
  throw new Error('Set ACCOUNTING_TEST_DATABASE_URL to a migrated disposable localhost readiness_* or accountrix_test_* database.');
}
const cwd=fileURLToPath(new URL('../',import.meta.url)),emails=[];
process.env.DATABASE_URL=database;
process.env.JWT_ACCESS_SECRET='disposable-readiness-test-secret';
process.env.NODE_ENV='test';process.env.AUTH_RATE_LIMIT_MAX='2000';
process.env.OPENAI_API_KEY='';process.env.APP_CLIENT_URL='http://127.0.0.1:43188';
process.env.CORS_ORIGINS='http://127.0.0.1:43188';
process.env.GOOGLE_CLIENT_ID='disposable-client';process.env.GOOGLE_CLIENT_SECRET='disposable-secret';
mock.module(fileURLToPath(new URL('../src/lib/sendEmail.js',import.meta.url)),{namedExports:{
  isEmailConfigured:()=>true,isSmtpConfigured:()=>true,
  sendAccountEmail:async data=>{emails.push(data);},
  sendInvoiceEmail:async()=>({messageId:'stub'}),sendInviteEmail:async()=>({messageId:'stub'}),
}});
let googleProfile={sub:'fixture-google',email:'fixture-google@example.test',email_verified:true,name:'Google fixture'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>String(url)==='https://oauth2.googleapis.com/token'
  ?new Response(JSON.stringify({access_token:'stub-only'}),{headers:{'Content-Type':'application/json'}})
  :String(url)==='https://www.googleapis.com/oauth2/v3/userinfo'
    ?new Response(JSON.stringify(googleProfile),{headers:{'Content-Type':'application/json'}})
    :originalFetch(url,options);
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const ocr=http.createServer((req,res)=>{req.resume();req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({text:'Test Supplier\nInvoice Date 24/24/2026\nTotal 40.00'}));});});
let app;
const server=http.createServer((req,res)=>{
  if(req.url==='/__test/mail'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(emails));}
  if(req.url==='/__test/google'&&req.method==='POST'){
    let body='';req.on('data',part=>{body+=part;if(body.length>10000)req.destroy();});
    req.on('end',()=>{try{googleProfile=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end('{}');}catch{res.writeHead(400);res.end();}});return;
  }
  if(!app){res.writeHead(503);res.end();return;}app(req,res);
});
try{
  process.env.OCR_SERVICE_URL='http://127.0.0.1:'+await listen(ocr);
  const root='http://127.0.0.1:'+await listen(server);
  process.env.GOOGLE_CALLBACK_URL=root+'/api/auth/google/callback';
  ({default:app}=await import('../src/app.js'));
  const tests=(await readdir(new URL('../tests/',import.meta.url))).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
  const env={...process.env};
  for(const key of ['ACCOUNTING_TEST_API','ACCOUNTING_AUTH_TEST_API','LEDGER_TEST_API','WORKFLOWS_TEST_API','PERFORMANCE_TEST_API'])env[key]=root;
  console.log('Running against disposable localhost books; Google, email and OCR are stubbed.');
  const child=spawn(process.execPath,['--test',...tests],{cwd,env,stdio:'inherit'});
  process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}finally{
  globalThis.fetch=originalFetch;
  server.closeAllConnections();ocr.closeAllConnections();server.close();ocr.close();
  const {prismaUnscoped}=await import('../src/db/prisma.js');await prismaUnscoped.$disconnect();
}
