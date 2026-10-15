import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {build} from 'esbuild';
import {preparedRuntimeFileInputs} from './prepared-runtime';
test('prepared fingerprint keeps real files and excludes disabled browser alias virtual inputs',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'prepared-inputs-'));
 try{
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({browser:{'./node.js':false}}));
  fs.writeFileSync(path.join(root,'index.js'),"import './node.js'; export const ready=true;");
  const result=await build({absWorkingDir:root,entryPoints:['index.js'],bundle:true,write:false,metafile:true,platform:'browser'});
  const inputs=Object.keys(result.metafile!.inputs);assert.ok(inputs.some(file=>file.startsWith('(disabled):')));
  const files=preparedRuntimeFileInputs(inputs);assert.deepEqual(files,['index.js']);
  for(const file of files)assert.doesNotThrow(()=>fs.readFileSync(path.resolve(root,file)));
  assert.deepEqual(preparedRuntimeFileInputs(['missing-real-file.js']),['missing-real-file.js'],'missing real dependencies must still fail fingerprinting');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
