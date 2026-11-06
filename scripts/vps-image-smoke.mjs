// Run only inside the isolated code image, with no host mounts or network access.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { Store } from '../lib/storage/db.ts';
import { AccessService } from '../lib/auth/service.ts';
// For stdin execution, use /app/scripts as the container working directory.
const database='/tmp/styx-image-check.sqlite';
const store=new Store(database);
const password=randomBytes(24).toString('hex');
await new AccessService(store,'password').createUser('image-owner',password,store.workspace,'owner');
store.close();
let child;
const headers={Host:'styx.test'};
// Send the public Host explicitly over loopback; native fetch can rewrite Host.
const fetch = (url, init = {}) => new Promise((resolve, reject) => {
  const target = new URL(url);
  const req = httpRequest({ hostname:'127.0.0.1', port:4173, path:target.pathname, method:init.method || 'GET', headers:{host:'styx.test',...init.headers} }, res => {
    const chunks=[];
    res.on('data', chunk=>chunks.push(chunk));
    res.on('end',()=>{
      const responseHeaders=new Headers();
      for(const [name,value] of Object.entries(res.headers))
        for(const item of Array.isArray(value)?value:[value]) if(item!==undefined)responseHeaders.append(name,item);
      resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:responseHeaders}));
    });
  });
  req.on('error',reject);
  req.setTimeout(15000,()=>req.destroy(Error('Image check request timed out')));
  req.end(init.body);
});
async function stop(){
  if(child && child.exitCode===null){const exited=new Promise(done=>child.once('exit',done));child.kill();await exited;}
}
async function start(){
  child=spawn(process.execPath,['--import','tsx','scripts/start-vps.ts'],{cwd:'/app',stdio:'ignore',env:{PATH:process.env.PATH,NODE_ENV:'production',HOST:'0.0.0.0',PORT:'4173',STYX_CONTAINER:'true',STYX_AUTH_MODE:'password',STYX_APP_ORIGIN:'https://styx.test',STYX_DB:database}});
  for(let i=0;i<100;i++){
    try{if((await fetch('http://127.0.0.1:4173/health/live')).status===200)return;}catch{}
    if(child.exitCode!==null)throw Error('Isolated app startup failed');
    await new Promise(done=>setTimeout(done,100));
  }
  throw Error('Isolated app startup timed out');
}
try{
  await start();
  assert.equal((await fetch('http://127.0.0.1:4173/app')).status,200);
  assert.equal((await fetch('http://127.0.0.1:4173/api/state',{headers})).status,401);
  const pre=await fetch('http://127.0.0.1:4173/api/session',{headers});
  const cookie=pre.headers.getSetCookie()[0].split(';')[0];
  const session=await pre.json();
  const login=await fetch('http://127.0.0.1:4173/api/auth/login',{method:'POST',headers:{...headers,Cookie:cookie,Origin:'https://styx.test','Content-Type':'application/json','X-Styx-CSRF':session.csrf},body:JSON.stringify({username:'image-owner',password})});
  assert.equal(login.status,200);
  const authCookie=login.headers.getSetCookie()[0].split(';')[0];
  assert.match(login.headers.getSetCookie()[0],/Secure/i);
  assert.equal((await fetch('http://127.0.0.1:4173/api/state',{headers:{...headers,Cookie:authCookie}})).status,200);
  await stop();await start();
  assert.equal((await fetch('http://127.0.0.1:4173/api/state',{headers:{...headers,Cookie:authCookie}})).status,200);
  console.log(JSON.stringify({passed:true,architecture:process.arch,node:process.version,checks:['production-page','anonymous-private-api-denied','owner-login','secure-cookie','authenticated-data','session-survives-app-restart'],externalNetwork:false,hostDataMounted:false}));
}finally{await stop();}
