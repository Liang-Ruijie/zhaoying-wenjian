import * as THREE from 'three';
import {MobileMenus} from './mobile-menus.js';
import {characterAssetState} from './character-art.js';
import {seed} from './rng.js';
const IDLE={moveX:0,moveZ:0,aimX:0,aimZ:-1,aimDist:8,fire:false,dash:false};
export function setupMobile(game){
  if(!(navigator.maxTouchPoints>0&&matchMedia('(pointer: coarse)').matches))return null;
  return new MobileExperience(game);
}
class MobileExperience{
  constructor(game){
    this.game=game;this.phase=null;this.inputSamples=[];this.boundsV=new THREE.Vector3();this.camP=new THREE.Vector3();this.camL=new THREE.Vector3();
    document.body.classList.add('mobile');document.documentElement.classList.add('mobile');
    game.input.touch.game=game;game.input.touch.enable();game.world.mobile=true;game.world.setQuality(game.lowQuality?0:2);
    game.ui.$('.tc').textContent='左下摇杆移动 · 按住攻击自动瞄准 · 闪避穿过剑气';
    game.ui.$('.intro-steps li span').textContent='左下摇杆移动，右下按住攻击自动瞄准；在攻击按钮内滑动可指定方向。红色剑气要侧躲，点“闪避”可短暂穿过剑气。';
    const first=game.ui.$('.step p');first.textContent=first.textContent.replace('空格冲刺','点“闪避”');
    game.ui.$('.title-foot').append(game.ui.$('.title-wrap .pace-setting'));
    game.ui.$('.scr-pause .btn-col').insertAdjacentHTML('afterbegin','<button class="btn" data-act="mobile-help" type="button">操作说明</button>');
    game.ui.root.insertAdjacentHTML('beforeend',`<div class="mobile-ready" role="status"><span>正在准备人物与场景…</span><div hidden><button class="btn mobile-reload" type="button">重新加载</button><button class="btn mobile-fallback" type="button">简化人物继续</button></div></div><div class="mobile-you" aria-hidden="true">你</div><div class="mobile-aim-cue" aria-hidden="true">➤</div><div class="mobile-target" aria-hidden="true">⌖</div><div class="mobile-objective" role="status"></div><section class="screen scr-mobilehelp"><div class="pause-card sketchbox"><h2 class="marker">操作说明</h2><p>左下摇杆移动；手指可以拖出摇杆范围，松手停止。</p><p>按住右下“攻击”自动瞄准可见敌人；按钮内滑动可指定方向，松手或滑出按钮停攻。</p><p>右手松开攻击后点“闪避”，沿移动方向冲刺；停步时沿瞄准方向。冷却结束显示“可用”。</p><p>红色剑气是危险，向侧面移动避开，或用闪避短暂穿过。右上角暂停。</p><button class="btn filled" data-act="mobile-help-back" type="button">返回暂停</button></div></section>`);
    game.ui.screens.mobilehelp=game.ui.$('.scr-mobilehelp');
    this.panel=game.ui.$('.mobile-ready');this.readyText=this.panel.querySelector('span');this.readyActions=this.panel.querySelector('div');
    this.panel.querySelector('.mobile-reload').onclick=()=>location.reload();
    this.panel.querySelector('.mobile-fallback').onclick=()=>{game.simpleCharacter=true;this.setPhase('loading');this.warmFrames=0;this.readyText.textContent='正在准备简化人物…';this.readyActions.hidden=true;};
    const hint=game.ui.$('.rotate-hint');hint.setAttribute('role','status');hint.innerHTML='<b>请横屏入阵</b><span>关闭手机方向锁定，将手机横过来。</span><small>转屏或切后台后，点“继续”恢复。</small>';
    this.syncViewport=()=>{
      const v=globalThis.visualViewport,w=v?.width||innerWidth,h=v?.height||innerHeight,root=document.documentElement;
      root.style.setProperty('--view-w',w+'px');root.style.setProperty('--view-h',h+'px');root.style.setProperty('--view-x',(v?.offsetLeft||0)+'px');root.style.setProperty('--view-y',(v?.offsetTop||0)+'px');
      const portrait=innerHeight>innerWidth;document.body.classList.toggle('needs-landscape',portrait);
      if(portrait){game.input.clear();if(game.inGameplay()&&!game.paused)game.togglePause();}
      game.world.resize();if(this.phase)this.snap();
    };
    addEventListener('resize',this.syncViewport);globalThis.visualViewport?.addEventListener('resize',this.syncViewport);globalThis.visualViewport?.addEventListener('scroll',this.syncViewport);
    addEventListener('orientationchange',()=>{game.input.clear();if(game.inGameplay()&&!game.paused)game.togglePause();});
    addEventListener('pagehide',()=>{game.input.clear();if(game.inGameplay()&&!game.paused)game.togglePause();});
    this.resizeObserver=new ResizeObserver(()=>game.world.resize());this.resizeObserver.observe(game.app);this.setPhase(null);this.syncViewport();this.menus=new MobileMenus(game);
  }
  camera(pos,look){
    const p=this.game.player,h=this.game.app.clientHeight,height=Math.max(15,Math.min(23,h*.065));
    pos.set(p.x,height,p.z+height*.64);look.set(p.x,0,p.z);
  }
  snap(){this.camera(this.camP,this.camL);this.game.world.snapCamera(this.camP,this.camL);this.game.world.camera.updateMatrixWorld();}
  playerBounds(){
    const g=this.game,art=g.player.mesh.userData.art?.mesh,r=g.app.getBoundingClientRect(),v=this.boundsV;let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    g.world.camera.updateMatrixWorld();g.player.mesh.updateWorldMatrix(true,true);
    for(const x of [-1.375,1.375])for(const y of [-1.375,1.375]){
      if(art?.visible)v.set(x,y,0).applyMatrix4(art.matrixWorld);else v.set(g.player.x+x*.5,y+1.4,g.player.z);
      v.project(g.world.camera);const px=r.left+(v.x+1)*r.width/2,py=r.top+(1-v.y)*r.height/2;left=Math.min(left,px);right=Math.max(right,px);top=Math.min(top,py);bottom=Math.max(bottom,py);
    }
    return{left,right,top,bottom,width:right-left,height:bottom-top};
  }
  keepPlayerVisible(){
    const g=this.game;if(g.rig!=='play'||!['calibrate','combat'].includes(g.state)||g.ui.current)return;
    const b=this.playerBounds(),r=g.app.getBoundingClientRect();
    const intersects=el=>{const q=el.getBoundingClientRect();return q.width>0&&b.left<q.right+8&&b.right>q.left-8&&b.top-22<q.bottom+8&&b.bottom>q.top-8;};
    if(b.left<r.left+12||b.right>r.right-12||b.top-22<r.top+58||b.bottom>r.bottom-16||[g.input.touch.els.move,g.input.touch.els.aim,g.input.touch.root.querySelector('.dash-btn')].some(intersects))this.snap();
  }
  setPhase(phase){this.phase=phase;document.body.dataset.mobilePhase=phase||'';}
  beginRun(){
    const g=this.game;g.input.clear();g.autopilot=false;g.player.x=g.player.z=0;g.player.update(0,IDLE,g);g.player.mesh.userData.ring.material.opacity=.65;this.setPhase('loading');
    this.loadAt=performance.now();this.warmFrames=0;this.readyActions.hidden=true;this.readyText.textContent='正在准备人物与场景…';this.syncViewport();this.snap();
    g.audio.setScene('quiet');g.ui.el.banner.classList.remove('on');g.ui.bannerT=0;
  }
  tick(){this.game.player.update(0,IDLE,this.game);}
  afterFrame(render){
    if(!render)return;
    const g=this.game;if(!g.inGameplay()){if(this.phase)this.cancel();return;}
    const controls=g.input.touch;if(controls.inputSerial!==this.lastInputSerial&&controls.lastInputAt){this.lastInputSerial=controls.inputSerial;this.inputSamples.push(performance.now()-controls.lastInputAt);if(this.inputSamples.length>180)this.inputSamples.shift();}
    controls.feedback();
    if(this.phase==='loading'&&!g.paused&&!g.ui.current){
      const assets=g.simpleCharacter?'ready':characterAssetState();
      if(assets==='ready')this.warmFrames++;
      if(this.warmFrames>=2)this.startFormal();
      else if(assets==='failed'||assets!=='ready'&&performance.now()-this.loadAt>8000){this.setPhase('asset-error');this.readyActions.hidden=false;this.readyText.textContent='人物尚未就绪：重新加载或使用简化人物继续。';}
    }
    const b=this.playerBounds(),you=g.ui.$('.mobile-you');you.style.left=((b.left+b.right)/2)+'px';you.style.top=(b.top-4)+'px';you.hidden=!g.player.alive;
    const pad=g.input.pad,dir=g.project(g.player.x+pad.aimX*2.8,.4,g.player.z+pad.aimZ*2.8).clone(),base=g.project(g.player.x,.4,g.player.z).clone(),r=g.app.getBoundingClientRect();
    const cue=g.ui.$('.mobile-aim-cue');cue.style.left=(r.left+(dir.x+1)*r.width/2)+'px';cue.style.top=(r.top+(1-dir.y)*r.height/2)+'px';cue.style.transform=`translate(-50%,-50%) rotate(${Math.atan2(-(dir.y-base.y)*r.height,(dir.x-base.x)*r.width)}rad)`;cue.hidden=!controls.aim.on;
    const target=controls.target;g.ui.$('.mobile-target').hidden=!target;if(target)this.positionCue('.mobile-target',target.x,1,target.z);
    const objective=g.ui.$('.mobile-objective');const text=this.phase?'':g.state==='combat'?(g.trial?g.trial.progress().replace('AI试炼 · ',''):'击败镜剑'):'';if(objective.textContent!==text)objective.textContent=text;
  }
  positionCue(selector,x,y,z){const g=this.game,v=g.project(x,y,z),r=g.app.getBoundingClientRect(),el=g.ui.$(selector);el.style.left=(r.left+(v.x+1)*r.width/2)+'px';el.style.top=(r.top+(1-v.y)*r.height/2)+'px';}
  startFormal(){
    if(this.phase!=='loading'||this.warmFrames<2)return;
    const g=this.game;
    // Fresh touches made during loading stay owned. Their vectors are applied only
    // after readiness; lifecycle resets still require a new physical touchstart.
    g.input.clear({keepTouch:true});seed(g.runSeed);g.player.reset();g.player.x=g.player.z=0;g.player.update(0,IDLE,g);g.bullets.clear();g.particles.clear();g.rings.clear();g.swordStrokes.clear();g.pendingDashSample=null;g.decisionSample=null;g.sampleT=0;
    this.setPhase(null);this.snap();g.audioScene=null;g.syncAudioScene();
  }
  cancel(){this.setPhase(null);this.game.input.clear();}
  review(){this.game.input.clear();this.game.ui.show('mobilehelp');}
}
