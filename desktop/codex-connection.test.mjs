import test from 'node:test';
import assert from 'node:assert/strict';
import { connectCodex } from './codex-connection.mjs';

const server = `
const readline = require('node:readline');
const send = value => process.stdout.write(JSON.stringify(value)+'\\n');
readline.createInterface({input:process.stdin}).on('line', line => {
 const message=JSON.parse(line);
 if (message.method==='initialize') send({id:message.id,result:{ready:true}});
 else if (message.method==='echo') setTimeout(()=>send({id:message.id,result:message.params.value}),message.params.delay||0);
 else if (message.method==='denial') send({id:901,method:'item/commandExecution/requestApproval',params:{}});
 else if (message.id===901) send({method:'host-denied',params:{denied:Boolean(message.error)}});
 else if (message.method==='invalid') process.stdout.write('not-json\\n');
 else if (message.method==='private-error') send({id:message.id,error:{code:42,message:'PRIVATE_ACCOUNT_DETAIL'}});
 else if (message.method==='exit') process.exit(1);
});`;
const open = options => connectCodex(process.execPath, { args: ['-e', server], ...options });

test('Codex transport correlates overlapping requests and never accepts host approvals', async () => {
  let denied;
  const denial = new Promise(resolve => { denied = resolve; });
  const client = await open({ onNotification(method, params) { if (method === 'host-denied') denied(params.denied); } });
  try {
    assert.equal(client.initialized.ready, true);
    assert.deepEqual(await Promise.all([
      client.request('echo', { value: 'first', delay: 30 }), client.request('echo', { value: 'second' }),
    ]), ['first', 'second']);
    // The fake server's approval event is a request independent of our pending call.
    const pending = client.request('denial').catch(error => error.message);
    assert.equal(await denial, true);
    await assert.rejects(client.request('private-error'), error => error.message.includes('42') && !error.message.includes('PRIVATE'));
    await client.close();
    assert.match(await pending, /closed/);
  } finally { await client.close(); }
});

test('malformed data and process exit reject pending calls and close the transport', async () => {
  for (const method of ['invalid', 'exit']) {
    const client = await open();
    await assert.rejects(client.request(method), /malformed|stopped/);
    await assert.rejects(client.request('echo'), /closed/);
    await client.close();
  }
});

test('request deadlines terminate unresponsive connections', async () => {
  const client = await open({ timeoutMs: 150 });
  await assert.rejects(client.request('hang'), /timed out/);
  await assert.rejects(client.request('echo'), /closed/);
  await client.close();
});

test('dynamic tool handler is opt-in and cannot authorize other host request types', async () => {
  const source = `
    const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
    require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
      const m=JSON.parse(line);
      if(m.method==='initialize')send({id:m.id,result:{}});
      else if(m.method==='trigger'){
        send({id:701,method:'item/tool/call',params:{threadId:'owned',turnId:'turn',callId:'call',tool:'timeline_get',arguments:{project_id:'fixture'}}});
        send({id:702,method:'item/commandExecution/requestApproval',params:{}});
        send({id:m.id,result:{}});
      } else if(m.id===701 || m.id===702)send({method:'observed',params:{id:m.id,...m}});
    });`;
  let calls=0; const observed=[];
  const client=await connectCodex(process.execPath,{args:['-e',source],
    onToolCall: async params=>{calls++;assert.equal(params.tool,'timeline_get');return {success:true,contentItems:[{type:'inputText',text:'fixture'}]};},
    onNotification(method,params){if(method==='observed')observed.push(params);}});
  try{
    await client.request('trigger');
    const deadline=Date.now()+2000;
    while(observed.length<2){if(Date.now()>deadline)throw Error('No host replies');await new Promise(resolve=>setTimeout(resolve,10));}
    assert.equal(calls,1);
    assert.equal(observed.find(value=>value.id===701).result.success,true);
    assert.equal(observed.find(value=>value.id===702).error.code,-32601);
  }finally{await client.close();}
});
