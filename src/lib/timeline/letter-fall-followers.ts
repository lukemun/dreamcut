import { deriveGravityDrop } from "./gravity-drop";
import { letterFallLastRelease, type LetterFallOrder } from "./letter-fall";
import { readKeyframeMap, resolveNumberKeyframe } from "./keyframes";

/** The wave continues into a linked object one stagger after the final glyph.
 * Recompute from the caption clock so tuning its stagger moves the dish too. */
export function resolveLetterFallFollowers<T extends {id:string; timeline_start:number; duration:number; props?:Record<string,unknown>|null}>(elements:T[], strict=false):T[] {
  return elements.map(element => {
    const id=element.props?.gravity_drop_after_text_id;
    if(typeof id!=="string")return element;
    const text=elements.find(candidate=>candidate.id===id);
    const start=text?.props?.letter_fall_start_seconds;
    if(!text || typeof start!=="number") {
      if(strict)throw new Error("Food fall requires its linked falling label");
      return element;
    }
    const stagger=Number(text.props?.letter_fall_stagger_seconds??.04);
    const order=(text.props?.letter_fall_order??"outside_in") as LetterFallOrder;
    const local=text.timeline_start-element.timeline_start+start+
      letterFallLastRelease(String(text.props?.text??""),stagger,order)+stagger;
    const seconds=Number(element.props?.gravity_drop_seconds??.45);
    if(local<0 || local+seconds>element.duration+1e-6) {
      if(strict)throw new Error("Linked food fall must finish within the clip");
      return element;
    }
    const props=element.props??{};
    const map=readKeyframeMap(props);
    const oldStart=Number(props.gravity_drop_start_seconds??local);
    const initial=resolveNumberKeyframe(props,"media_offset_y",oldStart,Number(props.media_offset_y??0));
    const base={...props,keyframes:{...map,media_offset_y:[...(map.media_offset_y??[]).filter(p=>p.t<oldStart),{t:oldStart,v:initial,ease:"hold" as const}]}};
    return {...element,props:deriveGravityDrop(base,local,seconds)};
  });
}
