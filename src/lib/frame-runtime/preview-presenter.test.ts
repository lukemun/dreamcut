import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameSession} from './session';
test('the player target survives renderer registration and uses the same epoch and clock',()=>{
 const session=new FrameSession();session.requestPreviewFrame(12,2,false);
 assert.deepEqual(session.previewTarget,{frame:12,epoch:2,playing:false});
 const seen:unknown[]=[];session.previewFrameRenderer=(frame,epoch,playing)=>seen.push({frame,epoch,playing});
 session.requestPreviewFrame(13,3,true);assert.deepEqual(seen,[{frame:13,epoch:3,playing:true}]);
 session.requestPreviewFrame(13,3,false);assert.deepEqual(seen[1],{frame:13,epoch:3,playing:false});
 session.dispose();assert.equal(session.previewFrameRenderer,null);assert.equal(session.previewTarget,null);
});
