import test from 'node:test';
import assert from 'node:assert/strict';
import {preparedBackendOptions} from './prepared-backend';
import {preparedPreviewIdentity,type PreparedPreviewInput} from '../timeline/prepared-preview';
const input:PreparedPreviewInput={width:160,height:160,fps:30,durationInFrames:120,inputProps:{elements:[]}};
test('prepared backend changes only picture decoding and cannot redirect audio',()=>{
 assert.deepEqual(preparedBackendOptions(input,'fixture',false),{nativeProjectId:undefined});
 assert.deepEqual(preparedBackendOptions({...input,backend:'rust'},'fixture',false),{nativeProjectId:'fixture'});
 for(const backend of ['standard','rust'] as const)assert.deepEqual(preparedBackendOptions({...input,backend},'fixture',true),{nativeProjectId:undefined});
});
test('backend identity prevents cross-engine prepared cache reuse',()=>{
 const standard=preparedPreviewIdentity({...input,backend:'standard'}),rust=preparedPreviewIdentity({...input,backend:'rust'});
 assert.notEqual(standard,rust);
 assert.equal(preparedPreviewIdentity({...input,backend:'rust'}),rust);
});
