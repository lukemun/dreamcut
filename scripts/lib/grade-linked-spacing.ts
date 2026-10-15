import { deriveProposalTimeline, type EditorAgentProposal } from '../../src/lib/agent/timeline-editor-agent-apply';
import { applyProposalNumericOverrides } from '../../src/lib/agent/proposal-overrides';

/** Structural checks only. No historical proposal is used as an exact-match answer. */
export function gradeLinkedSpacing(original: Parameters<typeof deriveProposalTimeline>[0], proposal: EditorAgentProposal, config: any) {
    const option = proposal.options[0];
    const timing = option.timing_controls ?? [];
    const results: any[] = [];
    if (timing.length !== 1) throw new Error('Expected one shared spacing control');
    const control = timing[0];
    for (const value of [control.min_spacing_seconds ?? 0.2, control.spacing_seconds, control.max_spacing_seconds ?? 1.2]) {
      try {
        const tuned = applyProposalNumericOverrides(option, [{ operation_index: 0, target: 'timing_control', field: 'spacing_seconds', value }]);
        const derived = deriveProposalTimeline(original, tuned.operations, config.project_id, tuned.preserve_fields).timeline;
        const actors = Object.fromEntries(derived.elements.map(e=>[e.id,e]));
        const near = (a:number,b:number) => Math.abs(a-b) < 1e-6;
        const checks: Record<string,boolean> = { spacing_exposed: !!option.review_controls?.some(r=>r.target==='timing_control'&&r.operation_index===0&&r.field==='spacing_seconds'), usable_range: (control.max_spacing_seconds??1.2)>(control.min_spacing_seconds??0.2) };
        for (const [index,g] of config.groups.entries()) {
          const w=actors[g.white], c=actors[g.color], bw=actors[g.background_white], bc=actors[g.background_color], full=actors[g.full], click=actors[g.click];
          checks[`group_${index}_continuous`] = near(w.timeline_start+w.duration,c.timeline_start) && near(c.timeline_start+c.duration,full.timeline_start) && near(bw.timeline_start+bw.duration,bc.timeline_start) && near(bc.timeline_start+bc.duration,full.timeline_start);
          checks[`group_${index}_click`] = near(click.timeline_start+1/30,w.timeline_start);
          checks[`group_${index}_phase_lengths`] = [g.white,g.background_white,g.background_color,g.click].every((id:string) => Math.abs(actors[id].duration - original.elements.find(e=>e.id===id)!.duration) < 1e-7);
          checks[`group_${index}_end`] = near(full.timeline_start+full.duration,config.range[1]);
        }
        checks.anchor = near(actors[config.groups[0].white].timeline_start,config.range[0]);
        const bg=config.groups.map((g:any)=>actors[g.background_white].timeline_start);
        checks.shared_background = bg.every((v:number)=>near(v,bg[0]));
        checks.final_click = near(actors[config.background_click].timeline_start+1/30,bg[0]);
        const normalize=(e:any)=>{const {updated_at,...rest}=e;return rest;};
        checks.transitions_unchanged = JSON.stringify(derived.transitions) === JSON.stringify(original.transitions);
        checks.preservation=derived.elements.every(e=>{const before=original.elements.find(x=>x.id===e.id)!; const restored={...e};if(config.element_ids.includes(e.id)){restored.timeline_start=before.timeline_start;restored.duration=before.duration;}return JSON.stringify(normalize(restored))===JSON.stringify(normalize(before));});
        results.push({ value, checks, pass:Object.values(checks).every(Boolean), starts:config.groups.map((g:any)=>actors[g.white].timeline_start), background_start:bg[0] });
      } catch(error:any) { results.push({value,pass:false,error:error.message}); }
    }
    const movement = results.length===3 && results[0].starts && results[2].starts && results[0].starts.slice(1).every((v:number,i:number)=>Math.abs(v-results[2].starts[i+1])>1/30) && Math.abs(results[0].background_start-results[2].background_start)>1/30;
    return {kind:'structural-timing-check',pass:results.every(x=>x.pass)&&!!movement,spacing_changes_later_reveals:!!movement,results,visual_quality:'not evaluated',audio_quality:'not evaluated',human_approval:'not requested or performed'};
}
