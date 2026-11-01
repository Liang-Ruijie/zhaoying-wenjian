export const AUDIO_SETTINGS_KEY='zhaoying.audio.v1';
export const DEFAULT_AUDIO_SETTINGS=Object.freeze({version:1,master:.8,music:.7,combat:.8,ambience:.4,ui:.6,muted:false,comfort:true});
const LEVELS=['master','music','combat','ambience','ui'];
export function sanitizeAudioSettings(input={},base=DEFAULT_AUDIO_SETTINGS){
 const result={...base,version:1};
 if(!input||typeof input!=='object')return result;
 for(const key of LEVELS)if(typeof input[key]==='number'&&Number.isFinite(input[key]))result[key]=Math.max(0,Math.min(1,input[key]));
 for(const key of ['muted','comfort'])if(typeof input[key]==='boolean')result[key]=input[key];
 return result;
}
export function loadAudioSettings(storage){
 try{const s=storage??globalThis.localStorage;const raw=s?.getItem(AUDIO_SETTINGS_KEY);if(raw)return sanitizeAudioSettings(JSON.parse(raw));return sanitizeAudioSettings({muted:s?.getItem('zhaoying.muted')==='1'});}catch{return {...DEFAULT_AUDIO_SETTINGS};}
}
export function saveAudioSettings(settings,storage){try{(storage??globalThis.localStorage)?.setItem(AUDIO_SETTINGS_KEY,JSON.stringify(sanitizeAudioSettings(settings)));return true;}catch{return false;}}
