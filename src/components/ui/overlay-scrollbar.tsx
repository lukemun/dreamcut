"use client";
import {useEffect, useRef, useState, type RefObject} from "react";

/** An accessible scrollbar that overlays, rather than narrows, its scroll viewport. */
export function OverlayScrollbar({target, contentHeight, label, controls}: {controls:string;target:RefObject<HTMLDivElement|null>;contentHeight:number;label:string}) {
  const [metrics,setMetrics]=useState({height:0,total:0,top:0});
  const drag=useRef<{y:number;top:number}|null>(null);
  useEffect(()=>{
    const node=target.current;if(!node)return;
    const update=()=>setMetrics({height:node.clientHeight,total:node.scrollHeight,top:node.scrollTop});
    update();node.addEventListener("scroll",update,{passive:true});
    const observer=new ResizeObserver(update);observer.observe(node);
    return()=>{node.removeEventListener("scroll",update);observer.disconnect();};
  },[target,contentHeight]);
  const max=Math.max(0,metrics.total-metrics.height);
  const thumb=Math.min(metrics.height,Math.max(28,metrics.height*metrics.height/Math.max(1,metrics.total)));
  const travel=metrics.height-thumb;
  if(max===0)return null;
  const move=(value:number)=>{if(target.current)target.current.scrollTop=Math.max(0,Math.min(max,value));};
  return <div className="overlay-scrollbar" role="scrollbar" aria-controls={controls} aria-label={label} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(metrics.top)} tabIndex={0}
    onKeyDown={e=>{const next=e.key==="Home"?0:e.key==="End"?max:e.key==="ArrowUp"?metrics.top-40:e.key==="ArrowDown"?metrics.top+40:e.key==="PageUp"?metrics.top-metrics.height:e.key==="PageDown"?metrics.top+metrics.height:null;if(next!==null){e.preventDefault();e.stopPropagation();move(next);}}}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.focus();const y=e.clientY-e.currentTarget.getBoundingClientRect().top;const top=metrics.top/max*travel;if(y<top||y>top+thumb)move((y-thumb/2)/Math.max(1,travel)*max);drag.current={y:e.clientY,top:target.current?.scrollTop??0};e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e=>{if(drag.current)move(drag.current.top+(e.clientY-drag.current.y)/Math.max(1,travel)*max);}}
    onPointerUp={e=>{drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}>
    <span style={{height:thumb,transform:`translateY(${metrics.top/max*travel}px)`}} />
  </div>;
}
