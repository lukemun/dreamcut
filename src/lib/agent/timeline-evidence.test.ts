import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {timelineEvidenceStamp} from './timeline-evidence';

test('source mask directories participate in the timeline evidence fingerprint',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'grid-evidence-'));
  const previous=process.env.TIMELINE_PROJECTS_DIR;process.env.TIMELINE_PROJECTS_DIR=root;
  try {
    const project=path.join(root,'fixture'),masks=path.join(project,'media/masks');fs.mkdirSync(masks,{recursive:true});
    fs.writeFileSync(path.join(project,'metadata.json'),'{}');
    fs.writeFileSync(path.join(project,'timeline.json'),JSON.stringify({elements:[{props:{grid_matte_mask:{source_url:'/api/projects/fixture/media/masks'}}}]}));
    fs.writeFileSync(path.join(masks,'00000.png'),'first-mask');
    const initial=await timelineEvidenceStamp('fixture');
    assert.equal(await timelineEvidenceStamp('fixture'),initial);
    fs.writeFileSync(path.join(masks,'00000.png'),'other-mask');
    assert.notEqual(await timelineEvidenceStamp('fixture'),initial);
  } finally {
    if(previous===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;
    fs.rmSync(root,{recursive:true,force:true});
  }
});
