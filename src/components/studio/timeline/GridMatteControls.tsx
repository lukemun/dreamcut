'use client';
import { GRID_MATTE_DEFAULTS, GRID_MATTE_RANGES } from '@/lib/timeline/grid-matte';
import { InspectorEffectNumber } from './InspectorEffectNumber';
import { InspectorPropertyControl } from './InspectorPropertyControl';
import { InspectorItemHeader } from './InspectorHierarchy';
import { Button } from '@/components/ui/button';
const rows = [
  ["grid_matte_cell_size", "Cell size"],
  ["grid_matte_coverage", "Mask coverage"],
  ["grid_matte_line_opacity", "Grid strength"],
  ["grid_matte_line_width", "Grid width"],
] as const;
export function GridMatteControls({props,onPreview,onPatch}:{props:Record<string,unknown>;onPreview:(patch:Record<string,unknown>|null)=>void;onPatch:(patch:Record<string,unknown>)=>void}) {
  if(!props.grid_matte_mask)return null;
  const active=props.grid_matte_enabled!==false && Number(props.grid_matte_cell_size??0)>0;
  return <div className="grid gap-3" role="group" aria-label="Moving Grid Matte effect">
    <InspectorItemHeader title="Moving Grid Matte" enabled={active} onEnabledChange={enabled=>onPatch({grid_matte_enabled:enabled,...(enabled && !Number(props.grid_matte_cell_size)?{grid_matte_cell_size:90}:{})})} actions={<Button variant="ghost" size="sm" onClick={()=>onPatch({...GRID_MATTE_DEFAULTS,grid_matte_enabled:true})}>Reset</Button>}/>
    {active?rows.map(([field,label])=>{
      const percent=field==='grid_matte_line_opacity',scale=percent?100:1;
      const value=Number(props[field]??GRID_MATTE_DEFAULTS[field])*scale;
      const [min,max]=GRID_MATTE_RANGES[field];
      return <InspectorPropertyControl key={field} fields={field} label={label} disabled={false} onReset={()=>onPatch({[field]:GRID_MATTE_DEFAULTS[field]})}>
        <InspectorEffectNumber label={label} value={value} min={field==='grid_matte_cell_size'?24:min*scale} max={max*scale} step={field==='grid_matte_coverage'?.05:field==='grid_matte_line_width'?.25:1} unit={percent?'%':field==='grid_matte_coverage'?'×':'px'} onPreview={v=>onPreview(v===null?null:{[field]:v/scale})} onCommit={v=>onPatch({[field]:v/scale})}/>
      </InspectorPropertyControl>;
    }):null}
  </div>;
}
