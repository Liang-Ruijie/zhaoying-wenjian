// Difficulty is a run setting. Rendering preferences never enter this module.
export const PACES = Object.freeze({
  gentle: { label: '舒缓', firstSpawn: 1.8, arrival: 1.25, move: 1, projectile: 1, combatMove: 1, combatProjectile: 1, leechAt: 16, pack: 2 },
  standard: { label: '标准', firstSpawn: 0.4, arrival: 0.7, move: 1, projectile: 1, combatMove: 1, combatProjectile: 1, leechAt: 9, pack: null },
});
export function calibrationPlan(seconds, paceId) {
  if (paceId !== 'gentle') return { cap: Math.min(8, 4 + Math.floor(seconds / 4)), interval: [0.35, 0.8], rangedAt: 4, maxRanged: 2 };
  return { cap: seconds < 8 ? 2 : seconds < 16 ? 3 : 5, interval: seconds < 8 ? [1.7, 2.1] : [1.05, 1.55], rangedAt: 9, maxRanged: 1 };
}
export function enemyPace(paceId, state) {
  const p = PACES[paceId] || PACES.gentle;
  const opening = state === 'calibrate';
  return { move: opening ? p.move : p.combatMove, projectile: opening ? p.projectile : p.combatProjectile, arrival: p.arrival };
}
