import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createLlamaAdapter} from './harness-llama.mjs';

async function fixture(t, handler) {
 const requests=[];
 const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const entry={url:req.url,body:JSON.parse(body)};requests.push(entry);await handler(entry,res);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 return {endpoint:`http://127.0.0.1:${server.address().port}`,requests};
}
const answer={model:'local-test',id:'response-1',choices:[{finish_reason:'stop',message:{role:'assistant',content:'red'}}],usage:{prompt_tokens:10,completion_tokens:2}};
const json=(res,body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};

test('sends actual tool image unchanged, bounded schema projection, and paired usage events',async t=>{
 const f=await fixture(t,(_req,res)=>json(res,answer));const events=[];
 const adapter=createLlamaAdapter({...f,model:'local-test',onEvent:async e=>events.push(e)});
 const messages=[{role:'tool',tool_call_id:'call-1',content:[{type:'image_url',image_url:{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII='}}]}];
 const tools=[{name:'inspect',inputSchema:{type:'object',properties:{description:{type:'string',maxLength:2000}}}}];
 assert.equal((await adapter.chat({messages,tools})).content,'red');
 assert.deepEqual(f.requests[0].body.messages,messages);
 assert.equal(f.requests[0].body.tools[0].function.parameters.properties.description.maxLength,256);
 assert.equal(tools[0].inputSchema.properties.description.maxLength,2000);
 assert.equal(f.requests[0].body.max_tokens,512);
 assert.equal(f.requests[0].body.response_format,undefined);
 assert.deepEqual(events.map(e=>e.kind),['model_request','model_response']);
 assert.equal(events[0].request_id,events[1].request_id);
 assert.deepEqual(events[1].usage,answer.usage);
});

test('rejects model substitution and truncated model output while retaining usage',async t=>{
 let response={...answer,model:'other-model'};
 const f=await fixture(t,(_req,res)=>json(res,response));const events=[];
 const adapter=createLlamaAdapter({...f,model:'local-test',onEvent:e=>events.push(e)});
 await assert.rejects(adapter.chat({messages:[]}),/identity mismatch/);
 response={...answer,choices:[{...answer.choices[0],finish_reason:'length'}]};
 await assert.rejects(adapter.chat({messages:[]}),/output budget/);
 assert.equal(events.filter(e=>e.kind==='model_response').length,2);
});

test('tokenizes runtime template and reserves image budget without sending pixels to template endpoint',async t=>{
 const f=await fixture(t,(req,res)=>json(res,req.url==='/apply-template'?{prompt:'rendered template'}:{tokens:[1,2,3]}));
 const adapter=createLlamaAdapter({...f,model:'local-test'});
 const messages=[{role:'user',content:[{type:'text',text:'look'},{type:'image_url',image_url:{url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII='}}]}];
 const result=await adapter.estimateContextFn({messages});
 assert.equal(result.tokens,4099);assert.equal(result.estimated,true);
 assert.equal(f.requests[0].body.messages[0].content[1].text,'[image evidence]');
 assert.equal(f.requests[1].body.content,'rendered template');
 assert.equal(messages[0].content[1].type,'image_url');
});

test('refuses redirects without reaching their target and reports one terminal error',async t=>{
 let redirected=0;
 const target=await fixture(t,(_req,res)=>{redirected++;json(res,answer);});
 const source=await fixture(t,(_req,res)=>{res.writeHead(307,{location:target.endpoint+'/v1/chat/completions'});res.end();});
 const events=[];
 await assert.rejects(createLlamaAdapter({...source,model:'local-test',onEvent:e=>events.push(e)}).chat({messages:[]}));
 assert.equal(redirected,0);
 assert.deepEqual(events.map(e=>e.kind),['model_request','model_error']);
 assert.equal(events[0].request_id,events[1].request_id);
});

test('rejects nonlocal/ambiguous endpoint configuration before networking',()=>{
 for(const endpoint of ['https://127.0.0.1','http://example.com','http://localhost','http://u:p@127.0.0.1','http://127.0.0.1/path','http://127.0.0.1?x=1','http://127.0.0.1#x'])assert.throws(()=>createLlamaAdapter({endpoint,model:'local-test'}));
 assert.throws(()=>createLlamaAdapter({endpoint:'http://127.0.0.1',model:'local-test',maxOutput:0}));
});

 test('forwards an explicit analyst response schema without adding tools',async t=>{
 const f=await fixture(t,(_req,res)=>json(res,answer));
 const responseFormat={type:'json_schema',json_schema:{name:'observations',strict:true,schema:{type:'object'}}};
 await createLlamaAdapter({...f,model:'local-test',responseFormat}).chat({messages:[],tools:[]});
 assert.deepEqual(f.requests[0].body.response_format,responseFormat);
 assert.equal(f.requests[0].body.tools,undefined);
 });
