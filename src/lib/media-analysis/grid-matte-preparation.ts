import { internalGridMatteDirectory } from '../local-store/internal-masks';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { projectDir } from '../local-store/paths';
import type { CustomCutoutReceipt } from '../local-store/custom-cutouts';
import { gridMatteMaskSchema, type GridMatteMask } from '../timeline/grid-matte';

/** Publish unchanged verified grayscale masks, never a baked mosaic or timeline edit. */
export function prepareGridMatteBinding(projectId: string, receipt: CustomCutoutReceipt): GridMatteMask {
  if (!/^[a-zA-Z0-9_-]+$/.test(receipt.cutout_id)) throw new Error('Invalid cutout identifier.');
  const prep=receipt.preparation;
  if(!prep || prep.masks.length!==receipt.frame_count) throw new Error('Grid matte needs a verified cutout mask manifest.');
  const root=fs.realpathSync(projectDir(projectId));
  const evidence=fs.realpathSync(path.join(root,receipt.evidence_directory,'masks'));
  if(!evidence.startsWith(root+path.sep))throw new Error('Mask evidence leaves project.');
  const output=path.join(internalGridMatteDirectory(projectId),receipt.cutout_id);
  fs.mkdirSync(output,{recursive:true});
  for(let i=0;i<prep.masks.length;i++) {
    const entry=prep.masks[i]!, name=`${String(i).padStart(5,'0')}.png`;
    if(entry.name!==name)throw new Error('Mask manifest must be ordered and gap-free.');
    const bytes=fs.readFileSync(path.join(evidence,name));
    if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('Mask bytes changed. Prepare the cutout again.');
    const dest=path.join(output,name);
    if(!fs.existsSync(dest)||createHash('sha256').update(fs.readFileSync(dest)).digest('hex')!==entry.sha256)fs.writeFileSync(dest,bytes);
  }
  const binding=gridMatteMaskSchema.parse({source_url:`/api/projects/${projectId}/media/grid-mattes/${receipt.cutout_id}`,source_start_seconds:receipt.source_interval_seconds[0],fps:receipt.frame_rate,frame_count:receipt.frame_count,width:prep.tracking_width,height:prep.tracking_height,source_sha256:receipt.source_sha256});
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({binding,masks:prep.masks},null,2));
  return binding;
}
