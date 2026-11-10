'use strict';
// Labeled synthetic observations, including independent calendar and privacy cases.
const {MONDAY,DAY,WEEK}=require('./server-metrics-fixture-draft-v1.cjs');
const item=(operation,settings={})=>({operation,settings});
function semanticBatches(){
  const batches=Array.from({length:6},()=>[]);
  for(const origin of [0,-DAY,Date.UTC(2000,1,29),MONDAY])
    for(const offset of [-1,0,1,DAY-1,DAY,3*DAY,6*DAY,7*DAY-1,7*DAY])
      batches[0].push(item('week',{t:origin+offset,empty:true}));
  for(const values of [[],[7],[3,1,2],[2,2,2,2],[-10,0,10],[9,8,7,6,5,4,3,2,1]])
    for(const p of [0,0.01,0.25,0.5,0.75,0.99,1])
      batches[1].push(item('percentile',{values,p,empty:true}));
  for(const name of ['loi_sent','loi_signed'])for(const ws of ['ws-0','ws-1','missing'])
    for(const noteRef of [undefined,null,'','LOI-8','a'.repeat(64),'a'.repeat(65),'https://example.invalid','a@example.invalid','bad ref'])
      for(const verifiedOriginal of [undefined,false,true])
        batches[2].push(item('loi',{name,ws,options:{noteRef,verifiedOriginal}}));
  for(const name of ['loi_sent','loi_signed'])for(const priorSigned of [false,true])
    for(const now of [0,MONDAY,MONDAY+1])
      batches[2].push(item('loi',{name,priorSigned,now}));
  for(const since of [null,'','2026-07-01','2026-10-26','2026-11-02','2099-01-01','invalid'])
    for(const now of [MONDAY-1,MONDAY,MONDAY+1,MONDAY+WEEK-1,MONDAY+WEEK])
      batches[3].push(item('report',{since,now}));
  for(const activitySource of ['session','epoch','usage','audit','operator','all'])
    for(const cohortWeeks of [0,1,2,4,5,12,13])
      batches[3].push(item('report',{activitySource,cohortWeeks}));
  for(const workspaces of [1,2,4])for(const sampleOnly of [false,true])
    for(const estimateCount of [0,1,3,5])
      batches[4].push(item('report',{workspaces,sampleOnly,estimateCount,allStages:true}));
  for(const empty of [false,true])for(const noSample of [false,true])
    for(const noRolled of [false,true])for(const requestState of ['approved','pending','rejected'])
      batches[4].push(item('report',{empty,noSample,noRolled,requestState}));
  for(const minutes of [0,0.1,1,59.4,59.9,60,119.9,2879,2880,3000])
    for(const cost of [null,0,1,-1000000])
      batches[5].push(item('report',{minutes,cost}));
  for(const directiveOnly of [false,true])for(const orphanEvents of [false,true])
    for(const omitOptions of [false,true])
      batches[5].push(item('report',{directiveOnly,orphanEvents,omitOptions}));
  return batches;
}
const faultPaths=[item('report'),item('report',{empty:true}),item('loi'),
  item('loi',{options:{verifiedOriginal:false,noteRef:'bad ref'}}),
  item('percentile',{empty:true,values:[9,1,5,3],p:0.75}),item('week',{empty:true,t:MONDAY+6*DAY})];
module.exports={semanticBatches,faultPaths};
