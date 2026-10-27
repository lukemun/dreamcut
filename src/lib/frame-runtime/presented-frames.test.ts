import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PresentedFrames} from './presented-frames';
test('presented frames follow decoder reversals and isolate video/session lifetimes',()=>{
 const a=new PresentedFrames(),b=new PresentedFrames(),seen:number[]=[];
 const stop=a.subscribe('foreground',t=>seen.push(t));
 a.publish('background',3.2);a.publish('foreground',3.1);a.publish('foreground',2.9);
 assert.deepEqual(seen,[3.1,2.9]);assert.equal(b.get('foreground'),undefined);
 a.remove('foreground');assert.equal(a.get('foreground'),undefined);
 stop();a.publish('foreground',4);assert.equal(seen.length,2);
 a.clear();assert.equal(a.get('background'),undefined);
});
