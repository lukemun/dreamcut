import assert from "node:assert/strict";
import test from "node:test";
import {findCursor,followCentres,simplifyTrack,type CursorSample} from "./cursor-track";

/** A dark screen with the system arrow drawn at (px, py), tip first. */
function screenWithArrow(width:number,height:number,px:number,py:number){
 const frame=new Uint8Array(width*height).fill(40);
 const arrow=["##........","###.......","#o##......","#oo##.....","#ooo##....","#oooo##...","#ooooo##..","#oooooo##.","#ooooooo##","#oooooooo#","#ooooo####","#ooooo###.","#o###oo#..","###.#oo#..","....#ooo#.",".....#oo#.",".....###.."];
 arrow.forEach((row,y)=>[...row].forEach((cell,x)=>{if(cell!==".")frame[(py+y)*width+px+x]=cell==="#"?250:5;}));
 return frame;
}

test("finds the arrow pointer's tip and ignores a lit tile corner", () => {
 const width=320,height=200,frame=screenWithArrow(width,height,200,60);
 for(let y=120;y<180;y++)for(let x=20;x<90;x++)frame[y*width+x]=230;
 const hit=findCursor(frame,width,height,null);
 assert.equal(hit?.cursor,"arrow");
 assert.deepEqual([Math.round(hit!.x*width),Math.round(hit!.y*height)],[200,60]);
 assert.equal(findCursor(new Uint8Array(width*height).fill(40).map((_,i)=>i%width>40&&i%width<120&&i/width>50?230:40),width,height,null),null);
});

test("the follow camera leans toward the pointer, settles without overshoot and stays in frame", () => {
 const samples:CursorSample[]=Array.from({length:60},(_,i)=>({t:i/10,x:i<10?0.5:0.95,y:0.5,seen:true}));
 const half=()=>({x:0.25,y:0.25,width:0.5,height:0.5});
 const views=followCentres(samples,half,{follow:1,smoothing:0.8,dead_zone:0});
 const lefts=views.map(view=>view.x);
 assert.equal(lefts[0],0.25);
 assert.ok(lefts.every((left,i)=>i===0||left>=lefts[i-1]!-1e-9),"glides one way");
 assert.ok(Math.max(...lefts)<=0.5+1e-9,"never leaves the source frame");
 assert.ok(Math.abs(lefts.at(-1)!-0.5)<0.01,"settles on the clamped pointer");
 assert.ok(lefts[10]!<0.3,"eases out rather than jumping");
 const still=followCentres(samples,half,{follow:0,smoothing:0.8,dead_zone:0});
 assert.ok(still.every(view=>view.x===0.25),"follow 0 keeps the plain framing");
 const whole=followCentres(samples,()=>({x:0,y:0,width:1,height:1}),{follow:1,smoothing:0.8,dead_zone:0});
 assert.ok(whole.every(view=>view.x===0&&view.y===0),"a whole-frame view cannot move");
});

test("small pointer moves inside the dead zone leave the camera still", () => {
 const samples:CursorSample[]=Array.from({length:40},(_,i)=>({t:i/10,x:0.5+(i%2?0.05:-0.05),y:0.5,seen:true}));
 const views=followCentres(samples,()=>({x:0.25,y:0.25,width:0.5,height:0.5}),{follow:1,smoothing:0.5,dead_zone:0.4});
 assert.ok(views.every(view=>Math.abs(view.x-0.25)<1e-9));
});

test("simplifying keeps the shape within tolerance with far fewer keys", () => {
 const points=Array.from({length:101},(_,i)=>({t:i/10,v:i<50?0:Math.min(1,(i-50)/20)}));
 const kept=simplifyTrack(points,0.001);
 assert.ok(kept.length<=5);
 assert.deepEqual([kept[0],kept.at(-1)],[points[0],points.at(-1)]);
});

test("the lean fades with the zoom and stays inside the given bounds", () => {
 const samples:CursorSample[]=Array.from({length:40},(_,i)=>({t:i/10,x:0.95,y:0.5,seen:true}));
 const app={x:0.1,y:0.1,width:0.8,height:0.8};
 const wide=followCentres(samples,()=>({...app,pull:0}),{follow:1,smoothing:0.5,dead_zone:0},app);
 assert.ok(wide.every(view=>view.x===app.x&&view.y===app.y),"the unzoomed framing holds still");
 const zoomed=followCentres(samples,()=>({x:0.3,y:0.3,width:0.4,height:0.4,pull:1}),{follow:1,smoothing:0.5,dead_zone:0},app);
 assert.ok(zoomed.every(view=>view.x+view.width<=app.x+app.width+1e-9),"never past the app window");
 assert.ok(Math.abs(zoomed.at(-1)!.x-0.5)<0.01,"leans to the bound");
});
