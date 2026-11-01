export const AUDIO_SCENES=Object.freeze(['ambient','combat','interlude','quiet']);
export function audioSceneFor(state,paused=false){
 if(paused)return 'quiet';
 if(['calibrate','combat','cleared','dead'].includes(state))return 'combat';
 if(['train','profile'].includes(state))return 'interlude';
 return 'ambient';
}
export function allowsSound(scene,name){
 if(scene==='combat')return true;
 if(name==='uiClick'||name==='uiHover')return true;
 return scene==='interlude'&&(name==='trainTick'||name==='trainDone');
}
