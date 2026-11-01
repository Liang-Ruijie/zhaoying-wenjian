// Shared jade-and-gold DOM controls, paper panels and game HUD.

import {TRIAL_PANEL} from './trials/ui.js';
import { PLAYER } from './config.js';
import { TRAITS } from './brain.js';
import {runGoal,fightTip} from './onboarding.js';
import heroPortrait from '../assets/scenes/title-mist-clean-v4.webp';
import refinedHero from '../assets/characters/swordsman-keyart-v3.webp';

const NS = 'http://www.w3.org/2000/svg';
const AST = `<svg class="ast" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 1.5V10.5"/><path d="M1.8 3.4 10.2 8.6"/><path d="M10.2 3.4 1.8 8.6"/></svg>`;
const ARROW = `<svg class="sk-arrow" viewBox="0 0 28 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7.5C9 6.6 16 7.4 25 6.8"/><path d="M19 2.2 25.4 6.9 19.4 12"/></svg>`;
const AUDIO_ROWS=[['master','主音量'],['music','背景音乐'],['combat','战斗音效'],['ambience','环境音'],['ui','界面音效']];
const AUDIO_PANEL=`<section class="screen scr-audio"><div class="audio-card sketchbox"><div class="label">听风 · 调弦</div><h2 class="marker">声音设置</h2><div class="audio-levels">${AUDIO_ROWS.map(([key,label])=>`<label class="audio-row" for="audio-${key}"><span>${label}</span><input id="audio-${key}" type="range" min="0" max="100" step="1" data-audio-setting="${key}"><output for="audio-${key}" data-audio-output="${key}"></output></label>`).join('')}</div><label class="audio-toggle"><input type="checkbox" data-audio-setting="muted">静音</label><label class="audio-toggle"><input type="checkbox" data-audio-setting="comfort">舒适聆听</label><p class="audio-note">柔化突发强音与尖锐高频，保留剑招轻重。设置即时生效并自动保存。</p><button class="btn filled" data-act="audio-back" type="button">返回 ${ARROW}</button></div></section>`;
const CREDIT = `<div class="credit">照影问剑 · 本地剑路，凝影成敌</div>`;

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// CSS owns the shared paper frames; keep this hook for capture/UI callers.
export function sketchBorder(el,seed=1,stroke='currentColor') {if(el)el.style.setProperty('--frame-ink',stroke);}

const TEMPLATE = `
<div class="splash" role="presentation"><div class="seal">照影<br>问剑</div><div class="label made">以你的剑路，照见你的对手</div><div class="marker team">照影问剑</div></div>
<div class="hud"><div class="run-goal" role="status"></div><div class="hud-tl"><div class="label round-label"></div><div class="marker score">0</div></div>
<div class="hud-top"><div class="rec sketchbox"><span class="rec-dot"></span><span class="label">试剑</span><span class="marker rec-time">25</span><span class="hand rec-n">0 条记录</span></div><div class="predict sketchbox"><div class="predict-row"><span class="label">剑路预测</span><span class="marker pct">暂无</span></div><div class="bar"><i></i></div><div class="hand hint">根据已记录操作估计方向</div></div></div>
<div class="hud-bl"><div class="hp"></div><div class="dash"><span class="label">身法</span><div class="dash-bar"><i></i></div></div></div><div class="hud-br sketchbox"><div class="label brain-label">镜剑决策</div><canvas class="minibrain" width="260" height="150"></canvas></div><button class="pause-btn label" type="button" aria-label="暂停">II</button></div>
<div class="plates"></div><div class="toasts" role="status"></div><div class="banner"><div class="marker big"></div><div class="label sub"></div></div><div class="callout"><div class="callout-box sketchbox"><div class="label">阵中来敌</div><div class="marker callout-name"></div><div class="hand callout-desc"></div></div></div><div class="caption"><div class="cap-box sketchbox"><div class="label cap-eyebrow"></div><div class="marker cap-text"></div></div></div>
<section class="screen scr-title"><div class="title-masthead"><span class="masthead-brand">照影问剑</span><span class="masthead-note">一人一剑 · 照见万千剑路</span></div><div class="title-character" aria-hidden="true"><img class="title-portrait" src="${heroPortrait}" alt="" draggable="false" fetchpriority="high" decoding="async"><img class="title-hero" src="${refinedHero}" alt="" draggable="false" decoding="async" fetchpriority="high"></div><div class="title-wrap"><div class="label eyebrow">水墨试剑录 / 单人试炼</div><div class="title-line"><span class="seal">照影<br>问剑</span><h1 class="marker title">照影<span>问剑</span></h1></div><p class="hand tagline">以你的剑路，照见你的对手。</p><p class="title-description">先打小怪25秒，让镜剑记住你的一些打法。<br>再击败红色镜剑，进入下一阵。</p><div class="duel sketchbox" hidden><div class="label">收到镜剑挑战</div><div class="marker duel-name"></div><div class="hand duel-meta"></div><button class="btn filled" data-act="duel" type="button">接受挑战 ${ARROW}</button></div><div class="btn-row"><button class="btn filled" data-act="play" type="button">开始试剑 ${ARROW}</button><button class="btn" data-act="how" type="button">怎么玩</button></div><div class="label controls"><span class="kb">WASD 移动 · 鼠标瞄准 · 按住左键出剑<br>空格 / Shift 冲刺 · Esc 暂停</span><span class="tc">左手移动 · 右手瞄准出剑 · 身法按钮冲刺</span></div><button class="label pace-setting" data-act="pace" type="button">来敌节奏 舒缓</button><p class="sample-note">你的操作留下记录，镜剑据此尝试回应。</p></div><div class="title-foot"><button class="label" data-act="trials" type="button">AI试炼</button><div class="label best">最高分 <span>0</span></div><button class="label sound" data-act="mute" type="button">声音开启</button><button class="label" data-act="audio-settings" type="button">声音设置</button></div>${CREDIT}</section>
<section class="screen scr-intro"><div class="intro-card sketchbox"><div class="label">第一次入阵 · 一分钟看懂</div><h2 class="marker">先试剑，再打败你的镜剑。</h2><ol class="intro-steps"><li><b>先打小怪25秒</b><span>WASD移动，按住鼠标左键出剑，空格冲刺。瞄准敌人，躲开来袭剑气。</span></li><li><b>它会记住部分打法</b><span>照平常习惯玩就好，不需要走指定路线，也不用刻意做动作给它学。</span></li><li><b>再击败红色人物</b><span>红色“镜剑”会结合学到的倾向和规则与你交战。击败它就能进入下一阵。</span></li></ol><details class="learning-detail"><summary>它具体学什么？</summary><p>它根据目标远近、来袭弹体、你之前的动作等情况，记录动作并训练预测。当前主要参考移动倾向，尚不保证复现你的冲刺与出手节奏。例如你常向目标右侧横移，它可能在相似局面偏向这类动作，实际路线会随局面改变。它不会完整复刻路线，也没有聊天或指令输入。另一个叫“镜步残影”的敌人才会跟随短时间前的路径。</p></details><div class="btn-row"><button class="btn filled" data-act="intro-start" type="button">开始25秒试剑 ${ARROW}</button><button class="btn" data-act="menu" type="button">返回</button></div></div></section>
<section class="screen scr-how"><div class="how-wrap"><div class="label">怎么玩</div><h2 class="marker">你的目标，是击败学过你部分打法的对手。</h2><div class="steps"><div class="step sketchbox"><div class="label">1 · 先打小怪</div><p class="hand">边走边向小怪出剑，先撑过25秒。空格冲刺可以穿过剑气，也能撞碎追身符刃。按自己的习惯玩即可。</p></div><div class="step sketchbox"><div class="label">2 · 看一条习惯</div><p class="hand">记录会在本地训练成镜剑。习惯卡说的是你的操作统计，不保证镜剑完全复制你，也不是能力评分。</p></div><div class="step sketchbox"><div class="label">3 · 击败红色镜剑</div><p class="hand">瞄准红色人物持续出剑，移动和冲刺躲避攻击。可以换方向、变距离寻找机会；保持原打法也能战斗。</p></div></div><details class="learning-detail"><summary>为什么有时不像我？</summary><p>镜剑会参考部分移动倾向；冲刺、出剑、瞄准与冷却仍受规则影响，不保证还原你的出手节奏。它按当前局面重新决策，不会沿着你原来的路线完整回放。旧代镜剑保持各自的模型，新一代在局间训练。</p></details><p class="hand how-more">第三阵起会出现带符雾护阵的首领。先冲刺穿过雾障，再趁破防出剑。结算后可分享镜剑模型，让朋友挑战。</p><details class="learning-detail field-guide"><summary>识敌与法器</summary><div class="field-guide-grid"><article><b>敕 · 追身符刃</b><span>贴身追击。移动拉开距离，冲刺可以击破。</span></article><article><b>雷 · 悬符法器</b><span>蓄光后放出符刃。看准出手，再横向躲避。</span></article><article><b>蛾 · 噬墨符</b><span>成群吸附并扣分。用身法穿过它们。</span></article><article><b>影 · 镜步残影</b><span>跟随两秒前的路径；与学习你的镜剑不同。</span></article><article><b>镇 · 镇阵剑印</b><span>先冲刺穿过符雾护阵，再趁破防出剑。</span></article><article><b>御剑与身法</b><span>青色飞剑是你的出招；朱砂符刃需要躲避。</span></article></div><p>场地外沿以渐浓墨雾提示范围，中心留白供你试剑。</p></details><button class="btn filled" data-act="back" type="button">明白了 ${ARROW}</button></div>${CREDIT}</section>
<section class="screen scr-train"><div class="train-card sketchbox"><div class="train-head"><span class="label train-eyebrow">本地凝影</span><span class="label train-epoch"></span></div><div class="marker train-title">镜剑形成中</div><canvas class="loss" width="520" height="120"></canvas><div class="train-stats hand"></div></div></section>
<section class="screen scr-profile"><div class="profile-card sketchbox"><div class="label">本次试剑习惯</div><h2 class="marker arch"></h2><p class="hand arch-blurb"></p><div class="profile-body"><div class="radar"></div><ul class="marks insights"></ul></div><div class="profile-next"><b>接下来，击败红色镜剑。</b><p class="profile-tip"></p><small>它学习部分操作倾向，并结合规则交战；这条习惯不代表分身复现率。</small></div><div class="profile-foot"><span class="label model-meta"></span><button class="btn filled" data-act="continue" type="button">与镜剑交手 ${ARROW}</button></div></div></section>
<section class="screen scr-recovery"><div class="pause-card sketchbox"><div class="label">凝影未成</div><h2 class="marker recovery-title">记录暂不足</h2><p class="hand recovery-copy"></p><div class="btn-col"><button class="btn filled" data-act="retrain" type="button">重试凝影</button><button class="btn" data-act="previous" type="button">沿用上一代镜剑</button><button class="btn" data-act="practice" type="button">规则练习</button><button class="btn" data-act="play" type="button">再试剑</button><button class="btn" data-act="menu" type="button">返回</button></div></div></section>
<section class="screen scr-over"><div class="over-wrap"><div class="label over-eyebrow">本次试剑结束</div><h2 class="marker over-title"></h2><div class="over-stats"></div><div class="share sketchbox"><div class="label">分享镜剑</div><p class="hand share-copy"></p><div class="share-row"><input class="name-in hand" maxlength="14" placeholder="留下名号（可匿名）" aria-label="名号" spellcheck="false"><button class="btn filled" data-act="share" type="button">复制挑战链接</button></div><input class="share-out hand" aria-label="挑战链接" readonly hidden></div><div class="btn-row"><button class="btn filled" data-act="retry" type="button">再试一次 ${ARROW}</button><button class="btn" data-act="menu" type="button">返回</button><button class="btn" data-act="trials" type="button">AI试炼</button></div></div>${CREDIT}</section>
<section class="screen scr-pause"><div class="pause-card sketchbox"><div class="label">且歇片刻</div><h2 class="marker">已暂停</h2><div class="btn-col"><button class="btn filled" data-act="resume" type="button">继续 ${ARROW}</button><button class="btn" data-act="how" type="button">怎么玩</button><button class="btn" data-act="retry" type="button">重新试剑</button><button class="btn" data-act="menu" type="button">返回</button><button class="label sound" data-act="mute" type="button">声音开启</button><button class="label" data-act="audio-settings" type="button">声音设置</button><button class="label pace-setting" data-act="pace" type="button">来敌节奏 舒缓</button><button class="label quality" data-act="quality" type="button">低特效 关闭</button><button class="label motion" data-act="motion" type="button">减少动态 关闭</button></div></div></section>
${TRIAL_PANEL}
${AUDIO_PANEL}
<div class="rotate-hint">横屏入阵，剑路更开阔</div>
`;
export class UI {
  constructor(root, game) {
    this.root = root;
    root.dataset.theme='jade-gold';
    this.game = game;
    root.innerHTML = TEMPLATE;
    const $ = (s) => root.querySelector(s);
    this.$ = $;
    this.el = {
      hud: $('.hud'),
      goal: $('.run-goal'),
      roundLabel: $('.round-label'),
      score: $('.score'),
      rec: $('.rec'),
      recTime: $('.rec-time'),
      recN: $('.rec-n'),
      predict: $('.predict'),
      pct: $('.predict .pct'),
      bar: $('.predict .bar i'),
      hint: $('.predict .hint'),
      hp: $('.hp'),
      dashBar: $('.dash-bar i'),
      brainBox: $('.hud-br'),
      brainLabel: $('.brain-label'),
      minibrain: $('.minibrain'),
      plates: $('.plates'),
      toasts: $('.toasts'),
      banner: $('.banner'),
      bannerBig: $('.banner .big'),
      bannerSub: $('.banner .sub'),
      loss: $('.loss'),
      trainTitle: $('.train-title'),
      trainEyebrow: $('.train-eyebrow'),
      trainEpoch: $('.train-epoch'),
      trainStats: $('.train-stats'),
    };
    this.screens = {};
    for (const s of root.querySelectorAll('.screen')) this.screens[s.className.match(/scr-(\w+)/)[1]] = s;
    for (let i = 0; i < PLAYER.hp; i++) {
      const pip = document.createElement('i');
      this.el.hp.appendChild(pip);
    }
    this.plates = new Map();
    this.bannerT = 0;
    this.toastList = [];
    this.calloutT = 0;
    this.pulseT = 0;
    this.hudMode = 'none';
    this.score = 0;
    this.shownScore = 0;

    const portrait=$('.title-hero');portrait.addEventListener('load',()=>{root.dataset.heroAsset='ready';});portrait.addEventListener('error',()=>{root.dataset.heroAsset='failed';portrait.hidden=true;});if(portrait.complete&&portrait.naturalWidth)root.dataset.heroAsset='ready';
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      game.audio.init();
      game.audio.uiClick();
      game.onAction(b.dataset.act, b);
    });
    root.addEventListener('input',e=>{
      const input=e.target.closest('[data-audio-setting]');if(!input)return;
      game.audio.init();const key=input.dataset.audioSetting;
      game.audio.setSettings({[key]:input.type==='checkbox'?input.checked:Number(input.value)/100});
      this.syncAudioSettings();this.setSound(game.audio.muted);
    });
    this.syncAudioSettings();
    root.addEventListener('pointerover', (e) => {
      const b = e.target.closest('.btn');
      if (b && b !== this.hovered) game.audio.uiHover();
      this.hovered = b;
    });
    $('.pause-btn').addEventListener('click', () => game.onAction('pause'));
    $('.splash').addEventListener('pointerdown', (e) => e.currentTarget.remove());
    addEventListener('resize', () => this.redrawSketches());
  }

  // ---- screens ---------------------------------------------------------------

  show(name) {
    // No held touch may survive a menu, result, training card or restart.
    this.game.input?.clear();
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('on', k === name);
    this.current = name;
    this.root.dataset.screen = name || '';
    document.body.dataset.screen=name||'';
    this.game.mobile?.menus?.sync(name);
    if (name && this.screens[name]) this.screens[name].scrollTop=0;
    requestAnimationFrame(() => this.redrawSketches());
  }

  redrawSketches() {
    let i = 1;
    for (const el of this.root.querySelectorAll('.sketchbox, .btn')) {
      if (el.offsetParent !== null) sketchBorder(el, i, el.classList.contains('filled') ? 'var(--bg)' : 'currentColor', el.classList.contains('btn') ? 2.4 : 2.8);
      i++;
    }
  }

  showTitle(best, duel) {
    this.el.banner.classList.remove('on');this.bannerT=0;
    this.$('.callout').classList.remove('on');this.calloutT=0;
    this.$('.best span').textContent = best.toLocaleString();
    const d = this.$('.duel');
    if (duel) {
      d.hidden = false;
      this.$('.duel-name').textContent = `${duel.name}的镜剑`;
      this.$('.duel-meta').innerHTML = `第 ${duel.gen} 代 · ${duel.samples.toLocaleString()} 条记录 · 挑战使用标准节奏`;
    } else d.hidden = true;
    this.setHud('none');
    this.show('title');
  }

  syncAudioSettings(){
    const settings=this.game.audio.settings;
    for(const el of this.root.querySelectorAll('[data-audio-setting]')){
      const value=settings[el.dataset.audioSetting];if(el.type==='checkbox')el.checked=value;else el.value=Math.round(value*100);
    }
    for(const el of this.root.querySelectorAll('[data-audio-output]'))el.value=`${Math.round(settings[el.dataset.audioOutput]*100)}%`;
  }

  setSound(muted) {
    for (const b of this.root.querySelectorAll('.sound')) b.textContent = muted ? '声音关闭' : '声音开启';
  }

  // ---- HUD -------------------------------------------------------------------

  setHud(mode) {
    this.hudMode = mode;
    this.root.dataset.hud = mode;
    document.body.dataset.hud = mode;
    requestAnimationFrame(() => this.redrawSketches());
  }

  updateHud(g, dt) {
    if (this.hudMode === 'none') return;
    const e = this.el;
    this.shownScore += (g.score - this.shownScore) * Math.min(1, dt * 10);
    if (Math.abs(g.score - this.shownScore) < 1) this.shownScore = g.score;
    e.score.textContent = Math.round(this.shownScore).toLocaleString();
    e.roundLabel.textContent = g.roundLabel();

    if (this.hudMode === 'calibrate') {
      e.recTime.textContent = Math.max(0, Math.ceil(g.calibrationLeft));
      e.recN.textContent = `${g.recorder.n.toLocaleString()} 条记录`;
    } else if (this.hudMode === 'combat') {
      const v = g.predict.value;
      e.pct.textContent = g.predict.n ? `${Math.round(v * 100)}%` : '暂无';
      e.bar.style.width = `${v * 100}%`;
      e.bar.style.background = v > 0.6 ? 'var(--acc-pink)' : v > 0.4 ? 'var(--acc-sun)' : 'var(--acc-electric)';
      if (this.pulseT <= 0) e.hint.textContent = g.predict.n < 10 ? '正在观察你的移动…' : '空心印记是预测位置，不会造成伤害';
    }

    const pips = e.hp.children;
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < g.player.hp);
    const dk = 1 - Math.max(0, g.player.dashCd) / PLAYER.dashCooldown;
    e.dashBar.style.width = `${Math.min(1, dk) * 100}%`;

    const goal=g.trial&&g.state==='combat'?g.trial.progress():runGoal(g.state,g.mode,g.drones.some(d=>d.kind==='warden'&&d.alive));if(e.goal.textContent!==goal)e.goal.textContent=goal;
    this.updatePlates(g);
    this.brainDrawT=(this.brainDrawT||0)+dt;
    this.el.brainBox.hidden=!g.debugEnabled;
    if(g.debugEnabled&&this.hudMode==='combat'&&this.brainDrawT>=.1){this.brainDrawT=0;this.drawMiniBrain(g);}
  }

  updatePlates(g) {
    const seen = new Set();
    const w = innerWidth;
    const h = innerHeight;
    for (const ec of g.echoes) {
      if (!ec.alive) continue;
      seen.add(ec);
      let p = this.plates.get(ec);
      if (!p) {
        p = document.createElement('div');
        p.className = 'plate';
        p.innerHTML = `<span class="label"></span><div class="pbar"><i></i></div>`;
        p.style.setProperty('--c', `#${ec.color.toString(16).padStart(6, '0')}`);
        p.querySelector('.label').textContent = ec.title || ec.name;
        this.el.plates.appendChild(p);
        this.plates.set(ec, p);
      }
      const v = g.project(ec.x, 2.3, ec.z);
      p.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      p.style.opacity = ec.spawnT < 1 ? ec.spawnT : 1;
      p.querySelector('i').style.width = `${(ec.hp / ec.maxHp) * 100}%`;
    }
    for (const [ec, p] of this.plates) {
      if (!seen.has(ec)) {
        p.remove();
        this.plates.delete(ec);
      }
    }
  }

  clearPlates() {
    for (const p of this.plates.values()) p.remove();
    this.plates.clear();
  }

  drawMiniBrain(g) {
    const net = g.focusEchoNet();
    const cv = this.el.minibrain;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!net) return;
    this.el.brainLabel.textContent = `${g.focusEchoName()} · 决策`;
    const sizes = net.sizes;
    const W = cv.width;
    const H = cv.height;
    const pos = sizes.map((n, l) => {
      const x = 14 + (l / (sizes.length - 1)) * (W - 28);
      return Array.from({ length: n }, (_, i) => [x, 10 + (n === 1 ? 0.5 : i / (n - 1)) * (H - 20)]);
    });
    ctx.lineWidth = 1;
    for (let l = 0; l < sizes.length - 1; l++) {
      const a = net.acts[l];
      const Wl = net.W[l];
      const nin = sizes[l];
      for (let o = 0; o < sizes[l + 1]; o++) {
        for (let i = 0; i < nin; i++) {
          const w = Wl[o * nin + i];
          const v = Math.min(1, Math.abs(w * a[i]) * 1.4);
          if (v < 0.06) continue;
          ctx.strokeStyle = w * a[i] >= 0 ? `rgba(33,109,104,${v * 0.8})` : `rgba(179,66,50,${v * 0.8})`;
          ctx.beginPath();
          ctx.moveTo(pos[l][i][0], pos[l][i][1]);
          ctx.lineTo(pos[l + 1][o][0], pos[l + 1][o][1]);
          ctx.stroke();
        }
      }
    }
    for (let l = 0; l < sizes.length; l++) {
      const a = net.acts[l];
      for (let i = 0; i < sizes[l]; i++) {
        const v = l === sizes.length - 1 ? Math.tanh(a[i] * 0.5) : Math.max(-1, Math.min(1, a[i]));
        ctx.fillStyle = v >= 0 ? `rgba(33,109,104,${0.25 + Math.abs(v) * 0.75})` : `rgba(179,66,50,${0.25 + Math.abs(v) * 0.75})`;
        ctx.beginPath();
        ctx.arc(pos[l][i][0], pos[l][i][1], 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- feedback --------------------------------------------------------------

  banner(big, sub = '', color = 'var(--fg)', dur = 1.6) {
    const e = this.el;
    e.bannerBig.innerHTML = big;
    e.bannerSub.textContent = sub;
    e.banner.style.setProperty('--c', color);
    e.banner.classList.remove('on');
    void e.banner.offsetWidth;
    e.banner.classList.add('on');
    this.bannerT = dur;
  }

  toast(html, color = 'var(--acc-electric)') {
    const t = document.createElement('div');
    t.className = 'toast label';
    t.style.setProperty('--c', color);
    t.innerHTML = html;
    this.el.toasts.appendChild(t);
    this.toastList.push({ el: t, t: 2.2 });
    while (this.toastList.length > 4) this.toastList.shift().el.remove();
  }

  // Timers run on game time (not setTimeout) so the trailer capture stays in sync.
  tick(dt) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('on');
    }
    if (this.calloutT > 0 && (this.calloutT -= dt) <= 0) this.$('.callout').classList.remove('on');
    if (this.pulseT > 0 && (this.pulseT -= dt) <= 0) this.el.predict.classList.remove('pulse');
    for (const t of this.toastList) t.t -= dt;
    while (this.toastList.length && this.toastList[0].t <= 0) this.toastList.shift().el.remove();
  }

  // A new character's name card (about a second on screen).
  callout(c) {
    const el = this.$('.callout');
    el.style.setProperty('--c', `#${c.color.toString(16).padStart(6, '0')}`);
    el.querySelector('.callout-name').textContent = c.name;
    el.querySelector('.callout-desc').textContent = c.desc;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    this.calloutT = 1.5;
    requestAnimationFrame(() => sketchBorder(el.querySelector('.callout-box'), 7, 'currentColor', 2.6));
  }

  // The meter flinches when a Mirror or Echo lands a prediction-based hit.
  pulsePredict() {
    const el = this.el.predict;
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
    this.pulseT = 0.8;
    this.el.hint.textContent = '预测弹命中 · 留意空心预测印';
  }

  // Trailer captions (lower third). Only the capture director uses these.
  caption(eyebrow, html, where = 'left') {
    const c = this.$('.caption');
    if (!html) {
      c.classList.remove('on');
      return;
    }
    c.classList.toggle('top', where === 'top');
    c.classList.toggle('right', where === 'right');
    c.querySelector('.cap-eyebrow').innerHTML = `${AST}${eyebrow}`;
    c.querySelector('.cap-text').innerHTML = html;
    c.classList.remove('on');
    void c.offsetWidth;
    c.classList.add('on');
    requestAnimationFrame(() => sketchBorder(c.querySelector('.cap-box'), 99, 'currentColor', 2.8));
  }

  // ---- training read-out --------------------------------------------------------

  showTraining(name, round) {
    this.el.trainTitle.innerHTML = `第 ${round} 代 · 凝影中`;
    this.el.trainEyebrow.textContent = '剑意归拢 · 静候镜成';this.el.loss.hidden=!this.game.debugEnabled;
    this.show('train');
  }

  updateTraining(tr, samples, done) {
    const e = this.el;
    e.trainEpoch.textContent = this.game.debugEnabled?`训练 ${Math.min(tr.epoch,tr.epochs)} / ${tr.epochs}`:done?'镜剑已成':'剑意渐成';
    const acc = Math.round((tr.valAcc || 0) * 100);
    e.trainStats.innerHTML = `<b>${samples.toLocaleString()}</b> 条保留记录 · ${done ? '凝影完成' : '正在训练'}<br>${samples < 200 ? '本次可用记录较少，镜剑表现可能不稳定。' : '镜剑学习部分操作倾向，并结合规则交战。'}`;
    if(this.game.debugEnabled)this.drawLoss(tr.lossHistory, tr.epochs);
  }

  drawLoss(hist, epochs) {
    const cv = this.el.loss;
    const g = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(37,50,56,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(10, 8);
    g.lineTo(9, H - 12);
    g.lineTo(W - 6, H - 11);
    g.stroke();
    g.fillStyle = 'rgba(37,50,56,0.6)';
    g.font = '15px "Shadows Into Light Two", cursive';
    g.fillText('LOSS', 16, 18);
    if (hist.length < 1) return;
    const max = Math.max(...hist) * 1.05;
    const min = Math.min(...hist) * 0.9;
    const rng = lcg(hist.length);
    g.strokeStyle = '#216D68';
    g.lineWidth = 3.2;
    g.lineJoin = g.lineCap = 'round';
    g.shadowColor = '#216D68';
    g.shadowBlur = 8;
    g.beginPath();
    hist.forEach((v, i) => {
      const x = 12 + (i / Math.max(1, epochs - 1)) * (W - 24);
      const y = 10 + (1 - (v - min) / Math.max(1e-6, max - min)) * (H - 26) + (rng() - 0.5) * 1.5;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
    g.shadowBlur = 0;
  }

  // ---- profile card -------------------------------------------------------------

  showProfile(profile, model) {
    const $ = this.$;
    const habit = this.game.habit;
    $('.arch').textContent = '镜剑已成，准备交手';
    $('.profile-tip').textContent=fightTip(habit);
    $('.arch-blurb').textContent = '本次已记录片段 · 玩家行为统计';
    $('.insights').innerHTML = '';
    const li = document.createElement('li');
    li.textContent = habit?.text || '这次记录还不足以判断明显习惯。';
    $('.insights').appendChild(li);
    if (habit?.denominator) {
      const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='查看依据';
      const p=document.createElement('p');p.textContent=`${habit.numerator} / ${habit.denominator} 条${habit.habitId==='lateral'?'有效横移':'有效动作'}记录 · 当前保留片段 · ${habit.ruleVersion}`;
      details.append(summary,p);li.appendChild(details);
    }
    $('.radar').innerHTML = `<div class="profile-seal">镜<br>剑</div>`;
    $('.model-meta').textContent = `第 ${model.gen} 代 · ${model.samples.toLocaleString()} 条保留记录${model.samples<200?' · 记录较少':''}`;
    this.show('profile');
  }

  // ---- game over ----------------------------------------------------------------

  showOver(r) {
    const $ = this.$;
    $('.over-eyebrow').innerHTML = `${AST}${r.eyebrow}`;
    $('.over-title').innerHTML = r.title;
    $('.over-stats').innerHTML = r.stats
      .map(([k, v]) => `<div class="stat"><div class="marker n">${v}</div><div class="label">${k}</div></div>`)
      .join('');
    $('.share').hidden = !r.canShare;
    $('.share-out').hidden = true;
    if (r.echo) $('.share-copy').innerHTML = '链接包含镜剑模型、名号和打法摘要，不包含完整逐帧操作记录。收到链接的人可以挑战它。';
    this.setHud('none');
    this.clearPlates();
    this.show('over');
  }

  showShareLink(url, copied) {
    const out = this.$('.share-out');
    out.hidden = false;
    out.value = url;
    out.select?.();
    this.toast(copied ? '挑战链接已复制' : '请手动复制下方链接', 'var(--acc-acid)');
    requestAnimationFrame(() => this.redrawSketches());
  }

  shareName() {
    return this.$('.name-in').value.trim();
  }
}

// Six-axis playstyle radar in hand-drawn ink.
function radarSVG(traits) {
  const S = 240;
  const cx = S / 2;
  const cy = S / 2 + 4;
  const R = 78;
  const rng = lcg(42);
  const ang = (i) => -Math.PI / 2 + (i * Math.PI * 2) / TRAITS.length;
  const pt = (i, r) => [cx + Math.cos(ang(i)) * r + (rng() - 0.5) * 1.6, cy + Math.sin(ang(i)) * r + (rng() - 0.5) * 1.6];
  let grid = '';
  for (const f of [0.34, 0.67, 1]) {
    const ps = TRAITS.map((_, i) => pt(i, R * f));
    grid += `<path d="M${ps.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}Z" fill="none" stroke="rgba(245,241,232,${f === 1 ? 0.5 : 0.18})" stroke-width="${f === 1 ? 2 : 1.4}"/>`;
  }
  let axes = '';
  let labels = '';
  TRAITS.forEach((t, i) => {
    const [x, y] = pt(i, R);
    axes += `<path d="M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}" stroke="rgba(245,241,232,0.18)" stroke-width="1.2"/>`;
    const [lx, ly] = pt(i, R + 22);
    labels += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle">${t}</text>`;
  });
  const vals = TRAITS.map((t, i) => pt(i, R * (0.08 + 0.92 * (traits[t] ?? 0))));
  const poly = `M${vals.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L')}Z`;
  const dots = vals.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="#FF4D9E"/>`).join('');
  return `<svg viewBox="0 0 ${S} ${S}" class="radar-svg">${grid}${axes}<path d="${poly}" fill="rgba(33,109,104,0.22)" stroke="#00E0FF" stroke-width="3" stroke-linejoin="round"/>${dots}<g class="rl">${labels}</g></svg>`;
}
