import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nativePreviewBinary} from './binary';

test('a helper built under the OpenEdit name keeps working until the DreamCut build exists',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-native-binary-'));
 try{
  const release=path.join(root,'native/preview/target/release');fs.mkdirSync(release,{recursive:true});
  assert.equal(nativePreviewBinary(root),path.join(release,'dreamcut-native-preview'));
  fs.writeFileSync(path.join(release,'openedit-native-preview'),'legacy');
  assert.equal(nativePreviewBinary(root),path.join(release,'openedit-native-preview'));
  fs.writeFileSync(path.join(release,'dreamcut-native-preview'),'current');
  assert.equal(nativePreviewBinary(root),path.join(release,'dreamcut-native-preview'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
