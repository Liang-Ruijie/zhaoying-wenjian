import * as THREE from 'three';
export function impactSide(camera,vx=0,vz=0){const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);return vx*right.x+vz*right.z<0?-1:1;}
export function fallPose(age,duration,reduced=false){const t=Math.min(1,Math.max(0,age/duration)),u=Math.min(1,t/.60),ease=u*u*(3-2*u);return{angle:reduced?0:ease*1.32,opacity:1-Math.max(0,(t-.45)/.55),sink:reduced?0:ease*.10};}
// Detached presentation snapshots: dead actors are still removed from gameplay immediately.
export class FallenFigures{
 constructor(scene){this.scene=scene;this.items=[];}
 add(actor,camera,impact={}){if(this.items.length>=20)this.remove(this.items[0]);const excluded=new Set(actor.mesh.userData.art?.trails.map(t=>t.mesh)||[]),resources=[],materials=[];
 const clone=node=>{if(!node.visible||excluded.has(node))return null;let c;if(node.isMesh){const geo=node.geometry.clone();resources.push(geo);const copy=m=>{const n=m.clone();if(n.map){n.map=(node===actor.mesh.userData.art?.mesh?actor.mesh.userData.art.map:n.map).clone();resources.push(n.map);}n.transparent=true;n.depthWrite=false;n.alphaTest=.01;materials.push({material:n,opacity:m.opacity});return n;};c=new THREE.Mesh(geo,Array.isArray(node.material)?node.material.map(copy):copy(node.material));}else c=new THREE.Group();c.position.copy(node.position);c.quaternion.copy(node.quaternion);c.scale.copy(node.scale);c.renderOrder=node.renderOrder;for(const child of node.children){const v=clone(child);if(v)c.add(v);}return c;};
 const model=clone(actor.mesh);if(!model)return;model.position.set(0,0,0);const root=new THREE.Group();root.position.set(actor.x,0,actor.z);root.add(model);this.scene.add(root);const item={root,model,resources,materials,age:0,duration:actor.kind?(actor.kind==='warden'?1.05:.72):1.45,side:impactSide(camera,impact.vx,impact.vz),axis:new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion)};this.items.push(item);return item;}
 update(dt,reduced){for(const i of [...this.items]){i.age+=dt;const p=fallPose(i.age,i.duration,reduced);i.root.quaternion.setFromAxisAngle(i.axis,-i.side*p.angle);i.root.position.y=-p.sink;for(const m of i.materials)m.material.opacity=m.opacity*p.opacity;if(i.age>=i.duration)this.remove(i);}}
 remove(i){this.scene.remove(i.root);for(const m of i.materials)m.material.dispose();for(const r of i.resources)r.dispose();this.items.splice(this.items.indexOf(i),1);}
 clear(){for(const i of [...this.items])this.remove(i);}
}
