// Presentation only: never changes colliders, cooldowns, inputs or learned features.
export function markCharacterAction(actor,kind,time){if(kind==='attack'&&actor.artEvent&&time-actor.artEvent.time<(actor.artEvent.kind==='hurt'?.22:.28))return;actor.artEvent={kind,time};}
export function characterAction(actor,time,reduced=false){
 const event=actor.artEvent,age=event?Math.max(0,time-event.time):Infinity;
 const kind=!actor.alive?'death':actor.dashT>0?'dash':event?.kind==='hurt'&&age<.22?'hurt':event?.kind==='attack'&&age<.32?'attack':Math.hypot(actor.vx,actor.vz)>.35?'run':'idle';
 const pulse=kind==='attack'?Math.sin(Math.PI*age/.32):kind==='hurt'?Math.sin(Math.PI*age/.22):0;
 return {kind,lean:reduced?0:(kind==='attack'?-.075:kind==='hurt'?.055:0)*pulse,stretch:reduced?1:kind==='dash'?.96:1+(kind==='attack'?.025:kind==='hurt'?-.025:0)*pulse};
}
// Four authored frames per clip. Rendering time only, no attack timing changes.
export function characterFrame(actor,time,phase=0,reduced=false){
 const a=characterAction(actor,time,reduced),age=Math.max(0,time-(actor.artEvent?.time??time));
 if(reduced)return {kind:a.kind,frame:a.kind==='death'?15:null};
 if(a.kind==='run')return{kind:a.kind,frame:Math.floor(Math.max(0,phase)/1.8)%4};
 if(a.kind==='attack')return{kind:a.kind,frame:4+Math.min(3,Math.floor(age/.08))};
 if(a.kind==='dash')return{kind:a.kind,frame:8+Math.min(3,Math.floor(Math.max(0,time-(actor.artDashAt??time))/.04))};
 if(a.kind==='hurt')return{kind:a.kind,frame:12+Math.min(1,Math.floor(age/.11))};
 if(a.kind==='death')return{kind:a.kind,frame:12+Math.min(3,Math.floor(age/.18))};
 return{kind:a.kind,frame:null};
}
