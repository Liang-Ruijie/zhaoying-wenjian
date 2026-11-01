import {VERSION,copy} from './schema.js';
const base={configVersion:VERSION,mode:'trial',pace:'gentle',constraints:{noHealthIncrease:true,maxEnemies:3,excludedEnemies:[]}};
export const PRESETS=Object.freeze([
 {...base,trialId:'quiet-wind',seed:1301,template:'melee',goal:{id:'dash',target:6},constraints:{...base.constraints,maxEnemies:2,excludedEnemies:['byte','mirror','warden']},waves:[{duration:15,cap:2,interval:2,enemies:['bit']},{duration:15,cap:2,interval:2,enemies:['bit','leech']}]},
 {...base,trialId:'steady-heart',seed:1302,template:'ranged',goal:{id:'survive',target:40},waves:[{duration:20,cap:2,interval:2.4,enemies:['bit']},{duration:20,cap:3,interval:2,enemies:['bit','byte']}]},
 {...base,trialId:'break-formation',seed:1303,template:'mixed',goal:{id:'defeat',target:5},waves:[{duration:15,cap:3,interval:1.7,enemies:['bit','byte']},{duration:15,cap:3,interval:1.55,enemies:['bit','mirror']}]},
 {...base,trialId:'ward-study',seed:1304,template:'ward',goal:{id:'survive',target:40},waves:[{duration:20,cap:2,interval:2.4,enemies:['bit']},{duration:20,cap:3,interval:2.4,enemies:['warden','bit']}]},
]);
export const getPreset=id=>copy(PRESETS.find(p=>p.trialId===id)||PRESETS[0]);
