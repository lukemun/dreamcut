import test from 'node:test';
import assert from 'node:assert/strict';
import {createProposalTuningOutbox, recoveredTuningFor, PROPOSAL_TUNING_OUTBOX_KEY, type PendingTuning} from './proposal-tuning-outbox';

class MemoryStorage {
  data = new Map<string,string>();
  getItem(key:string) { return this.data.get(key) ?? null; }
  setItem(key:string,value:string) { this.data.set(key,value); }
}
const revision = 'a'.repeat(64);
const intent = (value:number | null, projectId='project', optionId='option') => ({projectId,proposalId:'proposal',optionId,expectedRevision:revision,
  overrides:value === null ? [] : [{operation_index:0,target:'patch' as const,field:'volume',value}]});
const deferred = () => { let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve}; };

test('stages the latest reset durably without a request per drag sample', async () => {
  const storage=new MemoryStorage(), saved:PendingTuning[]=[];
  const box=createProposalTuningOutbox({storage,clientId:()=> 'writer',save:async j=>{saved.push(j);},canRecover:async()=>true,onError:assert.fail});
  box.stage(intent(.5));box.stage(intent(.7));box.stage(intent(null));
  assert.equal(saved.length,0);
  const recovered=createProposalTuningOutbox({storage,save:async j=>{saved.push(j);},canRecover:async()=>true,onError:assert.fail});
  assert.deepEqual(recovered.pending()[0]!.overrides,[]);
  await recovered.flush();
  assert.equal(saved.length,1);assert.equal(saved[0]!.write.sequence,3);assert.equal(saved[0]!.write.expected_revision,revision);
  assert.deepEqual(recovered.pending(),[]);
});

test('serializes writes and an older acknowledgement cannot delete a newer reset', async () => {
  const storage=new MemoryStorage(), gate=deferred(), saved:PendingTuning[]=[];
  const box=createProposalTuningOutbox({storage,clientId:()=> 'writer',save:async j=>{saved.push(j);if(saved.length===1)await gate.promise;},canRecover:async()=>true,onError:assert.fail});
  box.stage(intent(.5));const flushing=box.flush();await Promise.resolve();
  box.stage(intent(null));assert.equal(saved.length,1);assert.equal(box.pending()[0]!.write.sequence,2);
  gate.resolve();await flushing;
  assert.equal(saved.length,2);assert.deepEqual(saved[1]!.overrides,[]);assert.deepEqual(box.pending(),[]);
});

test('reload recovery keeps project, proposal, option and revision boundaries', async () => {
  const storage=new MemoryStorage(), saved:PendingTuning[]=[];
  const before=createProposalTuningOutbox({storage,clientId:()=> 'writer',save:async()=>{},canRecover:async()=>true,onError:assert.fail});
  before.stage(intent(.5,'first','a'));before.stage(intent(.6,'second','b'));
  const after=createProposalTuningOutbox({storage,save:async j=>{saved.push(j);},canRecover:async j=>{assert.equal(j.write.expected_revision,revision);return true;},onError:assert.fail});
  await after.flush();
  assert.deepEqual(saved.map(j=>[j.projectId,j.proposalId,j.optionId]),[['first','proposal','a'],['second','proposal','b']]);
});

test('resolved cards are dropped without writes, failed or changed recovery remains recoverable', async () => {
  const storage=new MemoryStorage(), errors:unknown[]=[], saved:PendingTuning[]=[];
  const before=createProposalTuningOutbox({storage,clientId:()=> 'writer',save:async()=>{},canRecover:async()=>true,onError:assert.fail});
  before.stage(intent(.5,'resolved'));before.stage(intent(.6,'changed'));before.stage(intent(.7,'healthy'));
  const after=createProposalTuningOutbox({storage,save:async j=>{saved.push(j);},canRecover:async j=>{if(j.projectId==='changed')throw Error('Revision changed');return j.projectId!=='resolved';},onError:e=>{errors.push(e);}});
  await after.flush();
  assert.deepEqual(saved.map(j=>j.projectId),['healthy']);assert.equal(errors.length,1);assert.deepEqual(after.pending().map(j=>j.projectId),['changed']);
});

test('failed requests retain intent for the next controller and storage failures are observable', async () => {
  const storage=new MemoryStorage(),errors:unknown[]=[];
  const box=createProposalTuningOutbox({storage,clientId:()=> 'writer',save:async()=>{throw Error('Offline');},canRecover:async()=>true,onError:e=>{errors.push(e);}});
  box.stage(intent(null));await box.flush();assert.equal(box.pending().length,1);assert.equal(errors.length,1);
  const recovered=createProposalTuningOutbox({storage,save:async()=>{},canRecover:async()=>true,onError:assert.fail});await recovered.flush();assert.equal(recovered.pending().length,0);
  const storageErrors:unknown[]=[],writes:PendingTuning[]=[];
  const broken=createProposalTuningOutbox({storage:{getItem:()=>null,setItem:()=>{throw Error('Quota');}},save:async j=>{writes.push(j);},canRecover:async()=>true,onError:e=>{storageErrors.push(e);}});
  broken.stage(intent(.5));assert.equal(broken.pending().length,1);await broken.flush();
  assert.equal(storageErrors.length,1);assert.equal(writes.length,1);
});

test('corrupt storage cannot crash rendering or overwrite its diagnostic bytes',async()=>{
  for(const raw of ['{broken',JSON.stringify({version:1,clientId:'writer',sequence:2,jobs:{bad:{write:{sequence:'bad'}}}})]) {
    const storage=new MemoryStorage(),errors:unknown[]=[],saved:PendingTuning[]=[];storage.setItem(PROPOSAL_TUNING_OUTBOX_KEY,raw);
    const box=createProposalTuningOutbox({storage,save:async j=>{saved.push(j);},canRecover:async()=>true,onError:e=>{errors.push(e);}});
    assert.deepEqual(box.pending(),[]);box.stage(intent(.5));await box.flush();
    assert.equal(saved.length,1);assert.equal(errors.length,1);assert.equal(storage.getItem(PROPOSAL_TUNING_OUTBOX_KEY),raw);
  }
});

test('recovered hydration excludes wrong project, option, revision, stale and resolved contexts',()=>{
  const storage=new MemoryStorage(),box=createProposalTuningOutbox({storage,clientId:()=> 'writer',save:async()=>{},canRecover:async()=>true,onError:assert.fail});box.stage(intent(null));
  const jobs=box.pending(),scope={projectId:'project',proposalId:'proposal',revision,status:'pending',stale:false,optionIds:['option']};
  assert.equal(recoveredTuningFor(jobs,scope).length,1);
  for(const mismatch of [{projectId:'other'},{proposalId:'other'},{revision:'b'.repeat(64)},{status:'approved'},{status:'rejected'},{stale:true},{optionIds:['other']}]) assert.deepEqual(recoveredTuningFor(jobs,{...scope,...mismatch}),[]);
});

test('a reloaded controller and an older in-flight writer cannot delete the newer reset',async()=>{
  const storage=new MemoryStorage(),gate=deferred();let appliedSequence=0,level:number|null=null;
  const apply=(job:PendingTuning)=>{if(job.write.sequence>appliedSequence){appliedSequence=job.write.sequence;level=job.overrides.length ? Number(job.overrides[0]!.value) : null;}};
  const old=createProposalTuningOutbox({storage,clientId:()=> 'writer',save:async j=>{await gate.promise;apply(j);},canRecover:async()=>true,onError:assert.fail});
  old.stage(intent(.5));const oldRequest=old.flush();await Promise.resolve();old.stage(intent(null));
  const reload=createProposalTuningOutbox({storage,save:async j=>{apply(j);},canRecover:async()=>true,onError:assert.fail});await reload.flush();
  gate.resolve();await oldRequest;assert.equal(appliedSequence,2);assert.equal(level,null);assert.deepEqual(reload.pending(),[]);
});

test('invalid outbox keys are treated as corruption rather than replayed forever',()=>{
  const storage=new MemoryStorage(),errors:unknown[]=[];
  const job={...intent(.5),write:{client_id:'writer',sequence:1,expected_revision:revision}};delete (job as Partial<typeof job>).expectedRevision;
  storage.setItem(PROPOSAL_TUNING_OUTBOX_KEY,JSON.stringify({version:1,clientId:'writer',sequence:1,jobs:{wrong:job}}));
  const box=createProposalTuningOutbox({storage,save:async()=>{},canRecover:async()=>true,onError:e=>{errors.push(e);}});
  assert.deepEqual(box.pending(),[]);assert.equal(errors.length,1);
});
