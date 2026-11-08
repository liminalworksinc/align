'use strict';
const {clean,quoted,end_sentence,ended_data}=require('./core.js');
const {SHARE_CHANGED,STOP_HOLDS_NO_SHARE}=ended_data();
const prefix=key=>key.slice(0,key.indexOf(':'));
const joinAnd=xs=>xs.length===1?xs[0]:xs.slice(0,-1).join(', ')+' and '+xs[xs.length-1];
function state_situation(now) {
  if(now.live)return 'live';
  if(now.ended!=='device_signed_out'&&now.ended!=='access_lost')return 'stopped';
  if(now.signed_in&&now.unread)return 'hold';
  if(!now.signed_in)return now.ended==='access_lost'&&!now.reaches?'noreach':'out';
  return now.reshare?'reshare':'noreach';
}
function told_situation(key) {
  const s=prefix(key);
  if(s==='started'||key==='changed:live')return 'live';
  if(s==='stopped'||s==='share_err'||key==='changed:other')return 'stopped';
  if(['out','reshare','noreach'].includes(s))return s;
  if(s==='none'&&['live','stopped','out','reshare','noreach'].includes(key.slice(5)))return key.slice(5);
  return null;
}
function none_told(id,now) { const sit=state_situation(now);return {id,key:'none:'+(sit==='hold'?'':sit),tail:''}; }
function share_retell(id,w,told,fresh,changed=false) {
  if(changed)return !told||told_situation(told.key)===null||told_situation(told.key)!==told_situation(w.key)||Boolean(w.tail&&w.tail!==told.tail);
  if(fresh||!told||told.id!==id)return fresh;
  return prefix(told.key)!==prefix(w.key)||Boolean(w.tail&&w.tail!==told.tail);
}
function stored_text(f) { return f.e==='started'||f.e==='share_err'?f.text??SHARE_CHANGED:SHARE_CHANGED; }
function never_sent_words(when) { return `this session's share had not reached the Align server yet when ${when}, so it was not shared`; }
function ended_why_words(why,again,relogin=false,brief=false) {
  if(why==='device_signed_out'&&relogin)return 'a new sign-in on this machine (`align login`) ended its share from the earlier sign-in';
  if(why==='device_signed_out')return (brief?'this machine signed out':'this machine signed out of Align')+(again?', and is signed in again now':'');
  if(why==='access_lost')return again?'this machine lost access to its Align workspace, and can reach it again now':'this machine no longer has access to its Align workspace';
  return "the Align server no longer has this session's share";
}
function stopped_for_good_words(lid,then) { return `this session's sharing was stopped (\`::align unshare\`, \`align stop-sharing\` or Stop sharing on the web), and a session whose sharing was stopped is not shared again, so it stays stopped. To share it again, counting from now, first delete its shared history (it leaves every total): run \`align delete-history ${lid.slice(0,8)}\` in a terminal, or use Delete shared history on the web's Sessions page; then ${then}.`; }
function other_workspace_words(ws,other) { return `this session was shared with ${clean(ws,80)}, so it is shared again only there (its work is that workspace's), never into ${clean(other,80)}.`; }
function share_again_words(unread,where,there=false,unsent=false) {
  const share='`::align share`'+(where?' '+where:'')+' shares it'+(there?' there':'')+(unsent?'':' again');
  return (unread?'run `align sync` first (this machine has not yet heard whether its sharing was stopped on the web meanwhile), then ':'')+share;
}
function persistentStop(user,lost) {
  return 'this session stays stopped: a stop set from its Align workspace holds after its sharing ends'+(lost?', and nothing lifts it from here unless this machine can reach that workspace again, when sharing it there again lets the stop be lifted from the web':', and nothing lifts it from here now')+'. A new session is not stopped'+(user?'':', so the user can start one to keep working')+'.';
}
function latch_way_out(lid,reshare,reader,release=null,again={},stop=false) {
  const user=reader==='user', run=`${user?'you run':'the user runs'} \`align stop-sharing ${lid.slice(0,8)}\` in a terminal`, lifted='after which the stop or hold, if still in place, can be lifted from the web', runs=user?'run':'the user runs',types=user?'type':'types';
  if(reshare&&again.unread)return `tools stay blocked until it is shared again: ${runs} \`align sync\` in a terminal first (this machine has not yet heard from the Align server whether its sharing was stopped on the web meanwhile, and one stopped there is not shared again), then ${types} \`::align share\` in this session, ${lifted}.`;
  if(reshare)return `tools stay blocked until it is shared again (${user?'you can type':'the user can type'} \`::align share\` in this session), ${lifted}.`;
  if(again.login&&stop)return `tools stay blocked until it is shared again once this machine is signed in (${runs} \`align login\` in a terminal, then ${types} \`::align share\` in this session), ${lifted}; until then ${persistentStop(user,false)}`;
  if(again.login)return `tools stay blocked until ${run}, or until it is shared again once this machine is signed in (${runs} \`align login\` in a terminal, then ${types} \`::align share\` in this session), ${lifted}.`;
  if(release?.goals.length){
    const hold='the hold on '+joinAnd(release.goals.map(t=>'"'+t+'"'));
    if(release.stopped||stop)return `${persistentStop(user,Boolean(again.lost))} A release of ${hold} (which still reaches this session) lifts only the hold.`;
    return `tools stay blocked until ${hold} is released from the web (a release still reaches this session though its sharing ended), or until ${run}.`;
  }
  return stop?persistentStop(user,Boolean(again.lost)):`tools stay blocked until ${run}.`;
}
function latch_notice_tail(lid,reshare,release=null,again={},stop=false) {
  const what=!reshare&&release?.goals.length?(release.stopped?'stopped and held':'held'):'stopped or held';
  const start=` It was ${what} from the web, so `;
  const lifted='tools stay blocked until it is shared again that way, after which the stop or hold, if still in place, can be lifted from the web';
  if(!reshare&&again.login&&stop)return start+lifted+'; until then '+persistentStop(true,false);
  if(!reshare&&again.login)return start+lifted+`, or until you run \`align stop-sharing ${lid.slice(0,8)}\` in a terminal.`;
  return start+latch_way_out(lid,reshare,'user',release,again,stop);
}
function out_of_reach_words(ws,lid,latched,stopped=false) {return `this session was shared with ${clean(ws,80)}, and this machine can't reach ${clean(ws,80)} in Align now, so this session can't be shared there again from here, and it is never shared into another workspace instead; its usage stays on this machine.`+(latched?latch_notice_tail(lid,false,null,{lost:true},stopped):'');}
function hold_reason(latch) {
  const h=latch&&Array.isArray(latch.holds)?latch.holds[0]:null;
  if(!h)return "Align: all agents on this session's goal were paused from its Align workspace. Work resumes when the hold is released. Your work so far is saved.";
  const text=end_sentence(`Align: ${clean(h.by,50)||'Someone'} paused all agents on goal "${clean(h.goal_title,100)}"`+(h.reason?`: ${quoted(h.reason,200)}`:'')+(latch.holds.length>1?` (and ${latch.holds.length-1} more goal holds)`:''));
  return text+(!(latch.ended&&!latch.release)?' Work resumes when they release it.':'')+' Your work so far is saved.';
}
function release_notice(by,title) {return end_sentence(`Align: ${clean(by,50)||'Someone'} released the hold on "${clean(title,100)}"`);}
function kept_holds_note(titles) {
  if(!titles.length)return '';
  const single=titles.length===1,which=`The hold${single?'':'s'} on ${joinAnd(titles.map(t=>'"'+clean(t,100)+'"'))} still block${single?'s':''}`;
  return ` ${which} this session's tools until ${single?'it is':'they are'} released: moving to another goal does not lift ${single?'it':'them'}.`;
}
function words(key,f,why) {
  const unsent=Boolean(f.unsent),ws=f.ws;
  const again=f.goal?` (it counts toward "${f.goal}"${unsent?'':' again'})`:'';
  const before=f.before??'this machine signed out of Align';
  const relogin='a new sign-in on this machine (`align login`) replaced the earlier one';
  const endWhen=f.e==='access_lost'||why==='access_lost'?`you lost access to ${ws} in Align (you were removed from it or left it)`:f.via==='login'&&!f.out_since?relogin:'this machine signed out of Align';
  const never=never_sent_words(endWhen),neverOut=never_sent_words('this machine signed out of Align'),neverRelogin=never_sent_words(relogin);
  const noShare=unsent?`can't be shared there from here (${never})`:"can't be shared there again from here";
  switch(key){
    case 'out:signed_out':return `Align: this session stopped sharing because this machine signed out of Align; its usage stays on this machine from now on. To share it again, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case 'out:signed_out_unsent':return `Align: ${neverOut}; its usage stays on this machine. To share it, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case 'out:signed_out_ended':return unsent?`Align: this machine signed out of Align, so this session can't be shared from here for now (${never}); its usage stays on this machine. To share it, run \`align login\` in a terminal, then type \`::align share\` here${again}.`:`Align: this machine signed out of Align, so this session can't be shared again from here for now; its usage stays on this machine. To share it again, run \`align login\` in a terminal, then type \`::align share\` here${again}.`;
    case 'reshare:signed_in':return unsent?`Align: this machine is signed in to Align again. Earlier, ${never}; to share it, type \`::align share\` here${again}.`:`Align: this machine is signed in to Align again. To share this session again, type \`::align share\` here${again}.`;
    case 'reshare:relogin':return unsent?`Align: ${neverRelogin}; its usage stays on this machine until it is shared. To share it, type \`::align share\` here${again}.`:`Align: a new sign-in on this machine (\`align login\`) ended this session's share from the earlier sign-in; its usage stays on this machine until it is shared again. To share it again, type \`::align share\` here${again}.`;
    case 'reshare:workspace_back':return unsent?`Align: this machine can reach ${ws} in Align again. Earlier, ${never}; to share it there, type \`::align share\` here${again}.`:`Align: this machine can reach ${ws} in Align again. To share this session there again, type \`::align share\` here${again}.`;
    case 'reshare:removed':return `Align: this session stopped sharing because you were removed from ${ws} in Align (or left it) while this machine was not in touch; its usage from then on stays on this machine. You are a member again, so to share it there again, type \`::align share\` here${again}.`;
    case 'reshare:server_signed_out':return `Align: this session stopped sharing because the Align server ended its share when this machine signed out of Align (an earlier sign-in); its usage stays on this machine from now on. This machine is signed in now, so to share it again, type \`::align share\` here${again}.`;
    case 'noreach:signed_in_noreach':return `Align: this machine is signed in to Align again, but this sign-in does not reach ${ws}, so this session ${noShare}; its usage stays on this machine.`;
    case 'noreach:relogin_noreach':return unsent?`Align: ${neverRelogin}, and this sign-in does not reach ${ws}, so it can't be shared there from here; its usage stays on this machine.`:`Align: a new sign-in on this machine (\`align login\`) ended this session's share from the earlier sign-in, and this sign-in does not reach ${ws}, so this session can't be shared there again from here; its usage stays on this machine.`;
    case 'noreach:signed_in_removed':return `Align: this machine is signed in to Align again, but you are no longer a member of ${ws} in Align (you were removed from it or left it), so this session ${noShare}; its usage stays on this machine.`;
    case 'noreach:relogin_removed':return unsent?`Align: ${neverRelogin}, and you are no longer a member of ${ws} in Align (you were removed from it or left it), so it can't be shared there from here; its usage stays on this machine.`:`Align: a new sign-in on this machine (\`align login\`) ended this session's share from the earlier sign-in, and you are no longer a member of ${ws} in Align (you were removed from it or left it), so this session can't be shared there again from here; its usage stays on this machine.`;
    case 'noreach:removed_again':return `Align: you are no longer a member of ${ws} in Align (you were removed from it or left it), so this session ${noShare}; its usage stays on this machine.`;
    case 'noreach:reach_lost':return `Align: this sign-in no longer reaches ${ws} in Align, so this session ${noShare}; its usage stays on this machine.`;
    case 'noreach:access_lost':return unsent?`Align: ${never}; its usage stays on this machine.`:`Align: this session stopped sharing because you no longer have access to ${ws} in Align (you were removed from it or left it); its usage stays on this machine from now on.`;
    case 'noreach:access_lost_again':return `Align: this machine can no longer reach ${ws} in Align (you were removed from it or left it again), so this session ${noShare}; its usage stays on this machine.`;
    case 'stopped:web':return "Align: this session's sharing was stopped (Stop sharing on the web), so it stopped sharing here; its usage stays on this machine from now on.";
    case 'changed:live':case 'changed:other':return SHARE_CHANGED;
    case 'stopped:before_end':return `Align: this session's sharing was stopped (Stop sharing on the web), so it stays stopped and is not shared again from here (its share here had ended when ${before}); its usage stays on this machine.`;
    case 'stopped:share_refused':return "Align: this session's sharing was stopped (Stop sharing on the web), so it stays stopped and is not shared again from here; its usage stays on this machine.";
    default:return f.text??'';
  }
}
function share_notice(lid,id,f,now,told,toldFacts=null) {
  const tail=now.latched&&now.ended?latch_notice_tail(lid,now.reshare,now.reshare?null:now.release,{unread:now.unread,login:now.login,lost:now.ended==='access_lost'},Boolean(now.stopped)):'';
  const out=key=>({key,tail,text:words(key,f,now.ended)+tail});
  const changed=f.e==='changed',sit=state_situation(now);
  if(changed&&sit==='hold')return 'hold';
  if(changed&&told&&told.id!==id&&told_situation(told.key)===sit){
    if(toldFacts&&toldFacts.e!=='changed'){
      const previous=share_notice(lid,told.id,toldFacts,now,told);
      if(previous&&previous!=='hold'&&told_situation(previous.key)===sit)return previous;
    }
    return {key:told.key,tail,text:(['started','none'].includes(prefix(told.key))?SHARE_CHANGED:words(told.key,f,now.ended))+tail};
  }
  const prev=told&&(told.id===id||changed&&['out','reshare','noreach'].includes(prefix(told.key)))?told:null;
  if(f.e==='started')return now.live?{key:'started:text',tail:'',text:f.text??''}:null;
  if(f.e==='share_err')return now.live?null:{key:'share_err:text',tail:'',text:f.text??''};
  const stopped={stopped_on_web:'stopped:web',stopped_before_end:'stopped:before_end',share_stopped:'stopped:share_refused',upload_refused:'stopped:refused'};
  if(Object.hasOwn(stopped,f.e))return now.live?null:out(stopped[f.e]);
  if(changed){if(now.live)return out('changed:live');if(!['device_signed_out','access_lost'].includes(now.ended))return out('changed:other');}
  if(now.live||!['device_signed_out','access_lost'].includes(now.ended))return null;
  if(sit==='hold')return 'hold';
  if(prev&&prefix(prev.key)===sit)return out(prev.key);
  const was=prev?prefix(prev.key):null,relogin=f.via==='login'&&!f.out_since&&now.ended==='device_signed_out'&&was!=='out';
  if(sit==='out')return out(now.ended==='device_signed_out'?(f.unsent?'out:signed_out_unsent':'out:signed_out'):'out:signed_out_ended');
  if(sit==='reshare'){
    if(!prev&&f.e==='removed')return out('reshare:removed');
    if(!prev&&f.e==='server_signed_out')return out('reshare:server_signed_out');
    if(was==='noreach')return out('reshare:workspace_back');
    if(relogin)return out('reshare:relogin');
    return out(now.ended==='device_signed_out'||was==='out'?'reshare:signed_in':'reshare:workspace_back');
  }
  const removed=now.member===false;
  if(relogin&&was!=='reshare')return out(removed?'noreach:relogin_removed':'noreach:relogin_noreach');
  if(removed&&now.ended==='device_signed_out')return out(was==='reshare'?'noreach:removed_again':'noreach:signed_in_removed');
  if(relogin)return out('noreach:reach_lost');
  if(now.ended==='device_signed_out'||was==='out'&&now.signed_in)return out(removed?'noreach:signed_in_removed':'noreach:signed_in_noreach');
  return out(was==='reshare'?'noreach:access_lost_again':'noreach:access_lost');
}
module.exports={state_situation,told_situation,none_told,share_retell,stored_text,never_sent_words,ended_why_words,stopped_for_good_words,other_workspace_words,share_again_words,latch_way_out,latch_notice_tail,out_of_reach_words,hold_reason,release_notice,kept_holds_note,share_notice};
