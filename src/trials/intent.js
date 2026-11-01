// Deterministic supported-language grammar; independent test expectations live in fixtures.
export const GUARD_VERSION='trial-guard-8';
const numeric='[0-9零一二两三四五六七八九十百]+(?:\\.\\d+)?';
const amount=new RegExp('(?:总共|一共|最多|至多|别超过|不(?:能|可|得)?超过|不要超过|不多于|不高于|上限(?:改成|改为|设为|为|是)?|只(?:保留|留|允许|能有|有|要)|仅(?:保留|留|有))\\s*('+numeric+')\\s*(?:个|只|名|人)?','g');
const value=s=>/^\d+(?:\.\d+)?$/.test(s)?Number(s):({'零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[s]??NaN);
const aliases={bit:'追身符刃|符刃',byte:'悬符法器|法器',leech:'噬墨符|墨蛾',mirror:'镜步残影|残影',warden:'镇阵剑印|首领'};
const refusal=message=>({ok:false,code:'UNSUPPORTED',message});
export function parseIntent(text,previous=null){
 const clauses=text.split(/[，。；,;]|但是|然后|但/).map(x=>x.trim()).filter(Boolean);
 const c=JSON.parse(JSON.stringify(previous?.constraints||{noHealthIncrease:true,maxEnemies:5,excludedEnemies:[]}));
 c.countScope??='minions';
 const explicitMin=/不含镜剑|不包括镜剑|不算镜剑|镜剑不计|镜剑另外算|只算小兵|仅(?:算)?小兵/.test(text);
 const explicitTotal=/(?<!不)(?:包含|包括|算上|含)(?:那|这)?(?:一)?(?:位)?镜剑|加上镜剑|镜剑也算/.test(text);
 if(explicitMin&&explicitTotal)return refusal('人数口径同时包含与不包含镜剑，请明确一种。');
 if(explicitMin)c.countScope='minions';else if(explicitTotal||(/总共|一共|所有敌人/.test(text)&&!/(?:小兵|追兵).{0,3}(?:总共|一共)|(?:总共|一共).{0,12}小兵/.test(text)))c.countScope='total';else if(/小兵/.test(text)&&[...text.matchAll(amount)].length)c.countScope='minions';
 const remove=k=>c.excludedEnemies=c.excludedEnemies.filter(v=>v!==k),exclude=k=>{if(!c.excludedEnemies.includes(k))c.excludedEnemies.push(k)};
 for(const clause of clauses){
  const negatedChange=/(?:不(?:再)?(?:撤销|取消|解除|改)|(?:不要|别|不许|禁止).*(?:改|取消|撤销|解除))/.test(clause)&&!/(?:不要超过|不能超过)/.test(clause);
  const revoke=!negatedChange&&/(?:撤销|取消|解除).*(?:上限|人数限制|数量限制)|(?:上限|人数限制|数量限制).*(?:撤销|取消|解除)/.test(clause);
  if(revoke)c.maxEnemies=5;
  const allMatches=[...clause.matchAll(amount)];const otherMeasure=m=>/^(?:次|秒)/.test(clause.slice(m.index+m[0].length))||(/冲刺|击破/.test(clause)&&!/小兵|敌人|人数|追兵/.test(clause));const matches=allMatches.filter(m=>!otherMeasure(m));
  if(!negatedChange)for(const m of matches){const n=value(m[1]),small=n-(c.countScope==='total'?1:0);if(!Number.isInteger(n)||small<2||small>5)return refusal(c.countScope==='total'?'含镜剑的总人数仅支持3—6名；其中固定1位镜剑、小兵2—5名。':'小兵在场上限仅支持2—5名，另外固定1位镜剑。');const change=m[0].startsWith('上限')||/(?:改成|改为|调整为|设为|换成|换为|现在)/.test(clause);c.maxEnemies=change?small:Math.min(c.maxEnemies,small);}
  if(!matches.length&&!allMatches.some(otherMeasure)&&!revoke&&!negatedChange&&/最多|至多|不能超过|只留|上限/.test(clause)&&!/保持|保留|已有|原有|之前|上次|不改|不变|照上次|按上次|仍按|沿用|原样/.test(clause))return refusal('请明确人数数字；小兵2—5名，或包含镜剑的总人数3—6名。');
  const allRange=['byte','mirror','warden'];
  if(/不是不要远程|不再禁止远程|允许远程/.test(clause))allRange.forEach(remove);
  else if(/不要远程|只要近战|仅近战|禁止远程|别让远程/.test(clause))allRange.forEach(exclude);
  if(/只要远程|仅远程/.test(clause))['bit','leech'].forEach(exclude);
  for(const [k,names]of Object.entries(aliases)){
   if(!new RegExp(names).test(clause))continue;
   if(/不要取消|不撤销|不解除|保持|保留/.test(clause)&&/禁止|排除|不出现/.test(clause))continue;
   const allow=new RegExp('(?:不是不要|不再(?:禁止|排除)|取消(?:禁止|排除|不出现)|(?<!不)允许(?:出现)?|恢复(?:出现)?)(?:'+names+')');
   const deny=new RegExp('(?:不允许|不要|排除|禁止|别让|不得|不能|不许|不想要)(?:再|出现|有|让)?(?:'+names+')');
   if(allow.test(clause))remove(k);else if(deny.test(clause)||new RegExp('(?:'+names+')(?:仍然|仍|也)?(?:不允许|不能|不得)(?:出现|有)').test(clause))exclude(k);
  }
 }
 const positive=clauses.filter(x=>!/^(?:不要|不许|禁止|别|不能|不(?:再)?(?:增加|提高|改动|修改))/.test(x)).join('，');
 if((/(?:字段|schema).{0,16}(?:类型|校验)|(?:类型|校验).{0,16}(?:字段|schema)/i.test(positive)&&/改|关|绕|忽略/.test(positive))||/(?:返回|输出|执行).{0,16}(?:脚本|代码|JavaScript|\beval\b|URL)/i.test(positive))return refusal('不能修改配置契约、关闭校验或生成脚本/URL。');
 if(/只要近战/.test(text)&&/只要远程/.test(text))return refusal('近战与仅远程要求冲突。');
 if(/成功.{0,3}(?:躲|闪避)|(?:躲掉|躲开|避开).{0,8}(?:次|下).*(?:完成|目标|才算)/.test(positive))return refusal('成功躲避尚无判定器，可改为实际冲刺次数或存活目标。');
 for(const clause of clauses){if(/间隔|每隔|出现|准备|记录|热身/.test(clause))continue;const m=clause.match(/(?:持续|坚持|存活|撑过|一局|本轮|战斗|试炼).{0,6}?(\d+)\s*秒/ )||clause.match(/(\d+)\s*秒(?:的)?(?:试炼|战斗)/);if(m&&(Number(m[1])<30||Number(m[1])>60))return refusal('交战总时长支持30—60秒，不能用其它时长冒充满足。');}
 if(/复活|无敌|联机|新技能|新增敌人|火球术|读取文件|执行代码/.test(positive))return refusal('该能力尚未实现，请选择已有敌人、节奏与计数目标。');
 if(/(?:增加|提高|加到|改成|设为)\s*(?:\d+\s*)?(?:血量|生命)|(?:血量|生命)\s*(?:增加|提高|加到|改成|设为)/.test(positive))return refusal('试炼固定6格血量，不调整血量。');
 if(/(?:不要|移除|取消)镜剑/.test(text))return refusal('AI试炼固定保留1位镜剑；可以调整小兵人数或返回普通模式。');
 if(c.excludedEnemies.includes('bit')&&c.excludedEnemies.includes('byte'))return refusal('试剑阶段至少需要符刃或法器之一，当前排除项无法开局。');
 return{ok:true,constraints:c};
}
