import * as THREE from 'three';
import {characterAction,characterFrame} from './character-actions.js';
import rearUrl from '../assets/characters/swordsman-rear-actions-v1.webp';
import actionUrl from '../assets/characters/swordsman-actions-v1.webp';
import atlasUrl from '../assets/characters/swordsman-directions-runtime-v2.webp';
import {characterHeading,viewForHeading} from './character-directions.js';
const textures=new Set();
let ready=false;
const atlas=new THREE.TextureLoader().load(atlasUrl,()=>{
  ready=true;for(const t of textures)t.needsUpdate=true;
  document.body.dataset.characterAsset='ready';
},undefined,()=>{document.body.dataset.characterAsset='failed';});
atlas.colorSpace=THREE.SRGBColorSpace;
atlas.minFilter=THREE.LinearMipmapLinearFilter;
atlas.magFilter=THREE.LinearFilter;
let actionReady=false;const actionMaps=new Set();
const actionAtlas=new THREE.TextureLoader().load(actionUrl,()=>{actionReady=true;for(const t of actionMaps)t.needsUpdate=true;document.body.dataset.characterActions='ready';},undefined,()=>document.body.dataset.characterActions='failed');
actionAtlas.colorSpace=THREE.SRGBColorSpace;
let rearReady=false;const rearAtlas=new THREE.TextureLoader().load(rearUrl,()=>{rearReady=true;for(const t of actionMaps)t.needsUpdate=true;document.body.dataset.characterRear='ready';},undefined,()=>document.body.dataset.characterRear='failed');rearAtlas.colorSpace=THREE.SRGBColorSpace;
const geometry=new THREE.PlaneGeometry(2.75,2.75);
export function characterAssetState(){
  if([document.body.dataset.characterAsset,document.body.dataset.characterActions,document.body.dataset.characterRear].includes('failed'))return 'failed';
  return ready&&actionReady&&rearReady?'ready':'loading';
}
export function attachCharacterArt(root,accent,hologram){
  const map=atlas.clone();map.repeat.set(.25,.5);textures.add(map);
  const actionMap=actionAtlas.clone();actionMap.repeat.set(.25,.25);actionMaps.add(actionMap);
  const rearMap=rearAtlas.clone();rearMap.repeat.set(.25,.25);actionMaps.add(rearMap);
  const material=new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.28,depthWrite:false,side:THREE.DoubleSide,color:hologram?new THREE.Color(accent).lerp(new THREE.Color(0xffffff),.20):0xffffff});
  const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=1;mesh.visible=false;root.add(mesh);
  root.userData.art={mesh,material,map,actionMap,rearMap,lastX:0,lastZ:1,heading:null,shader:null,trailClock:0,trails:[]};
  const art=root.userData.art;
  material.onBeforeCompile=shader=>{
    art.shader=shader;shader.uniforms.gaitTime={value:0};shader.uniforms.gaitStride={value:0};
    shader.vertexShader='uniform float gaitTime; uniform float gaitStride;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n float hem=smoothstep(0.05,0.5,0.5-uv.y); transformed.x+=sin(gaitTime*10.0+uv.y*6.0)*0.045*gaitStride*hem;');
  };
  material.customProgramCacheKey=()=> 'zhaoying-cloth-v1';
  for(let i=0;i<3;i++){const tmap=map.clone();textures.add(tmap);const tactionMap=actionMap.clone();actionMaps.add(tactionMap);const trearMap=rearMap.clone();actionMaps.add(trearMap);const mat=new THREE.MeshBasicMaterial({map:tmap,transparent:true,depthWrite:false,alphaTest:.12,side:THREE.DoubleSide,color:accent});const trail=new THREE.Mesh(geometry,mat);trail.visible=false;trail.renderOrder=0;root.add(trail);art.trails.push({mesh:trail,map:tmap,actionMap:tactionMap,rearMap:trearMap,material:mat,age:1,world:new THREE.Vector3()});root.userData.materials.add(mat);}
  root.userData.materials.add(material);
}
export function poseCharacterArt(actor,game){
  const u=actor.mesh.userData,a=u.art;if(!a)return;
  const loaded=!game.simpleCharacter&&ready&&!!a.map.image;
  a.mesh.visible=loaded;u.figure.visible=!loaded;
  if(!loaded)return;
  const moving=Math.hypot(actor.vx,actor.vz)>.35;
  if(moving){a.lastX=actor.vx;a.lastZ=actor.vz;}
  a.heading=characterHeading(a.lastX,a.lastZ,a.heading);
  const d=viewForHeading(a.heading);
  a.map.offset.set((d.frame%4)/4,1-(Math.floor(d.frame/4)+1)/2);
  const clip=characterFrame(actor,game.time,u.phase,game.world.reducedMotion);
  const rear=[3,4,5].includes(a.heading),clipMap=rear?a.rearMap:a.actionMap,useClip=(rear?rearReady:actionReady)&&clip.frame!==null;
  if(useClip)clipMap.offset.set((clip.frame%4)/4,1-(Math.floor(clip.frame/4)+1)/4);
  a.material.map=useClip?clipMap:a.map;a.frame=useClip?clip.frame:null;a.view=rear?'rear':'front-side';
  // Billboard faces the actual camera; artwork controls body heading, never aim features.
  a.mesh.quaternion.copy(game.world.camera.quaternion);
  a.mesh.scale.x=(useClip?[5,6,7].includes(a.heading):d.flip)?-1:1;
  const action=characterAction(actor,game.time,game.world.reducedMotion);a.action=action.kind;
  a.mesh.rotateZ(action.lean);a.mesh.scale.y=action.stretch;
  const readability=game.mobile?1.5:1;a.mesh.scale.z=1;a.mesh.scale.multiplyScalar(readability);
  const bob=game.world.reducedMotion?0:moving?Math.sin(u.phase)*.025:Math.sin(game.time*1.8)*.012;
  // Sprite's feet sit at the collider mark rather than at its visual centre.
  a.mesh.position.set(0,1,0).applyQuaternion(game.world.camera.quaternion).multiplyScalar(1.16*readability);
  a.mesh.position.y+=.06+bob;
  if(a.shader){a.shader.uniforms.gaitTime.value=game.time;a.shader.uniforms.gaitStride.value=moving&&!game.world.reducedMotion?1:0;}
  const dt=Math.max(0,Math.min(.05,game.time-(a.lastTime??game.time)));a.lastTime=game.time;
  for(const t of a.trails){t.age+=dt;t.mesh.visible=t.age<.20&&!game.lowQuality&&!game.world.reducedMotion;if(t.mesh.visible){t.mesh.position.set(t.world.x-actor.x,t.world.y,t.world.z-actor.z);t.material.opacity=(1-t.age/.20)*.30;}}
  a.trailClock+=dt;
  if(actor.dashT>0&&a.trailClock>.045&&!game.lowQuality&&!game.world.reducedMotion){a.trailClock=0;const t=a.trails.reduce((old,v)=>v.age>old.age?v:old);t.age=0;t.world.set(actor.x+a.mesh.position.x,a.mesh.position.y,actor.z+a.mesh.position.z);const source=a.material.map,target=source===a.actionMap?t.actionMap:source===a.rearMap?t.rearMap:t.map;t.material.map=target;target.repeat.copy(source.repeat);target.offset.copy(source.offset);t.mesh.quaternion.copy(a.mesh.quaternion);t.mesh.scale.copy(a.mesh.scale);}
  a.material.opacity=actor.alive?1:Math.max(0,1-(game.deadReal??0)/2);
}
export function disposeCharacterArt(root){
  const a=root.userData.art;if(a){textures.delete(a.map);a.map.dispose();actionMaps.delete(a.actionMap);a.actionMap.dispose();actionMaps.delete(a.rearMap);a.rearMap.dispose();for(const t of a.trails){textures.delete(t.map);t.map.dispose();actionMaps.delete(t.actionMap);t.actionMap.dispose();actionMaps.delete(t.rearMap);t.rearMap.dispose();}}
}
