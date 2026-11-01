export function runGoal(state, mode='story', boss=false) {
  if(state==='calibrate')return '先打小怪、躲开攻击，撑过这25秒。镜剑正在记录部分打法。';
  if(state!=='combat')return '';
  if(mode==='practice')return '击败规则对手。这一局不代表镜剑学会了你的打法。';
  if(mode==='duel')return '瞄准并击败对方分享的镜剑，躲开朱砂剑气。';
  if(boss)return '先冲刺穿过首领护阵雾障，趁护阵破开时出剑。';
  return '击败红色人物镜剑，进入下一阵。瞄准它持续出剑，移动躲避。';
}
export function fightTip(habit) {
  if(habit?.habitId==='lateral'&&habit?.evidenceState==='sufficient')return '可以试试换个横移方向或变换距离，再观察交战。保持原打法也能继续战斗。';
  if(habit?.habitId==='idle')return '可以先边移动边出剑，再用冲刺躲开危险，寻找打败镜剑的机会。';
  return '先瞄准红色人物持续出剑，边走边躲；必要时冲刺穿过剑气。';
}
