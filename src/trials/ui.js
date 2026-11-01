import {PRESETS,getPreset} from './presets.js';
import {PUBLIC_BUILD} from '../build-flavor.js';
import {localId} from '../local-id.js';
import {VERSION,validateConfig,describeConfig,copy,checkSchema,FeedbackSchema} from './schema.js';
import {requestTrial,ERRORS} from '../ai/trial-client.js';
import {readHistory,saveResult,clearHistory} from './runtime.js';
export const TRIAL_PANEL=`<section class="screen scr-trial"><div class="trial-wrap sketchbox"><div class="label">AI试炼 · 先配置，再入阵</div><h2 class="marker">择一阵，练一招。</h2><p>默认人数指小兵，不含固定1位镜剑；也可明确要求“含镜剑总共几名”。卡片会列出合计人数。这里每次独立开局，先记录25秒、本地凝影，再按试炼配置交战；成绩单独保存。</p><div class="trial-presets">${PRESETS.map(p=>`<button class="btn" data-trial-preset="${p.trialId}" type="button">${describeConfig(p).title}</button>`).join('')}</div><form class="trial-form"><label for="trial-text">想练什么？也可以修改上一张已确认配置。</label><textarea id="trial-text" maxlength="240" rows="2" placeholder="例如：敌人最多2名，多练冲刺，不要远程，不要加血量。"></textarea><p class="trial-data">在线生成只发送这句话和上一张配置，不发送逐帧轨迹、图片、模型权重或身份。取消会尽力终止请求，但不保证上游零计费。</p><label class="audio-toggle"><input type="checkbox" id="trial-consent">允许按上述范围在线生成（本设备记住）</label><div class="btn-row"><button class="btn filled" type="submit" data-trial-act="generate">生成 / 修改试炼</button><button class="btn" type="button" data-trial-act="cancel" hidden>取消生成</button><button class="btn" type="button" data-trial-act="retry" hidden>重试</button></div></form><p class="trial-status" role="status" aria-live="polite">可以直接选择预设，无需联网或密钥。</p><div class="trial-card" hidden><div class="label trial-source"></div><h3 class="marker trial-name"></h3><p class="trial-goal"></p><p class="trial-details"></p><ul class="trial-waves"></ul><p class="trial-limits"></p><p class="trial-unmet"></p><button class="btn filled" data-trial-act="accept" type="button">接受配置，开始试炼</button></div><div class="btn-row"><button class="btn" data-trial-act="back" type="button">返回普通模式</button><button class="label" data-trial-act="export" type="button">导出试炼记录</button><button class="label" data-trial-act="clear" type="button">清除试炼记录</button></div><p class="trial-history"></p></div></section>
<section class="screen scr-trialover"><div class="trial-result sketchbox"><div class="label">AI试炼 · 独立结算</div><h2 class="marker trial-result-title"></h2><p class="trial-result-summary"></p><p class="trial-result-metrics"></p><p class="trial-result-best"></p><p>本局目标是否符合你的要求？可跳过。</p><div class="trial-feedback"><button class="btn" type="button" data-trial-feedback="yes">符合我的要求</button><button class="btn" type="button" data-trial-feedback="partial">部分符合</button><button class="btn" type="button" data-trial-feedback="no">不符合</button></div><label>可选理由<input class="trial-note" maxlength="120" placeholder="只保存在本设备，可随记录导出或清除"></label><p class="trial-feedback-status" role="status"></p><div class="btn-row"><button class="btn filled" type="button" data-trial-act="again">再试这阵</button><button class="btn" type="button" data-trial-act="edit">微调配置</button><button class="btn" type="button" data-trial-act="back">普通模式</button></div></div></section>`;
const storageGet=k=>{try{return localStorage.getItem(k);}catch{return null;}};
export class TrialController{
 constructor(game){
  this.game=game;this.root=game.ui.root;this.state='idle';this.config=null;this.source='preset';this.ticket=0;this.events=[];
  this.root.querySelector('#trial-consent').checked=storageGet('zhaoying.trialConsent.v1')==='1';
  this.root.addEventListener('click',e=>{const preset=e.target.closest('[data-trial-preset]'),act=e.target.closest('[data-trial-act]'),feedback=e.target.closest('[data-trial-feedback]');if(preset){this.selectPreset(preset.dataset.trialPreset);}else if(act){if(act.dataset.trialAct!=='generate')this.action(act.dataset.trialAct);}else if(feedback)this.feedback(feedback.dataset.trialFeedback);});
  this.$('.trial-form').addEventListener('submit',e=>{e.preventDefault();this.generate();});
  this.$('#trial-consent').addEventListener('change',e=>{try{localStorage.setItem('zhaoying.trialConsent.v1',e.target.checked?'1':'0');}catch{}});
  this.$('.trial-note').addEventListener('input',()=>this.feedback(this.result?.feedback||'pending'));
  // Private phone preview has no model endpoint. Keep the full local trial flow explicit.
  if(PUBLIC_BUILD){
   this.localOnly=true;this.$('.trial-form').hidden=true;
   this.$('.trial-status').textContent='公开试玩：普通模式、本地学习和四套预设可用；自然语言生成仅在本机服务版提供。无需密钥。';
  }else fetch('/api/trials/status').then(r=>r.ok?r.json():null).then(s=>{
   if(!s?.localOnly)return;
   this.localOnly=true;this.$('.trial-form').hidden=true;
   if(this.state==='idle')this.status('手机入口使用四套本地预设，无需密钥；在线生成未开放。选择预设后查看试炼卡即可入阵。');
  }).catch(()=>{});
 }
 $(q){return this.root.querySelector(q);}
 log(code,details={}){this.events.push({at:new Date().toISOString(),code,...details});if(this.events.length>100)this.events.shift();}
 cancel(message=true){++this.ticket;this.controller?.abort();this.controller=null;if(this.state==='requesting'||this.state==='validating'){this.state='cancelled';if(message)this.status(ERRORS.CANCELLED);}this.refresh();}
 open(){this.cancel(false);this.game.input.clear();this.game.ui.setHud('none');this.game.ui.show('trial');this.refresh();}
 status(text){this.$('.trial-status').textContent=text;}
 refresh(){
  const busy=this.state==='requesting'||this.state==='validating';this.$('[data-trial-act=generate]').disabled=busy;this.$('[data-trial-act=cancel]').hidden=!busy;this.$('[data-trial-act=retry]').hidden=this.state!=='failed';
  this.$('.trial-card').hidden=!this.config||this.state!=='ready';this.$('[data-trial-act=accept]').disabled=!this.config||this.state!=='ready';this.game.mobile?.menus?.syncTrial();this.$('.trial-history').textContent=`本设备保留 ${readHistory().length}/50 条试炼结算；不计入普通最高分。`;
 }
 selectPreset(id){this.cancel(false);const c=getPreset(id);const v=validateConfig(c);if(!v.ok){this.state='failed';this.status(v.errors.join('；'));this.refresh();return;}this.config=c;this.review=null;this.metadata=null;this.source='preset';this.state='ready';this.renderCard();this.status('预设试炼已通过本地校验；未使用模型。');this.log('preset-ready',{trialId:c.trialId});}
 renderCard(){const d=describeConfig(this.config);for(const[key,text]of Object.entries({'.trial-source':this.source==='model'?'模型生成 · 已双重校验':this.source==='simulation'?'模拟输出 · 非真实模型':'预设试炼 · 无模型调用','.trial-name':d.title,'.trial-goal':d.goal,'.trial-details':d.details,'.trial-limits':d.limits,'.trial-unmet':d.excluded+'。'+(this.source==='preset'?'固定预设不会解析上方输入。':(this.review?.unmet?.length?'未满足：'+this.review.unmet.join('；')+'。':'')+(this.review?.unverified||['请核对实际配置。']).join('；'))}))this.$(key).textContent=text;const list=this.$('.trial-waves');list.replaceChildren(...d.waves.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));this.refresh();}
 async generate(){
  if(this.localOnly){this.status('此手机入口仅使用本地预设，请选择上方试炼。');return;}
  if(this.state==='requesting'||this.state==='validating')return;
  const text=this.$('#trial-text').value.trim();if(!text){this.status('请先写一句需求，或直接选择预设。');return;}
  if(!this.$('#trial-consent').checked){this.status('在线生成前，请确认上面列出的发送范围。预设不需要发送任何内容。');return;}
  this.cancel(false);const ticket=this.ticket,controller=this.controller=new AbortController();this.state='requesting';this.status('正在生成；最多等待15秒，可随时取消。');this.refresh();
  const request={schemaVersion:VERSION,requestId:localId(),text,previousConfig:this.config?copy(this.config):null,summary:null};
  try{const r=await requestTrial(request,{signal:controller.signal});if(ticket!==this.ticket)return;this.state='validating';if(!validateConfig(r.config).ok)throw new Error(ERRORS.INVALID_OUTPUT);this.config=copy(r.config);this.source=r.source;this.review=r.requirements;this.metadata=r.metadata;this.state='ready';this.renderCard();this.status('配置已校验，请查看实际目标与限制，再决定是否开局。');this.log('generation-ready',{requestId:r.requestId,metadata:r.metadata});}
  catch(e){if(ticket!==this.ticket)return;this.state=e.code==='CANCELLED'?'cancelled':'failed';this.status(e.message||ERRORS.UNAVAILABLE);this.log('generation-failed',{code:e.code||'UNAVAILABLE'});this.refresh();}
  finally{if(ticket===this.ticket)this.controller=null;}
 }
 action(act){
  if(act==='cancel')this.cancel();
  else if(act==='retry')this.generate();
  else if(act==='back'){if(this.game.trial&&!this.game.trial.finished)this.game.finishTrial('abandoned',false);this.cancel(false);this.game.toTitle();}
  else if(act==='accept'){if(this.state!=='ready'||!this.config)return;try{this.game.startRun('trial',this.config,this.source);this.state='playing';}catch(e){this.state='failed';this.status(e.message);this.refresh();}}
  else if(act==='again'){if(this.result){this.game.startRun('trial',this.result.config,this.result.source);this.state='playing';}}
  else if(act==='edit'){this.config=copy(this.result.config);this.source=this.result.source;this.metadata=this.result.generation;this.state='ready';this.open();this.renderCard();}
  else if(act==='clear'){clearHistory();this.events=[];this.status('本设备试炼结算和调试记录已清除；普通模式成绩保留。');this.refresh();}
  else if(act==='export'){const blob=new Blob([JSON.stringify({version:VERSION,history:readHistory(),events:this.events},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='照影问剑-试炼记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
 complete(result){
  this.result=result;this.state='completed';const saved=saveResult(result),history=readHistory().filter(r=>r.hash===result.hash);const best=Math.max(0,...history.map(r=>r.score));
  this.$('.trial-result-title').textContent=result.achieved?'目标达成':'本次目标未达成';const description=describeConfig(result.config);
  this.$('.trial-result-summary').textContent=`${result.source==='preset'?'预设试炼':result.source==='simulation'?'模拟试炼':'模型试炼'} · ${description.goal}。${{time:'战斗计时结束',death:'角色倒下',abandoned:'主动结束'}[result.reason]}。`;
  this.$('.trial-result-metrics').textContent=`战斗${result.metrics.elapsed.toFixed(1)}秒 · 击破${result.metrics.defeats}名 · 冲刺${result.metrics.dashes}次 · 受伤${result.metrics.damage}次 · 得分${result.score}`;
  this.$('.trial-result-best').textContent=saved?`此配置独立最高分 ${best}；不计入普通模式最高分。`:'浏览器未允许保存，本次结算仍可查看。';this.$('.trial-note').value='';this.$('.trial-feedback-status').textContent='反馈可跳过，也可修改。';this.$('.trial-feedback').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));this.game.ui.setHud('none');this.game.ui.show('trialover');
 }
 feedback(value){if(!this.result)return;const r=this.result;r.feedback=value;r.note=this.$('.trial-note').value.slice(0,120);const fields={trialId:r.trialId,source:r.source,reason:r.reason,metrics:r.metrics,achieved:r.achieved,feedback:r.feedback,note:r.note};if(checkSchema(fields,FeedbackSchema).length)return;const ok=saveResult(r);this.$('.trial-feedback-status').textContent=ok?'反馈已保存在本设备，未发送给模型。':'无法保存反馈，仍可继续游戏。';this.$('.trial-feedback').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.trialFeedback===value)));}
}
