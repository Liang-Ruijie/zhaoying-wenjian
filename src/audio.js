import {loadTheme,THEME_ID,THEME_BPM} from './audio-theme.js';
import {AUDIO_SCENES,allowsSound} from './audio-scenes.js';
import {DEFAULT_AUDIO_SETTINGS,sanitizeAudioSettings,loadAudioSettings,saveAudioSettings} from './audio-settings.js';
import {SOUND_RULES,voiceBudget,selectVoiceSlot,densityGain} from './audio-mix.js';

// One lightweight WebAudio rig, shared by live playback and offline verification.
// music / wind / battle / important cues / UI → EQ → ONE compressor → soft ceiling → master.
const BPM=THEME_BPM,STEP=60/BPM/4,BAR=16,LOOP=256,AHEAD=.10,TICK_MS=25,SFX_LEAD=.012;
const PENTA=[0,2,4,7,9];
// Original eight-bar answer phrases, repeated with a small ornament after the breath.
// [sixteenth-note position, MIDI pitch, length in sixteenths]. No imported game melody.
const FLUTE_PHRASES=[
 [[2,74,3],[6,78,2],[9,81,4]],
 [[0,83,3],[4,81,2],[7,78,2],[10,76,4]],
 [[2,78,3],[6,81,2],[9,86,4]],
 [[0,83,3],[4,81,3],[9,78,5]],
 [[2,76,3],[6,78,2],[9,81,4]],
 [[0,78,3],[4,76,2],[7,74,5]],
 [[2,73,3],[6,76,2],[9,78,3],[13,76,2]],
 [[0,74,8]],
];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const num=(x,fallback)=>typeof x==='number'&&Number.isFinite(x)?x:fallback;
const mtof=m=>440*2**((m-69)/12);
const toLevel=x=>clamp(Math.round(num(x,0)),0,3);
const quiet=p=>p?.catch?.(()=>{});
const create=(C,options,legacy)=>{try{return new C(options);}catch{return new C(...legacy);}};
let warnings=0;
const warn=e=>{if(warnings++<5)console.warn('[audio]',e);};
function mulberry32(seed){return()=>{let t=seed+=0x6d2b79f5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const RIGS=new WeakMap(),rig=c=>RIGS.get(c);
const SOFT=Float32Array.from({length:4097},(_,i)=>{const x=i/2048-1,a=Math.abs(x);return a<=.65?x:Math.sign(x)*(.65+.25*Math.tanh((a-.65)/.25));});
function smooth(param,value,t,seconds=.12){
 if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(t);
 else{param.cancelScheduledValues(t);param.setValueAtTime(param.value,t);}
 param.linearRampToValueAtTime(value,t+Math.max(.004,seconds));
}
function own(ctx,node){rig(ctx)?.scope?.push(node);return node;}
function gain(ctx,v=1){const g=own(ctx,ctx.createGain());g.gain.value=v;return g;}
function filt(ctx,type,frequency,q=.7){const n=own(ctx,ctx.createBiquadFilter());n.type=type;n.frequency.value=frequency;n.Q.value=q;return n;}
function buildRig(ctx){
 const sr=ctx.sampleRate,R={noise:ctx.createBuffer(1,Math.floor(sr*2),sr),strings:new Map(),scope:null};
 const rnd=mulberry32(0x5e1f),data=R.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=rnd()*2-1;
 RIGS.set(ctx,R);
 R.bus=gain(ctx,.82);R.master=gain(ctx,0);
 R.hp=filt(ctx,'highpass',55,.6);R.bass=filt(ctx,'lowshelf',170,.7);R.presence=filt(ctx,'peaking',2800,.8);R.top=filt(ctx,'lowpass',5800,.65);
 R.compressor=ctx.createDynamicsCompressor();R.makeup=gain(ctx,1);R.clip=ctx.createWaveShaper();R.clip.curve=SOFT;try{R.clip.oversample='2x';}catch{}
 R.bus.connect(R.hp).connect(R.bass).connect(R.presence).connect(R.top).connect(R.compressor).connect(R.makeup).connect(R.clip).connect(R.master).connect(ctx.destination);
 R.music=gain(ctx,1);R.musicIn=gain(ctx,.55);R.duckG=gain(ctx,1);R.duckLP=filt(ctx,'lowpass',6500,.6);
 R.musicIn.connect(R.duckLP).connect(R.duckG).connect(R.music).connect(R.bus);
 R.ambience=gain(ctx,1);R.ambience.connect(R.bus);
 R.combat=gain(ctx,1);R.density=gain(ctx,1);R.combat.connect(R.density).connect(R.bus);
 R.cue=gain(ctx,1);R.cue.connect(R.bus);R.ui=gain(ctx,1);R.ui.connect(R.bus);
 const dl=ctx.createDelay(1),dr=ctx.createDelay(1),mix=ctx.createChannelMerger(2);
 dl.delayTime.value=dr.delayTime.value=STEP*3;
 R.dlyIn=filt(ctx,'highpass',300,.6);R.dlyIn.connect(dl);dl.connect(gain(ctx,.30)).connect(dr);dr.connect(filt(ctx,'lowpass',2200,.5)).connect(gain(ctx,.30)).connect(dl);
 dl.connect(mix,0,0);dr.connect(mix,0,1);mix.connect(gain(ctx,.23)).connect(R.musicIn);
 const reverb=ctx.createConvolver();reverb.buffer=makeIR(ctx,1.65);R.revIn=filt(ctx,'highpass',300,.6);R.revIn.connect(reverb).connect(gain(ctx,.22)).connect(R.musicIn);
 R.echo=ctx.createDelay(.5);R.echo.delayTime.value=.18;const echoLP=filt(ctx,'lowpass',2300,.6);R.echoFeedback=gain(ctx,.22);R.fxReturn=gain(ctx,0);
 R.echo.connect(echoLP);echoLP.connect(R.echoFeedback).connect(R.echo);echoLP.connect(gain(ctx,.24)).connect(R.fxReturn).connect(R.combat);
 return R;
}
function makeIR(ctx, secs) {
  const sr = ctx.sampleRate, n = Math.floor(sr * secs), ir = ctx.createBuffer(2, n, sr), rnd = mulberry32(0x1e57);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = Math.floor(sr * 0.012), lp = 0; i < n; i++) {
      const x = i / n;
      lp += (0.6 - 0.5 * x) * (rnd() * 2 - 1 - lp); // tail darkens over time
      d[i] = lp * (1 - x) ** 2.5;
    }
  }
  return ir;
}


function env(param,t,peak,attack,decay,hold=0){
 const p=Math.max(peak,1e-5),end=t+attack+hold+decay;
 param.value=0;param.setValueAtTime(0,t);param.linearRampToValueAtTime(p,t+attack);if(hold)param.setValueAtTime(p,t+attack+hold);
 param.exponentialRampToValueAtTime(p*.001,end);param.linearRampToValueAtTime(0,end+.008);return end+.008;
}
function tone(ctx,out,t,{f,f1,type='sine',a=.007,d=.16,hold=0,peak=.1,glide=.08,lp}){
 const g=gain(ctx,0),end=env(g.gain,t,peak,a,d,hold),filter=lp?filt(ctx,'lowpass',lp,.6):null,o=own(ctx,ctx.createOscillator());
 o.type=type;o.frequency.value=f;if(f1){o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f1,t+glide);}
 o.connect(filter||g);if(filter)filter.connect(g);g.connect(out);o.start(t);o.stop(end);
 o.onended=()=>{o.disconnect();filter?.disconnect();g.disconnect();};return end;
}
function hiss(ctx,out,t,{f=1600,f1,q=.6,a=.012,d=.12,hold=0,peak=.08,type='bandpass',sweep=.12}){
 const filter=filt(ctx,type,f,q),g=gain(ctx,0),source=own(ctx,ctx.createBufferSource()),end=env(g.gain,t,peak,a,d,hold);
 source.buffer=rig(ctx).noise;source.loop=true;if(f1){filter.frequency.setValueAtTime(f,t);filter.frequency.exponentialRampToValueAtTime(f1,t+sweep);}
 source.connect(filter).connect(g).connect(out);source.start(t,(t*.731)%1.8);source.stop(end);source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();};return end;
}
function stringNote(ctx,out,t,midi,volume=.08,decay=1){
 const R=rig(ctx),key=Math.round(midi),sr=ctx.sampleRate,period=Math.max(2,Math.round(sr/mtof(key)));
 if(!R.strings.has(key)){
  const buffer=ctx.createBuffer(1,Math.floor(sr*1.8),sr),data=buffer.getChannelData(0),rnd=mulberry32(3001+key);
  for(let i=0;i<period;i++)data[i]=(rnd()*2-1)*.7;
  for(let i=period;i<data.length;i++)data[i]=.496*(data[i-period]+data[i-period+1]);
  if(R.strings.size>=32)R.strings.delete(R.strings.keys().next().value);R.strings.set(key,buffer);
 }
 const source=own(ctx,ctx.createBufferSource()),g=gain(ctx,0),end=env(g.gain,t,volume*1.8,.006,Math.min(1.65,decay));
 source.buffer=R.strings.get(key);source.connect(g).connect(out);source.start(t);source.stop(end);source.onended=()=>{source.disconnect();g.disconnect();};return end;
}
function chime(ctx,out,t,f=660,volume=.06,decay=.7){
 let end=t;for(const [ratio,level]of [[1,1],[2.01,.26],[3.97,.06]])end=Math.max(end,tone(ctx,out,t,{f:f*ratio,a:.008,d:decay/Math.sqrt(ratio),peak:volume*level,lp:4800}));return end;
}
// A soft bamboo-like lead: one harmonic wave, breath and gently delayed vibrato.
// Oscillators keep synthesis off the game thread; the waveform is shared per context.
function bambooNote(ctx,out,t,midi,volume=.055,length=.5){
 const R=rig(ctx),f=mtof(midi),end=t+length+.23;
 if(!R.bambooWave)R.bambooWave=ctx.createPeriodicWave(new Float32Array(6),Float32Array.from([0,1,.20,.065,.022,.008]));
 const source=own(ctx,ctx.createOscillator()),vibrato=own(ctx,ctx.createOscillator()),depth=gain(ctx,0),g=gain(ctx,0),filter=filt(ctx,'lowpass',3400,.5);
 source.setPeriodicWave(R.bambooWave);source.frequency.setValueAtTime(f*.995,t);source.frequency.linearRampToValueAtTime(f,t+.08);
 vibrato.frequency.value=4.7;depth.gain.setValueAtTime(0,t);depth.gain.linearRampToValueAtTime(f*.0022,t+.25);vibrato.connect(depth).connect(source.frequency);
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.055);g.gain.linearRampToValueAtTime(volume*.78,t+length);
 g.gain.exponentialRampToValueAtTime(.00001,end);g.gain.linearRampToValueAtTime(0,end+.008);
 source.connect(filter).connect(g).connect(out);source.start(t);source.stop(end+.008);vibrato.start(t);vibrato.stop(end+.008);
 source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();vibrato.disconnect();depth.disconnect();};
 return Math.max(end+.008,hiss(ctx,out,t,{f:1200,q:.4,a:.06,hold:Math.max(0,length-.12),d:.16,peak:volume*.055}));
}
// Light struck-string colour, with the upper modes kept well below the body tone.
function hammeredNote(ctx,out,t,midi,volume=.025,decay=.65){
 let end=t;for(const [ratio,level,duration]of [[1,1,1],[2.006,.19,.62],[3.01,.055,.35]])end=Math.max(end,tone(ctx,out,t,{f:mtof(midi)*ratio,a:.007,d:decay*duration,peak:volume*level,lp:4200}));return end;
}
function woodTap(ctx,out,t,midi,volume=.035){
 return Math.max(tone(ctx,out,t,{f:mtof(midi),type:'triangle',a:.006,d:.075,peak:volume,lp:1800}),hiss(ctx,out,t,{f:700,q:.45,a:.006,d:.035,peak:volume*.15}));
}
// Shared D-minor/A resonances follow the approved 80 BPM score, with no melodic run on every hit.
function swordWind(ctx,out,t,f=1500,volume=.08){
 return Math.max(hiss(ctx,out,t,{f,f1:f*.88,sweep:.08,q:.5,a:.006,d:.075,peak:volume}),hiss(ctx,out,t,{f:470,q:.45,a:.009,d:.065,peak:volume*.22}),tone(ctx,out,t,{f:mtof(86),a:.006,d:.045,peak:volume*.07,lp:2700}));
}
function swordHit(ctx,out,t,heavy=false){
 const volume=heavy?.10:.066,metal=mtof(heavy?81:86);
 return Math.max(
  hiss(ctx,out,t,{f:1850,q:.45,a:.005,d:heavy?.060:.035,peak:volume*.40}),
  tone(ctx,out,t,{f:heavy?220:mtof(62),f1:heavy?196:undefined,glide:.035,a:.006,d:heavy?.13:.065,peak:volume*.68,lp:1500}),
  tone(ctx,out,t,{f:metal,a:.005,d:heavy?.27:.16,peak:volume*.55,lp:3700}),
  tone(ctx,out,t+.003,{f:metal*2.003,a:.006,d:.085,peak:volume*.065,lp:3800}),
  hammeredNote(ctx,out,t,heavy?74:81,volume*.22,heavy?.25:.13));
}
function reverseSword(ctx,out,t){
 const R=rig(ctx);if(!R.reverseSword){const sr=ctx.sampleRate,n=Math.floor(sr*.42),buffer=ctx.createBuffer(1,n,sr),data=buffer.getChannelData(0);for(let i=0;i<n;i++){const k=i/n,u=i/sr,envelope=k*k*Math.min(1,(1-k)/.09);data[i]=envelope*(Math.sin(u*mtof(74)*Math.PI*2)*.65+Math.sin(u*mtof(74)*2.003*Math.PI*2)*.23+Math.sin(u*mtof(74)*3.01*Math.PI*2)*.09);}R.reverseSword=buffer;}
 const source=own(ctx,ctx.createBufferSource()),g=gain(ctx,.07);source.buffer=R.reverseSword;source.connect(g).connect(out);source.start(t);source.onended=()=>{source.disconnect();g.disconnect();};return t+.42;
}
const VOICES={
 shoot:(c,o,t)=>swordWind(c,o,t,1700,.078),
 echoShoot:(c,o,t)=>swordWind(c,o,t,1250,.065),
 enemyShoot:(c,o,t)=>Math.max(swordWind(c,o,t,1050,.055),chime(c,o,t,mtof(77),.020,.20)),
 mirrorShoot:(c,o,t)=>swordWind(c,o,t,1350,.065),
 enemyHit:(c,o,t)=>swordHit(c,o,t,false),heavyHit:(c,o,t)=>swordHit(c,o,t,true),
 playerHurt:(c,o,t)=>Math.max(hiss(c,o,t,{f:650,q:.5,a:.009,d:.12,peak:.07}),tone(c,o,t,{f:240,f1:180,a:.008,d:.18,peak:.065})),
 danger:(c,o,t)=>Math.max(chime(c,o,t,mtof(74),.047,.25),chime(c,o,t+.13,mtof(81),.034,.22)),
 explode(c,o,t,size=.5){const s=clamp(num(size,.5),0,1);return Math.max(hiss(c,o,t,{f:850,f1:550,q:.55,a:.018,d:.20+s*.10,peak:.045+s*.025}),chime(c,o,t,mtof(62),.025+s*.018,.30+s*.12));},
 dash:(c,o,t)=>Math.max(hiss(c,o,t,{f:950,f1:1150,sweep:.14,q:.4,a:.016,d:.15,peak:.08}),hiss(c,o,t,{f:430,q:.45,a:.025,d:.12,peak:.027})),
 echoSpawn(c,o,t){let end=reverseSword(c,o,t);end=Math.max(end,chime(c,o,t+.33,mtof(74),.040,.85),bambooNote(c,o,t+.44,81,.034,.48),hammeredNote(c,o,t+.44,69,.026,.8));const send=gain(c,.09);o.connect(send).connect(rig(c).echo);return end;},
 trainTick:(c,o,t,p=0)=>hammeredNote(c,o,t,69+PENTA[Math.round(clamp(num(p,0),0,1)*4)],.019,.20),
 trainDone:(c,o,t)=>Math.max(stringNote(c,o,t,62,.065,.9),chime(c,o,t+.16,mtof(77),.038,.7)),
 predictBlip:(c,o,t)=>chime(c,o,t,mtof(74),.014,.16),
 uiHover:(c,o,t)=>woodTap(c,o,t,76,.018),uiClick:(c,o,t)=>Math.max(woodTap(c,o,t,69,.032),hammeredNote(c,o,t+.016,81,.012,.19)),
 roundStart:(c,o,t)=>chime(c,o,t,440,.055,.65),
 roundClear(c,o,t){let end=chime(c,o,t,330,.045,1.55);for(const [i,m]of [74,77,81,86].entries())end=Math.max(end,bambooNote(c,o,t+i*.18,m,.032,.27),hammeredNote(c,o,t+i*.18,m-12,.027,.7));return end;},
 leechDrain:(c,o,t)=>swordWind(c,o,t,650,.055),
 wardenShield:(c,o,t)=>chime(c,o,t,mtof(81),.030,.17),
 wardenBreak:(c,o,t)=>Math.max(swordHit(c,o,t,true),chime(c,o,t+.075,mtof(62),.048,.8),hiss(c,o,t,{f:1200,f1:700,q:.5,a:.012,d:.18,peak:.045})),
 callout:(c,o,t)=>chime(c,o,t,mtof(77),.032,.30),
 death:(c,o,t)=>Math.max(stringNote(c,o,t,50,.060,1.4),bambooNote(c,o,t+.12,62,.036,.65),chime(c,o,t+.20,220,.030,1.35)),
};

class Core{
 constructor(ctx,seed,settings=DEFAULT_AUDIO_SETTINGS){
  Object.assign(this,{ctx,R:buildRig(ctx),settings:sanitizeAudioSettings(settings),scene:'ambient',voices:[],retiring:[],garbage:[],retiredBuses:[],last:{},bus:null,playing:false,silent:false,step:0,t0:0,level:0,pending:0,stateDuck:0,eventUntil:0,eventAmount:0,densityTarget:1,theme:null,themeSource:null,themeFailed:false});
  this.stats={attempted:0,played:0,rateDropped:0,capDropped:0,sceneDropped:0,steals:0,peakVoices:0,peakRetiring:0,musicStarts:0,themeStarts:0,errors:0,perSound:{}};
  this.applySettings(this.settings,0,true);
 }
 applySettings(patch,t,initial=false){
  this.settings=sanitizeAudioSettings(patch,this.settings);const s=this.settings,R=this.R,d=initial?.004:.14;
  for(const [key,node]of [['master',R.master],['music',R.music],['combat',R.combat],['combat',R.cue],['ambience',R.ambience],['ui',R.ui]]){const value=key==='master'&&s.muted?0:s[key];if(initial)node.gain.value=value;else smooth(node.gain,value,t,d);}
  // Web Audio compression includes automatic makeup gain; compensate rather than making comfort louder.
  if(initial)R.makeup.gain.value=s.comfort?.78:1;else smooth(R.makeup.gain,s.comfort?.78:1,t,.22);
  const profile=(param,value,seconds)=>{if(initial)param.value=value;else smooth(param,value,t,seconds);};
  profile(R.bass.gain,s.comfort?-3:-1,.25);profile(R.presence.gain,s.comfort?-2.8:-.6,.25);profile(R.top.frequency,s.comfort?5600:9000,.25);
  for(const [key,value]of Object.entries({threshold:s.comfort?-16:-12,knee:s.comfort?14:10,ratio:s.comfort?3.1:2.4,attack:s.comfort?.008:.006,release:s.comfort?.30:.23}))profile(R.compressor[key],value,.22);
  this.silent=s.muted;this._automateDuck(t);
  const budget=voiceBudget(s.comfort);while(this.voices.length>budget.max){const v=[...this.voices].sort((a,b)=>a.priority-b.priority||a.started-b.started)[0];this.retire(v,t);}
 }
 startMusic(t){
  if(this.playing)return;
  const mk=(rev=0,delay=0)=>{const g=gain(this.ctx,1);g.connect(this.R.musicIn);if(rev)g.connect(gain(this.ctx,rev)).connect(this.R.revIn);if(delay)g.connect(gain(this.ctx,delay)).connect(this.R.dlyIn);return g;};
  this.bus={dry:mk(),room:mk(.22),echo:mk(.12,.22),pulse:mk(.10,.08),air:gain(this.ctx,1),theme:gain(this.ctx,0)};this.bus.air.connect(this.R.ambience);
  // The approved master already contains its room sound. Do not add the synth reverb/delay again.
  this.bus.theme.connect(this.R.duckLP);
  this.bus.pulse.gain.value=0;smooth(this.bus.pulse.gain,this.scene==='combat'?1:0,t,.35);
  this.playing=true;this.t0=t;this.step=0;this.stats.musicStarts++;this.attachTheme(t);
 }
 setTheme(buffer){this.theme=buffer;this.themeFailed=false;if(this.playing)this.attachTheme(this.ctx.currentTime);}
 attachTheme(t){
  if(!this.playing||!this.theme||this.themeSource)return;
  const source=this.ctx.createBufferSource(),at=Math.max(t,this.ctx.currentTime,this.t0);
  // Decode may finish after the requested start time: fade from the actual attachment.
  this.bus.theme.gain.setValueAtTime(0,at);this.bus.theme.gain.linearRampToValueAtTime(1,at+.18);
  source.buffer=this.theme;source.loop=true;source.loopStart=0;source.loopEnd=this.theme.duration;source.connect(this.bus.theme);
  source.start(at,Math.max(0,at-this.t0)%this.theme.duration);source.onended=()=>source.disconnect();this.themeSource=source;this.stats.themeStarts++;
 }
 stopMusic(t){if(!this.playing)return;if(this.themeSource){try{this.themeSource.stop(t+.24);}catch{}this.themeSource=null;}this.playing=false;for(const node of Object.values(this.bus))smooth(node.gain,0,t,.22);this.retiredBuses.push({bus:this.bus,end:t+3});this.bus=null;}
 setScene(scene,t){
  if(!AUDIO_SCENES.includes(scene)||scene===this.scene)return;this.scene=scene;
  for(const v of [...this.voices])if(!allowsSound(scene,v.name))this.retire(v,t);
  if(scene!=='combat')this.pending=0;
  if(this.bus)smooth(this.bus.pulse.gain,scene==='combat'?1:0,t,scene==='combat'?.35:.45);
  smooth(this.R.fxReturn.gain,scene==='combat'?1:0,t,.18);smooth(this.R.echoFeedback.gain,scene==='combat'?.22:0,t,.12);
  if(scene!=='combat'){this.eventUntil=t;this.eventAmount=0;this._automateDuck(t);}
 }
 setIntensity(level){this.pending=toLevel(level);}
 setDuck(amount,t){this.stateDuck=clamp(num(amount,0),0,1);this._automateDuck(t);}
 _automateDuck(t){
  const base=1-this.stateDuck*(this.settings.comfort?.22:.28),active=t<this.eventUntil?this.eventAmount:0;
  smooth(this.R.duckG.gain,base*(1-active),t,active?.08:.55);
  if(active)smooth(this.R.duckG.gain,base,this.eventUntil,.55);
  // Keep the score warm and intelligible instead of sweeping seven octaves down.
  smooth(this.R.duckLP.frequency,6500-this.stateDuck*1800,t,.35);
 }
 duckEvent(t){this.eventUntil=Math.max(this.eventUntil,t+.38);this.eventAmount=this.settings.comfort?.10:.15;this._automateDuck(t);}
 destroy(v){for(const node of v.nodes||[]){try{node.stop?.();}catch{}try{node.disconnect();}catch{}}try{v.out.disconnect();}catch{}}
 retire(v,t){const index=this.voices.indexOf(v);if(index>=0)this.voices.splice(index,1);smooth(v.out.gain,0,t,.024);this.retiring.push({...v,end:t+.032});this.stats.peakRetiring=Math.max(this.stats.peakRetiring,this.retiring.length);}
 clean(t){
  // Logical voice expiry may run ahead of the audio clock (especially offline).
  // Never disconnect a scheduled tail until the context has actually rendered it.
  const expire=v=>{if(v.end>t)return true;this.garbage.push(v);return false;};
  this.voices=this.voices.filter(expire);this.retiring=this.retiring.filter(expire);
  this.garbage=this.garbage.filter(v=>{if(v.end>this.ctx.currentTime)return true;this.destroy(v);return false;});
  this.retiredBuses=this.retiredBuses.filter(b=>{if(b.end>this.ctx.currentTime)return true;for(const n of Object.values(b.bus))n.disconnect();return false;});
  const target=densityGain(this.voices.filter(v=>v.category==='combat').length);if(target!==this.densityTarget){this.densityTarget=target;smooth(this.R.density.gain,target,t,target<this.R.density.gain.value?.065:.36);}
 }
 advance(until,now){
  this.clean(now??until);if(!this.playing)return;
  let t=this.t0+this.step*STEP;if(now!==undefined&&t<now+SFX_LEAD){this.step+=Math.ceil((now+SFX_LEAD-t)/STEP);t=this.t0+this.step*STEP;}
  for(;t<until;t=this.t0+(++this.step)*STEP)this._play(this.step,t);
 }
 _play(step,t){
  if(this.silent)return;const s=step%LOOP,sb=s%BAR,bar=s>>4;this.level=this.pending;
  const c=this.ctx,B=this.bus,root=[50,57,54,57,52,50,57,50][bar%8];
  // Only the very quiet wind is separate. The approved theme is one continuous source.
  if(s%32===0)hiss(c,B.air,t,{f:390,q:.4,a:.55,hold:.5,d:1.8,peak:.006});
  if(!this.themeFailed)return;
  // Quiet procedural fallback if a browser cannot decode the embedded MP3.
  for(const [position,pitch,length]of FLUTE_PHRASES[bar%8])if(sb===position)bambooNote(c,B.room,t,pitch,.056,length*STEP*.86);
  if(sb===0)stringNote(c,B.room,t,root,.034,1.4);
  if(sb===0||sb===8)hammeredNote(c,B.echo,t,root+24+(sb===8?7:0),.024,.80);
  if(sb===12&&bar%2===0)hammeredNote(c,B.echo,t,root+28,.017,.50);
  if(bar>=8&&bar%2===0&&sb===15)hammeredNote(c,B.room,t,86,.014,.25);
  if(this.scene!=='combat')return;
  if(sb%4===0)hammeredNote(c,B.pulse,t,root+12+PENTA[(Math.floor(s/4)+2)%5],.024,.45);
  if(sb%8===0)woodTap(c,B.pulse,t,50,.019);
  if(this.level>=3&&sb===10)stringNote(c,B.pulse,t,root+24,.025,.55);
 }
 sfx(name,t,args=[]){
  const rule=SOUND_RULES[name];if(!rule||!VOICES[name])return;this.stats.attempted++;
  if(!allowsSound(this.scene,name)){this.stats.sceneDropped++;return;}
  this.clean(t);const gapKey=name==='explode'?'dissolve':name;
  if(t-(this.last[gapKey]??-Infinity)<rule.gap){this.stats.rateDropped++;return;}
  const choice=selectVoiceSlot(this.voices,this.retiring.length,rule,this.settings.comfort);
  if(!choice.accept){this.stats.capDropped++;return;}if(choice.steal){this.retire(choice.steal,t);this.stats.steals++;}
  const nodes=[];this.R.scope=nodes;let out;
  try{
   out=gain(this.ctx,rule.level);out.connect(this.R[rule.category]);
   const end=VOICES[name](this.ctx,out,t,...args);if(!Number.isFinite(end)||end<=t)throw new Error('Invalid voice duration');
   this.voices.push({name,group:rule.group,category:rule.category,priority:rule.priority,started:t,end,out,nodes});this.last[gapKey]=t;
   this.stats.played++;this.stats.perSound[name]=(this.stats.perSound[name]||0)+1;this.stats.peakVoices=Math.max(this.stats.peakVoices,this.voices.length);
   if(rule.priority>=4&&rule.category==='cue')this.duckEvent(t);
  }catch(error){this.destroy({out:out||{disconnect(){}},nodes});this.stats.errors++;warn(error);}finally{this.R.scope=null;}
 }
 stopAll(t){for(const v of [...this.voices])this.retire(v,t);}
 diagnostics(){return {...this.stats,perSound:{...this.stats.perSound},active:this.voices.length,retiring:this.retiring.length,settings:{...this.settings},scene:this.scene,musicStep:this.step,musicOrigin:this.t0,cachedStrings:this.R.strings.size,themeId:this.theme?THEME_ID:null,themeDuration:this.theme?.duration||0,themeFailed:this.themeFailed,themePosition:this.theme&&this.playing?Math.max(0,this.ctx.currentTime-this.t0)%this.theme.duration:0};}
 dispatch(name,t,args=[]){
  if(name==='startMusic')this.startMusic(t);else if(name==='stopMusic')this.stopMusic(t);else if(name==='setScene')this.setScene(args[0],t);
  else if(name==='setIntensity')this.setIntensity(args[0]);else if(name==='setDuck')this.setDuck(args[0],t);
  else if(name==='setSettings')this.applySettings(args[0],t);else if(name==='setMuted')this.applySettings({muted:!!args[0]},t);
  else if(name==='setMasterVolume')this.applySettings({master:args[0]},t);else this.sfx(name==='enemyHit'&&args[0]>1?'heavyHit':name,t,args);
 }
}

export class AudioEngine{
 constructor(opts={}){
  this._storage=opts.storage;this._persist=opts.persist!==false;
  this._settings=sanitizeAudioSettings(opts.settings||{},this._persist?loadAudioSettings(this._storage):DEFAULT_AUDIO_SETTINGS);
  Object.assign(this,{_ctx:null,_core:null,_timer:null,_music:false,_level:0,_duck:0,_scene:'ambient',_hidden:false,lastRenderStats:null});
  this._hideSuspend=opts.suspendWhenHidden!==false;
  this._onVis=()=>{const c=this._ctx;if(!c||!this._hideSuspend)return;if(document.hidden&&c.state==='running'){this._hidden=true;quiet(c.suspend());}else if(!document.hidden&&this._hidden){this._hidden=false;quiet(c.resume());}};
 }
 get ready(){return !!this._ctx&&this._ctx.state==='running';}
 get muted(){return this._settings.muted;}
 get settings(){return {...this._settings};}
 get scene(){return this._scene;}
 get diagnostics(){return this._core?.diagnostics()||{active:0,retiring:0,musicStarts:0,settings:this.settings,scene:this.scene};}
 init(){
  try{
   const hasDoc=typeof document!=='undefined';
   if(!this._ctx){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return;const ctx=create(C,{latencyHint:'interactive'},[]),core=new Core(ctx,undefined,this._settings);this._ctx=ctx;this._core=core;
    loadTheme(ctx).then(buffer=>{if(this._ctx===ctx)core.setTheme(buffer);}).catch(error=>{if(this._ctx===ctx){core.themeFailed=true;warn(error);}});
    core.setIntensity(this._level);core.setScene(this._scene,ctx.currentTime);core.setDuck(this._duck,ctx.currentTime);if(this._music)core.startMusic(ctx.currentTime+.06);
    this._timer=setInterval(()=>this._tick(),TICK_MS);if(hasDoc)document.addEventListener('visibilitychange',this._onVis);
   }
   if(this._ctx.state!=='running'&&!(hasDoc&&document.hidden))quiet(this._ctx.resume());
  }catch(error){warn(error);}
 }
 setSettings(patch){this._settings=sanitizeAudioSettings(patch,this._settings);if(this._persist)saveAudioSettings(this._settings,this._storage);this._run((c,t)=>c.applySettings(this._settings,t));return this.settings;}
 setMuted(value){this.setSettings({muted:!!value});}
 toggleMute(){this.setMuted(!this.muted);return this.muted;}
 setMasterVolume(value){this.setSettings({master:value});}
 setScene(scene){if(!AUDIO_SCENES.includes(scene)||scene===this._scene)return;this._scene=scene;this._run((c,t)=>c.setScene(scene,t));}
 setIntensity(level){this._level=toLevel(level);this._run(c=>c.setIntensity(this._level));}
 setDuck(value){const d=clamp(num(value,0),0,1);if(d===this._duck)return;this._duck=d;this._run((c,t)=>c.setDuck(d,t));}
 startMusic(){this._music=true;this._run((c,t)=>c.startMusic(t+.06));this._tick();}
 stopMusic(){this._music=false;this._run((c,t)=>c.stopMusic(t));}
 shoot(){this._sfx('shoot');}echoShoot(){this._sfx('echoShoot');}enemyShoot(){this._sfx('enemyShoot');}
 enemyHit(weight=1){this._sfx(weight>1?'heavyHit':'enemyHit');}heavyHit(){this._sfx('heavyHit');}danger(){this._sfx('danger');}
 playerHurt(){this._sfx('playerHurt');}explode(size=.5){this._sfx('explode',[size]);}dash(){this._sfx('dash');}
 echoSpawn(){this._sfx('echoSpawn');}trainTick(p=0){this._sfx('trainTick',[p]);}trainDone(){this._sfx('trainDone');}
 predictBlip(){this._sfx('predictBlip');}uiHover(){this._sfx('uiHover');}uiClick(){this._sfx('uiClick');}
 roundStart(){this._sfx('roundStart');}roundClear(){this._sfx('roundClear');}death(){this._sfx('death');}
 leechDrain(){this._sfx('leechDrain');}mirrorShoot(){this._sfx('mirrorShoot');}wardenShield(){this._sfx('wardenShield');}wardenBreak(){this._sfx('wardenBreak');}callout(){this._sfx('callout');}
 async renderOfflineBuffer({duration,sampleRate=48000,events=[],seed=0x5e1f,settings=this.settings}={}){
  const C=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext,dur=num(duration,0);if(!C||dur<=0)return null;
  const ctx=create(C,{numberOfChannels:2,length:Math.ceil(dur*sampleRate),sampleRate},[2,Math.ceil(dur*sampleRate),sampleRate]),core=new Core(ctx,seed,sanitizeAudioSettings(settings));
  try{core.setTheme(await loadTheme(ctx));}catch(error){core.themeFailed=true;warn(error);}
  const sorted=events.filter(e=>e&&Number.isFinite(e.t)).slice().sort((a,b)=>a.t-b.t);let i=0;
  const scheduleTo=T=>{for(;i<sorted.length&&sorted[i].t<T;i++){const e=sorted[i],t=Math.max(0,e.t);core.advance(t);core.dispatch(e.name,t,[].concat(e.args??[]));}core.advance(T);};
  let first=dur;if(typeof ctx.suspend==='function'){try{for(let t=1;t<dur;t++)ctx.suspend(t).then(()=>{scheduleTo(Math.min(dur,t+2));return ctx.resume();});first=Math.min(dur,2);}catch{}}
  scheduleTo(first);const buffer=await new Promise((resolve,reject)=>{ctx.oncomplete=e=>resolve(e.renderedBuffer);try{ctx.startRendering()?.then?.(resolve,reject);}catch(e){reject(e);}});core.clean(dur+.01);this.lastRenderStats=core.diagnostics();return buffer;
 }
 async renderOfflineWav(options){const b=await this.renderOfflineBuffer(options);return b?encodeWav(b):null;}
 dispose(){if(this._timer!==null)clearInterval(this._timer);this._timer=null;if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this._onVis);this._run((c,t)=>{c.stopAll(t);c.stopMusic(t);});quiet(this._ctx?.close());this._ctx=null;this._core=null;}
 _run(fn){try{if(this._core)fn(this._core,this._ctx.currentTime);}catch(error){warn(error);}}
 _sfx(name,args=[]){if(this.ready&&!this.muted&&allowsSound(this._scene,name))this._run((c,t)=>c.sfx(name,t+SFX_LEAD,args));}
 _tick(){if(this.ready)this._run((c,t)=>c.advance(t+AHEAD,t));}
}
/** AudioBuffer (or anything with numberOfChannels/length/sampleRate/getChannelData) → 16-bit PCM WAV. */
export function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate, bytes = n * ch * 2;
  const out = new ArrayBuffer(44 + bytes), v = new DataView(out);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + bytes, true);
  str(8, 'WAVEfmt ');
  [[16, 16, 4], [20, 1, 2], [22, ch, 2], [24, sr, 4], [28, sr * ch * 2, 4], [32, ch * 2, 2], [34, 16, 2]].forEach(([o, val, size]) =>
    size === 4 ? v.setUint32(o, val, true) : v.setUint16(o, val, true)); // fmt chunk: PCM, channels, rate, byte rate, align, bits
  str(36, 'data');
  v.setUint32(40, bytes, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  for (let i = 0, o = 44; i < n; i++) {
    for (let c = 0; c < ch; c++, o += 2) v.setInt16(o, Math.round((clamp(data[c][i], -1, 1) || 0) * 32767), true);
  }
  return out;
}
