'use client';
import {useState, type ReactNode} from 'react';
import {InspectorDisclosure} from './InspectorHierarchy';
import type { GuideEffect } from '@/lib/effects/guide';
import { creatorGuideFor } from '@/lib/effects/creator-guides';

/** Same creator brief in the Library detail and Guide; the enclosing page owns scrolling. */
export function EffectRecipeInstructions({ effect }: { effect: GuideEffect }) {
  const guide = creatorGuideFor(effect);
  const inputs = guide?.inputs ?? effect.inputDirections;
  return <div className="space-y-4 text-base leading-relaxed">
    <section>
      <h3 className="text-base font-semibold">What you supply</h3>
      <ul className="mt-2 list-disc space-y-2 pl-4">{inputs ? inputs.map(input =>
        <li key={input.title}><strong>{input.title}:</strong> {input.directions}</li>) :
        (effect.needs ?? effect.inputs.map(input => input.label)).map(need => <li key={need}>{need}</li>)}</ul>
    </section>
    <section>
      <h3 className="text-base font-semibold">Supply your own or generate inputs</h3>
      <p className="mt-2">{guide?.generation ?? 'Generated alternatives not assessed yet.'}</p>
    </section>
    <section>
      <h3 className="text-base font-semibold">How the effect is built</h3>
      {guide ? <ol className="mt-2 list-decimal space-y-1 pl-4">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
        : <p className="mt-2">{effect.preparation ?? 'Not documented yet.'}</p>}
    </section>
  </div>;
}

export function EffectRecipeDetails({effect,children}:{effect:GuideEffect;children?:ReactNode}){
 const [open,setOpen]=useState(false);
 return <InspectorDisclosure title={effect.brings ? 'How it is built' : 'Filming tips and build steps'} open={open} onOpenChange={setOpen}><EffectRecipeInstructions effect={effect}/>{children}</InspectorDisclosure>;
}
