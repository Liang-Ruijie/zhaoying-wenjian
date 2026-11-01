// Two independent pointer owners: left thumb movement, right thumb attack OR evade.
export class TouchControls {
  constructor(overlay,input){
    this.input=input;this.active=false;this.dashFlag=false;this.owners=new Map();this.physicalTouches=new Map();this.rearm=new Map();
    this.move={on:false,id:-1,x:0,y:0};this.aim={on:false,id:-1,x:0,y:0};
    this.root=document.createElement('div');this.root.className='touch-ui';
    this.root.innerHTML=`<div class="mobile-control-bar">
      <div class="move-control"><div class="move-stick" role="slider" aria-label="移动摇杆" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><span class="stick-arrows">↑<br>←　→<br>↓</span><span class="knob"></span></div></div>
      <button class="dash-btn" type="button" aria-label="闪避冲刺"><b>闪避</b><small>可用</small></button>
      <button class="attack-btn" type="button" aria-label="按住攻击，滑动瞄准"><span class="attack-direction">↑</span><b>攻击</b><small>按住连发</small></button>
    </div>`;
    overlay.append(this.root);
    this.els={move:this.root.querySelector('.move-stick'),aim:this.root.querySelector('.attack-btn')};
    // On touch screens, Touch.identifier is the authority. Pointer capture loss is
    // not a finger release, and cancelling the right thumb must not reset the left.
    const options={capture:true,passive:false};
    addEventListener('touchstart',e=>{
      this.reconcile(e.touches);
      if(!this.canTrack())return;
      let handled=false;
      for(const t of e.changedTouches){
        const role=this.roleFor(t.target);if(!role)continue;
        if(this.owners.has(t.identifier))this.end(t.identifier,true);
        handled=this.begin(t.identifier,role,t.clientX,t.clientY)||handled;
      }
      if(handled)e.preventDefault();
    },options);
    addEventListener('touchmove',e=>{
      const previous=this.physicalTouches;
      this.reconcile(e.touches);
      if(!this.canTrack()){this.reset();return;}
      let handled=false;
      // Read the whole active list: some WebViews coalesce changedTouches.
      for(const t of e.touches){
        if(!this.owners.has(t.identifier)&&!this.rearm.has(t.identifier)&&this.roleFor(t.target)==='move'){
          const last=previous.get(t.identifier);this.rearm.set(t.identifier,last?{x:last.x,y:last.y}:{x:t.clientX,y:t.clientY});
        }
        const pending=this.rearm.get(t.identifier);
        // After an explicit resume, a still-held left thumb may deliberately drag
        // again. A stationary old touch never silently restarts movement/attack.
        if(!this.owners.has(t.identifier)&&pending&&Math.hypot(t.clientX-pending.x,t.clientY-pending.y)>=8){this.rearm.delete(t.identifier);this.begin(t.identifier,'move',t.clientX,t.clientY);}
        const role=this.owners.get(t.identifier);if(role){this.drag(role,{pointerId:t.identifier,clientX:t.clientX,clientY:t.clientY});handled=true;}
      }
      if(handled)e.preventDefault();
    },options);
    for(const name of ['touchend','touchcancel'])addEventListener(name,e=>{
      for(const t of e.changedTouches){this.rearm.delete(t.identifier);this.end(t.identifier,name==='touchcancel');}
      this.reconcile(e.touches);
    },{capture:true,passive:true});
    // Mouse/pen fallback uses the global stream, not capture lifetime. Native touch
    // PointerEvents are deliberately ignored to avoid two competing owner maps.
    this.root.addEventListener('pointerdown',e=>{
      if(e.pointerType==='touch'||e.button!==0)return;
      const role=this.roleFor(e.target);if(role&&this.begin('p:'+e.pointerId,role,e.clientX,e.clientY))e.preventDefault();
    });
    addEventListener('pointermove',e=>{
      if(e.pointerType==='touch')return;
      const id='p:'+e.pointerId,role=this.owners.get(id);if(!role)return;
      if(!e.buttons){this.end(id);return;}
      this.drag(role,{pointerId:id,clientX:e.clientX,clientY:e.clientY});
    });
    addEventListener('pointerup',e=>{if(e.pointerType!=='touch')this.end('p:'+e.pointerId);});
    addEventListener('pointercancel',e=>{if(e.pointerType!=='touch')this.end('p:'+e.pointerId,true);});
    this.root.addEventListener('contextmenu',e=>e.preventDefault());
  }
  roleFor(target){
    const el=target?.closest?.('.move-stick,.attack-btn,.dash-btn');if(!el||!this.root.contains(el))return null;
    return el.classList.contains('move-stick')?'move':el.classList.contains('attack-btn')?'aim':'dash';
  }
  begin(id,role,x,y){
    if(!this.canTrack()||[...this.owners.values()].includes(role)||role==='dash'&&(this.game.player.dashCd>0||this.game.mobile?.phase))return false;
    this.game.audio.init();this.owners.set(id,role);
    this.rearm.delete(id);
    if(role==='dash'){this.dashFlag=true;this.markInput();return true;}
    const s=this[role],el=this.els[role],r=el.getBoundingClientRect();
    s.on=true;s.id=id;s.x=s.y=0;
    // Lock the anchor for this drag. Browser toolbar/viewport reflow must not move
    // the origin under a finger that is still held.
    s.ox=role==='move'?r.left+r.width/2:x;s.oy=role==='move'?r.top+r.height/2:y;
    if(role==='aim')this.target=null;
    el.classList.add('on');this.drag(role,{pointerId:id,clientX:x,clientY:y});return true;
  }
  reconcile(touches){
    const active=new Set(Array.from(touches,t=>t.identifier));
    this.physicalTouches=new Map(Array.from(touches,t=>[t.identifier,{x:t.clientX,y:t.clientY,target:t.target}]));
    for(const id of this.rearm.keys())if(!active.has(id))this.rearm.delete(id);
    for(const id of [...this.owners.keys()])if(typeof id==='number'&&!active.has(id))this.end(id,true);
  }

  enable(){this.active=true;document.body.classList.add('touch');}
  canTrack(){return !!this.game&&!this.game.paused&&!document.body.classList.contains('needs-landscape')&&!document.body.dataset.screen&&['calibrate','combat'].includes(this.game.state)&&(!this.game.mobile?.phase||this.game.mobile.phase==='loading');}
  canPlay(){return this.canTrack()&&!this.game.mobile?.phase;}
  drag(role,e){
    if(role==='dash')return;
    const s=this[role],r=role==='aim'?this.els[role].getBoundingClientRect():null;
    if(role==='aim'&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)){this.end(e.pointerId);return;}
    const ox=s.ox,oy=s.oy;
    let x=(e.clientX-ox)/38,y=(e.clientY-oy)/38,l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}
    // Small dead zone followed by a continuous ramp, never a snap to full speed.
    if(role==='move'){const gain=l<.10?0:Math.min(1,(l-.10)/.90)/(Math.min(1,l)||1);x*=gain;y*=gain;}
    s.x=x;s.y=y;
    this.markInput();
    if(role==='move'){this.els.move.querySelector('.knob').style.transform=`translate(${x*30}px,${y*30}px)`;this.els.move.setAttribute('aria-valuenow',Math.round(Math.hypot(x,y)*100));}
  }
  end(id,cancelled=false){
    const role=this.owners.get(id);if(!role)return;this.owners.delete(id);
    this.markInput();
    if(role!=='dash'){const s=this[role];s.on=false;s.id=-1;s.x=s.y=0;this.els[role].classList.remove('on');if(role==='move'){this.els.move.querySelector('.knob').style.transform='';this.els.move.setAttribute('aria-valuenow','0');}}
    if(role==='dash'&&cancelled)this.dashFlag=false;
    if(role==='aim'){this.input.pad.fire=false;this.target=null;}
    if(role==='move')this.input.pad.moveX=this.input.pad.moveZ=0;
  }
  reset(){
    this.rearm.clear();for(const [id,t]of this.physicalTouches)if(this.roleFor(t.target)==='move')this.rearm.set(id,{x:t.x,y:t.y});
    for(const id of [...this.owners.keys()])this.end(id,true);
    for(const role of ['move','aim']){const s=this[role];s.on=false;s.id=-1;s.x=s.y=0;this.els[role].classList.remove('on');}
    this.els.move.querySelector('.knob').style.transform='';this.els.move.setAttribute('aria-valuenow','0');this.dashFlag=false;this.target=null;this.manual=false;
  }
  markInput(){this.lastInputAt=performance.now();this.inputSerial=(this.inputSerial||0)+1;}
  worldVector(x,y,camera){
    const e=camera.matrixWorld.elements,rx=e[0],rz=e[2],dx=-e[4],dz=-e[6],rl=Math.hypot(rx,rz)||1,dl=Math.hypot(dx,dz)||1;
    return{x:x*rx/rl+y*dx/dl,z:x*rz/rl+y*dz/dl};
  }
  readAim(camera,origin){
    if(!this.aim.on)return null;
    if(Math.hypot(this.aim.x,this.aim.y)>.3){const v=this.worldVector(this.aim.x,this.aim.y,camera),l=Math.hypot(v.x,v.z)||1;this.manual=true;this.target=null;return{x:v.x/l,z:v.z/l,distance:8};}
    this.manual=false;
    let best=null,dist=Infinity;const valid=[];
    for(const a of [...this.game.echoes,...this.game.drones]){
      if(!a.alive||a.active===false)continue;
      const v=this.game.project(a.x,1,a.z);if(v.z<-1||v.z>1||Math.abs(v.x)>.95||Math.abs(v.y)>.95)continue;
      const d=Math.hypot(a.x-origin.x,a.z-origin.z);valid.push(a);if(d<dist){best=a;dist=d;}
    }
    const old=this.target;
    if(old&&valid.includes(old)&&Math.hypot(old.x-origin.x,old.z-origin.z)<dist*1.35)best=old;
    this.target=best;if(!best)return null;
    const x=best.x-origin.x,z=best.z-origin.z,d=Math.hypot(x,z)||1;return{x:x/d,z:z/d,distance:d};
  }
  consumeDash(){const d=this.dashFlag;this.dashFlag=false;return d;}
  feedback(){
    const cd=Math.max(0,this.game.player.dashCd),el=this.root.querySelector('.dash-btn');
    const text=cd>0?`${cd.toFixed(1)}秒`:'可用';if(el.lastElementChild.textContent!==text)el.lastElementChild.textContent=text;
    el.setAttribute('aria-disabled',cd>0||!this.canPlay()?'true':'false');el.classList.toggle('cooling',cd>0);
    const a=this.els.aim.querySelector('.attack-direction');a.style.transform=`rotate(${Math.atan2(this.input.pad.aimX,-this.input.pad.aimZ)}rad)`;
  }
}
