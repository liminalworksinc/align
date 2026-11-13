'use strict';
const {NOW,DAY}=require('./server-retention-core-fixture-draft-v1.cjs');
const item=(operation,settings={})=>({operation,settings});
function semanticBatches(){
  const batches=Array.from({length:7},()=>[]);
  for(const empty of [false,true])for(const dryRun of [false,true])for(const asyncTx of [false,true])
    for(const repeat of [false,true])batches[0].push(item('run',{empty,dryRun,asyncTx,repeat}));
  for(const date of ['2027-01-01','2027-02-01','2027-03-01','2027-04-01','2028-02-29','2027-03-31'])
    for(const offset of [-1,0,1])for(const dryRun of [false,true])
      batches[1].push(item('run',{now:Date.parse(date+'T00:00:00.000Z')+offset,dryRun}));
  for(const lastActivityAt of ['2026-02-01T00:00:00.000Z','2027-04-01T00:00:00.000Z'])
    for(const stoppedAt of [null,'2026-01-01T00:00:00.000Z','2027-04-01T00:00:00.000Z'])
      batches[1].push(item('run',{lastActivityAt,stoppedAt}));
  for(const restoreDays of [7,30,37])for(const deletedAgeDays of [7,29,30,31,37,38])
    for(const deletedOffset of [-1,0,1])for(const dryRun of [false,true])
      batches[2].push(item('run',{restoreDays,deletedAgeDays,deletedOffset,dryRun}));
  for(const departureAgeDays of [29,30,31])for(const departureOffset of [-1,0,1])
    for(const removeMembership of [false,true])for(const dryRun of [false,true])
      batches[3].push(item('run',{departureAgeDays,departureOffset,removeMembership,plantPerson:true,dryRun}));
  for(const noPending of [false,true])for(const outerTx of [false,true])
    batches[3].push(item('pseudonymise',{noPending,outerTx,plantPerson:true,removeMembership:true}));
  for(const operation of ['naming','departure','cancel'])for(const noPending of [false,true])
    for(const user of ['fixture-viewer-a','fixture-owner-a','missing'])
      batches[3].push(item(operation,{noPending,user}));
  for(const missingVerification of [false,true])for(const missingSessions of [false,true])
    for(const missingMarkers of [false,true])for(const sessionCapDays of [7,30,365])
      batches[4].push(item('run',{missingVerification,missingSessions,missingMarkers,sessionCapDays,lastActivityAt:new Date(NOW).toISOString()}));
  for(const ALIGN_TEST_IDP of [undefined,'0','1'])for(const ALIGN_TEST_NOW of [undefined,'','invalid','2020-02-29T12:00:00.000Z'])
    for(const idpEnabled of [false,true])for(const explicitEnv of [false,true])
      batches[5].push(item('clock',{env:{ALIGN_TEST_IDP,ALIGN_TEST_NOW},idpEnabled,explicitEnv}));
  for(const personId of ['fm_0','fm_1','fm_0003','fm_-1','fm_12x','xfm_2','unknown'])
    for(const personName of [undefined,null,'','Name'])batches[6].push(item('name',{personId,personName,empty:true}));
  for(const n of [-1,0,1,18,1000000])batches[6].push(item('former-id',{n,empty:true}));
  for(const reverseCounts of [false,true])batches[6].push(item('describe',{reverseCounts,empty:true}));
  for(const dryRun of [false,true])batches[6].push(item('run',{dryRun,fileBacked:true,plantPerson:true,removeMembership:true}));
  batches[6].push(item('orphans'));
  return batches;
}
const faultPaths=[item('run'),item('run',{dryRun:true}),item('run',{plantPerson:true,removeMembership:true,lastActivityAt:new Date(NOW).toISOString()}),
  item('pseudonymise',{plantPerson:true,removeMembership:true,outerTx:true}),item('naming',{plantPerson:true}),
  item('clock',{env:{ALIGN_TEST_IDP:'1',ALIGN_TEST_NOW:'2020-02-29T12:00:00.000Z'}}),item('describe',{empty:true})];
module.exports={semanticBatches,faultPaths};
