'use strict';
// Labeled synthetic scheduler controls. No real timers or application database.
const assert=require('node:assert/strict');
const countKeys=['workspaces_purged','sessions_rolled_up','usage_rows_rolled_up','former_members_pseudonymised','audit_rows_deleted','codes_deleted','sign_in_sessions_deleted','activity_deleted','invites_deleted','access_requests_deleted','events_deleted','asks_deleted','value_reports_deleted','requests_deleted','deleted_session_markers_deleted'];
const resourceNames=['core','runRetention','globalState','readConsole','readSetInterval'];
function normalize(value,seen=new Map()){
  if(value===undefined)return {$undefined:true};
  if(typeof value==='function')return {$function:true};
  if(typeof value==='number'&&!Number.isFinite(value))return {$number:String(value)};
  if(value===null||typeof value!=='object')return value;
  if(seen.has(value))return {$ref:seen.get(value)};
  seen.set(value,seen.size);
  if(Array.isArray(value))return Array.from(value,x=>normalize(x,seen));
  return Object.fromEntries(Object.keys(value).map(key=>[key,normalize(value[key],seen)]));
}
function fixture(settings={}){
  let active=false,reads=0,effects=0,captures=0,runCalls=0,unrefs=0,lastNow;
  const trace=[],callbacks=[],pending=[],wrapped=new WeakMap(),fault=new Error('owned retention runner fault');
  const sourceError=Object.hasOwn(settings,'errorValue')?settings.errorValue:Object.assign(new Error('private retention error text'),{name:settings.errorName??'OwnedRetentionError'});
  const counts=Object.fromEntries(countKeys.map(key=>[key,key===settings.positiveKey?(settings.count??1):0]));
  const proxies=new WeakSet();
  const state={};
  if(settings.existingTimer)state.__alignRetention={id:'existing-timer'};
  const quiet=fn=>{const old=active;active=false;try{return fn();}finally{active=old;}};
  function watch(value,label){
    if(!value||typeof value!=='object'||value instanceof Date)return value;
    if(proxies.has(value))return value;
    if(wrapped.has(value))return wrapped.get(value);
    const proxy=new Proxy(value,{
      get(target,key,receiver){if(active&&typeof key==='string'){trace.push(['get',label,key]);if(++reads===settings.propertyFault)throw fault;}return watch(Reflect.get(target,key,receiver),label+'.'+String(key));},
      set(target,key,value,receiver){if(active)trace.push(['set',label,String(key),quiet(()=>normalize(value))]);return Reflect.set(target,key,value,receiver);},
      ownKeys(target){if(active)trace.push(['keys',label]);return Reflect.ownKeys(target);},
    });
    wrapped.set(value,proxy);proxies.add(proxy);return proxy;
  }
  function effect(name,args,fn){
    if(active){trace.push(['service',name,quiet(()=>normalize(args))]);if(++effects===settings.effectFault)throw fault;}
    return quiet(fn);
  }
  let core;
  core=watch({
    retentionNow:function(){assert.equal(this,core);return effect('retentionNow',[],()=>lastNow=new Date('2026-11-09T00:00:00.000Z'));},
    describeCounts:function(c){assert.equal(this,core);return effect('describeCounts',[c],()=>Object.entries(c).map(([key,value])=>key.replaceAll('_',' ')+' '+value).join(', '));},
    RETENTION_INTERVAL_MS:86400000,
  },'core');
  const consolePort={
    log:function(...args){assert.equal(this,consolePort);return effect('console.log',args,()=>undefined);},
    error:function(...args){assert.equal(this,consolePort);return effect('console.error',args,()=>{trace.push(['error-identity',args[1]===sourceError,args[1]===fault]);});},
  };
  const statePort=watch(state,'globalState');
  const timerFactory=function(callback,interval){
    assert.equal(this,undefined);assert.equal(typeof callback,'function');
    return effect('setInterval',[interval],()=>{
      const target={id:'timer-'+(callbacks.length+1)};let timer;
      if(!settings.unrefMissing)target.unref=function(){assert.equal(this,timer);return effect('unref',[],()=>{unrefs++;});};
      timer=watch(target,'timer-'+(callbacks.length+1));callbacks.push(callback);return timer;
    });
  };
  const supplied={
    core,globalState:statePort,
    runRetention:function(now){
      assert.equal(this,undefined);assert.equal(now,lastNow);
      return effect('runRetention',[now.toISOString()],()=>{
        runCalls++;
        const reject=settings.rejectRun===true || (Array.isArray(settings.rejectRun)&&settings.rejectRun.includes(runCalls));
        if(settings.deferred)return new Promise((resolve,rejectPromise)=>pending.push(()=>reject?rejectPromise(sourceError):resolve(watch({...counts},'counts-'+runCalls))));
        return reject?Promise.reject(sourceError):Promise.resolve(watch({...counts},'counts-'+runCalls));
      });
    },
    readConsole:function(){assert.equal(this,undefined);return effect('readConsole',[],()=>consolePort);},
    readSetInterval:function(){assert.equal(this,undefined);return effect('readSetInterval',[],()=>timerFactory);},
  };
  const resources=new Proxy(supplied,{get(target,key){trace.push(['capture',String(key)]);if(++captures===settings.captureFault)throw fault;return target[key];},ownKeys(){throw Error('Resource enumeration forbidden');}});
  const flush=()=>{while(pending.length)pending.shift()();};
  async function run(factory){
    let value,caught,didThrow=false;
    try{
      const api=factory(resources);
      assert.deepEqual(Object.keys(api),['startRetention']);
      assert.equal(api.startRetention.name,'startRetention');assert.equal(api.startRetention.length,1);assert.equal(api.startRetention.constructor.name,'AsyncFunction');
      active=true;
      if(settings.concurrent){
        const tasks=Array.from({length:settings.calls??2},()=>api.startRetention(settings.hosted??false));
        trace.push(['after-start-calls',callbacks.length,pending.length]);flush();value=await Promise.all(tasks);
      }else{
        value=[];
        for(let i=0;i<(settings.calls??1);i++){
          const task=api.startRetention(settings.hosted??false);
          trace.push(['after-start-call',callbacks.length,pending.length]);flush();value.push(await task);
        }
      }
      if(settings.fireTimer&&callbacks.length){
        assert(!settings.propertyFault&&!settings.effectFault,'Fault controls use awaited startup, not detached timer promises');
        callbacks[0]();trace.push(['after-timer-call',pending.length]);flush();
        await Promise.resolve();await Promise.resolve();await Promise.resolve();
      }
    }catch(error){caught=error;didThrow=true;flush();}
    active=false;
    return {result:normalize(value),error:didThrow?{name:caught?.name,message:caught?.message,sameFault:caught===fault,sameSourceError:caught===sourceError}:null,
      trace,reads,effects,captures,runCalls,timers:callbacks.length,unrefs,state:normalize(state)};
  }
  return {run};
}
function semanticCases(){
  const rows=[];
  for(const hosted of [false,true])for(const existingTimer of [false,true])for(const deferred of [false,true])
    for(const positiveKey of [undefined,...countKeys])
      rows.push({hosted,existingTimer,deferred,positiveKey});
  for(const hosted of [false,true])for(const concurrent of [false,true])for(const calls of [1,2,3])
    for(const deferred of [false,true])for(const unrefMissing of [false,true])
      rows.push({hosted,concurrent,calls,deferred,unrefMissing,positiveKey:'events_deleted'});
  for(const hosted of [false,true])for(const errorValue of [undefined,null,false,0,'private rejection',{name:'OwnedName',message:'private detail'}])
    for(const existingTimer of [false,true]){
      const row={hosted,rejectRun:true,existingTimer};
      if(errorValue!==undefined)row.errorValue=errorValue;
      rows.push(row);
    }
  for(const hosted of [false,true])for(const deferred of [false,true])for(const rejectRun of [false,true,[2]])
    rows.push({hosted,deferred,rejectRun,fireTimer:true,positiveKey:'events_deleted'});
  for(const count of [-1,0,1,2])rows.push({positiveKey:'events_deleted',count,calls:2});
  return rows;
}
const faultPaths=[{}, {positiveKey:'events_deleted'}, {hosted:true,rejectRun:true},
  {hosted:false,rejectRun:true}, {existingTimer:true,positiveKey:'workspaces_purged'},
  {deferred:true,calls:2,positiveKey:'events_deleted'}, {concurrent:true,deferred:true,calls:2}];
module.exports={fixture,normalize,resourceNames,countKeys,semanticCases,faultPaths};
