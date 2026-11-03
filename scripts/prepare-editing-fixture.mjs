/** Internal eval setup: verify frozen inputs and copy into a fresh private attempt. No model calls. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inside(root,relative){
 const result=path.resolve(root,relative);
 if(!result.startsWith(root+path.sep))throw Error('Path escapes fixture');
 return result;
}
export function prepareFixture(packagePath,attemptPath){
 const fixture=fs.realpathSync(packagePath),attempt=path.resolve(attemptPath),privateRoot=fs.realpathSync(path.join(root,'private'));
 if(!attempt.startsWith(privateRoot+path.sep))throw Error('Attempts must be inside private/');
 let ancestor=path.dirname(attempt);while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
 if(!fs.realpathSync(ancestor).startsWith(privateRoot+path.sep)&&fs.realpathSync(ancestor)!==privateRoot)throw Error('Attempt symlink escape');
 if(fs.existsSync(attempt))throw Error('Attempt already exists; use a fresh directory');
 const manifest=JSON.parse(fs.readFileSync(path.join(fixture,'manifest.json'),'utf8'));
 if(manifest.version!==1 || !manifest.inputs?.length)throw Error('Invalid fixture manifest');
 for(const entry of manifest.inputs){
  if(!entry.path.startsWith('input/') || entry.path.split('/').some(part=>!part || part==='.' || part==='..'))throw Error('Only input files may enter attempt');
  const source=inside(fixture,entry.path);
  if(!fs.realpathSync(source).startsWith(path.join(fixture,'input')+path.sep)||hash(source)!==entry.sha256)throw Error('Frozen input mismatch');
 }
 fs.mkdirSync(attempt,{recursive:true});
 for(const entry of manifest.inputs){
  const target=inside(attempt,entry.path.slice(6));fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(inside(fixture,entry.path),target,fs.constants.COPYFILE_FICLONE);
  if(hash(target)!==entry.sha256)throw Error('Copy mismatch');
 }
 fs.writeFileSync(path.join(attempt,'setup-receipt.json'),JSON.stringify({case_id:manifest.case_id,fixture_manifest_sha256:hash(path.join(fixture,'manifest.json')),prepared_at:new Date().toISOString(),inputs:manifest.inputs,model_run:false},null,2)+'\n');
 return {attempt,case_id:manifest.case_id,files:manifest.inputs.length,model_run:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [fixture,attempt]=process.argv.slice(2);if(!fixture||!attempt)throw Error('Usage: node scripts/prepare-editing-fixture.mjs <frozen-package> <fresh-private-attempt>');
 console.log(JSON.stringify(prepareFixture(fixture,attempt)));
}
