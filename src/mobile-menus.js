import {describeConfig,ENEMIES} from './trials/schema.js';
import {PUBLIC_BUILD} from './build-flavor.js';
const SHORT={bit:'符刃',byte:'法器',leech:'墨蛾',mirror:'残影',warden:'剑印'};
// Mobile information hierarchy only. Reuse the original controls and actions;
// no battle/input/training changes, and no primary action below a scroll fold.
export class MobileMenus{
 constructor(game){
  this.game=game;this.ui=game.ui;const $=s=>this.ui.$(s);
  this.ui.root.insertAdjacentHTML('beforeend',`
   <section class="screen scr-mobileprefs"><div class="mobile-menu-card sketchbox"><h2>设置</h2><div class="mobile-settings-scroll mobile-preferences"></div><button class="btn filled" data-mobile-menu="prefs-back" type="button">返回</button></div></section>
   <section class="screen scr-mobileshare"><div class="mobile-menu-card sketchbox"><h2>分享镜剑</h2><div class="mobile-share-body"></div><button class="btn" data-mobile-menu="share-back" type="button">返回结算</button></div></section>
   <section class="screen scr-mobilefeedback"><div class="mobile-menu-card sketchbox"><h2>试炼反馈 · 可跳过</h2><div class="mobile-feedback-body"></div><button class="btn" data-mobile-menu="feedback-back" type="button">返回结算</button></div></section>`);
  for(const name of ['mobileprefs','mobileshare','mobilefeedback'])this.ui.screens[name]=$('.scr-'+name);
  const pause=$('.scr-pause .btn-col'),prefs=$('.mobile-preferences');
  for(const act of ['audio-settings','mute','pace','quality','motion'])prefs.append(pause.querySelector(`[data-act=${act}]`));
  const diagnostic=pause.querySelector('.diagnostic-controls');if(diagnostic)prefs.append(diagnostic);
  pause.querySelector('[data-act=how]').hidden=true;
  pause.insertAdjacentHTML('beforeend','<button class="btn" data-mobile-menu="prefs" type="button">设置</button>');
  const title=$('.title-foot');title.insertAdjacentHTML('beforeend','<button class="label mobile-home-settings" data-mobile-menu="prefs" type="button">设置</button>');
  for(const act of ['mute','audio-settings','pace'])title.querySelector(`[data-act=${act}]`).hidden=true;
  const audio=$('.audio-card'),audioBody=document.createElement('div');audioBody.className='mobile-settings-scroll';
  for(const el of [...audio.children])if(el.matches('.audio-levels,.audio-toggle,.audio-note'))audioBody.append(el);
  audio.insertBefore(audioBody,audio.querySelector('[data-act=audio-back]'));
  $('.mobile-share-body').append($('.share'));
  $('.over-wrap>.btn-row').insertAdjacentHTML('beforeend','<button class="btn mobile-share-entry" data-mobile-menu="share" type="button">分享镜剑</button>');
  const result=$('.trial-result'),feedback=$('.mobile-feedback-body');
  for(const el of [...result.children])if(el.matches('.trial-feedback,.trial-feedback-status,label')||el.textContent==='本局目标是否符合你的要求？可跳过。')feedback.append(el);
  result.querySelector('.btn-row').insertAdjacentHTML('beforeend','<button class="btn" data-mobile-menu="feedback" type="button">反馈</button>');
  const wrap=$('.trial-wrap'),preview=document.createElement('div');preview.className='mobile-trial-preview';preview.setAttribute('aria-live','polite');wrap.append(preview);
  const footer=wrap.querySelector(':scope>.btn-row');footer.classList.add('mobile-trial-actions');footer.prepend(wrap.querySelector('[data-trial-act=accept]'));
  $('.scr-trial h2').textContent='选择试炼';
  const how=$('.scr-how');how.querySelector('h2').textContent='先试剑，再击败镜剑';
  const lines=['左下摇杆移动，按住攻击自动瞄准；点闪避躲开红色剑气。','先试剑25秒，本地形成镜剑。它参考部分操作，也受规则影响。','击败红色镜剑进入下一阵。护阵首领可用闪避破盾。'];how.querySelectorAll('.step p').forEach((el,i)=>el.textContent=lines[i]);
  const help=$('.scr-mobilehelp');help.querySelectorAll('p').forEach((el,i)=>el.textContent=['左下摇杆移动，拖出范围仍可控制，松手停止。','按住攻击自动瞄准；按钮内滑动可手瞄，松手停攻。','松开攻击后点闪避，沿移动方向冲刺，等“可用”再闪。','红色剑气要躲；暂停、转屏或后台后点继续。'][i]);
  this.ui.root.addEventListener('click',e=>{const button=e.target.closest('[data-mobile-menu]');if(!button)return;const action=button.dataset.mobileMenu;game.audio.init();game.audio.uiClick();
   if(action==='prefs'){this.prefsReturn=this.ui.current||'pause';this.ui.show('mobileprefs');}
   else if(action==='prefs-back')this.ui.show(this.prefsReturn||'pause');
   else if(action==='share')this.ui.show('mobileshare');else if(action==='share-back')this.ui.show('over');
   else if(action==='feedback')this.ui.show('mobilefeedback');else if(action==='feedback-back')this.ui.show('trialover');
  });this.sync('title');
 }
 sync(name){
  const $=s=>this.ui.$(s);
  if(name==='profile'){$('.arch').textContent='镜剑已成';$('.profile-next>b').textContent='下一步：击败红色镜剑';$('.profile-next small').textContent='参考部分操作并结合规则，不是完整复制。';}
  if(name==='over')$('.mobile-share-entry').hidden=$('.share').hidden;
  if(name==='trial')this.syncTrial();
  if(name==='trialover')this.syncResult();
 }
 syncTrial(){
  const controller=this.game.trials,wrap=this.ui.$('.trial-wrap'),preview=this.ui.$('.mobile-trial-preview'),c=controller.config,ready=controller.state==='ready'&&!!c;
  wrap.dataset.ready=ready?'true':'false';const accept=this.ui.$('[data-trial-act=accept]');accept.disabled=!ready;
  preview.replaceChildren();const add=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;preview.append(el);};
  if(!ready){add('h3','选一阵，开始练习');add('p',PUBLIC_BUILD?'四套本地预设，无需密钥。':'先试剑25秒，再按目标交战。');add('p',PUBLIC_BUILD?'自然语言生成仅本机提供；成绩独立记录。':'成绩单独记录，不影响普通最高分。');return;}
  const d=describeConfig(c);
  add('h3',d.title+' · '+(controller.source==='preset'?'预设':controller.source==='model'?'模型':'模拟'));
  add('p',this.goal(c),'mobile-trial-goal');
  add('p',`小兵≤${c.constraints.maxEnemies}＋镜剑1＝总数≤${c.constraints.maxEnemies+1} · 6格血`,'mobile-trial-cap');
  add('p','先记录25秒；受伤带入，不自动回血。','mobile-trial-health');
  for(const[wIndex,w]of c.waves.entries())add('p',`${wIndex+1}波 ${w.duration}秒 · ≤${w.cap}兵 · ${w.interval}秒/次 · ${w.enemies.map(k=>SHORT[k]||ENEMIES[k]).join('/')}`,'mobile-trial-wave');
  // The full original card remains for desktop. Mobile presets show goal, total
  // population (including Echo), health carryover and every executable wave.
  if(controller.review?.unmet?.length)add('p','未满足：'+controller.review.unmet.join('；'),'mobile-trial-warning');
  for(const button of wrap.querySelectorAll('[data-trial-preset]'))button.setAttribute('aria-pressed',String(button.dataset.trialPreset===c.trialId));
 }
 goal(c){const seconds=c.waves.reduce((n,w)=>n+w.duration,0);return c.goal.id==='dash'?`冲刺${c.goal.target}次并存活${seconds}秒（非躲避计数）`:c.goal.id==='defeat'?`击破${c.goal.target}名（含镜剑），并存活${seconds}秒`:c.template==='ward'?`存活${seconds}秒，不要求击破首领`:`存活${seconds}秒`;}
 syncResult(){const r=this.game.trials.result;if(!r)return;const $=s=>this.ui.$(s);$('.trial-result-summary').textContent=this.goal(r.config)+' · '+({time:'战斗结束',death:'角色倒下',abandoned:'已退出'}[r.reason]||'');$('.trial-result-metrics').textContent=`交战${r.metrics.elapsed.toFixed(1)}秒 · 击破${r.metrics.defeats} · 冲刺${r.metrics.dashes} · 得分${r.score}`;$('.trial-result-best').textContent=$('.trial-result-best').textContent.match(/浏览器未允许|未能保存/)?'本次未能保存，仍可继续游玩。':'独立试炼成绩，不计入普通最高分。';}
}
