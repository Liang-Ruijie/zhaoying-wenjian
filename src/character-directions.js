// Six usable atlas views, with symmetric left diagonals. Shared immutable lookup.
const VIEWS=Object.freeze([
 {frame:0,flip:false},{frame:7,flip:false},{frame:6,flip:false},{frame:5,flip:false},
 {frame:4,flip:false},{frame:5,flip:true},{frame:2,flip:false},{frame:7,flip:true},
].map(Object.freeze));
export function characterHeading(x,z,previous=null){
 const angle=Math.atan2(x,z),step=Math.PI/4;
 if(previous!==null){const delta=((angle-previous*step+Math.PI*3)%(Math.PI*2))-Math.PI;if(Math.abs(delta)<step*.65)return previous;}
 return ((Math.round(angle/step)%8)+8)%8;
}
export function characterDirection(x,z){return VIEWS[characterHeading(x,z)];}
export function viewForHeading(heading){return VIEWS[heading];}
