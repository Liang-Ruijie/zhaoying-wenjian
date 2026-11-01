import {RequestSchema,ResultSchema,checkSchema,deriveConstraints,validateConfig,configHash} from '../trials/schema.js';
export const ERRORS={NO_KEY:'在线生成尚未配置，请先选择预设试炼。',UNAVAILABLE:'试炼服务不可用，预设仍可游玩。',NETWORK:'无法连接试炼服务，请检查连接或使用预设。',TIMEOUT:'生成超时，可重试或选择预设。',CANCELLED:'已取消生成。',RATE_LIMIT:'请求过于频繁，请稍后重试或使用预设。',BUDGET:'生成额度已达上限，预设仍可游玩。',INVALID_OUTPUT:'返回的配置未通过校验，未执行。可重试或使用预设。',UNSUPPORTED:'当前需求超出已实现能力，请修改或选预设。',AUTH:'演示访问未授权，请使用预设。'};
export class TrialRequestError extends Error{constructor(code,message){super(message||ERRORS[code]||ERRORS.UNAVAILABLE);this.code=code;}}
export async function requestTrial(request,{signal,timeoutMs=15000,fetcher=globalThis.fetch}={}){
 if(checkSchema(request,RequestSchema).length)throw new TrialRequestError('UNSUPPORTED','需求格式无效或超过240字。');
 const required=deriveConstraints(request.text,request.previousConfig);if(!required.ok)throw new TrialRequestError(required.code,required.message);
 const controller=new AbortController();let timedOut=false;const cancel=()=>controller.abort();if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 let rejectAbort;const aborted=new Promise((_,reject)=>rejectAbort=reject);aborted.catch(()=>{});const onAbort=()=>rejectAbort(new TrialRequestError(timedOut?'TIMEOUT':'CANCELLED'));controller.signal.addEventListener('abort',onAbort,{once:true});if(controller.signal.aborted)onAbort();
 const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{
  const response=await Promise.race([fetcher('/api/trials/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal}),aborted]);
  const raw=await Promise.race([response.text(),aborted]);if(raw.length>40000)throw new TrialRequestError('INVALID_OUTPUT');
  let body;try{body=JSON.parse(raw);}catch{throw new TrialRequestError(response.ok?'INVALID_OUTPUT':'UNAVAILABLE');}
  if(!response.ok)throw new TrialRequestError(body?.error?.code||'UNAVAILABLE',body?.error?.message);
  if(controller.signal.aborted)throw new TrialRequestError(timedOut?'TIMEOUT':'CANCELLED');
  if(checkSchema(body,ResultSchema).length||body.requestId!==request.requestId||!validateConfig(body.config,required.constraints).ok||configHash(body.config)!==body.metadata.configHash)throw new TrialRequestError('INVALID_OUTPUT');
  return body;
 }catch(e){if(controller.signal.aborted)throw new TrialRequestError(timedOut?'TIMEOUT':'CANCELLED');if(e instanceof TrialRequestError)throw e;throw new TrialRequestError('NETWORK');}
 finally{controller.signal.removeEventListener('abort',onAbort);clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
