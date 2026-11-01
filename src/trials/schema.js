import {parseIntent} from './intent.js';
export {GUARD_VERSION} from './intent.js';
// Versioned allowlist shared by the browser and the minimal Node proxy.
export const VERSION='trial-1';
export const ENEMIES=Object.freeze({bit:'追身符刃',byte:'悬符法器',leech:'噬墨符',mirror:'镜步残影',warden:'镇阵剑印'});
export const TEMPLATES=Object.freeze({melee:['bit','leech'],ranged:['bit','byte'],mixed:['bit','byte','leech','mirror'],ward:['bit','byte','warden']});
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const number=(minimum,maximum)=>({type:'number',minimum,maximum});
const string=(minLength,maxLength,pattern)=>({type:'string',minLength,maxLength,...(pattern?{pattern}:{})});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const enemyList={type:'array',items:{type:'string',enum:Object.keys(ENEMIES)},minItems:0,maxItems:5,uniqueItems:true};
export const ConstraintsSchema=object({noHealthIncrease:{const:true},maxEnemies:integer(2,5),excludedEnemies:enemyList,countScope:{enum:['minions','total']}});
ConstraintsSchema.required=['noHealthIncrease','maxEnemies','excludedEnemies'];
export const ConfigSchema=object({configVersion:{const:VERSION},trialId:string(1,48,'^[a-zA-Z0-9_-]+$'),mode:{const:'trial'},seed:integer(1,2147483647),pace:{enum:['gentle','standard']},template:{enum:Object.keys(TEMPLATES)},waves:{type:'array',minItems:2,maxItems:3,items:object({duration:integer(10,20),cap:integer(2,5),interval:number(1.05,5.5),enemies:{...enemyList,minItems:1,maxItems:4}})},goal:object({id:{enum:['survive','defeat','dash']},target:integer(1,60)}),constraints:ConstraintsSchema});
export const UnsupportedSchema=object({status:{const:'unsupported'},reason:string(1,200)});
export const RequestSchema=object({schemaVersion:{const:VERSION},requestId:string(8,64,'^[a-zA-Z0-9_-]+$'),text:string(1,240),previousConfig:{anyOf:[{type:'null'},ConfigSchema]},summary:{type:'null'}});
export const MetricsSchema=object({elapsed:number(0,61),damage:integer(0,1000),defeats:integer(0,1000),dashes:integer(0,1000)});
export const FeedbackSchema=object({trialId:string(1,48),source:{enum:['preset','model','simulation']},reason:{enum:['time','death','abandoned']},metrics:MetricsSchema,achieved:{type:'boolean'},feedback:{enum:['pending','yes','partial','no']},note:string(0,120)});
export const ResultSchema=object({schemaVersion:{const:VERSION},requestId:string(8,64),status:{const:'ready'},source:{enum:['model','simulation']},config:ConfigSchema,requirements:object({satisfied:{type:'array',maxItems:8,items:string(1,240)},unmet:{type:'array',maxItems:8,items:string(1,240)},unverified:{type:'array',maxItems:8,items:string(1,240)}}),metadata:object({provider:string(1,64),model:string(1,100),promptVersion:string(14,32,'^trial-prompt-[1-9][0-9]{0,2}$'),validatorVersion:{const:VERSION},configHash:string(8,8),elapsedMs:number(0,15000),retries:integer(0,1),inputTokens:integer(0,100000),outputTokens:integer(0,100000),costUsd:number(0,100)})});
export function checkSchema(value,schema,path='$',errors=[]){
 if(schema.anyOf){if(!schema.anyOf.some(s=>checkSchema(value,s,path,[]).length===0))errors.push(path+': 类型不符');return errors;}
 if('const'in schema&&value!==schema.const)errors.push(path+': 固定值不符');
 if(schema.enum&&!schema.enum.includes(value))errors.push(path+': 不在白名单');
 const type=value===null?'null':Array.isArray(value)?'array':typeof value;
 if(schema.type&&!(schema.type==='integer'?Number.isInteger(value):schema.type===type)){errors.push(path+': 类型不符');return errors;}
 if(type==='number'&&(!Number.isFinite(value)||value<schema.minimum||value>schema.maximum))errors.push(path+': 数值越界');
 if(type==='string'&&((schema.minLength!==undefined&&value.length<schema.minLength)||(schema.maxLength!==undefined&&value.length>schema.maxLength)||(schema.pattern&&!new RegExp(schema.pattern).test(value))))errors.push(path+': 文本格式不符');
 if(type==='array'){
  if(value.length<schema.minItems||value.length>schema.maxItems)errors.push(path+': 数量越界');
  if(schema.uniqueItems&&new Set(value.map(x=>JSON.stringify(x))).size!==value.length)errors.push(path+': 重复项');
  value.slice(0,64).forEach((v,i)=>checkSchema(v,schema.items,path+'['+i+']',errors));
 }
 if(type==='object'&&schema.properties){
  for(const k of schema.required||[])if(!Object.hasOwn(value,k))errors.push(path+'.'+k+': 缺失');
  for(const k of Object.keys(value)){if(!Object.hasOwn(schema.properties,k)){if(schema.additionalProperties===false)errors.push(path+'.'+k+': 未允许的字段');}else checkSchema(value[k],schema.properties[k],path+'.'+k,errors);}
 }
 return errors;
}
export const copy=value=>JSON.parse(JSON.stringify(value));
export const configHash=config=>{let n=2166136261;for(const c of JSON.stringify(config)){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return(n>>>0).toString(16).padStart(8,'0');};
export function validateConfig(config,required=null){
 const errors=checkSchema(config,ConfigSchema);if(errors.length)return {ok:false,errors};
 if(!config.waves[0].enemies.some(k=>k==='bit'||k==='byte'))errors.push('首波须有符刃或悬符法器供25秒记录使用');
 const total=config.waves.reduce((n,w)=>n+w.duration,0),allowed=TEMPLATES[config.template],c=config.constraints;
 if(total<30||total>60)errors.push('战斗总时长须为30—60秒');
 if(required){if((c.countScope??'minions')!==(required.countScope??'minions'))errors.push('人数口径必须保持');if(c.maxEnemies>required.maxEnemies||required.excludedEnemies.some(k=>!c.excludedEnemies.includes(k)))errors.push('不得放宽已确定的硬约束');}
 let opportunities=0;
 config.waves.forEach((w,i)=>{
  if(w.cap>c.maxEnemies)errors.push('波次在场数量超过硬约束');
  w.enemies.forEach((k,j)=>{if(!allowed.includes(k))errors.push(`waves[${i}].enemies[${j}]=${k} 不属于模板${config.template}，该模板仅允许${allowed.join('/') }；移除此敌人或改为兼容模板，但不得违反排除项`);if(c.excludedEnemies.includes(k))errors.push(`waves[${i}].enemies[${j}]=${k} 已被用户排除，必须移除`);});
  if(w.enemies.includes('warden')&&(i!==config.waves.length-1||w.duration<15))errors.push('首领仅能在最后且不少于15秒的波次出现');
  opportunities+=Math.floor(w.duration/w.interval);
 });
 if(config.goal.id==='survive'&&config.goal.target!==total)errors.push(`存活目标须等于战斗总时长${total}，当前target=${config.goal.target}`);
 if(config.goal.id==='defeat'&&(config.goal.target>8||config.goal.target>opportunities))errors.push('击破目标超过有限出怪机会');
 if(config.goal.id==='dash'&&(config.goal.target>12||config.goal.target>Math.floor(total/0.85)))errors.push('冲刺目标超过上限');
 return {ok:errors.length===0,errors,total};
}
export const deriveConstraints=parseIntent;
export function describeConfig(c){
 const names=[...new Set(c.waves.flatMap(w=>w.enemies))].map(k=>ENEMIES[k]);
 const total=c.waves.reduce((n,w)=>n+w.duration,0);
 const goal=c.goal.id==='survive'?`存活满${total}秒${c.template==='ward'?'（护阵存活，不要求破盾或击破首领）':''}`:c.goal.id==='defeat'?`击破至少${c.goal.target}名敌人（含镜剑），并存活至结束`:`完成${c.goal.target}次身法冲刺，并存活至结束（不等于成功躲避次数）`;
 return {title:c.goal.id==='survive'?(c.template==='ward'?'护阵存活':'守心试炼'):c.goal.id==='defeat'?'破阵试炼':'御风试炼',goal,details:`先试剑25秒并在本地凝影，再进行${total}秒、${c.waves.length}波交战。${names.join('、')}；另有1位本局学习形成的镜剑。`,limits:`初始6格血量、原伤害和移速；试剑受伤会带入交战。人数口径：${c.constraints.countScope==='total'?'包含镜剑':'小兵上限不包含镜剑'}；小兵最多${c.constraints.maxEnemies}名 + 镜剑1名 = 总共最多${c.constraints.maxEnemies+1}名。不自动回血。`,waves:c.waves.map((w,i)=>`第${i+1}波 ${w.duration}秒 · 最多${w.cap}名 · 每${w.interval}秒尝试出怪 · ${w.enemies.map(k=>ENEMIES[k]).join('、')}`),excluded:c.constraints.excludedEnemies.length?`不出现：${c.constraints.excludedEnemies.map(k=>ENEMIES[k]).join('、')}`:'仅使用现有敌人与技能'};
}
