// One embedded, gapless 8-bar master approved by the owner; no runtime network request.
export const THEME_ID='zhaoying-story-v3';
export const THEME_BPM=80;
export const THEME_SECONDS=24;
let encoded=null;
const decoded=new Map();
export function configureTheme(dataURL){if(encoded!==dataURL){encoded=dataURL;decoded.clear();}}
export function loadTheme(ctx){
 const rate=ctx.sampleRate;
 if(decoded.has(rate))return decoded.get(rate);
 const pending=(async()=>{
  if(!encoded?.startsWith('data:audio/'))throw new Error('Background theme unavailable');
  const bytes=Uint8Array.from(atob(encoded.slice(encoded.indexOf(',')+1)),c=>c.charCodeAt(0));
  const buffer=await new Promise((resolve,reject)=>{try{ctx.decodeAudioData(bytes.buffer,resolve,reject)?.then?.(resolve,reject);}catch(error){reject(error);}});
  if(!Number.isFinite(buffer.duration)||Math.abs(buffer.duration-THEME_SECONDS)>.025)throw new Error('Unexpected background theme duration');
  return buffer;
 })();
 // AudioBuffers may be shared across contexts; cache at most three decode rates.
 if(decoded.size>=3)decoded.delete(decoded.keys().next().value);
 decoded.set(rate,pending);pending.catch(()=>{if(decoded.get(rate)===pending)decoded.delete(rate);});return pending;
}
