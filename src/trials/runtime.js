import {validateConfig,copy,configHash,checkSchema,FeedbackSchema} from './schema.js';
export class TrialRun{
 constructor(config,source='preset'){
  const check=validateConfig(config);if(!check.ok)throw new Error(check.errors.join('；'));
  this.config=copy(config);this.source=source;this.hash=configHash(config);this.total=check.total;
  this.metrics={elapsed:0,damage:0,defeats:0,dashes:0};this.wave=-1;this.spawnIn=0;this.cursor=0;this.finished=false;this.credited=new WeakSet();
 }
 tick(dt){if(!this.finished)this.metrics.elapsed=Math.min(this.total,this.metrics.elapsed+dt);let offset=0;for(let i=0;i<this.config.waves.length;i++){offset+=this.config.waves[i].duration;if(this.metrics.elapsed<offset||i===this.config.waves.length-1)return i;}}
 credit(foe){if(!this.finished&&!this.credited.has(foe)){this.credited.add(foe);this.metrics.defeats++;}}
 result(reason,score){
  this.finished=true;const g=this.config.goal,m=copy(this.metrics),actual=g.id==='survive'?m.elapsed:g.id==='defeat'?m.defeats:m.dashes;
  return {trialId:this.config.trialId,config:copy(this.config),hash:this.hash,source:this.source,generation:this.generation||null,reason,metrics:m,actual,target:g.target,achieved:reason==='time'&&actual+1e-6>=g.target,score,feedback:'pending',note:'',endedAt:new Date().toISOString()};
 }
 progress(){const g=this.config.goal;const n=g.id==='survive'?this.metrics.elapsed:g.id==='dash'?this.metrics.dashes:this.metrics.defeats;return `AI试炼 · 第${Math.max(1,this.wave+1)}波 · ${Math.ceil(this.total-this.metrics.elapsed)}秒 · ${g.id==='dash'?'冲刺':g.id==='defeat'?'击破':'存活'} ${Math.floor(n)}/${g.target}`;}
}
const KEY='zhaoying.trials.v1';
export function readHistory(storage){try{const a=JSON.parse((storage??globalThis.localStorage).getItem(KEY)||'[]');return Array.isArray(a)?a.filter(r=>r&&validateConfig(r.config).ok&&r.hash===configHash(r.config)&&Number.isFinite(r.score)&&r.score>=0&&checkSchema({trialId:r.trialId,source:r.source,reason:r.reason,metrics:r.metrics,achieved:r.achieved,feedback:r.feedback,note:r.note},FeedbackSchema).length===0).slice(-50):[];}catch{return[];}}
export function saveResult(result,storage){const list=readHistory(storage);const id=result.runId||result.endedAt;const at=list.findIndex(r=>(r.runId||r.endedAt)===id);if(at>=0)list[at]=copy(result);else list.push(copy(result));try{(storage??globalThis.localStorage).setItem(KEY,JSON.stringify(list.slice(-50)));return true;}catch{return false;}}
export function clearHistory(storage){try{(storage??globalThis.localStorage).removeItem(KEY);return true;}catch{return false;}}
