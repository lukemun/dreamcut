import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../../../docs/effects/catalog.json';
import {EFFECT_CONTROLS} from '../timeline/effect-controls';
import {ANIMATION_PRESETS} from '../timeline/animation-presets';
import {TIMELINE_TRANSITION_TYPES} from '../timeline/contracts';
import {TRANSITION_CONTROLS} from '../timeline/transition-controls';
import {gpuCatalogCases,assessGpuCatalogCoverage,GPU_CATALOG_PROOF_CHECKS,gpuCatalogTransitionFields,type GpuCatalogEvidence} from '../gpu-preview/catalog-coverage';

test('inventory enumerates registries without filtering unsupported families',()=>{
 const cases=gpuCatalogCases(),ids=new Set(cases.map(item=>item.id));
 assert.equal(ids.size,cases.length);
 assert.deepEqual(cases.filter(item=>item.family==='property').map(item=>item.input.property),EFFECT_CONTROLS.map(control=>control.prop));
 for(const preset of ANIMATION_PRESETS)for(const actor of ['media','caption'])for(const phase of ['in','out'])assert.ok(ids.has(`animation:${actor}:${phase}:${preset}`));
 for(const type of TIMELINE_TRANSITION_TYPES)assert.ok(cases.some(item=>item.family==='transition'&&item.input.type===type));
 for(const recipe of catalog.entries)assert.ok(ids.has(`recipe:${recipe.catalog_id}`));
 for(const id of ['FX-MOVING-GRID-MATTE','FX-MASK-GLITCH-GLOW','FX-SPEED-ENTRANCE-EXIT','skill:layered-paper-cutout','skill:talking-head-cutout'])assert.ok(ids.has(`recipe:${id}`));
 assert.deepEqual(gpuCatalogTransitionFields(),TRANSITION_CONTROLS.map(control=>control.field));
 const fields=new Set(cases.filter(item=>item.family==='transition').flatMap(item=>(item.input.controls as {field:string}[]).map(c=>c.field)));
 for(const control of TRANSITION_CONTROLS)assert.ok(fields.has(control.field));
});

test('property fixtures retain nonidentity context, reset and animation obligations',()=>{
 const cases=gpuCatalogCases();
 const iris=cases.find(item=>item.id==='property:iris_feather')!;
 assert.deepEqual(iris.input.context,{iris_radius:.7});assert.equal(iris.input.keyframeable,true);
 const grid=cases.find(item=>item.id==='property:grid_matte_cell_size')!;
 assert.equal(grid.input.media,'video');assert.equal(grid.input.keyframeable,false);
 (grid.input.context as Record<string,unknown>).grid_matte_mask=null;
 assert.ok((gpuCatalogCases().find(item=>item.id===grid.id)!.input.context as Record<string,unknown>).grid_matte_mask);
});

test('missing measurements and unsupported operations stay gaps even with supplied green checks',()=>{
 const cases=gpuCatalogCases();
 const empty=assessGpuCatalogCoverage({cases,engine:'canvaskit',inputFingerprint:'revision-a'});
 assert.equal(empty.gaps,cases.length);assert.equal(empty.passed,0);
 const evidence:GpuCatalogEvidence={caseId:cases[0].id,engine:'canvaskit',inputFingerprint:'revision-a',receipt:'receipt.json',checks:Object.fromEntries(GPU_CATALOG_PROOF_CHECKS.map(check=>[check,true]))};
 const report=assessGpuCatalogCoverage({cases:[cases[0]],engine:'canvaskit',inputFingerprint:'revision-a',evidence:[evidence],assessments:[{caseId:cases[0].id,unsupportedReason:'Grid packet is not implemented'}]});
 assert.equal(report.passed,0);assert.equal(report.gaps,1);
});

test('qualification requires current engine/fingerprint and every check; nonapplicability is distinct',()=>{
 const cases=gpuCatalogCases().slice(0,1),base={cases,engine:'canvaskit',inputFingerprint:'revision-a'};
 const evidence:GpuCatalogEvidence={caseId:cases[0].id,engine:'canvaskit',inputFingerprint:'revision-a',receipt:'receipt.json',checks:Object.fromEntries(GPU_CATALOG_PROOF_CHECKS.map(check=>[check,true]))};
 assert.equal(assessGpuCatalogCoverage({...base,evidence:[evidence]}).passed,1);
 for(const changed of [{...evidence,engine:'custom'},{...evidence,inputFingerprint:'old'},{...evidence,receipt:''},{...evidence,checks:{...evidence.checks,sourceClock:false}},{...evidence,checks:{}}])assert.equal(assessGpuCatalogCoverage({...base,evidence:[changed]}).gaps,1);
 const notApplicable=assessGpuCatalogCoverage({...base,assessments:[{caseId:cases[0].id,notApplicableReason:'Fixture domain excludes this operation'}]});
 assert.equal(notApplicable.notApplicable,1);assert.equal(notApplicable.passed,0);
 assert.throws(()=>assessGpuCatalogCoverage({...base,evidence:[evidence,evidence]}),/duplicate/);
 assert.throws(()=>assessGpuCatalogCoverage({...base,assessments:[{caseId:'unknown',unsupportedReason:'Unknown'}]}),/Unknown/);
});

test('local recipes add obligations without reading private stores or colliding with shared identities',()=>{
 const cases=gpuCatalogCases([{id:'FX-MOVING-GRID-MATTE',version:3}]);
 assert.ok(cases.some(item=>item.id==='recipe:local:FX-MOVING-GRID-MATTE'&&item.input.version===3));
 assert.throws(()=>gpuCatalogCases([{id:'same'},{id:'same'}]),/Duplicate/);
 assert.throws(()=>gpuCatalogCases([{id:' '}]),/nonempty/);
});
