import {FallenFigures} from './fallen.js';
import {InterludeMist} from './interlude-mist.js';
import {setupMobile} from './mobile.js';
import {localId} from './local-id.js';
import {RunDiagnostics,downloadDiagnostics} from './diagnostics.js';
import {poseCharacterArt} from './character-art.js';
import {markCharacterAction} from './character-actions.js';
// Game loop and state machine.
//
//   title ─► calibrate (round 1: we record you) ─► train (a net learns you)
//     ─► profile ─► combat (fight your Echoes) ─► cleared ─► train ─► combat …
//                                     └─► dead ─► over (share your Echo)

import * as THREE from 'three';
import { PACES, calibrationPlan, enemyPace } from './pacing.js';
import { ARENA_R, SAMPLE_HZ, CALIBRATION_TIME, MAX_ECHOES, PLAYER, SCORE, C, CAST, LEECH, WARDEN, AI_RULES } from './config.js';
import { seed, rand, range, chance } from './rng.js';
import { World, BRAIN_POS } from './world.js';
import { Particles, Rings, Shake, SwordStrokes } from './fx.js';
import { Player, Echo, RuleOpponent, Bit, Byte, Leech, Mirror, Warden, Bullets, Ghost } from './entities.js';
import { Input, newPad } from './input.js';
import { UI } from './ui.js';
import { Pilot } from './pilot.js';
import { AudioEngine } from './audio.js';
import {TrialRun} from './trials/runtime.js';
import {validateConfig,copy} from './trials/schema.js';
import {TrialController} from './trials/ui.js';
import {configureTheme} from './audio-theme.js';
import themeAudio from '../assets/audio/zhaoying-theme-v3.mp3';
configureTheme(themeAudio);
import {audioSceneFor} from './audio-scenes.js';
import {
  Recorder,
  buildHabit,
  finiteModel,
  Frame,
  extractFeatures,
  moveClassFromLocal,
  makeTrainer,
  newNet,
  buildProfile,
  echoPersonality,
  Predictability,
  expectedLocalDir,
  DIM,
} from './brain.js';
import { moveProbs, argmaxMove } from './nn.js';
import { encodeEcho, echoLink, readHashEcho } from './share.js';

const pad2 = (n) => String(n).padStart(2, '0');
const L = { x: 0, z: 0 };
const IDLE_PAD = newPad();
IDLE_PAD.aimZ = -1;

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch (e) {
    return null;
  }
  return null;
}

export class Game {
  constructor({ capture = false } = {}) {
    this.capture = capture;
    if (capture) seed(7);
    this.app = document.getElementById('app');
    this.world = new World(this.app);
    const scene = this.world.scene;
    this.scene = scene;
    this.particles = new Particles(scene);
    this.rings = new Rings(scene);
    this.shake = new Shake();
    this.swordStrokes=new SwordStrokes(scene);
    this.bullets = new Bullets(scene);
    this.player = new Player(scene);
    this.ghost = new Ghost(scene);
    this.audio = new AudioEngine();
    this.input = new Input(this.world.renderer.domElement, this.app);
    this.ui = new UI(document.getElementById('ui'), this);
    this.trials = new TrialController(this);
    this.trial = null;
    this.pilot = new Pilot();
    this.pad = newPad();

    this.echoes = [];
    this.drones = [];
    this.recorder = new Recorder();
    this.models = [];
    this.latest = null;
    this.profile = null;
    this.predict = new Predictability();
    this.prediction = { x: 0, z: 0, vx: 0, vz: 0, confidence: 0 };
    this.feat = new Float32Array(DIM);
    this.frame = new Frame();
    this.probs = new Float32Array(9);
    this.v3 = new THREE.Vector3();
    this.rig = 'title';

    this.state = 'title';
    this.stateT = 0;
    this.time = 0;
    this.round = 0;
    this.score = 0;
    this.kills = 0;
    this.paused = false;
    this.timeScale = 1;
    this.hitStop = 0;
    this.autopilot = true;
    this.mode = 'story';
    this.aimError = 0.12;
    this.sampleT = 0;this.decisionSample=null;this.pendingDashSample=null;
    this.spawnT = 0;
    this.byteT = 0;
    this.roundHits = 0;
    this.roundN = 0;
    this.trail = [];
    this.seen = new Set();
    this.leechT = 0;
    this.mirrorT = 0;
    this.bossSpawned = false;
    this.duel = readHashEcho();
    this.best = Number(store('zhaoying.best')) || 0;
    this.ui.setSound(this.audio.muted);
    this.world.reducedMotion = store('zhaoying.motion') === '1';
    this.lowQuality = store('zhaoying.quality') === '1';
    if(this.lowQuality)this.world.setQuality(0);
    this.syncSettings();
    this.paceId=store('zhaoying.pace')||'gentle';if(!PACES[this.paceId])this.paceId='gentle';this.runPaceId=this.paceId;this.syncPace();
    this.introSeen=store('zhaoying.intro.v1')==='1';
    this.fallen=new FallenFigures(this.scene);this.interludeMist=new InterludeMist(this.scene);
    this.debugEnabled=capture||new URLSearchParams(location.search).has('debug');this.diagnostics=new RunDiagnostics({enabled:this.debugEnabled});this.debugEvents=this.diagnostics.events;
    if(this.debugEnabled)this.ui.$('.scr-pause .btn-col').insertAdjacentHTML('beforeend','<div class=diagnostic-controls><span class=label>本机诊断 · 仅本地记录</span><button class=btn data-act=debug-export>导出诊断</button><button class=btn data-act=debug-clear>清除诊断记录</button><small>清除已保存的诊断，不影响本局训练样本和设置。</small></div>');
    addEventListener('blur',()=>{this.input.clear();if(this.inGameplay()&&!this.paused)this.togglePause();});
    this.world.renderer.domElement.addEventListener('webglcontextlost',(e)=>{e.preventDefault();this.input.clear();this.paused=true;this.ui.show('recovery');this.ui.$('.recovery-title').textContent='画面连接中断';this.ui.$('.recovery-copy').textContent='请重新加载页面。本局进度无法保证恢复。';for(const b of this.ui.screens.recovery.querySelectorAll('button'))b.hidden=true;const b=document.createElement('button');b.className='btn';b.textContent='重新加载';b.onclick=()=>location.reload();this.ui.screens.recovery.querySelector('.btn-col').append(b);});


    this.titleNet = newNet();
    this.world.brain.setNet(this.titleNet);

    this.input.on('key', (code) => this.onKey(code));
    const unlock = () => {
      this.audio.init();
      if (this.state === 'title') {
        this.audio.startMusic();
        this.audio.setIntensity(0);
      }
    };
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.inGameplay() && !this.paused) this.togglePause();
    });
    // A challenge link pasted into an open tab only changes the hash.
    addEventListener('hashchange', () => {
      const duel = readHashEcho();
      if(!duel){this.duel=null;if(location.hash.includes('echo='))this.ui.toast('镜剑链接损坏或版本不支持，可返回普通试剑。');return;}
      this.duel = duel;
      if (this.state === 'title' || this.state === 'over') this.toTitle();
    });

    this.toTitle();
    this.mobile=setupMobile(this);
    if(location.hash.includes('echo=')&&!this.duel)this.ui.toast('镜剑链接损坏或版本不支持，可直接开始普通试剑。');
    this.last = performance.now();
    this.frameTimes = [];
    if (!capture) requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------------------------------------------------------------------
  // Loop

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    this.tickSplash(now);
    // Substep slow frames so fast bullets can't tunnel through targets.
    const n = Math.ceil(dt / (1 / 60) - 0.01);
    for (let i = 0; i < n; i++) this.step(dt / n, i === n - 1);
    this.autoQuality(dt);
  }

  step(dt, render = true) {
    this.syncAudioScene();
    const pad = this.autopilot ? this.pad : this.input.update(this.world.camera, this.player);
    if (this.autopilot) this.pilot.update(dt, this, this.pad);
    if (!this.paused) {
      let sdt = dt * this.timeScale;
      if (this.hitStop > 0) {
        this.hitStop -= dt;
        sdt *= 0.1;
      }
      if(this.mobile?.phase)this.mobile.tick(dt,pad);
      else this.update(sdt, pad, dt);
    }
    this.updateCamera(dt);
    this.world.updateFx(dt);
    this.hudDt=(this.hudDt||0)+dt;
    if(render||this.capture){this.ui.updateHud(this,this.hudDt);this.hudDt=0;}
    this.ui.tick(dt);
    if (render) this.world.render();
    this.mobile?.afterFrame(render);
  }

  // Advance the simulation without rendering (tests, and jump cuts in the trailer).
  advance(seconds, dt = 1 / 60) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) this.step(dt, false);
  }

  // Title splash: starts on the second rendered frame.
  tickSplash(now) {
    if (this.splashDone) return;
    const el = document.querySelector('.splash');
    this.splashFrames = (this.splashFrames || 0) + 1;
    if (!el) {
      this.splashDone = true;
    } else if (this.splashFrames === 2) {
      el.classList.add('play');
      this.splashAt = now;
    } else if (this.splashAt && now - this.splashAt > 2200) {
      el.classList.add('gone');
      this.splashDone = true;
      setTimeout(() => el.remove(), 700);
    }
  }

  autoQuality(dt) {
    if (this.capture) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 150) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 0.026 && this.world.quality > 0) this.world.setQuality(this.world.quality - 1);
  }

  update(dt, pad, realDt) {
    this.time += dt;
    this.stateT += dt;
    switch (this.state) {
      case 'title':
        this.updateAttract(dt, pad);
        break;
      case 'calibrate':
        this.updateCalibrate(dt, pad);
        break;
      case 'train':
        this.updateTrain(dt, realDt);
        break;
      case 'combat':
        this.updateCombat(dt, pad);
        break;
      case 'cleared':
        this.updateCleared(dt, pad);
        break;
      case 'dead':
        this.updateDead(dt, realDt);
        break;
      default:
        this.simulate(dt, IDLE_PAD, false);
    }
    this.bullets.render();
    this.particles.update(dt);
    this.rings.update(dt);
    this.swordStrokes.update(dt);
    this.world.dots.update(dt, this.time);
    this.world.brain.group.visible=false;
    this.world.dots.mesh.visible=false;
    this.fallen.update(this.state==='dead'?dt/Math.max(.01,this.timeScale):dt,this.world.reducedMotion);
    this.interludeMist.update(dt,this.player,this.state==='train',this.world.reducedMotion);
  }

  // Core simulation shared by every playable state.
  simulate(dt, pad, record) {
    this.bullets.enemySpeedScale=this.enemyPace().projectile;
    if(record&&this.sampleT-dt<=0)this.decisionSample=this.captureDecision(pad,false,this.player.dashCd<=dt);
    this.player.update(dt, pad, this);
    const tr = this.trail;
    tr.push({ t: this.time, x: this.player.x, z: this.player.z });
    while (tr.length > 2 && this.time - tr[0].t > 3) tr.shift();
    for (const e of this.echoes) e.update(dt, this);
    for (const d of this.drones) d.update(dt, this);
    this.bullets.enemySpeedScale=this.enemyPace().projectile;
    this.bullets.update(dt);
    this.collide();
    this.cleanup();
    if (record) {
      this.sampleT -= dt;
      while (this.sampleT <= 0) {
        this.sampleTick();
        this.sampleT += 1 / SAMPLE_HZ;
      }
    }
    const show = record && !!this.predictor() && this.state === 'combat' && this.prediction.confidence > 0;
    this.ghost.update(dt, this.player.x, this.player.z, this.prediction.x, this.prediction.z, show && this.player.alive);
  }

  // ---------------------------------------------------------------------------
  // Recording + prediction (15 Hz)

  focusTarget(aimX=this.player.aimX,aimZ=this.player.aimZ) {
    const p = this.player;
    let best = null;
    let bestScore = Infinity;
    const consider = (a) => {
      if (!a.active) return;
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const cos = (dx * aimX + dz * aimZ) / d;
      const score = (1 - cos) * 6 + d * 0.06;
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    };
    this.echoes.forEach(consider);
    this.drones.forEach(consider);
    return best;
  }

  // Where the player was `delay` seconds ago (null until there's enough history).
  trailAt(delay) {
    const tr = this.trail;
    const t = this.time - delay;
    if (!tr.length || tr[0].t > t) return null;
    for (let i = tr.length - 1; i >= 0; i--) if (tr[i].t <= t) return tr[i];
    return tr[0];
  }

  predictor() {
    return this.mode === 'duel' ? this.duelModel?.net : this.latest?.net;
  }

  captureDecision(pad,dash=false,ready=this.player.dashCd<=0){
    const p=this.player,target=this.focusTarget(pad.aimX??p.aimX,pad.aimZ??p.aimZ);if(!target)return null;
    const features=new Float32Array(DIM),frame=new Frame();
    const threat=extractFeatures(features,frame,p,target,this.bullets.enemyBullets,p.prevMoveX,p.prevMoveZ,ready,p.hp/PLAYER.hp);
    const length=Math.max(1,Math.hypot(pad.moveX,pad.moveZ)),mx=pad.moveX/length,mz=pad.moveZ/length;
    frame.toLocal(mx,mz,L);
    return{features,fx:frame.fx,fz:frame.fz,move:moveClassFromLocal(L.x,L.z),moveX:mx,moveZ:mz,dash,fire:!!pad.fire,dist:Math.hypot(target.x-p.x,target.z-p.z),threat};
  }

  sampleTick() {
    const p=this.player;if(!p.alive)return;
    const sample=this.pendingDashSample||this.decisionSample||(!p.dashedSinceSample?this.captureDecision({moveX:p.moveX,moveZ:p.moveZ,aimX:p.aimX,aimZ:p.aimZ,fire:p.firing}):null);
    this.pendingDashSample=null;this.decisionSample=null;
    if(!sample){this.recorder.skip(p.dashedSinceSample?'unaligned-dash':'no-target');p.dashedSinceSample=false;return;}
    this.feat.set(sample.features);this.frame.set(sample.fx,sample.fz);
    const cls=sample.move,dist=sample.dist,threatDist=sample.threat;
    const accepted=this.recorder.add(this.feat,cls,sample.dash,sample.fire,this.round,dist,threatDist);
    if(!accepted){p.dashedSinceSample=false;return;}
    // Before learning from this move, check whether the model saw it coming.
    const net = this.predictor();
    if (net) {
      const out = net.forward(this.feat);
      const hit = argmaxMove(out) === cls;
      this.predict.push(hit);
      this.roundHits += hit ? 1 : 0;
      this.roundN++;
      moveProbs(out, 1, this.probs);
      expectedLocalDir(this.probs, L);
      const conf = Math.max(...this.probs);
      this.frame.toWorld(L.x, L.z, L);
      this.prediction.vx = L.x * PLAYER.speed;
      this.prediction.vz = L.z * PLAYER.speed;
      this.prediction.x = p.x + this.prediction.vx * 0.5;
      this.prediction.z = p.z + this.prediction.vz * 0.5;
      this.prediction.confidence = conf;
      if (hit && this.predict.value > 0.6) this.audio.predictBlip();
    }

    this.world.dots.add(p.x, p.z, this.time);
    p.prevMoveX = sample.moveX;
    p.prevMoveZ = sample.moveZ;
    p.dashedSinceSample = false;
  }

  // ---------------------------------------------------------------------------
  // States

  toTitle() {
    this.mobile?.cancel();
    this.finishInterlude('cancelled','title');
    if(this.trial&&!this.trial.finished)this.finishTrial('abandoned',false);
    this.trial=null;this.trials?.cancel(false);
    this.trainer=null;this.endingKind=null;this.input.clear();
    this.resetArena();
    this.state = 'title';
    this.stateT = 0;
    this.autopilot = true;
    this.paused = false;
    this.mode = 'story';
    this.rig = 'title';
    this.round = 0;
    this.world.brain.setNet(this.latest?.net || this.titleNet);
    this.world.brain.level = 0.2;
    this.best=this.bestForPace(this.paceId);
    this.ui.showTitle(this.best, this.duel);this.syncPace();
    this.syncAudioScene();
    this.audio.setDuck(0);
    this.audio.setIntensity(0);
  }

  resetArena() {
    this.fallen?.clear();this.interludeMist?.clear();
    for (const e of this.echoes) {
      this.scene.remove(e.mesh);
      e.dispose();
    }
    for (const d of this.drones) { this.scene.remove(d.mesh); d.dispose?.(); }
    this.echoes = [];
    this.drones = [];
    this.bullets.clear();
    this.particles.clear();
    this.rings.clear();
    this.swordStrokes.clear();
    this.world.dots.clear();
    this.player.reset();
    this.timeScale = 1;
    this.hitStop = 0;
    this.ui.clearPlates();
  }

  startRun(mode = 'story',trialConfig=null,trialSource='preset') {
    if(mode==='trial'){const v=validateConfig(trialConfig);if(!v.ok)throw new Error(v.errors.join('；'));}
    this.finishInterlude('cancelled','restart');
    this.trials?.cancel(false);
    if(this.trial&&!this.trial.finished)this.finishTrial('abandoned',false);
    this.trial=mode==='trial'?new TrialRun(trialConfig,trialSource):null;
    if(this.trial&&trialSource!=='preset'&&this.trials.metadata?.configHash===this.trial.hash)this.trial.generation=copy(this.trials.metadata);
    this.input.clear();this.guideReturn=null;this.trainer=null;this.endingKind=null;this.habit=null;this.runId=mode==='trial'?localId():Date.now().toString(36);this.idleHint=false;this.hasOperated=false;
    if (mode === 'duel' && !this.duel) mode = 'story';
    this.audio.setIntensity(mode==='duel'?2:1);this.audioScene='combat';this.audio.setScene('combat');
    this.runSeed=this.trial?.config.seed??(this.capture ? 20261004 : (Math.random() * 4294967296) >>> 0);seed(this.runSeed);
    this.resetArena();
    this.mode = mode;
    this.runPaceId=this.trial?this.trial.config.pace:mode==='duel'?'standard':this.paceId;
    this.autopilot = this.capture;
    this.pilot = new Pilot();
    this.recorder.clear();
    this.trail = [];
    this.seen = new Set();
    this.leechT = PACES[this.runPaceId].leechAt;
    this.mirrorT = 3;
    this.bossSpawned = false;
    this.lastFocus = null;
    this.roundEchoes = 0;
    this.models = [];
    this.latest = null;
    this.profile = null;
    this.duelModel = null;
    this.predict = new Predictability();
    this.score = 0;
    this.kills = 0;
    this.round = 1;
    this.sampleT = 0;this.decisionSample=null;this.pendingDashSample=null;
    this.spawnT = PACES[this.runPaceId].firstSpawn;
    this.byteT = 6;
    this.paused = false;
    this.ui.show(null);
    this.audio.startMusic();
    this.audio.setDuck(0);
    this.audio.roundStart();

    if (mode === 'duel' && this.duel) {
      const d = this.duel;
      this.duelModel = { net: d.net, gen: d.gen, acc: d.match, samples: d.samples, label: `${d.name}的镜剑`, hp: 26 };
      this.state = 'combat';
      this.stateT = 0;
      this.rig = 'play';
      this.roundHits = this.roundN = 0;
      this.spawnEcho(this.duelModel, 0);
      this.ui.setHud('combat');
      this.ui.banner('镜剑挑战', `${d.name}的镜剑 · 第 ${d.gen} 代`, 'var(--acc-pink)', 2.2);
      this.audio.setIntensity(2);
      this.audio.echoSpawn();
      this.mobile?.beginRun();
      return;
    }
    this.state = 'calibrate';
    this.stateT = 0;
    this.rig = 'play';
    this.world.brain.level = 0.35;
    this.ui.setHud('calibrate');
    this.ui.banner(`第一阵 · 试剑`, `${PACES[this.runPaceId].label}节奏 · 墨印收拢后敌人才会行动`, 'var(--fg)', 2.4);
    this.audio.setIntensity(1);
    this.mobile?.beginRun();
  }

  get calibrationLeft() {
    return CALIBRATION_TIME - this.stateT;
  }

  roundLabel() {
    if (this.mode === 'duel') return '镜剑挑战';
    if(this.mode==='practice')return '规则练习 · 规则对手';
    if (this.state === 'calibrate') return `第一阵 · 试剑 · ${PACES[this.runPaceId].label}`;
    const n = this.roundEchoes || this.echoes.length;
    return `第 ${this.round} 阵 · ${n} 位镜剑`;
  }

  updateAttract(dt, pad) {
    // The autopilot plays against a few drones behind the menu; it can't die.
    this.player.invuln = 1;
    this.player.hp = PLAYER.hp;
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.drones.length < 4) {
      this.spawnDrone(chance(0.25) ? 'byte' : 'bit');
      this.spawnT = range(0.8, 2);
    }
    this.simulate(dt, pad, false);
    // The floating brain "watches" the demo player: feed it what the player sees.
    this.sampleT -= dt;
    if (this.sampleT <= 0) {
      this.sampleT = 1 / SAMPLE_HZ;
      const p = this.player;
      const t = this.focusTarget();
      if (t) {
        extractFeatures(this.feat, this.frame, p, t, this.bullets.enemyBullets, p.prevMoveX, p.prevMoveZ, p.dashCd <= 0, 1);
        this.world.brain.net.forward(this.feat);
        p.prevMoveX = p.moveX;
        p.prevMoveZ = p.moveZ;
      }
    }
  }

  updateCalibrate(dt, pad) {
    const t = this.stateT;
    if(pad.moveX||pad.moveZ||pad.fire||pad.dash)this.hasOperated=true;
    if(!this.capture&&!this.idleHint&&!this.hasOperated&&t>=AI_RULES.onboardingIdleSeconds){this.idleHint=true;if(!this.mobile)this.ui.toast('试着移动，按住左键出剑，空格冲刺。');}
    this.spawnT -= dt;
    const plan=calibrationPlan(t,this.runPaceId);
    const opening=this.trial?.config.waves[0];
    const target = opening?Math.min(plan.cap,opening.cap):plan.cap;
    if (this.spawnT <= 0 && this.drones.length < target) {
      const bytes = this.drones.filter((d) => d.kind === 'byte').length;
      const allowed=opening?.enemies.filter(k=>k==='bit'||k==='byte');
      const kind=t>plan.rangedAt&&bytes<plan.maxRanged&&chance(.3)?'byte':'bit';
      this.spawnDrone(allowed?(allowed.includes(kind)?kind:allowed[0]):kind);
      this.spawnT = this.runPaceId==='standard' && this.drones.length<2 ? 0.15 : range(...plan.interval);
    }
    this.leechT -= dt;
    if (!this.trial && this.leechT <= 0 && !this.drones.some((d) => d.kind === 'leech')) {
      this.spawnDrone('leech');
      this.leechT = range(6, 8);
    }
    this.simulate(dt, pad, true);
    if (this.calibrationLeft <= 0 && this.player.alive) this.startTraining();
  }

  updateCombat(dt, pad) {
    if(this.trial){this.updateTrialCombat(dt,pad);return;}
    this.spawnT -= dt;
    const bits = this.drones.filter((d) => d.kind === 'bit').length;
    if (this.spawnT <= 0) {
      if (bits < 1 + Math.floor(this.round / 2)) this.spawnDrone('bit');
      this.spawnT = range(3.5, 5.5);
    }
    if (this.round >= 3 || this.mode === 'duel') {
      this.byteT -= dt;
      if (this.byteT <= 0) {
        if (this.drones.filter((d) => d.kind === 'byte').length < 2) this.spawnDrone('byte');
        this.byteT = range(8, 12);
      }
    }
    this.leechT -= dt;
    if (this.leechT <= 0) {
      if (!this.drones.some((d) => d.kind === 'leech')) this.spawnDrone('leech');
      this.leechT = range(7, 10);
    }
    if (this.round >= 3) {
      this.mirrorT -= dt;
      const mirrors = this.drones.filter((d) => d.kind === 'mirror').length;
      if (this.mirrorT <= 0 && mirrors < (this.round >= 4 ? 2 : 1)) {
        this.spawnDrone('mirror');
        this.mirrorT = range(10, 14);
      }
    }
    this.simulate(dt, pad, true);
    if (this.player.alive && this.stateT > 1 && this.echoes.length === 0) {
      if(this.mode==='practice'){this.state='over';this.showOver('practice');}
      else if (this.mode === 'duel') this.finishDuel(true);
      else if (this.round >= 3 && !this.bossSpawned) this.spawnBoss();
      else if (!this.drones.some((d) => d.kind === 'warden')) this.roundCleared();
    }
  }

  updateTrialCombat(dt,pad){
    const tr=this.trial,index=tr.tick(dt),wave=tr.config.waves[index];
    if(index!==tr.wave){for(const d of this.drones)if(d.alive)this.killDrone(d,false,null,true);tr.wave=index;tr.spawnIn=0;tr.cursor=0;this.ui.toast(`试炼第${index+1}波 · ${wave.duration}秒`);}
    tr.spawnIn-=dt;
    if(tr.spawnIn<=0){
      tr.spawnIn=wave.interval;const alive=this.drones.filter(d=>d.alive);
      if(alive.length<wave.cap){
        for(let i=0;i<wave.enemies.length;i++){
          const kind=wave.enemies[tr.cursor++%wave.enemies.length],count=alive.filter(d=>d.kind===kind).length;
          if((kind==='byte'&&count>=2)||(['mirror','warden'].includes(kind)&&count>=1))continue;
          const before=this.drones.length;this.spawnDrone(kind);
          // Existing leech packs are clipped to the active wave cap, not just the run cap.
          while(this.drones.filter(d=>d.alive).length>wave.cap){const d=this.drones.pop();this.scene.remove(d.mesh);d.dispose?.();}
          tr.spawned=(tr.spawned||0)+(this.drones.length-before);break;
        }
      }
    }
    this.simulate(dt,pad,true);
    if(this.player.alive&&tr.metrics.elapsed>=tr.total-1e-6)this.finishTrial('time');
  }

  finishTrial(reason,show=true){
    if(!this.trial||this.trial.finished)return;
    this.finishInterlude('ready','trial-result');
    const result=this.trial.result(reason,this.score);result.runId=this.runId;result.sampleScope={localOnly:true,recordedSamples:this.recorder.n,models:this.models.length};
    this.trainer=null;this.endingKind=null;this.input.clear();this.paused=false;this.timeScale=1;this.state='over';this.stateT=0;
    this.resetArena();this.syncAudioScene();this.audio.setDuck(0);this.audio.setIntensity(0);
    if(show)this.trials.complete(result);else{this.trials.complete(result);this.ui.setHud('none');}
  }

  // Round 3+ ends with a Warden once every Echo is down.
  spawnBoss() {
    this.bossSpawned = true;
    this.spawnDrone('warden');
    this.ui.banner('镇阵剑印 · 入阵', '冲刺穿过护阵雾障，趁破防出剑', 'var(--fg)', 2.4);
    this.audio.roundStart();
  }

  onWardenBreak(w) {
    this.rings.spawn(w.x, w.z, C.acid, WARDEN.shieldR, WARDEN.shieldR * 1.8, 0.5);
    this.particles.burst(w.x, 0.5, w.z, C.acid, 30, 12, 0.6, 1.1);
    this.shake.add(0.35);
    this.world.fx.aberration = Math.max(this.world.fx.aberration, 0.7);
    this.audio.wardenBreak();
    this.ui.toast('护阵已破 · 趁势出剑', 'var(--acc-acid)');
  }

  // First appearance of a new character in a run: a 1-second name card.
  introduce(kind) {
    if (this.seen.has(kind)) return;
    this.seen.add(kind);
    const c = CAST[kind];
    if (!c || this.state === 'title') return;
    this.ui.callout(c);
    this.audio.callout();
  }

  roundCleared() {
    this.diagnostics.begin(this.runId,this.round,'round-cleared');
    this.state = 'cleared';
    this.stateT = 0;
    const acc = this.roundN ? this.roundHits / this.roundN : 0.5;
    const bonus = Math.round((1 - acc) * SCORE.unpredictBonus);
    this.score += SCORE.roundClear + bonus;
    for (const d of this.drones) this.killDrone(d, true);
    this.player.hp = Math.min(PLAYER.hp, this.player.hp + 2);
    this.ui.banner('此阵已破', `本阵移动预测命中 ${Math.round(acc * 100)}%`, 'var(--fg)', 1.8);
    this.ui.toast(`变招奖励 +${bonus}`, 'var(--acc-acid)');
    this.audio.roundClear();
  }

  updateCleared(dt, pad) {
    this.simulate(dt, pad, false);
    if (this.stateT > 1.7) this.startTraining();
  }

  // ---------------------------------------------------------------------------
  // Training interlude

  startTraining() {
    this.diagnostics.begin(this.runId,this.round,'training');
    this.input.clear();
    if(this.recorder.n<AI_RULES.minTrainSamples){
      if(this.endingKind){const kind=this.endingKind;this.endingKind=null;this.state='over';this.finishInterlude('insufficient','over');this.showOver(kind);return;}
      this.trainingRecovery('insufficient');return;
    }
    this.trainingWallStart=performance.now();this.logEvent('training-start',{samples:this.recorder.n});
    this.rig='interlude';
    this.state = 'train';
    this.stateT = 0;
    for (const d of this.drones) this.killDrone(d, false,null,true);
    this.bullets.clear();
    this.trainer = null;
    this.trained = false;
    this.ui.setHud('none');
    this.ui.clearPlates();
    if (this.round === 1) {
      this.ui.banner('试剑已毕', `${this.recorder.n.toLocaleString()} 条可用记录`, 'var(--fg)', 1.3);
    }
    this.audio.setDuck(0.6);
  }

  updateTrain(dt, realDt) {
    const t = this.stateT;
    this.simulate(dt, IDLE_PAD, false);
    const first = this.models.length === 0;
    const anim = first ? 1.7 : 1.2;
    try {
    if (!this.trainer && t > (first ? 0.9 : 0.3)) {
      const gen = this.models.length + 1;
      this.trainer = makeTrainer(this.recorder, first ? 36 : 24);
      this.world.brain.setNet(this.trainer.net);
      this.world.brain.level = 0.6;
      this.world.dots.clear();
      this.rig = 'interlude';
      this.trainStart = t;
      this.tickT = 0;
      this.ui.showTraining(`ECHO-${pad2(gen)}`, gen);
    }
    const tr = this.trainer;
    if (tr && !tr.done) {
      const k = Math.min(1, Math.max(0, (t - this.trainStart - 0.45) / anim));
      const want = Math.ceil(k * tr.totalSteps);
      const until=performance.now()+AI_RULES.trainBudgetMs;
      do {tr.run(1);} while(!tr.done && performance.now()<until);
      const rec = this.recorder;
      if (rec.n) {
        const i = Math.floor(rand() * rec.n);
        tr.net.forward(rec.X.subarray(i * DIM, (i + 1) * DIM));
      }
      this.tickT -= dt;
      if (this.tickT <= 0 && k > 0) {
        this.audio.trainTick(k);
        this.tickT = 0.07;
      }
      this.ui.updateTraining(tr, rec.n, false);
      if (tr.done) this.onTrained();
    }
    } catch(error){this.trainingRecovery('failed',error);return;}
    if (this.trained && t > this.trainedAt + 0.8) {
      if(this.endingKind){const kind=this.endingKind;this.endingKind=null;this.state='over';this.showOver(kind);return;}
      if (this.round === 1 && ['story','trial'].includes(this.mode) && this.profile) {
        this.state = 'profile';
        this.stateT = 0;
        this.rig = 'overview';
        this.ui.showProfile(this.profile, this.latest);
        this.ui.$('.profile-next b').textContent=this.trial?'接下来，按试炼目标与本局镜剑交手。':'接下来，击败红色镜剑。';
        this.audio.setDuck(0.3);this.finishInterlude('ready','profile');
      } else {
        this.beginRound(this.round + 1);
      }
    }
  }

  onTrained() {
    const tr = this.trainer;
    if(this.trained)return;
    if(!tr?.done || !finiteModel(tr.net))throw new Error('INVALID_MODEL');
    const gen = this.models.length + 1;
    const model = { net: tr.net, gen, acc: tr.valAcc, samples: this.recorder.n, totalSamples:this.recorder.total, label: `镜剑-${pad2(gen)}`, computeMs: tr.computeMs };
    this.profile = buildProfile(this.recorder, this.player.shots, this.player.hits);
    this.habit = buildHabit(this.recorder,this.runId);
    model.personality = echoPersonality(this.profile, this.models.map((m) => m.personality?.id));
    this.models.push(model);
    this.latest = model;
    const acc = this.player.shots ? this.player.hits / this.player.shots : 0.3;
    this.aimError = Math.min(0.2, Math.max(0.02, 0.24 - acc * 0.32));
    this.trained = true;
    model.elapsedTrainingMs=performance.now()-this.trainingWallStart;this.diagnostics.trained(tr.computeMs,model.elapsedTrainingMs);this.logEvent('training-complete',{samples:this.recorder.n,computeMs:tr.computeMs,elapsedTrainingMs:model.elapsedTrainingMs});
    this.trainedAt = this.stateT;
    this.world.brain.pulse = 1;
    this.audio.trainDone();
    this.ui.updateTraining(tr, this.recorder.n, true);
  }

  continueFromProfile() {
    if (this.state !== 'profile') return;
    this.input.clear();this.beginRound(2);
  }

  beginRound(r) {
    this.finishInterlude('ready','combat');
    this.input.clear();
    this.round = r;
    this.state = 'combat';
    this.stateT = 0;
    this.syncAudioScene();
    this.rig = 'play';
    this.ui.show(null);
    this.ui.setHud('combat');
    this.predict.reset();
    this.roundHits = this.roundN = 0;
    this.spawnT = 2.5;
    this.byteT = 4;
    const gens = this.models.slice(-MAX_ECHOES);
    gens.forEach((m, i) => this.spawnEcho(m, i, gens.length));
    this.roundEchoes = gens.length;
    this.bossSpawned = false;
    this.mirrorT = 3;
    this.leechT = range(5, 7);
    const newest = gens[gens.length - 1];
    const P = newest.personality;
    const sub = `第 ${newest.gen} 代镜剑 · 学习策略与规则共同驱动`;
    this.ui.banner(`第 ${r} 阵 · 照影问剑`, sub, 'var(--fg)', 1.4);
    this.audio.setDuck(0);
    this.audio.setIntensity(r >= 4 ? 3 : 2);
    this.audio.roundStart();
    this.audio.echoSpawn();
    this.world.fx.glitch = 1;
  }

  spawnEcho(model, i, n = 1) {
    const p = this.player;
    const away = Math.atan2(-p.z, -p.x) + (n > 1 ? (i - (n - 1) / 2) * 0.9 : 0);
    let x = Math.cos(away) * 12;
    let z = Math.sin(away) * 12;
    if (Math.hypot(x - p.x, z - p.z) < 9) {
      x = -p.x * 0.8;
      z = -p.z * 0.8 - 6;
    }
    const e = new Echo(this.scene, model, x, z);
    this.echoes.push(e);
    this.rings.spawn(x, z, e.color, 4, 0.4, 0.9);
    this.rings.spawn(x, z, e.color, 0.2, 2.5, 0.7);
    for (let k = 0; k < 40; k++) {
      this.particles.spawn(x + range(-0.5, 0.5), range(1, 7), z + range(-0.5, 0.5), 0, range(-9, -4), 0, range(0.3, 0.8), range(0.6, 1.4), new THREE.Color(e.color).multiplyScalar(2.5), 0.5, 0);
    }
  }

  finishDuel(won) {
    this.diagnostics.begin(this.runId,this.round,'duel-ended');
    this.state = 'over';
    this.stateT = 0;
    if (won) this.score += 1500;
    const kind=won?'duel-won':'duel-lost';
    if(!this.trainSync(kind))this.showOver(kind);
  }

  // End-of-run training uses the same frame-budgeted scheduler.
  trainSync(kind='lost') {
    if(this.mode==='practice'||this.recorder.n<AI_RULES.minTrainSamples||this.latest?.totalSamples===this.recorder.total)return false;
    this.endingKind=kind;this.startTraining();return true;
  }

  trainingRecovery(reason,error) {
    this.finishInterlude(reason,'recovery');
    this.input.clear();this.bullets.clear();for(const d of this.drones)this.killDrone(d,false,null,true);
    this.trainer=null;this.trained=false;this.state='recovery';this.stateT=0;this.rig='overview';this.ui.setHud('none');this.ui.show('recovery');
    this.logEvent('training-'+reason,{message:error?.message||'',samples:this.recorder.n});
    this.ui.$('.recovery-title').textContent=reason==='insufficient'?'记录暂不足':'镜剑生成失败';
    this.ui.$('.recovery-copy').textContent=reason==='insufficient'?'这次还没有足够记录形成镜剑。可再试剑，或与明确的规则对手练习。':'可以重试凝影，或进入规则练习。';
    this.ui.$('[data-act=retrain]').hidden=reason==='insufficient';
    this.ui.$('[data-act=previous]').hidden=!this.latest;
  }

  startRulePractice() {
    this.startRun('practice');this.state='combat';this.round=2;this.recorder.clear();this.ui.setHud('combat');this.ui.show(null);
    this.echoes.push(new RuleOpponent(this.scene,0,-8));this.roundEchoes=1;this.ui.banner('规则练习','对手由固定规则控制，不是学习分身。');
  }

  logEvent(type,details={}){this.diagnostics?.log(type,{runId:this.runId,time:this.time},details);}
  finishInterlude(outcome,destination){const row=this.diagnostics?.finish(outcome,destination,this.trainer?.computeMs??null);if(row){if(outcome==='ready'&&this.latest&&this.trained)this.latest.interludeMs=row.interludeMs;this.logEvent('interlude-end',row);}return row;}
  syncSettings(){document.body.classList.toggle('reduced-motion',this.world.reducedMotion);this.ui.$('.quality').textContent=`低特效 ${this.lowQuality?'开启':'关闭'}`;this.ui.$('.motion').textContent=`减少动态 ${this.world.reducedMotion?'开启':'关闭'}`;this.particles.mesh.visible=!this.lowQuality;this.world.dots.mesh.visible=false;this.ghost.reducedMotion=this.world.reducedMotion;}

  // ---------------------------------------------------------------------------
  // Death + game over

  die() {
    this.diagnostics.begin(this.runId,this.round,'death');
    const p = this.player;
    p.alive = false;
    this.fallen.add(p,this.world.camera,p.lastImpact||{vx:-p.aimX,vz:-p.aimZ});
    p.mesh.visible = false;markCharacterAction(p,'death',this.time);
    this.state = 'dead';
    this.stateT = 0;
    this.deadReal = 0;
    this.timeScale = 0.3;
    this.rig = 'death';
    this.deathInk(p.x,p.z,C.electric);
    this.world.fx.glitch=0;this.world.fx.aberration=0;this.world.fx.flash=0;
    this.audio.death();
    this.audio.setDuck(1);
    this.ghost.update(0.016, p.x, p.z, p.x, p.z, false);
  }

  updateDead(dt, realDt) {
    this.deadReal += realDt;
    for (const e of this.echoes) e.update(dt, this);
    for (const d of this.drones) d.update(dt, this);
    this.bullets.update(dt);
    if (this.deadReal > 2) {
      this.timeScale = 1;
      this.state = 'over';
      this.stateT = 0;
      if(this.trial){this.finishTrial('death');return;}
      if (this.mode === 'duel') this.finishDuel(false);
      else {
        if(!this.trainSync('lost'))this.showOver(this.mode==='practice'?'practice':'lost');
      }
    }
  }

  showOver(kind) {
    this.finishInterlude('ready','over');
    this.syncAudioScene();
    this.rig = 'overview';
    const bestKey=`zhaoying.best.${this.runPaceId}`;
    this.best=this.bestForPace(this.runPaceId);
    if(this.mode==='story'&&this.score>this.best){this.best=this.score;store(bestKey,String(this.best));}
    const pct = Math.round(this.predict.overall * 100);
    const d = this.duel;
    const titles = {
      lost: this.round <= 1 ? '试剑未竟，再问一剑。' : '此番照影，下回再会。',
      practice:'规则练习结束',
      'duel-won': `你击败了${d?.name}的镜剑。`,
      'duel-lost': `${d?.name}的镜剑胜出。`,
    };
    const stats = [
      ['得分', this.score.toLocaleString()],
      [this.mode === 'duel' ? '模式' : '阵数', this.mode === 'duel' ? '挑战' : this.round],
      ['击败镜剑', this.kills],
      ['移动预测命中', this.predict.allN ? `${pct}%` : '—'],
      ['保留记录', this.recorder.n.toLocaleString()],
    ];
    this.ui.showOver({
      eyebrow: kind === 'duel-won' ? '挑战胜出' : kind === 'duel-lost' ? '挑战结束' : '本次试剑结束',
      title: titles[kind],
      stats,
      canShare: !!this.latest,
      echo: this.latest ? `${this.latest.label} (<b class="pink">${this.profile?.archetype.name ?? 'UNKNOWN'}</b>)` : null,
    });
    this.audio.setIntensity(0);
    this.audio.setDuck(0.4);
  }

  shareLink() {
    if (!this.latest) return;
    const prof = this.profile;
    const code = encodeEcho({
      name: this.ui.shareName() || '无名客',
      gen: this.latest.gen,
      samples: this.latest.samples,
      match: this.latest.acc || 0,
      archetypeId: prof?.archetype.id,
      traits: prof?.traits,
      net: this.latest.net,
    });
    const url = echoLink(code);
    const done = (ok) => this.ui.showShareLink(url, ok);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
    else done(false);
  }

  bestForPace(pace){const current=store(`zhaoying.best.${pace}`);return Number(current??(pace==='standard'?store('zhaoying.best'):0))||0;}
  enemyPace(){return enemyPace(this.mode==='duel'?'standard':this.runPaceId,this.state);}
  syncPace(){this.ui.$('.best').firstChild.textContent=`${PACES[this.paceId].label}最高分 `;for(const b of this.ui.root.querySelectorAll('[data-act=pace]'))b.textContent=`来敌节奏 ${PACES[this.paceId].label}${this.state!=='title'?' · 下局生效':''}`;}

  // ---------------------------------------------------------------------------
  // Combat helpers

  spawnDrone(kind) {
    const p = this.player;
    let x = 0;
    let z = 0;
    let best=-Infinity;
    for (let tries = 0; tries < 32; tries++) {
      const a=rand()*Math.PI*2,r=range(ARENA_R-6,ARENA_R-1.5);
      const cx=Math.cos(a)*r,cz=Math.sin(a)*r,dist=Math.hypot(cx-p.x,cz-p.z);
      const screen=this.project(cx,.1,cz);
      const visible=Math.abs(screen.x)<.86 && Math.abs(screen.y)<.76;
      const score=Math.min(dist,14)+(visible?20:0);
      if(score>best){best=score;x=cx;z=cz;}
      if(dist>11 && visible){x=cx;z=cz;break;}
    }
    if (kind === 'leech') {
      const n = this.trial?Math.min(2,Math.max(0,this.trial.config.constraints.maxEnemies-this.drones.filter(d=>d.alive).length)):this.runPaceId==='gentle'&&this.state==='calibrate' ? PACES.gentle.pack : LEECH.pack[0] + Math.floor(rand() * (LEECH.pack[1] - LEECH.pack[0] + 1));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const leech=new Leech(this.scene,x+Math.cos(a)*1.1,z+Math.sin(a)*1.1);leech.spawnSeconds=this.enemyPace().arrival;this.drones.push(leech);
      }
      this.rings.spawn(x, z, C.pink, 2.6, .6, this.enemyPace().arrival, .65);
      this.introduce('leech');
      return;
    }
    const Kind = { byte: Byte, mirror: Mirror, warden: Warden }[kind] || Bit;
    const d = new Kind(this.scene, x, z);
    d.spawnSeconds=this.enemyPace().arrival;
    this.drones.push(d);
    this.rings.spawn(x,z,C.pink,kind==='warden'?4:1.65,.6,this.enemyPace().arrival,.7);
    this.introduce(kind);
  }

  collide() {
    const p = this.player;
    const hit = (b, a) => Math.hypot(b.x - a.x, b.z - a.z) < b.radius + a.radius;
    for (const b of this.bullets.list) {
      if (b.dead) continue;
      if (b.owner === 'player') {
        for (const e of this.echoes) {
          if (e.active && !e.dodging && hit(b, e)) {
            b.dead = true;
            this.hitEcho(e, b);
            break;
          }
        }
        if (b.dead) continue;
        for (const d of this.drones) {
          if (!d.active) continue;
          if (d.kind === 'warden' && d.shielded) {
            // The shield eats bullets at the ring.
            if (Math.hypot(b.x - d.x, b.z - d.z) < WARDEN.shieldR) {
              b.dead = true;
              this.particles.spray(b.x, 0.6, b.z, -b.vx, -b.vz, C.acid, 3, 6);
              this.audio.wardenShield();
              break;
            }
            continue;
          }
          if (hit(b, d)) {
            b.dead = true;
            this.hitDrone(d, b);
            break;
          }
        }
      } else if (p.alive && hit(b, p) && p.invuln <= 0) {
        b.dead = true;
        this.hurtPlayer(b.vx, b.vz, b.color);
        if (b.src === 'echo' || b.src === 'mirror') this.ui.pulsePredict();
      }
    }
    if (!p.alive) return;
    for (const d of this.drones) {
      if (!d.active || (d.kind !== 'bit' && d.kind !== 'leech' && d.kind !== 'mirror')) continue;
      if (Math.hypot(d.x - p.x, d.z - p.z) >= d.radius + p.radius) continue;
      if (d.kind === 'leech') {
        // Leeches drain score instead of health; dash through them to pop them.
        if (p.dashT > 0) this.killDrone(d, true);
        else {
          const drain = Math.min(this.score, LEECH.drain);
          this.score -= drain;
          this.killDrone(d, false);
          this.audio.leechDrain();
          if (drain > 0) this.ui.toast(`噬墨扣分 −${drain}`, 'var(--acc-pink)');
        }
      } else if (d.kind === 'mirror') {
        // Walking back into your own old route hurts.
        if (p.dashT <= 0 && p.invuln <= 0) {
          this.hurtPlayer(d.vx, d.vz, d.color);
          this.ui.pulsePredict();
        }
      } else if (p.dashT > 0) this.killDrone(d, true);
      else if (p.invuln <= 0) {
        this.killDrone(d, false);
        this.hurtPlayer(d.vx, d.vz, d.color);
      }
    }
    for (const e of this.echoes) {
      if (!e.active) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = e.radius + p.radius;
      if (d < min && d > 1e-3) {
        const push = (min - d) / 2;
        e.x += (dx / d) * push;
        e.z += (dz / d) * push;
        p.x -= (dx / d) * push;
        p.z -= (dz / d) * push;
      }
    }
  }

  hitEcho(e, b) {
    markCharacterAction(e,'hurt',this.time);
    e.hurt(1);
    this.player.hits++;
    this.particles.hitFlash(b.x, 0.6, b.z, e.color);
    this.swordStrokes.spawn(b.x,b.z,e.color,Math.atan2(b.vx,b.vz),.7,.18);
    e.vx += b.vx * 0.03;
    e.vz += b.vz * 0.03;
    this.particles.spray(b.x, 0.6, b.z, -b.vx, -b.vz, e.color, 6, 9);
    this.audio.enemyHit();
    if (!e.alive) {
      const pts = SCORE.echoBase * e.gen;
      this.score += pts;
      this.kills++;
      if(this.trial&&this.state==='combat')this.trial.credit(e);
      this.fallen.add(e,this.world.camera,b);this.deathInk(e.x,e.z,e.color);
      this.hitStop = 0.14;
      this.ui.toast(`${e.name} 已破 +${pts}`, `#${e.color.toString(16).padStart(6, '0')}`);
    }
  }

  hitDrone(d, b) {
    d.hurt(1);
    this.player.hits++;
    this.particles.hitFlash(b.x, 0.6, b.z, d.color);
    this.swordStrokes.spawn(b.x,b.z,d.color,Math.atan2(b.vx,b.vz),.7,.18);
    this.particles.spray(b.x, 0.6, b.z, -b.vx, -b.vz, d.color, 4, 7);
    this.audio.enemyHit(d.kind==='warden'?2:1);
    if (!d.alive) this.killDrone(d, true,b);
  }

  killDrone(d, scored, impact=null,quiet=false) {
    if(d.deathHandled)return;d.deathHandled=true;d.alive=false;
    if(!quiet){this.fallen.add(d,this.world.camera,impact||{vx:d.x-this.player.x,vz:d.z-this.player.z});this.deathInk(d.x,d.z,d.color);this.audio.explode(d.kind==='warden'?.5:.15);if(d.kind==='warden'){this.hitStop=.12;if(scored)this.ui.toast(`镇阵剑印已破 +${d.score}`,'var(--acc-acid)');}}
    if(scored){this.score+=d.score;if(this.trial&&this.state==='combat')this.trial.credit(d);}
  }
  deathInk(x,z,color){this.particles.spray(x,.12,z,0,0,color,3,1.2,.35,.18,.4);}

  explode(x, z, color, size) {
    this.particles.burst(x, 0.7, z, color, Math.round(70 * size), 13 * size, 0.9, 1.5);
    this.particles.burst(x, 0.7, z, C.ink, Math.round(20 * size), 9 * size, 0.6, 1, 1.2);
    this.rings.spawn(x, z, color, 0.5, 7 * size, 0.6);
    this.rings.spawn(x, z, C.ink, 0.3, 4 * size, 0.45, 0.6);
    this.shake.add(0.55 * size);
    this.world.fx.aberration = Math.max(this.world.fx.aberration, 0.8 * size);
    this.world.fx.flash = 0.6 * size;
    this.audio.explode(Math.min(1, size));
  }

  hurtPlayer(vx, vz, color) {
    const p = this.player;p.lastImpact={vx,vz};
    if(this.trial&&this.state==='combat')this.trial.metrics.damage++;
    markCharacterAction(p,'hurt',this.time);
    p.hp -= 1;
    p.invuln = PLAYER.hurtIframes;
    this.shake.add(0.5);
    this.world.fx.aberration = 1.2;
    this.world.fx.glitch = 0.5;
    this.particles.spray(p.x, 0.7, p.z, vx, vz, color, 14, 10, 1.2);
    this.audio.playerHurt();
    if (p.hp <= 0) this.die();
  }

  onSwordRelease(actor,color){
    markCharacterAction(actor,'attack',this.time);
    if(this.world.reducedMotion)return;
    if(this.time-(actor.lastSwordStroke??-1)<.19)return;
    actor.lastSwordStroke=this.time;
    this.swordStrokes.spawn(actor.x+actor.aimX*.9,actor.z+actor.aimZ*.9,color,Math.atan2(actor.aimX,actor.aimZ),.75,.18);
  }

  onDash(actor, color,fire=actor.firing) {
    if(!this.mobile?.phase&&actor===this.player&&actor.dashedSinceSample&&(this.state==='combat'||this.state==='calibrate'))this.pendingDashSample=this.captureDecision({moveX:actor.moveX,moveZ:actor.moveZ,aimX:actor.aimX,aimZ:actor.aimZ,fire},true,true);
    actor.artDashAt=this.time;
    if(!this.mobile?.phase&&this.trial&&actor===this.player&&this.state==='combat')this.trial.metrics.dashes++;
    if(!this.world.reducedMotion)this.swordStrokes.spawn(actor.x,actor.z,color,Math.atan2(actor.dashX,actor.dashZ),1.8,.32);
    this.particles.spray(actor.x, 0.4, actor.z, -actor.dashX, -actor.dashZ, color, 10, 6, 0.6, 0.3, 0.9);
    this.rings.spawn(actor.x, actor.z, color, 0.4, 1.6, 0.3, 0.7);
    this.audio.dash();
  }

  cleanup() {
    const alive = (a) => {
      if (a.alive) return true;
      this.scene.remove(a.mesh);
      a.dispose?.();
      return false;
    };
    this.echoes = this.echoes.filter(alive);
    this.drones = this.drones.filter(alive);
  }

  // ---------------------------------------------------------------------------
  // Camera, input, misc

  updateCamera(dt) {
    const p = this.player;
    const tall = this.world.aspect < 1;
    const pos = this.v3a || (this.v3a = new THREE.Vector3());
    const look = this.v3b || (this.v3b = new THREE.Vector3());
    let sharp = 4;
    switch (this.rig) {
      case 'play': {
        if(this.mobile){this.mobile.camera(pos,look);sharp=9;break;}
        const cx = p.x * 0.8 + p.aimX * 1.6;
        const cz = p.z * 0.8 + p.aimZ * 1.6;
        pos.set(cx, tall ? 33 : 22, cz + (tall ? 17 : 13.5));
        look.set(cx, 0, cz - 1);
        sharp = 5;
        break;
      }
      case 'title': {
        const a = Math.sin(this.time * 0.07) * 0.3 - 0.12;
        pos.set(Math.sin(a) * 28 - (tall ? 0 : 6), tall ? 20 : 11, Math.cos(a) * 28 + 2);
        look.set(tall ? 0 : -10, 8.6, -13);
        sharp = 2;
        break;
      }
      case 'interlude':
        pos.set(p.x,tall?33:23.5,p.z+(tall?17:14));look.set(p.x,0,p.z);sharp=2.2;
        break;
      case 'brain':
        pos.set(BRAIN_POS.x, BRAIN_POS.y - 0.6, BRAIN_POS.z + (tall ? 30 : 19.5));
        look.copy(BRAIN_POS);
        sharp = 2.6;
        break;
      case 'overview':
        pos.set(0, tall ? 44 : 31, tall ? 26 : 21);
        look.set(0, 0, 1);
        sharp = 2.4;
        break;
      case 'death':
        pos.set(p.x, 11, p.z + 8.5);
        look.set(p.x, 0, p.z);
        sharp = 3;
        break;
    }
    this.world.updateCamera(dt, pos, look, sharp, this.world.reducedMotion?null:this.shake.update(dt));
    this.mobile?.keepPlayerVisible();
  }

  project(x, y, z) {
    return this.v3.set(x, y, z).project(this.world.camera);
  }

  focusEcho() {
    let best = null;
    let bd = Infinity;
    for (const e of this.echoes) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.player.x, e.z - this.player.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  focusEchoNet() {
    const e = this.focusEcho();
    if (e) this.lastFocus = e;
    return this.lastFocus?.net || null;
  }

  focusEchoName() {
    return this.lastFocus?.name || 'ECHO';
  }

  inGameplay() {
    return ['calibrate', 'combat', 'cleared', 'train', 'dead'].includes(this.state);
  }

  syncAudioScene(){
    const scene=this.mobile?.phase?'quiet':audioSceneFor(this.state,this.paused);
    if(scene===this.audioScene)return;
    this.audioScene=scene;
    this.audio.setIntensity(scene==='combat'?(this.state==='combat'?(this.round>=4?3:2):1):0);
    this.audio.setScene(scene);
  }

  togglePause() {
    if (!this.inGameplay() || this.state === 'dead') return;
    this.input.clear();
    this.paused = !this.paused;
    this.syncAudioScene();
    this.syncPace();
    this.ui.show(this.paused ? 'pause' : this.state === 'train' ? 'train' : null);
    this.audio.setDuck(this.paused ? 1 : this.state === 'train' ? 0.6 : 0);
  }

  toggleMute() {
    const m = this.audio.toggleMute();
    store('zhaoying.muted', m ? '1' : '0');
    this.ui.setSound(m);
    this.ui.syncAudioSettings();
  }

  onKey(code) {
    if(['trial','trialover'].includes(this.ui.current)){if(code==='Escape')this.trials.action('back');return;}
    if(this.ui.current==='audio'){if(code==='Escape')this.onAction('audio-back');else if(code==='KeyM')this.toggleMute();return;}
    if(this.ui.current==='intro'&&code==='Enter'){this.onAction('intro-start');return;}
    if (code === 'Escape' || code === 'KeyP') this.togglePause();
    else if (code === 'KeyM') this.toggleMute();
    else if (code === 'Space' || code === 'Enter' || code === 'GamepadA') {
      if (this.state === 'profile') this.continueFromProfile();
      else if (this.state === 'title' && code === 'Enter') this.onAction('play');
      else if (this.state === 'over' && code === 'Enter') {if(this.trial)this.trials.action('again');else this.startRun(this.mode);}
    }
  }

  onAction(act) {
    if(act==='mobile-help'){this.mobile?.review();return;}
    if(act==='mobile-help-back'){this.ui.show('pause');return;}
    switch (act) {
      case 'debug-export':if(this.debugEnabled)this.ui.toast(downloadDiagnostics(this.diagnostics.snapshot(this))?'已请求下载，仅保存在本机':'导出未完成，请重试');break;
      case 'debug-clear':if(this.debugEnabled){this.diagnostics.clear();this.ui.toast('已清除诊断记录，训练样本与设置保留');}break;
      case 'trials':this.toTitle();this.trials.open();break;
      case 'audio-settings':
        this.audioReturn=this.ui.current||'title';this.input.clear();this.ui.syncAudioSettings();this.ui.show('audio');break;
      case 'audio-back':
        this.ui.show(this.audioReturn||'title');this.audioReturn=null;break;
      case 'pace':this.paceId=this.paceId==='gentle'?'standard':'gentle';store('zhaoying.pace',this.paceId);this.syncPace();if(this.state==='title'){this.best=this.bestForPace(this.paceId);if(this.ui.current==='mobileprefs')this.ui.$('.best span').textContent=this.best.toLocaleString();else this.ui.showTitle(this.best,this.duel);}break;
      case 'quality':this.lowQuality=!this.lowQuality;this.world.setQuality(this.lowQuality?0:2);store('zhaoying.quality',this.lowQuality?'1':'0');this.syncSettings();break;
      case 'motion':this.world.reducedMotion=!this.world.reducedMotion;store('zhaoying.motion',this.world.reducedMotion?'1':'0');this.syncSettings();break;
      case 'retrain':if(this.state==='recovery')this.startTraining();break;
      case 'previous':if(this.state==='recovery'&&this.latest){this.endingKind=null;this.ui.toast('沿用上一代镜剑');this.beginRound(this.round+1);}break;
      case 'practice':this.startRulePractice();break;
      case 'intro-start':
        this.introSeen=true;store('zhaoying.intro.v1','1');this.startRun('story');break;
      case 'play':
        if(this.trial&&this.state==='recovery'){this.startRun('trial',this.trial.config,this.trial.source);break;}
        if(!this.introSeen&&!this.mobile){this.input.clear();this.ui.show('intro');break;}
        this.startRun('story');
        break;
      case 'duel':
        this.startRun('duel');
        break;
      case 'how':
        this.guideReturn=this.paused?'pause':null;
        this.ui.show('how');
        break;
      case 'back':
        if(this.guideReturn==='pause'){this.guideReturn=null;this.ui.show('pause');break;}
      case 'menu':
        if (this.paused) this.paused = false;
        this.toTitle();
        break;
      case 'continue':
        this.continueFromProfile();
        break;
      case 'retry':
        if(this.trial){this.startRun('trial',this.trial.config,this.trial.source);break;}
        this.paused = false;
        this.startRun(this.mode === 'duel' && this.duel ? 'duel' : 'story');
        break;
      case 'resume':
      case 'pause':
        this.togglePause();
        break;
      case 'mute':
        this.toggleMute();
        break;
      case 'share':
        this.shareLink();
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Fonts improve canvas labels, but must never hold the game behind a blank page.
async function boot() {
  const capture = new URLSearchParams(location.search).has('capture');
  const timing = window.__bootTiming = { start: performance.now() };
  let fontTimeout;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('24px "Songti SC"'),
        document.fonts.load('24px system-ui'),
      ]),
      new Promise(resolve => { fontTimeout = setTimeout(resolve, 350); }),
    ]);
  } catch { /* System fallback fonts keep the game playable. */ }
  finally { clearTimeout(fontTimeout); }
  timing.fonts = performance.now();
  const game = new Game({ capture });
  window.__zhaoying = game;
  if (capture) setupCapture(game);
  document.body.classList.add('ready');
  timing.ready = performance.now();
  document.getElementById('boot-status')?.remove();
}

// Trailer capture: the director (video/capture-game.cjs) steps the game frame by
// frame. SFX calls are logged against video time and rendered offline later;
// CSS animations are driven from video time so every frame is reproducible.
function setupCapture(game) {
  document.body.classList.add('capture');
  const log = (window.__audioEvents = []);
  window.__vt = 0;
  window.__logAudio = false;
  window.__AudioEngine = AudioEngine;
  const audio = game.audio;
  const music = new Set(['init', 'startMusic', 'stopMusic', 'setIntensity', 'setDuck', 'setMuted', 'toggleMute', 'setMasterVolume', 'renderOfflineWav', 'renderOfflineBuffer', 'setSettings', 'dispose']);
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(audio), name);
    if (name === 'constructor' || !desc || typeof desc.value !== 'function') continue;
    audio[name] = (...args) => {
      if (!music.has(name) && window.__logAudio) log.push({ t: window.__vt, name, args });
      return name === 'toggleMute' ? false : undefined;
    };
  }
  const born = new WeakMap();
  window.__syncAnimations = (vt) => {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) born.set(a, vt);
      a.pause();
      a.currentTime = Math.max(0, (vt - born.get(a)) * 1000);
    }
  };
}

boot().catch(()=>{document.getElementById('boot-status')?.remove();document.getElementById('ui').innerHTML='<div style="padding:12vh 8vw;pointer-events:auto"><h1>暂时无法入阵</h1><p>请确认浏览器支持 WebGL，或重新加载页面。</p><button onclick="location.reload()">重新加载</button></div>';});
