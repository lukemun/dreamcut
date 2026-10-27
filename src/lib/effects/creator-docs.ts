import { recipeStatusLabel } from './promoted-recipes';
import fs from 'node:fs';
import { recipeVisuals } from './recipe-visuals';
import { effectHome } from './placement';
import path from 'node:path';
import { effectCatalogSchema } from './recipes';
import { creatorGuides } from './creator-guides';
import { guideEffects } from './guide-examples';
import { effectRecipeRequest } from './agent-request';
import type { GuideEffect } from './guide';

const begin = '<!-- BEGIN EFFECT INDEX -->';
const end = '<!-- END EFFECT INDEX -->';
const anchor = (id: string) => id.toLowerCase();

/** Deterministic documentation from the same creator briefs shown in the editor. */
export function syncEffectCreatorDocs(write = false, root = process.cwd()) {
  const catalog = effectCatalogSchema.parse(JSON.parse(fs.readFileSync(path.join(root, 'docs/effects/catalog.json'), 'utf8')));
  const effects: GuideEffect[] = catalog.entries.map(entry => ({
    id: entry.catalog_id, title: entry.name, skill: entry.recipe.skill,
    description: entry.recipe.success_criteria.join(' '),
    prompt: `Follow the ${entry.catalog_id} recipe and its success criteria, adapting the construction to my supplied assets.`,
    inputs: [], status: entry.recipe.status, limitations: entry.recipe.evidence.limitations,
  }));
  effects.push(...guideEffects.filter(effect => !catalog.entries.some(entry => entry.catalog_id === effect.id)));
  const identities = effects.map(effect => effect.id ?? effect.skill);
  for (const id of identities) if (!creatorGuides[id]) throw new Error(`Missing creator brief: ${id}`);
  for (const id of Object.keys(creatorGuides)) if (!identities.includes(id)) throw new Error(`Orphan creator brief: ${id}`);
  const rows = effects.map(effect => {
    const id = effect.id ?? effect.skill;
    const guide = creatorGuides[id];
    const status = recipeStatusLabel(effect);
    return { effect, id, guide, status };
  });
  const index = [begin, 'Browse every shared effect and reference study below. Each link opens its demo, input brief, build sequence and the request your agent works from. Reference-only entries are ideas to assess, not verified implementations.', '', '| Effect | What you supply | Home | Evidence |', '| --- | --- | --- | --- |', ...rows.map(({ effect, id, guide, status }) => `| [${effect.title}](recipes.md#${anchor(id)}) | ${guide.inputs.map(input => input.title).join('; ')} | ${effectHome(id)} | ${status} |`), '', 'Want to add one? Start with the [effect page template](creator-template.md) and [PR contribution guide](../../CONTRIBUTING.md#add-a-template).', end].join('\n');
  const pages = ['# Make an effect with your own assets', '', 'Every recipe includes an input brief and build instructions. Demonstrations are optional; when present, they show the actual construction. Select it in Templates and tell your agent which files to use. The agent prepares the construction; you review the proposed edit and fine-tune its persistent controls. Generation needs a separate reviewed draft and authorization.', '', '[All effects](README.md#all-templates) · [Contribute an effect](creator-template.md) · [Evidence and packaging](README.md)', '', ...rows.flatMap(({ effect, id, guide, status }) => {
    const visual = recipeVisuals[id];
    const visualLines = visual ? [
      `[<img src="../../public${visual.poster}" width="160" alt="${effect.title} demonstration" />](../../public${visual.video})`, '',
      `${visual.summary} ${visual.note}`, '',
      ...(['supply','prepared'] as const).flatMap(role=>{
        const inputs=visual.inputs.filter(input=>input.role===role);
        if(!inputs.length)return [];
        return [`**${role==='supply'?'You supply':'DreamCut prepares'}**`, '',
          '| ' + inputs.map(input=>input.label).join(' | ') + ' |',
          '| ' + inputs.map(()=>'---').join(' | ') + ' |',
          '| ' + inputs.map(input=>input.file?`<img src="../../public${input.file}" width="100" alt="${input.label}" />`:(input.words??[]).join(' · ')).join(' | ') + ' |', ''];
      }),
      '| ' + visual.stages.map(stage=>stage.label).join(' | ') + ' |',
      '| ' + visual.stages.map(()=>'---').join(' | ') + ' |',
      '| ' + visual.stages.map(stage=>`<img src="../../public${stage.file}" width="100" alt="${stage.label}" />`).join(' | ') + ' |', '',
      `${visual.credit} Catalog evidence below is separate.`, '',
    ] : [];
    const entry = catalog.entries.find(entry => entry.catalog_id === id);
    const r = entry?.recipe;
    const demo = r?.recreation;
    const curatedMedia = effect.video ?? effect.image;
    // A recipe preview above already is the demonstration; the line below only covers entries without one.
    const example = demo ? `[Recreated demo](${demo.path})` : r ? 'No recreated demo yet.' : curatedMedia ? `[Demonstration](../../public/guide/effects/${curatedMedia})` : visual ? '' : 'Demo not available yet.';
    return [
      `<a id="${anchor(id)}"></a>`, '', `## ${effect.title}`, '', `**${id} · ${status}** · [Owning skill](../../.agents/skills/${effect.skill}/SKILL.md)`, '',
      `**Home:** ${effectHome(id)}.`, '', '### Demonstration', '', ...visualLines, ...(example || r ? [example + (r ? `${example ? ' · ' : ''}[Reference](${r.reference.path})` : ''), ''] : []),
      ...(r ? [`Reference credit: ${r.reference.credit}. Rights basis: ${r.reference.rights}.`, '', ...(demo ? [`Recreation credit: ${demo.credit}. Rights basis: ${demo.rights}.`, ''] : [])] : effect.credit ? [`Example credit: ${effect.credit}.`, ''] : []),
      effect.description, '', '### What you supply', '', ...guide.inputs.map(input => `- **${input.title}:** ${input.directions}`), '',
      '### Supply your own or generate inputs', '', guide.generation, '', 'Generation suitability is guidance, not proof of a tested generated-input workflow. Ask the agent to stage any needed assets in Library → Generate, then review the model, prompt and settings before generating.', '',
      '### How the effect is built', '', ...guide.steps.map((step, i) => `${i + 1}. ${step}`), '',
      '### Ask your agent', '', 'Select this template in Templates, then tell your agent which files to use. Your agent works from this request; it prepares a proposal for you to review, never an edit or a generation on its own.', '', '```text', effectRecipeRequest(effect), '```', '',
      '### Evidence and limits', '', ...(effect.limitations?.length ? effect.limitations.map(limit => `- ${limit}`) : [effect.status === 'complete' ? 'No unresolved limitations recorded in the catalog.' : 'This workflow has not been promoted to a verified complete catalog recipe.']), '',
      ...(r ? [`[Technical recipe and evidence](catalog.json) · [Skill receipt](${r.evidence_path})`, ''] : []),
    ];
  })].join('\n') + '\n';
  // The full index lives with the catalog; the repository README shows a short gallery instead.
  const readmePath = path.join(root, 'docs/effects/README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const start = readme.indexOf(begin), finish = readme.indexOf(end);
  if (start < 0 || finish < start) throw new Error('docs/effects/README.md effect index markers missing');
  const nextReadme = readme.slice(0, start) + index + readme.slice(finish + end.length);
  for (const [file, content] of [[readmePath, nextReadme], [path.join(root, 'docs/effects/recipes.md'), pages]]) {
    if (write) fs.writeFileSync(file, content);
    else if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) throw new Error(`Stale effect pages: ${path.basename(file)}. Run pnpm exec tsx scripts/generate-effect-pages.ts --write`);
  }
}
