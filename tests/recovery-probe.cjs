'use strict';
const assert=require('node:assert/strict');const {retryStep}=require('../server/build-retry.cjs');
const ok={code:0,output:'Done',errors:''},bad={code:12,output:'Tool failed',errors:''};
async function check(results,options={}){let calls=0,cleans=0;const messages=[];const result=await retryStep({execute:async()=>{calls++;return results[Math.min(calls-1,results.length-1)]},clean:async()=>{cleans++},report:message=>messages.push(message),...options});return {result,calls,cleans,messages};}
(async()=>{
let x=await check([ok]);assert.equal(x.calls,1);assert.equal(x.cleans,0);
x=await check([bad,ok]);assert.equal(x.calls,2);assert.equal(x.cleans,1);assert.equal(x.result.code,0);
x=await check([bad,bad]);assert.equal(x.calls,2);assert.equal(x.cleans,1);assert.equal(x.result.code,12);
x=await check([bad],{enabled:false});assert.equal(x.calls,1);assert.equal(x.cleans,0);
x=await check([{...bad,output:'xdvipdfmx: gave an error in previous invocation'}],{writable:()=>false});assert.equal(x.calls,1);assert.equal(x.cleans,0);assert(x.messages[0].includes('PDF'));
x=await check([bad],{cancelled:()=>true});assert.equal(x.calls,1);assert.equal(x.cleans,0);
x=await check([{...bad,signal:'SIGTERM'}]);assert.equal(x.calls,1);assert.equal(x.cleans,0);
x=await check([bad,ok],{clean:async()=>{throw Error('Cleaner unavailable')}});assert.equal(x.calls,2);assert(x.messages.some(m=>m.includes('清理失败')));
let cancelled=false;x=await check([bad],{clean:async()=>{cancelled=true},cancelled:()=>cancelled});assert.equal(x.calls,1);
await assert.rejects(retryStep({execute:async()=>{throw Error('Tool missing')},clean:async()=>{throw Error('Should not clean')}}),/Tool missing/);
console.log('PASS plugin retry: clean once, disabled setting, persistent failure, PDF lock, cancellation, missing tool and cleanup failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
