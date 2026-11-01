import {dashProbability,shootProbability} from './policy-heads.js';
// Actors: the player, Echo clones (driven by a trained network), drones, bullets.
// Everything lives on the XZ plane; meshes are dark "ink" bodies with cream
// outlines and neon accents that feed the bloom pass.

import * as THREE from 'three';
import {mistTexture,runeTexture} from './ink-art.js';
import {attachCharacterArt,poseCharacterArt,disposeCharacterArt} from './character-art.js';
import { ARENA_R, PLAYER, ECHO, BIT, BYTE, LEECH, MIRROR, WARDEN, C, SAMPLE_HZ, echoColor } from './config.js';
import { rand, range, gauss, chance } from './rng.js';
import { Frame, extractFeatures, decide, newDecision, classDir, expectedLocalDir, DIM } from './brain.js';

const INK = new THREE.Color(0x253238);
const neon = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(Math.min(1.15, k));

// ---------------------------------------------------------------------------
// Shared geometry / materials

function swordGeometry(){
 const shape=new THREE.Shape();shape.moveTo(0,.61);
 for(const [x,y]of [[.075,.29],[.055,-.26],[.17,-.30],[.17,-.35],[.035,-.35],[.035,-.51],[-.035,-.51],[-.035,-.35],[-.17,-.35],[-.17,-.30],[-.055,-.26],[-.075,.29]])shape.lineTo(x,y);
 shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:.035,bevelEnabled:false}).translate(0,0,-.0175);
}
let G = null;
function shared() {
  if (G) return G;
  const grad = new THREE.DataTexture(new Uint8Array([70, 140, 255]), 3, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  G = {
    grad,
    body: new THREE.CylinderGeometry(0.20, 0.48, 0.95, 8),
    head: new THREE.SphereGeometry(0.24, 10, 8),
    belt: new THREE.CylinderGeometry(.27,.32,.14,8),
    hair: new THREE.SphereGeometry(.26,10,8),
    bun: new THREE.SphereGeometry(.12,8,6),
    tail: new THREE.ConeGeometry(.18,.78,6),
    sleeve: new THREE.CylinderGeometry(.14,.23,.65,6),
    guard: new THREE.BoxGeometry(.32,.07,.09),
    visor: new THREE.BoxGeometry(0.42, 0.1, 0.12),
    gun: swordGeometry().rotateX(Math.PI/2),
    charm: new THREE.PlaneGeometry(.50,.9),
    droneHalo: new THREE.PlaneGeometry(1.8,1.8).rotateX(-Math.PI/2),
    wing: new THREE.PlaneGeometry(.35,.65).rotateZ(.45),
    smallCore: new THREE.SphereGeometry(.12,8,6),
    footRing: new THREE.PlaneGeometry(1.5,1.5),
    shadow: new THREE.PlaneGeometry(1.7,1.7),
    tetra: new THREE.TetrahedronGeometry(0.62, 0),
    octa: new THREE.OctahedronGeometry(0.8, 0),
    core: new THREE.IcosahedronGeometry(0.22, 1),
    bulletP: swordGeometry().scale(.8,.88,1),
    bulletE: new THREE.ConeGeometry(0.16, 0.65, 4),
    leech: new THREE.ConeGeometry(0.3, 0.85, 4).rotateX(Math.PI / 2),
    mirror: new THREE.IcosahedronGeometry(0.62, 0),
    warden: new THREE.DodecahedronGeometry(1.0, 0),
    wardenRing: new THREE.PlaneGeometry(WARDEN.shieldR*2.5,WARDEN.shieldR*2.5),
    bodyMat: new THREE.MeshToonMaterial({ color: 0xece4d2, gradientMap: grad }),
    outlineMat: new THREE.MeshBasicMaterial({ color: 0x253238, side: THREE.BackSide }),
    shadowMat: new THREE.MeshBasicMaterial({ color: 0x253238, map:mistTexture('wash'), transparent: true, opacity: 0.23, depthWrite: false }),
  };
  G.bulletP.rotateX(Math.PI / 2);
  G.bulletE.rotateX(Math.PI / 2);
  return G;
}

function outlined(geo, mat, outlineMat, s = 1.12) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  const o = new THREE.Mesh(geo, outlineMat);
  o.scale.setScalar(s);
  g.add(o);
  return g;
}

// Original procedural character study: robe, hair bun, sleeves and an independent flying sword.
// Visual dress and sword never change the actor collider.
function buildPilot(accent, hologram) {
  const S=shared();const root=new THREE.Group();
  const shadow=new THREE.Mesh(S.shadow,S.shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.y=.03;shadow.scale.setScalar(.9);root.add(shadow);
  const tilt=new THREE.Group();root.add(tilt);
  const accentMat=new THREE.MeshBasicMaterial({color:accent});
  const bodyMat=new THREE.MeshToonMaterial({color:hologram?accent:0xece4d2,gradientMap:S.grad});
  const outlineMat=new THREE.MeshBasicMaterial({color:0x253238,side:THREE.BackSide});
  const figure=new THREE.Group();tilt.add(figure);
  const robe=outlined(S.body,bodyMat,outlineMat,1.07);robe.position.y=.78;figure.add(robe);
  const belt=new THREE.Mesh(S.belt,accentMat);belt.position.y=.94;figure.add(belt);
  const face=new THREE.Mesh(S.head,new THREE.MeshToonMaterial({color:hologram?0xd2b4a5:0xe7cbb4,gradientMap:S.grad}));face.position.y=1.48;figure.add(face);
  const hairMat=new THREE.MeshBasicMaterial({color:0x253238});
  const hair=new THREE.Mesh(S.hair,hairMat);hair.scale.set(1,.65,1);hair.position.set(0,1.62,-.04);figure.add(hair);
  const bun=new THREE.Mesh(S.bun,hairMat);bun.position.set(0,1.81,-.03);figure.add(bun);
  const tail=new THREE.Mesh(S.tail,hairMat);tail.position.set(0,1.1,-.26);tail.rotation.x=-.13;figure.add(tail);
  const sleeves=[];
  for(const sign of [-1,1]){const sleeve=new THREE.Mesh(S.sleeve,bodyMat);sleeve.position.set(sign*.34,1.04,.01);sleeve.rotation.z=sign*.45;figure.add(sleeve);sleeves.push(sleeve);}
  const footMat=new THREE.MeshBasicMaterial({color:accent,map:mistTexture('wash'),transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide});
  const ring=new THREE.Mesh(S.footRing,footMat);ring.rotation.x=Math.PI/2;ring.position.y=.045;root.add(ring);
  const turret=new THREE.Group();turret.position.y=.85;tilt.add(turret);
  const sword=outlined(S.gun,new THREE.MeshBasicMaterial({color:hologram?0xd6b6a6:0xa5beb5}),outlineMat,1.12);sword.position.set(.58,.25,.54);turret.add(sword);
  const guard=new THREE.Mesh(S.guard,accentMat);guard.position.set(.58,.25,.06);turret.add(guard);
  root.userData={tilt,turret,ring,accentMat,bodyMat,outlineMat,shadow,figure,sleeves,tail,phase:0,materials:new Set([footMat,accentMat,bodyMat,outlineMat,face.material,hairMat,sword.children[0].material])};
  attachCharacterArt(root,accent,hologram);
  return root;
}

function clampToArena(a, r) {
  const d = Math.hypot(a.x, a.z);
  const max = ARENA_R - r;
  if (d > max) {
    const nx = a.x / d;
    const nz = a.z / d;
    a.x = nx * max;
    a.z = nz * max;
    const vn = a.vx * nx + a.vz * nz;
    if (vn > 0) {
      a.vx -= vn * nx;
      a.vz -= vn * nz;
    }
    return true;
  }
  return false;
}

function steer(a, tx, tz, speed, sharp, dt) {
  const k = 1 - Math.exp(-sharp * dt);
  a.vx += (tx * speed - a.vx) * k;
  a.vz += (tz * speed - a.vz) * k;
}

function poseMesh(a, dt, bob = 0) {
  const m = a.mesh;
  const u = m.userData;
  m.position.set(a.x, bob, a.z);
  u.turret.rotation.y = Math.atan2(a.aimX, a.aimZ);
  // Lean into the movement a little.
  const lx = THREE.MathUtils.clamp(a.vx / 30, -0.25, 0.25);
  const lz = THREE.MathUtils.clamp(a.vz / 30, -0.25, 0.25);
  u.tilt.rotation.z += (-lx - u.tilt.rotation.z) * Math.min(1, dt * 10);
  u.tilt.rotation.x += (lz - u.tilt.rotation.x) * Math.min(1, dt * 10);
  u.phase += dt * Math.hypot(a.vx,a.vz)*1.8;
  const moving=Math.hypot(a.vx,a.vz)>.3;
  if(moving)u.figure.rotation.y=Math.atan2(a.vx,a.vz);
  u.sleeves.forEach((s,i)=>s.rotation.x=moving?Math.sin(u.phase+i*Math.PI)*.22:0);
  u.tail.rotation.x=-.13+(moving?Math.sin(u.phase)*.1:0);
  u.turret.position.y=.85+Math.sin(u.phase*.5)*.04;
}

// ---------------------------------------------------------------------------

export class Player {
  constructor(scene) {
    this.mesh = buildPilot(C.electric, false);
    scene.add(this.mesh);
    this.radius = PLAYER.radius;
    this.reset();
  }

  reset() {
    this.x = 0;
    this.z = 7;
    this.vx = this.vz = 0;
    this.aimX = 0;
    this.aimZ = -1;
    this.hp = PLAYER.hp;
    this.alive = true;
    this.artEvent=null;this.artDashAt=null;this.lastImpact=null;
    this.fireCd = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.dashX = 0;
    this.dashZ = 0;
    this.invuln = 0;
    this.moveX = this.moveZ = 0; // current input (unit or 0)
    this.prevMoveX = this.prevMoveZ = 0; // input at the previous sample tick
    this.dashedSinceSample = false;
    this.firing = false;
    this.shots = 0;
    this.hits = 0;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    for(const t of this.mesh.userData.art?.trails||[]){t.age=1;t.mesh.visible=false;}
  }

  update(dt, pad, game) {
    if (!this.alive) return;
    this.dashCd -= dt;
    this.invuln -= dt;
    this.fireCd -= dt;

    let mx = pad.moveX;
    let mz = pad.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-3) {
      this.moveX = mx / Math.max(1, ml);
      this.moveZ = mz / Math.max(1, ml);
    } else {
      this.moveX = this.moveZ = 0;
    }
    this.aimX = pad.aimX;
    this.aimZ = pad.aimZ;

    if (pad.dash && this.dashCd <= 0) {
      let dx = this.moveX;
      let dz = this.moveZ;
      if (Math.hypot(dx, dz) < 0.2) {
        dx = this.aimX;
        dz = this.aimZ;
      }
      const l = Math.hypot(dx, dz) || 1;
      this.dashX = dx / l;
      this.dashZ = dz / l;
      this.dashT = PLAYER.dashTime;
      this.dashCd = PLAYER.dashCooldown;
      this.invuln = Math.max(this.invuln, PLAYER.dashTime + 0.1);
      this.dashedSinceSample = true;
      game.onDash(this, C.electric,pad.fire);
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashX * PLAYER.dashSpeed;
      this.vz = this.dashZ * PLAYER.dashSpeed;
    } else {
      steer(this, this.moveX, this.moveZ, PLAYER.speed, PLAYER.friction, dt);
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    clampToArena(this, this.radius);

    this.firing = pad.fire;
    if (pad.fire && this.fireCd <= 0) {
      this.fireCd = 1 / PLAYER.fireRate;
      const spread = (rand() - 0.5) * 0.04;
      const ax = this.aimX * Math.cos(spread) - this.aimZ * Math.sin(spread);
      const az = this.aimX * Math.sin(spread) + this.aimZ * Math.cos(spread);
      game.bullets.spawn('player', this.x + ax * 0.9, this.z + az * 0.9, ax, az, PLAYER.bulletSpeed, PLAYER.bulletLife, C.electric, 1, 0);
      this.shots++;
      game.audio.shoot();
      game.onSwordRelease(this,C.electric);
    }

    poseMesh(this, dt);
    poseCharacterArt(this,game);
    // Blink while invulnerable after a hit.
    const blink = !game.world.reducedMotion && this.invuln > 0 && this.dashT <= 0 && Math.floor(this.invuln * 16) % 2 === 0;
    this.mesh.userData.tilt.visible = !blink;
  }
}

// ---------------------------------------------------------------------------
// The Echo: a clone whose every decision comes from a network trained on you.

const tmpL = { x: 0, z: 0 };
const tmpW = { x: 0, z: 0 };

export class Echo {
  constructor(scene, model, x, z) {
    this.model = model;
    this.net = model.net;
    this.gen = model.gen;
    this.color = echoColor(this.gen);
    this.mesh = buildPilot(this.color, true);
    this.mesh.scale.setScalar(0.001);
    scene.add(this.mesh);
    this.radius = ECHO.radius;
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.aimX = 0;
    this.aimZ = 1;
    const m = model.personality?.mods || {};
    this.speed = ECHO.speed * (m.speed ?? 1);
    this.fireRate = ECHO.fireRate * (m.fireRate ?? 1);
    this.dashCooldown = ECHO.dashCooldown * (m.dashCooldown ?? 1);
    this.dashProb = m.dashProb ?? 1;
    this.aimNoise = ECHO.aimNoise * (m.aimNoise ?? 1);
    this.bulletSpeed = ECHO.bulletSpeed * (m.bulletSpeed ?? 1);
    this.temperature = m.temperature ?? ECHO.temperature;
    this.maxHp = Math.round((model.hp ?? ECHO.baseHp + (this.gen - 1) * ECHO.hpPerGen) * (m.hp ?? 1));
    this.hp = this.maxHp;
    this.alive = true;
    this.spawnT = 0;
    this.thinkT = rand() / SAMPLE_HZ;
    this.features = new Float32Array(DIM);
    this.frame = new Frame();
    this.decision = newDecision();
    this.wantX = this.wantZ = 0;
    this.prevX = this.prevZ = 0;
    this.shootIntent = false;
    this.fireCd = 0.6 + rand() * 0.6;
    this.dashT = 0;
    this.dashCd = 0.8;
    this.dashX = this.dashZ = 0;
    this.flash = 0;
    this.glitchT = 0;
    this.name = model.label || `ECHO-${String(this.gen).padStart(2, '0')}`;
    this.title = model.rule ? '规则对手' : `第 ${this.gen} 代镜剑`;
  }

  get active() {
    return this.alive && this.spawnT >= 1;
  }

  get dodging() {
    return this.dashT > 0;
  }

  think(game) {
    const p = game.player;
    extractFeatures(this.features, this.frame, this, p, game.bullets.playerBullets, this.prevX, this.prevZ, this.dashCd <= 0, this.hp / this.maxHp);
    const d = decide(this.net, this.features, this.temperature, rand, this.decision);
    if (d.move === 0) {
      this.wantX = this.wantZ = 0;
    } else {
      const [lx, lz] = classDir(d.move);
      this.frame.toWorld(lx, lz, tmpW);
      this.wantX = tmpW.x;
      this.wantZ = tmpW.z;
    }
    this.prevX = this.wantX;
    this.prevZ = this.wantZ;

    if (this.dashCd <= 0 && rand() < dashProbability(d.dashP,this.dashProb)) {
      let dx = this.wantX;
      let dz = this.wantZ;
      if (Math.hypot(dx, dz) < 0.2) {
        dx = this.frame.rx;
        dz = this.frame.rz;
      }
      this.dashX = dx;
      this.dashZ = dz;
      this.dashT = ECHO.dashTime;
      this.dashCd = this.dashCooldown;
      game.onDash(this, this.color);
    }
    this.shootIntent = rand() < shootProbability(d.shootP);
  }

  update(dt, game) {
    if (!this.alive) return;
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt / 0.9);
      const s = this.spawnT;
      this.mesh.scale.set(s * (1 + (game.world.reducedMotion ? 0 : Math.sin(s * 40) * 0.15 * (1 - s))), s, s);
      this.mesh.position.set(this.x, (1 - s) * 2.5, this.z);
      poseCharacterArt(this,game);
      return;
    }
    this.dashCd -= dt;
    this.fireCd -= dt;
    this.thinkT -= dt;
    while (this.thinkT <= 0) {
      this.think(game);
      this.thinkT += 1 / SAMPLE_HZ;
    }

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashX * ECHO.dashSpeed;
      this.vz = this.dashZ * ECHO.dashSpeed;
    } else {
      steer(this, this.wantX, this.wantZ, this.speed * game.enemyPace().move, ECHO.friction, dt);
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    clampToArena(this, this.radius);

    // Aim where the model thinks you are going to be.
    const p = game.player;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    const lead = dist / this.bulletSpeed;
    const conf = game.prediction.confidence;
    const tx = p.x + game.prediction.vx * lead * conf;
    const tz = p.z + game.prediction.vz * lead * conf;
    let ax = tx - this.x;
    let az = tz - this.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    this.aimX += (ax - this.aimX) * Math.min(1, dt * 12);
    this.aimZ += (az - this.aimZ) * Math.min(1, dt * 12);
    const nl = Math.hypot(this.aimX, this.aimZ) || 1;
    this.aimX /= nl;
    this.aimZ /= nl;

    if (this.shootIntent && this.fireCd <= 0 && p.alive) {
      this.fireCd = 1 / this.fireRate;
      const n = gauss() * (this.aimNoise + game.aimError);
      const bx = this.aimX * Math.cos(n) - this.aimZ * Math.sin(n);
      const bz = this.aimX * Math.sin(n) + this.aimZ * Math.cos(n);
      game.bullets.spawn('enemy', this.x + bx * 0.9, this.z + bz * 0.9, bx, bz, this.bulletSpeed, ECHO.bulletLife, this.color, 1, this.gen, 'echo');
      game.audio.echoShoot();
      game.onSwordRelease(this,this.color);
    }

    poseMesh(this, dt, 0);
    poseCharacterArt(this,game);
    // Holographic glitch: occasional horizontal slips + hit flash.
    this.glitchT -= dt;
    const u = this.mesh.userData;
    if (this.glitchT <= 0) {
      this.glitchT = 1;
      u.tilt.position.x = 0;
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    u.bodyMat.color.set(this.color).multiplyScalar(0.8 + this.flash * 0.2);
    this.mesh.scale.setScalar(1);
  }

  hurt(dmg) {
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) this.alive = false;
  }

  // Holographic materials are per-Echo (they flash on hit); free them on removal.
  dispose() {
    const u = this.mesh.userData;
    disposeCharacterArt(this.mesh);
    for (const m of u.materials || [u.accentMat, u.bodyMat, u.outlineMat]) m?.dispose();
  }
}

// ---------------------------------------------------------------------------
export class RuleOpponent extends Echo {
  constructor(scene,x,z){super(scene,{gen:1,label:'规则对手',rule:true,hp:26,net:null},x,z);}
  think(game){
    const dx=game.player.x-this.x,dz=game.player.z-this.z,d=Math.hypot(dx,dz)||1;
    const approach=d>10? .6:d<6?-.6:0;
    this.wantX=dx/d*approach-dz/d*.7;this.wantZ=dz/d*approach+dx/d*.7;
    this.shootIntent=true;this.prevX=this.wantX;this.prevZ=this.wantZ;
  }
}

// Drones: Bits rush you, Bytes keep their distance and lob slow bolts.

// Drones are spawned constantly, so their geometry and materials are cached
// (one set per shape/colour) instead of allocated per drone.
const droneCache = new Map();
function droneParts(geo, color, coreBoost) {
  const key = `${geo.uuid}:${color}:${coreBoost}`;
  if (!droneCache.has(key)) {
    droneCache.set(key, {
      fill: new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(.75) }),
      core: new THREE.MeshBasicMaterial({ color: neon(color, 1), toneMapped: false }),
      paper:new THREE.MeshBasicMaterial({map:runeTexture(geo===shared().tetra?'敕':geo===shared().octa?'雷':'镇'),transparent:true,alphaTest:.15,side:THREE.DoubleSide}),
      halo:new THREE.MeshBasicMaterial({map:mistTexture('wash'),color,transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide}),
    });
  }
  return droneCache.get(key);
}

// Each enemy has a xianxia silhouette; physics and original roles stay separate.
function droneMesh(geo, color, coreBoost = 1) {
  const S=shared(),P=droneParts(geo,color,coreBoost);
  const root=new THREE.Group(),g=new THREE.Group();root.add(g);
  const core=new THREE.Mesh(S.smallCore,P.core);g.add(core);
  const fill=new THREE.Mesh(S.charm,P.fill);fill.visible=false;g.add(fill);
  const make=(geometry,material,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);g.add(m);return m;};
  if(geo===S.tetra){ // 追身符刃：立起的飞剑，剑尖朝向行进方向。
    const blade=make(S.gun,P.core,0,0,.16);blade.scale.set(1.6,1.6,1.2);
    make(S.guard,P.core,0,0,-.25);const ribbon=make(S.charm,P.paper,0,.06,-.48);ribbon.rotation.x=-Math.PI/2;ribbon.scale.set(.5,.55,1);
  }else if(geo===S.octa){ // 远程悬符：菱形主符与四枚护符。
    const plate=make(S.charm,P.paper);plate.rotation.x=-Math.PI/2;plate.rotation.z=Math.PI/4;plate.scale.set(1.5,1.5,1);const halo=make(S.droneHalo,P.halo);halo.position.y=.08;
    for(let i=0;i<4;i++){const a=i*Math.PI/2,c=make(S.charm,P.paper,Math.cos(a)*.72,.05,Math.sin(a)*.72);c.rotation.x=-Math.PI/2;c.rotation.z=a;c.scale.set(.35,.55,1);}
  }else if(geo===S.leech){ // 噬墨蛾：翅形轮廓，不再是霓虹箭头。
    for(const sign of [-1,1]){const wing=make(S.wing,P.fill,sign*.22,0,0);wing.rotation.x=-Math.PI/2;wing.rotation.z=sign*.6;}
    const body=make(S.gun,P.core);body.scale.set(.7,.6,.5);
  }else if(geo===S.mirror){ // 镜步残影与学习分身不同，使用空心墨衣。
    const robe=make(S.body,P.fill,0,.32,0);robe.scale.set(.9,1.1,.9);
    make(S.head,P.core,0,1.05,0);const halo=make(S.droneHalo,P.halo,0,-.35,0);halo.scale.set(.7,.7,.7);
  }else{ // 镇阵剑印：悬剑与三方小剑，护阵仍由Warden实体管理。
    const seal=make(S.charm,P.paper,0,.6,-.12);seal.scale.set(1.5,1.8,1);
    const blade=make(S.gun,P.fill,0,.45,0);blade.rotation.x=Math.PI/2;blade.scale.set(2.7,2.7,2.7);
    make(S.guard,P.core,0,1.15,0).scale.setScalar(2.2);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,m=make(S.gun,P.core,Math.cos(a)*.95,.1,Math.sin(a)*.95);m.rotation.y=-a;m.scale.setScalar(.85);}
  }
  const shadow=new THREE.Mesh(S.shadow,S.shadowMat);shadow.rotation.x=-Math.PI/2;shadow.position.y=.03;shadow.scale.setScalar(.75);root.add(shadow);
  root.userData={spin:g,core,fill,visualKind:geo===S.tetra?'talisman-blade':geo===S.octa?'thunder-charm':geo===S.leech?'ink-moth':geo===S.mirror?'paper-afterimage':'ward-sword'};return root;
}

export class Bit {
  constructor(scene, x, z) {
    this.kind = 'bit';
    this.mesh = droneMesh(shared().tetra, C.orange);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.radius = BIT.radius;
    this.hp = BIT.hp;
    this.alive = true;
    this.spawnT = 0;
    this.speed = BIT.speed * range(0.9, 1.12);
    this.wobble = rand() * 10;
    this.score = BIT.score;
    this.color = C.orange;
  }
  get active() {
    return this.alive && this.spawnT >= 1;
  }
  update(dt, game) {
    this.spawnT = Math.min(1, this.spawnT + dt / (this.spawnSeconds || .7));
    const u = this.mesh.userData;
    if (this.spawnT < 1) {
      this.mesh.position.set(this.x, 3 * (1 - this.spawnT), this.z);
      this.mesh.scale.setScalar(this.spawnT);
      return;
    }
    const p = game.player;
    let dx = p.x - this.x;
    let dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    // Weave a little so they don't arrive in a perfect line.
    this.wobble += dt * 3;
    const w = Math.sin(this.wobble) * 0.45;
    let tx = dx - dz * w;
    let tz = dz + dx * w;
    // Separation from other drones.
    for (const o of game.drones) {
      if (o === this || !o.alive) continue;
      const ox = this.x - o.x;
      const oz = this.z - o.z;
      const od = Math.hypot(ox, oz);
      if (od < 1.6 && od > 0.01) {
        tx += (ox / od) * (1.6 - od);
        tz += (oz / od) * (1.6 - od);
      }
    }
    const tl = Math.hypot(tx, tz) || 1;
    steer(this, tx / tl, tz / tl, this.speed * game.enemyPace().move, 4, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    clampToArena(this, this.radius);
    this.mesh.position.set(this.x, 0.55 + Math.sin(this.wobble * 2) * 0.08, this.z);
    this.mesh.scale.setScalar(1);
    u.spin.rotation.y = Math.atan2(this.vx,this.vz);
    u.spin.rotation.x = -.12;
  }
  hurt(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) this.alive = false;
  }
}

export class Byte {
  constructor(scene, x, z) {
    this.kind = 'byte';
    this.mesh = droneMesh(shared().octa, C.sun, 1.7);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.radius = BYTE.radius;
    this.hp = BYTE.hp;
    this.alive = true;
    this.spawnT = 0;
    this.fireT = range(1.2, BYTE.fireEvery);
    this.orbit = chance(0.5) ? 1 : -1;
    this.score = BYTE.score;
    this.color = C.sun;
    this.flash = 0;
  }
  get active() {
    return this.alive && this.spawnT >= 1;
  }
  update(dt, game) {
    this.spawnT = Math.min(1, this.spawnT + dt / (this.spawnSeconds || .8));
    const u = this.mesh.userData;
    if (this.spawnT < 1) {
      this.mesh.position.set(this.x, 3 * (1 - this.spawnT), this.z);
      this.mesh.scale.setScalar(this.spawnT);
      return;
    }
    const p = game.player;
    let dx = p.x - this.x;
    let dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const radial = d > BYTE.keepAway + 2 ? 1 : d < BYTE.keepAway - 2 ? -1 : 0;
    const tx = dx * radial - dz * this.orbit * 0.7;
    const tz = dz * radial + dx * this.orbit * 0.7;
    const tl = Math.hypot(tx, tz) || 1;
    steer(this, tx / tl, tz / tl, BYTE.speed * game.enemyPace().move, 3, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (clampToArena(this, this.radius)) this.orbit *= -1;

    this.fireT -= dt;
    const charging = this.fireT < 0.55;
    if (this.fireT <= 0 && p.alive) {
      this.fireT = BYTE.fireEvery * range(0.85, 1.15);
      game.bullets.spawn('enemy', this.x + dx, this.z + dz, dx, dz, BYTE.bulletSpeed, 3, C.sun, 1, 0);
      game.audio.enemyShoot();
    }
    this.flash = Math.max(0, this.flash - dt * 6);
    u.core.scale.setScalar(charging ? 0.6 + (0.55 - this.fireT) * 1.6 : 0.6);
    this.mesh.position.set(this.x, 0.75, this.z);
    this.mesh.scale.setScalar(1);
    u.spin.rotation.y += dt * 1.4;
  }
  hurt(dmg) {
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) this.alive = false;
  }
}

// ---------------------------------------------------------------------------
// The cast. Leeches swarm and drain score; Mirrors replay your own path two
// seconds late; Wardens are shielded bosses you open up by dashing through
// their ring.

export class Leech {
  constructor(scene, x, z) {
    this.kind = 'leech';
    this.mesh = droneMesh(shared().leech, C.pink, 2.4);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.radius = LEECH.radius;
    this.hp = LEECH.hp;
    this.alive = true;
    this.spawnT = 0;
    this.speed = LEECH.speed * range(0.88, 1.12);
    this.phase = rand() * 10;
    this.score = LEECH.score;
    this.color = C.pink;
  }
  get active() {
    return this.alive && this.spawnT >= 1;
  }
  update(dt, game) {
    this.spawnT = Math.min(1, this.spawnT + dt / (this.spawnSeconds || .5));
    if (this.spawnT < 1) {
      this.mesh.position.set(this.x, 2 * (1 - this.spawnT), this.z);
      this.mesh.scale.setScalar(this.spawnT);
      return;
    }
    const p = game.player;
    let dx = p.x - this.x;
    let dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    this.phase += dt * 9;
    const w = Math.sin(this.phase) * 0.6;
    steer(this, dx - dz * w, dz + dx * w, this.speed * game.enemyPace().move, 6, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    clampToArena(this, this.radius);
    this.mesh.position.set(this.x, 0.4, this.z);
    this.mesh.scale.setScalar(1);
    this.mesh.userData.spin.rotation.set(0, Math.atan2(this.vx, this.vz), 0);
  }
  hurt(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) this.alive = false;
  }
}

export class Mirror {
  constructor(scene, x, z) {
    this.kind = 'mirror';
    this.mesh = droneMesh(shared().mirror, C.violet, 2.4);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.radius = MIRROR.radius;
    this.hp = MIRROR.hp;
    this.alive = true;
    this.spawnT = 0;
    this.score = MIRROR.score;
    this.color = C.violet;
    this.fireT = range(1, MIRROR.fireEvery);
    this.pop = 0;
  }
  get active() {
    return this.alive && this.spawnT >= 1;
  }
  update(dt, game) {
    this.spawnT = Math.min(1, this.spawnT + dt / (this.spawnSeconds || .8));
    const u = this.mesh.userData;
    if (this.spawnT < 1) {
      this.mesh.position.set(this.x, 2.5 * (1 - this.spawnT), this.z);
      this.mesh.scale.setScalar(this.spawnT);
      return;
    }
    // Walk exactly where you were MIRROR.delay seconds ago.
    const p = game.player;
    const past = game.trailAt(MIRROR.delay) || p;
    const dx = past.x - this.x;
    const dz = past.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.01) steer(this, dx / d, dz / d, Math.min(MIRROR.maxSpeed, d * 4), 10, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    clampToArena(this, this.radius);

    // Fire where the model says you're headed.
    this.fireT -= dt;
    if (this.fireT <= 0 && p.alive) {
      this.fireT = MIRROR.fireEvery * range(0.85, 1.15);
      const pr = game.prediction;
      const lead = Math.hypot(p.x - this.x, p.z - this.z) / MIRROR.bulletSpeed;
      const vx = pr.confidence ? pr.vx : p.vx;
      const vz = pr.confidence ? pr.vz : p.vz;
      const ax = p.x + vx * lead - this.x;
      const az = p.z + vz * lead - this.z;
      const al = Math.hypot(ax, az) || 1;
      game.bullets.spawn('enemy', this.x + (ax / al) * 0.8, this.z + (az / al) * 0.8, ax / al, az / al, MIRROR.bulletSpeed, 2.2, C.violet, 1, 0, 'mirror');
      game.audio.mirrorShoot();
      this.pop = 1;
    }
    this.pop = Math.max(0, this.pop - dt * 5);
    this.mesh.position.set(this.x, 0.7, this.z);
    this.mesh.scale.setScalar(1 + this.pop * 0.25);
    u.spin.rotation.y += dt * 1.8;
    u.spin.rotation.z += dt * 0.9;
  }
  hurt(dmg) {
    this.hp -= dmg;
    this.pop = 1;
    if (this.hp <= 0) this.alive = false;
  }
}

export class Warden {
  constructor(scene, x, z) {
    this.kind = 'warden';
    this.mesh = droneMesh(shared().warden, C.acid, 2.0);
    scene.add(this.mesh);
    this.ringMat = new THREE.MeshBasicMaterial({ color: C.acid,map:mistTexture('ward'),side:THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    this.ring = new THREE.Mesh(shared().wardenRing, this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = -0.65;
    this.ring.name='warden-mist-ward';this.ring.userData.colliderRadius=WARDEN.shieldR;
    this.mesh.add(this.ring);
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.radius = WARDEN.radius;
    this.hp = WARDEN.hp;
    this.alive = true;
    this.spawnT = 0;
    this.score = WARDEN.score;
    this.color = C.acid;
    this.openT = 0;
    this.wasInside = false;
    this.volleyT = 2;
    this.t = 0;
  }
  get active() {
    return this.alive && this.spawnT >= 1;
  }
  get shielded() {
    return this.openT <= 0;
  }
  update(dt, game) {
    this.t += dt;
    this.spawnT = Math.min(1, this.spawnT + dt / (this.spawnSeconds || 1.0));
    const u = this.mesh.userData;
    if (this.spawnT < 1) {
      this.mesh.position.set(this.x, 0.9 + 4 * (1 - this.spawnT), this.z);
      this.mesh.scale.setScalar(this.spawnT);
      return;
    }
    const p = game.player;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const radial = d > 7 ? 1 : d < 5 ? -0.6 : 0;
    steer(this, (dx / d) * radial, (dz / d) * radial, WARDEN.speed, 2, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    clampToArena(this, this.radius);

    // Dashing across the ring (in either direction) breaks the shield.
    const inside = d < WARDEN.shieldR;
    if (inside !== this.wasInside && p.dashT > 0 && this.shielded && p.alive) {
      this.openT = WARDEN.openTime;
      game.onWardenBreak(this);
    }
    this.wasInside = inside;
    this.openT = Math.max(0, this.openT - dt);

    const previousVolley=this.volleyT;
    this.volleyT -= dt;
    if(previousVolley>.55&&this.volleyT<=.55&&p.alive)game.audio.danger();
    if (this.volleyT <= 0 && p.alive) {
      this.volleyT = WARDEN.volleyEvery;
      const off = rand() * Math.PI * 2;
      for (let k = 0; k < WARDEN.volley; k++) {
        const a = off + (k / WARDEN.volley) * Math.PI * 2;
        game.bullets.spawn('enemy', this.x + Math.cos(a) * 1.4, this.z + Math.sin(a) * 1.4, Math.cos(a), Math.sin(a), WARDEN.bulletSpeed, 3.2, C.acid, 1, 0, 'warden');
      }
      game.audio.enemyShoot();
    }

    // Shield up: steady glowing ring. Open: ring gone, flickering back as it recovers.
    const recovering = this.openT > 0 && this.openT < 0.8;
    this.ring.visible = this.shielded || (recovering && (game.world.reducedMotion || Math.floor(this.t * 14) % 2 === 0));
    this.ringMat.opacity = 0.45 + 0.06 * Math.sin(this.t * 2);
    u.core.scale.setScalar(this.shielded ? 0.6 : 0.95 + Math.sin(this.t * 20) * 0.15);
    this.mesh.position.set(this.x, 0.9, this.z);
    this.mesh.scale.setScalar(1);
    u.spin.rotation.y += dt * 0.8;
  }
  hurt(dmg) {
    if (this.shielded) return;
    this.hp -= dmg;
    if (this.hp <= 0) this.alive = false;
  }
  dispose() {
    this.ringMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Bullets: a flat pool rendered through two instanced meshes.

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V = new THREE.Vector3();
const S1 = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const COL = new THREE.Color();

export class Bullets {
  constructor(scene, max = 400) {
    const S = shared();
    this.list = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.meshP = new THREE.InstancedMesh(S.bulletP, new THREE.MeshBasicMaterial({ color: neon(C.electric, 3.2), toneMapped: false }), max);
    this.meshE = new THREE.InstancedMesh(S.bulletE, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), max);
    this.meshE.setColorAt(0, COL.set(0xffffff));
    for (const m of [this.meshP, this.meshE]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    this.max = max;
  }

  spawn(owner, x, z, dx, dz, speed, life, color, dmg, gen, src = owner) {
    if (this.list.length >= this.max) return;
    const pace=owner==='player'?1:(this.enemySpeedScale||1);
    this.list.push({ owner, src, x, z, vx: dx * speed * pace, vz: dz * speed * pace, life:life/pace, color, dmg, gen, radius: owner === 'player' ? 0.18 : 0.26, dead: false });
  }

  clear() {
    this.list.length = 0;
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
  }

  update(dt) {
    const keep = [];
    this.playerBullets.length = 0;
    this.enemyBullets.length = 0;
    for (const b of this.list) {
      if (b.dead) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      if (b.life <= 0 || Math.hypot(b.x, b.z) > ARENA_R + 3) continue;
      keep.push(b);
      (b.owner === 'player' ? this.playerBullets : this.enemyBullets).push(b);
    }
    this.list = keep;
  }

  render() {
    let np = 0;
    let ne = 0;
    for (const b of this.list) {
      V.set(b.x, 0.6, b.z);
      if (b.owner === 'player') {
        Q.setFromAxisAngle(UP, Math.atan2(b.vx, b.vz));
        M4.compose(V, Q, S1);
        this.meshP.setMatrixAt(np++, M4);
      } else {
        Q.setFromAxisAngle(UP, Math.atan2(b.vx,b.vz));
        M4.compose(V,Q,S1);
        this.meshE.setMatrixAt(ne, M4);
        this.meshE.setColorAt(ne, COL.set(b.color));
        ne++;
      }
    }
    this.meshP.count = np;
    this.meshE.count = ne;
    this.meshP.instanceMatrix.needsUpdate = true;
    this.meshE.instanceMatrix.needsUpdate = true;
    if (this.meshE.instanceColor) this.meshE.instanceColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// The prediction ghost: where the model thinks you'll be in half a second.

export class Ghost {
  constructor(scene) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.strokeStyle = '#B34232';
    g.lineWidth = 10;
    g.setLineDash([18,12]);
    for(const [x,y,sx,sy]of [[42,42,1,1],[214,42,-1,1],[42,214,1,-1],[214,214,-1,-1]]){
      g.beginPath();g.moveTo(x+sx*50,y);g.lineTo(x,y);g.lineTo(x,y+sy*50);g.stroke();
    }
    g.setLineDash([]);
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(128, 70);
    g.lineTo(128, 186);
    g.moveTo(70, 128);
    g.lineTo(186, 128);
    g.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);

    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.lineMat = new THREE.LineDashedMaterial({ color: neon(C.pink, 1.6), dashSize: 0.35, gapSize: 0.25, transparent: true, toneMapped: false });
    this.line = new THREE.Line(lg, this.lineMat);
    scene.add(this.line);
    this.x = 0;
    this.z = 0;
    this.alpha = 0;
    this.spin = 0;
  }

  update(dt, px, pz, tx, tz, show) {
    const k = 1 - Math.exp(-dt * 12);
    this.x += (tx - this.x) * k;
    this.z += (tz - this.z) * k;
    this.alpha += ((show ? 1 : 0) - this.alpha) * Math.min(1, dt * 6);
    this.spin += this.reducedMotion ? 0 : dt * 1.5;
    this.mesh.position.set(this.x, 0.07, this.z);
    this.mesh.rotation.z = this.spin;
    this.mat.opacity = this.alpha * 0.9;
    this.mesh.visible = this.alpha > 0.02;
    const pos = this.line.geometry.attributes.position;
    pos.setXYZ(0, px, 0.1, pz);
    pos.setXYZ(1, this.x, 0.1, this.z);
    pos.needsUpdate = true;
    this.line.computeLineDistances();
    this.lineMat.opacity = this.alpha * 0.7;
    this.line.visible = this.mesh.visible;
  }
}
