import {execFileSync,spawn} from "node:child_process";

/**
 * Find the mouse pointer in a screen recording. Decodes a gray copy at half size (where the system
 * pointer is ~20 px) and matches two masked templates: the arrow (white outline, black fill) and the
 * pointing hand shown over links (white fill, dark ring). A template scores the share of its outline
 * pixels that are bright plus the share of its fill pixels that are dark, so 2 is a perfect match.
 * Writes nothing; positions are fractions of the source frame, at the pointer's tip.
 */

type Template={name:"arrow"|"hand";bright:Int32Array;dark:Int32Array;gaps:Int32Array;hot:[number,number];width:number;height:number;threshold:number};

// "#" = must be bright (> 150), "o" = must be dark (< 70), "x" = dark and required (the dark either side of
// the hand's raised finger, which tells it from a lit tile corner), "." = ignored.
const ARROW=[
 "##........",
 "###.......",
 "#o##......",
 "#oo##.....",
 "#ooo##....",
 "#oooo##...",
 "#ooooo##..",
 "#oooooo##.",
 "#ooooooo##",
 "#oooooooo#",
 "#ooooo####",
 "#ooooo###.",
 "#o###oo#..",
 "###.#oo#..",
 "....#ooo#.",
 ".....#oo#.",
 ".....###..",
];
const HAND=[
 ".ooo........",
 ".o..x.......",
 "ox#.x.......",
 "ox#.x.......",
 ".x#.x.......",
 "ox#.ooo.....",
 "ox#..#ooo...",
 ".o#..#.#.oo.",
 ".o#..#.#...o",
 ".o######.#.o",
 ".o########.o",
 "#.########.o",
 "##########.o",
 "##########.o",
 "##########.o",
 ".#########oo",
 "o.#######.o.",
 "oo.####..o..",
 "..ooooooo...",
];

function template(name:Template["name"],rows:string[],hot:[number,number],threshold:number):Template{
 const bright:number[]=[],dark:number[]=[],gaps:number[]=[];
 rows.forEach((row,y)=>[...row].forEach((cell,x)=>{
  if(cell==="#")bright.push(x-hot[0],y-hot[1]);
  if(cell==="o"||cell==="x")dark.push(x-hot[0],y-hot[1]);
  if(cell==="x")gaps.push(x-hot[0],y-hot[1]);
 }));
 return {name,bright:Int32Array.from(bright),dark:Int32Array.from(dark),gaps:Int32Array.from(gaps),hot,width:Math.max(...rows.map(row=>row.length)),height:rows.length,threshold};
}
// The hand's one-pixel finger blurs under scaling, so it scores a little lower than the arrow when right.
const TEMPLATES=[template("arrow",ARROW,[0,0],1.7),template("hand",HAND,[2,2],1.6)];
const BRIGHT=150,DARK=70,WINDOW=160,STRICTER_FAR=0.08;

export type CursorHit={x:number;y:number;score:number;cursor:Template["name"]};

/** Score one template at one pointer position; stops early once it can no longer reach the threshold. */
function score(frame:Uint8Array,width:number,px:number,py:number,t:Template,threshold:number){
 // The tip is always drawn bright; checking it first rejects nearly every position in one read.
 if(frame[py*width+px]!<=BRIGHT)return 0;
 let gapMiss=0;
 for(let i=0;i<t.gaps.length;i+=2)if(frame[(py+t.gaps[i+1]!)*width+px+t.gaps[i]!]!>=DARK&&++gapMiss*4>t.gaps.length/2)return 0;
 const budget=2-threshold,nb=t.bright.length/2,nd=t.dark.length/2;let missB=0,missD=0;
 const most=Math.max(nb,nd);
 for(let i=0;i<most;i++){
  if(i<nd&&frame[(py+t.dark[2*i+1]!)*width+px+t.dark[2*i]!]!>=DARK&&(++missD/nd+missB/nb)>budget)return 0;
  if(i<nb&&frame[(py+t.bright[2*i+1]!)*width+px+t.bright[2*i]!]!<=BRIGHT&&(missD/nd+(++missB)/nb)>budget)return 0;
 }
 return 2-missB/nb-missD/nd;
}

function search(frame:Uint8Array,width:number,height:number,box:{x0:number;y0:number;x1:number;y1:number},extra:number){
 let best:{x:number;y:number;score:number;cursor:Template["name"]}|null=null;
 for(const t of TEMPLATES){
  const threshold=t.threshold+extra;
  const x0=Math.max(box.x0,t.hot[0]),y0=Math.max(box.y0,t.hot[1]),x1=Math.min(box.x1,width-t.width+t.hot[0]),y1=Math.min(box.y1,height-t.height+t.hot[1]);
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   const value=score(frame,width,x,y,t,threshold);
   if(value>=threshold&&(!best||value>best.score))best={x,y,score:value,cursor:t.name};
  }
 }
 return best;
}

/**
 * Find the pointer in one gray frame. Looks near the last position first; a jump elsewhere must
 * score a little higher, which keeps text and window corners from pulling the track away.
 */
export function findCursor(frame:Uint8Array,width:number,height:number,last?:{x:number;y:number}|null):CursorHit|null{
 let hit=last?search(frame,width,height,{x0:Math.round(last.x*width)-WINDOW,y0:Math.round(last.y*height)-WINDOW,x1:Math.round(last.x*width)+WINDOW,y1:Math.round(last.y*height)+WINDOW},0):null;
 hit??=search(frame,width,height,{x0:0,y0:0,x1:width,y1:height},last?STRICTER_FAR:0);
 return hit?{x:hit.x/width,y:hit.y/height,score:Math.round(hit.score*1000)/1000,cursor:hit.cursor}:null;
}

export type CursorSample={t:number;x:number;y:number;seen:boolean};

/**
 * Track the pointer through a source window: `t` is seconds after `start`. Frames where it is not
 * found (typing, hidden, off screen) keep the last position with seen=false.
 */
export async function trackCursor(file:string,start:number,duration:number,fps=10):Promise<CursorSample[]>{
 // Measure the file itself: a clip's recorded size can be its preview copy's, and the templates need the recording's pixels.
 const [probedWidth,probedHeight]=execFileSync("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","csv=p=0",file],{encoding:"utf8"}).trim().split(",").map(Number);
 if(!probedWidth||!probedHeight)throw new Error("Could not measure the screen recording");
 const source={width:probedWidth,height:probedHeight};
 const width=Math.max(2,Math.round(source.width/4)*2),height=Math.max(2,Math.round(source.height/4)*2),size=width*height;
 const child=spawn("ffmpeg",["-v","error","-ss",start.toFixed(3),"-t",duration.toFixed(3),"-i",file,"-vf",`fps=${fps},scale=${width}:${height}:flags=lanczos,format=gray`,"-f","rawvideo","-"],{stdio:["ignore","pipe","pipe"]});
 const samples:CursorSample[]=[];let pending:Buffer=Buffer.alloc(0),last:{x:number;y:number}|null=null,errors="";
 child.stderr.on("data",chunk=>{errors+=chunk;});
 for await(const chunk of child.stdout as AsyncIterable<Buffer>){
  pending=pending.length?Buffer.concat([pending,chunk]):chunk;
  while(pending.length>=size){
   const hit=findCursor(new Uint8Array(pending.buffer,pending.byteOffset,size),width,height,last);
   if(hit)last={x:hit.x,y:hit.y};
   samples.push({t:samples.length/fps,x:last?.x??0.5,y:last?.y??0.5,seen:!!hit});
   pending=pending.subarray(size);
  }
 }
 const code:number=await new Promise(resolve=>child.exitCode!==null?resolve(child.exitCode):child.on("close",resolve));
 if(code!==0)throw new Error(`Could not read the screen recording: ${errors.trim().slice(0,300)||`ffmpeg exited ${code}`}`);
 // Before the first sighting, hold where it is first seen rather than the frame centre.
 const first=samples.find(sample=>sample.seen);
 if(first)for(const sample of samples){if(sample.seen)break;sample.x=first.x;sample.y=first.y;}
 return samples;
}

/**
 * A camera that leans toward the pointer with weight: it ignores small moves inside a dead zone, then
 * glides with a critically damped spring, so it settles without overshoot. `follow` 0 stays put, 1
 * centres the pointer; `smoothing` is the spring's settle time in seconds. The spring moves only the
 * lean, so the framing's own push-ins keep their timing; `pull` (0–1, default 1) scales the lean at
 * each moment and `bounds` is the part of the source the view must stay inside (default the frame).
 */
export function followCentres(samples:readonly CursorSample[],anchor:(t:number)=>{x:number;y:number;width:number;height:number;pull?:number},
 options:{follow:number;smoothing:number;dead_zone:number},bounds={x:0,y:0,width:1,height:1}){
 const omega=4/Math.max(0.05,options.smoothing);
 let x:number|null=null,y=0,vx=0,vy=0,goalX=0,goalY=0,previous=0;
 return samples.map(sample=>{
  const region=anchor(sample.t),cx=region.x+region.width/2,cy=region.y+region.height/2,weight=options.follow*(region.pull??1);
  // Lean toward the pointer only once it leaves the middle of the view; the zone scales with the zoom.
  const dx=sample.x-cx,dy=sample.y-cy,zx=region.width/2*options.dead_zone,zy=region.height/2*options.dead_zone;
  const wantX=weight*Math.sign(dx)*Math.max(0,Math.abs(dx)-zx),wantY=weight*Math.sign(dy)*Math.max(0,Math.abs(dy)-zy);
  if(x===null){x=wantX;y=wantY;goalX=wantX;goalY=wantY;previous=sample.t;}
  else{
   // Hold the goal while the pointer stays within the dead zone of where the camera is heading.
   if(Math.abs(wantX-goalX)>zx*0.5||Math.abs(wantY-goalY)>zy*0.5||options.dead_zone===0||weight===0){goalX=wantX;goalY=wantY;}
   const dt=sample.t-previous;previous=sample.t;
   for(let step=0,steps=Math.max(1,Math.ceil(dt/0.01));step<steps;step++){
    const h=dt/steps;
    vx+=(omega*omega*(goalX-x)-2*omega*vx)*h;vy+=(omega*omega*(goalY-y)-2*omega*vy)*h;
    x+=vx*h;y+=vy*h;
   }
  }
  // Keep the view inside the bounds; a view as large as the bounds therefore never moves.
  const fit=(own:number,lean:number,size:number,low:number,span:number)=>size>=span-1e-9?own:Math.min(Math.max(own+lean,low),low+span-size);
  const left=fit(region.x,x,region.width,bounds.x,bounds.width),top=fit(region.y,y,region.height,bounds.y,bounds.height);
  return {t:sample.t,x:left,y:top,width:region.width,height:region.height};
 });
}

/** Drop keys a straight line between their neighbours already explains (Ramer–Douglas–Peucker). */
export function simplifyTrack(points:readonly {t:number;v:number}[],tolerance:number):{t:number;v:number}[]{
 if(points.length<=2)return [...points];
 const keep=new Uint8Array(points.length);keep[0]=1;keep[points.length-1]=1;
 const stack:[number,number][]=[[0,points.length-1]];
 while(stack.length){
  const [a,b]=stack.pop()!;let worst=-1,at=-1;
  for(let i=a+1;i<b;i++){
   const p=points[i]!,pa=points[a]!,pb=points[b]!;
   const line=pa.v+(pb.v-pa.v)*(p.t-pa.t)/(pb.t-pa.t),error=Math.abs(p.v-line);
   if(error>worst){worst=error;at=i;}
  }
  if(worst>tolerance){keep[at]=1;stack.push([a,at],[at,b]);}
 }
 return points.filter((_,index)=>keep[index]);
}
