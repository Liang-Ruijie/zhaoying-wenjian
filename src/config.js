// Tunables. Distances are metres-ish world units on the XZ plane.

export const ARENA_R = 20;
export const SAMPLE_HZ = 15; // decisions recorded per second — also the Echo "think" rate
export const CALIBRATION_TIME = 25;
export const MAX_ECHOES = 4;

export const PLAYER = {
  radius: 0.6,
  speed: 9.5,
  accel: 85,
  friction: 14,
  hp: 6,
  fireRate: 9,
  bulletSpeed: 34,
  bulletLife: 0.8,
  dashSpeed: 30,
  dashTime: 0.16,
  dashCooldown: 0.85,
  hurtIframes: 1.0,
};

export const ECHO = {
  radius: 0.62,
  speed: 8.6,
  accel: 70,
  friction: 12,
  baseHp: 26,
  hpPerGen: 5,
  fireRate: 2.6,
  bulletSpeed: 19,
  bulletLife: 1.7,
  dashSpeed: 26,
  dashTime: 0.16,
  dashCooldown: 1.2,
  temperature: 0.85,
  minFireProb: 0.35,
  aimNoise: 0.1, // radians, on top of the player's own measured aim error
};

export const BIT = { radius: 0.5, speed: 6.4, hp: 1, score: 25 };
export const BYTE = { radius: 0.75, speed: 3.4, hp: 3, score: 60, fireEvery: 2.4, bulletSpeed: 11, keepAway: 10 };

export const SCORE = { echoBase: 300, roundClear: 500, unpredictBonus: 1000 };

// 照影问剑 · 宣纸、青玉与朱砂。
export const C = {
  night: 0xeee8dc,
  nightShadow: 0xe2dacb,
  ink: 0x253238,
  electric: 0x216d68,
  pink: 0xb34232,
  acid: 0x8a6840,
  sun: 0x9b713f,
  orange: 0xa84c35,
  violet: 0x784b47,
};

// Echo generations cycle through these accents.
export const ECHO_COLORS = [C.pink, C.violet, C.orange, C.acid];
export const echoColor = (gen) => ECHO_COLORS[(gen - 1) % ECHO_COLORS.length];

export const AI_RULES = Object.freeze({ version: 'A1-B1', minTrainSamples: 20, limitedEvidenceSamples: 200, onboardingIdleSeconds: 3, trainBudgetMs: 4, minLateral: 30, habitShare: 0.7 });

// ---- the cast: new archetypes alongside Bit and Byte ----
export const LEECH = { radius: 0.42, speed: 8.6, hp: 1, score: 15, drain: 50, pack: [3, 5] };
export const MIRROR = { radius: 0.62, hp: 4, score: 150, delay: 2.0, maxSpeed: 13, fireEvery: 1.8, bulletSpeed: 17 };
export const WARDEN = { radius: 1.15, speed: 2.2, hp: 16, score: 800, shieldR: 3.6, openTime: 3.2, volleyEvery: 2.6, volley: 10, bulletSpeed: 9 };

// Name cards shown the first time each character appears in a run.
export const CAST = {
  leech: { name: '噬墨符', desc: '成群追身，触碰会扣分。冲刺穿过可击破。', color: C.pink },
  mirror: { name: '镜步残影', desc: '追随你两秒前的路径，并用模型预测瞄准。', color: C.violet },
  warden: { name: '镇阵剑印', desc: '冲刺穿过护阵雾障可破防，趁窗口出剑。', color: C.acid },
};
