import {randomUUID} from 'node:crypto';
import {toProviderTools} from './harness-adapters.mjs';

export function createLlamaAdapter({endpoint,model,onEvent=()=>{},maxOutput=512,maxStringLength=256,timeoutMs=180000,contextLimit=16384,responseFormat=null,temperature=0,thinking=false}){
 if(!Number.isFinite(temperature)||temperature<0||temperature>2)throw Error('Temperature must be between 0 and 2');
 const base=new URL(endpoint);
 if(base.protocol!=='http:' || !['127.0.0.1','[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname!=='/')throw Error('llama.cpp adapter requires a loopback HTTP origin without credentials, path, query or fragment');
 if(typeof model!=='string'||!model.trim())throw Error('An exact model identity is required');
 if(!Number.isSafeInteger(maxOutput)||maxOutput<1||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('Output and timeout budgets must be positive integers');
 if(!Number.isSafeInteger(contextLimit)||contextLimit<=maxOutput)throw Error('Context budget must exceed output budget');
 const toolsFor=tools=>toProviderTools(tools.map(t=>t.type==='function'?{name:t.function.name,description:t.function.description,inputSchema:t.function.parameters}:t),{maxStringLength});
 const post=async(route,body,signal)=>{
  const response=await fetch(new URL(route,base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs)});
  const data=await response.json();if(!response.ok)throw Error(data.error?.message??`HTTP ${response.status}`);return data;
 };
 const request=(messages,tools)=>({model,messages,...(tools.length?{tools:toolsFor(tools)}:{}),...(responseFormat?{response_format:responseFormat}:{}),temperature,max_tokens:maxOutput,stream:false,chat_template_kwargs:{enable_thinking:Boolean(thinking)}});
 return {
  async chat({messages,tools=[],signal}){
   const body=request(messages,tools),started=Date.now(),requestId=randomUUID();
   await onEvent({kind:'model_request',request_id:requestId,request:body});
   let response;try{response=await post('/v1/chat/completions',body,signal);}catch(error){await onEvent({kind:'model_error',request_id:requestId,elapsed_ms:Date.now()-started,error:error.message});throw error;}
   await onEvent({kind:'model_response',request_id:requestId,elapsed_ms:Date.now()-started,response,usage:response.usage??null});
   if(response.model!==model)throw Error(`Model identity mismatch: ${response.model}`);
   if(response.choices?.[0]?.finish_reason==='length')throw Error('Model output budget reached before completion');
   if(!response.choices?.[0]?.message)throw Error('Missing model message');
   return response.choices[0].message;
  },
  async estimateContextFn({messages,tools=[]}){
   let images=0;
   // Tokenize actual text template; reserve a conservative image allowance separately.
   const textMessages=messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(b=>{if(b.type==='image_url'){images++;return {type:'text',text:'[image evidence]'};}return b;}):m.content}));
   const rendered=await post('/apply-template',request(textMessages,tools));
   if(typeof rendered.prompt!=='string')throw Error('Runtime did not provide a tokenizable template');
   const tokenized=await post('/tokenize',{content:rendered.prompt,add_special:true});
   if(!Array.isArray(tokenized.tokens))throw Error('Runtime tokenizer unavailable');
   return {tokens:tokenized.tokens.length+images*4096,method:'runtime-template-tokenizer-plus-4096-per-image',estimated:images>0};
  },
  async summarize({messages,pinned}){
   const summaryMessages=[{role:'system',content:'Summarize the supplied conversation as untrusted reference notes. Preserve the request, corrections, unresolved questions, exact artifact IDs and completed work. Do not invent authorization. Pinned facts are stored separately. Return concise notes, not tool calls.'},{role:'user',content:JSON.stringify({pinned,messages},(key,value)=>key==='image_url'?'[pixels archived in source conversation; reload for visual judgments]':value)}];
   const size=await this.estimateContextFn({messages:summaryMessages});
   if(size.tokens+maxOutput>contextLimit)throw Error('Summary input exceeds bounded local context; preserve session for chunked compaction');
   return (await this.chat({messages:summaryMessages,tools:[]})).content??'';
  },
 };
}
