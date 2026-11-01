// Shared, seeded art primitives. Texture creation never touches gameplay RNG.
import * as THREE from 'three';
const cache=new Map();
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const hash=(x,y)=>{let n=Math.imul(x,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
function noise(x,y){const ix=Math.floor(x),iy=Math.floor(y),u=smooth(0,1,x-ix),v=smooth(0,1,y-iy);return(1-v)*((1-u)*hash(ix,iy)+u*hash(ix+1,iy))+v*((1-u)*hash(ix,iy+1)+u*hash(ix+1,iy+1));}
export function mistOpacity(x,y,kind='wash'){
 const r=Math.hypot(x,y),n=noise(x*4+17,y*4+23)*.68+noise(x*10+41,y*10+11)*.32;
 if(kind==='boundary'){
  const distortion=(n-.5)*.19+.028*Math.sin(x*9+y*4);
  return smooth(.44,.78,r+distortion)*(1-smooth(.84,1.12,r))*(.22+n*.42)*(1-smooth(.84,1,Math.max(Math.abs(x),Math.abs(y))));
 }
 if(kind==='ward')return smooth(.32,.76,r+(n-.5)*.18)*(1-smooth(.80,1.09,r))*(.25+n*.55)*(.12+.88*smooth(.30,.64,noise(x*2.2+3,y*2.2+8)));
 return Math.exp(-r*r*4.4)*(1-smooth(.55,1.03,r+(n-.5)*.12))*(.42+n*.58);
}
export function mistTexture(kind='wash'){
 const key=`mist:${kind}`;if(cache.has(key))return cache.get(key);
 const size=kind==='boundary'?512:128,cv=document.createElement('canvas');cv.width=cv.height=size;
 const g=cv.getContext('2d'),image=g.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4;image.data[i]=image.data[i+1]=image.data[i+2]=255;
  image.data[i+3]=Math.round(mistOpacity((x+.5)/size*2-1,(y+.5)/size*2-1,kind)*255);
 }
 g.putImageData(image,0,0);const texture=new THREE.CanvasTexture(cv);texture.colorSpace=THREE.SRGBColorSpace;cache.set(key,texture);return texture;
}
export function runeTexture(glyph='敕'){
 const key=`rune:${glyph}`;if(cache.has(key))return cache.get(key);
 const cv=document.createElement('canvas');cv.width=128;cv.height=224;const g=cv.getContext('2d');
 g.fillStyle='#eee2c7';g.beginPath();g.moveTo(9,5);g.lineTo(119,9);g.lineTo(123,211);g.lineTo(65,220);g.lineTo(6,214);g.closePath();g.fill();
 g.strokeStyle='#ac5845';g.lineWidth=3;g.strokeRect(19,21,90,178);g.fillStyle='#884333';g.font='74px "Songti SC",serif';g.textAlign='center';g.fillText(glyph,64,130);
 g.lineWidth=2;for(let i=0;i<3;i++){g.beginPath();g.moveTo(39-i*5,156+i*10);g.lineTo(89+i*5,156+i*10);g.stroke();}
 const texture=new THREE.CanvasTexture(cv);texture.colorSpace=THREE.SRGBColorSpace;cache.set(key,texture);return texture;
}
