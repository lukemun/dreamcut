import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EFFECT_CONTROLS } from "../timeline/effect-controls";
import { EFFECT_RENDER_CASES, renderContractCases } from "./effect-render-contract";
test("every shipped effect control has an explicit observable render case",()=>{
 assert.deepEqual(Object.keys(EFFECT_RENDER_CASES).sort(),EFFECT_CONTROLS.map(c=>c.prop).sort());
 for(const entry of renderContractCases()){
   assert.notDeepEqual(entry.value,entry.identity,entry.property);
   assert.ok(entry.minimumChangedPixels>0,entry.property);
   const control=EFFECT_CONTROLS.find(c=>c.prop===entry.property)!;
   assert.deepEqual(control.normalize(entry.value),entry.value,`${entry.property} fixture must use a supported value`);
 }
});
test("the product has no Remotion package dependency",()=>{
 const manifest=JSON.parse(fs.readFileSync("package.json","utf8"));
 assert.ok(manifest.dependencies["playwright-core"],"export browser must be available in production installs");
 for(const name of Object.keys({...manifest.dependencies,...manifest.devDependencies})) assert.ok(name!=="remotion"&&!name.startsWith("@remotion/"),name);
});
