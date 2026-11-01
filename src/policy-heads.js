import {ECHO} from './config.js';
// Same original policy gates, separated so diagnostics can distinguish learned
// probabilities from minimum-fire, personality gain and maximum-dash rules.
export const dashProbability=(learned,personalityGain=1)=>Math.min(.6,learned*1.15*personalityGain);
export const shootProbability=learned=>Math.max(ECHO.minFireProb,learned);
