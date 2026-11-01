// Stable per-family budgets. Priority 4+ has reserved capacity; common attacks cannot evict it.
const rule=(group,category,gap,cap,priority,level)=>Object.freeze({group,category,gap,cap,priority,level});
export const SOUND_RULES=Object.freeze({
 shoot:rule('swing','combat',.085,2,1,.72),
 echoShoot:rule('enemy-fire','combat',.12,3,2,.72),
 enemyShoot:rule('enemy-fire','combat',.13,3,3,.72),
 mirrorShoot:rule('enemy-fire','combat',.13,3,3,.68),
 enemyHit:rule('impact','combat',.065,3,2,.72),
 heavyHit:rule('heavy-impact','cue',.14,2,4,.82),
 playerHurt:rule('danger','cue',.18,2,5,.85),
 danger:rule('warning','cue',.3,2,5,.88),
 explode:rule('dissolve','combat',.12,2,2,.72),
 dash:rule('dash','combat',.12,2,3,.85),
 echoSpawn:rule('arrival','cue',.6,1,4,.88),
 trainTick:rule('interface','ui',.1,2,1,.6),
 trainDone:rule('resolve','ui',.5,1,4,.85),
 predictBlip:rule('prediction','combat',.65,1,1,.48),
 uiHover:rule('interface','ui',.10,1,1,.55),
 uiClick:rule('interface','ui',.08,2,2,.72),
 roundStart:rule('resolve','cue',.5,1,4,.8),
 roundClear:rule('resolve','cue',.6,1,4,.9),
 death:rule('resolve','cue',.7,1,5,.86),
 leechDrain:rule('drain','combat',.16,2,2,.72),
 wardenShield:rule('shield','combat',.14,2,2,.65),
 wardenBreak:rule('shield-break','cue',.5,1,5,.90),
 callout:rule('warning','cue',.5,1,4,.72),
});
export const voiceBudget=comfort=>({max:comfort?14:20,reserved:4,retiring:2});
export function selectVoiceSlot(active,retiringCount,rule,comfort){
 const budget=voiceBudget(comfort),family=active.filter(v=>v.group===rule.group);
 if(active.length+retiringCount>=budget.max+budget.retiring)return {accept:false,steal:null};
 let pool=null;
 if(family.length>=rule.cap)pool=family;
 else if(active.length>=budget.max||rule.priority<4&&active.filter(v=>v.priority<4).length>=budget.max-budget.reserved)pool=active;
 else return {accept:true,steal:null};
 const candidate=pool.filter(v=>v.priority<rule.priority).sort((a,b)=>a.priority-b.priority||a.started-b.started)[0];
 return candidate&&retiringCount<budget.retiring?{accept:true,steal:candidate}:{accept:false,steal:null};
}
export const densityGain=count=>Math.max(.65,1/Math.sqrt(1+Math.max(0,count-2)*.22));
