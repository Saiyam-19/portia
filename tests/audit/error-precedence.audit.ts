import {afterEach,expect,it,vi} from 'vitest';
import {modelErrorDetails} from '../../src/lib/migration/error-reporting';
import {responseErrorMessage} from '../../src/lib/migration/response-errors';
import {withSafeModelErrors} from '../../src/lib/migration/safe-model';
import {MockLanguageModelV4} from 'ai/test';
afterEach(()=>vi.unstubAllGlobals());
it.each([401,403,402,429,503])('keeps HTTP%s guidance ahead of nested network errors',statusCode=>{
  const message=responseErrorMessage({statusCode,cause:{code:'ECONNRESET'}});
  expect(message).toContain(statusCode===402?'spending limit':statusCode===401||statusCode===403?'unavailable':'is busy right now');
});
it('retains timeout ahead of nested cancellation/network errors through repeated sanitization',async()=>{
  const original=Object.assign(new Error('PRIVATE'),{name:'TimeoutError',cause:{name:'AbortError',cause:{code:'ECONNRESET'}}});
  const model=withSafeModelErrors(withSafeModelErrors(new MockLanguageModelV4({doGenerate:async()=>{throw original;}})));
  const error=await Promise.resolve(model.doGenerate({prompt:[]})).catch((error:unknown)=>error);
  expect(modelErrorDetails(error)).toMatchObject({errorType:'timeout'});expect(responseErrorMessage(error)).toContain('took too long');expect(String(error)).not.toContain('PRIVATE');
});
it('preserves invalid response classification and ignores arbitrary or cyclic error metadata',()=>{
  expect(modelErrorDetails({errorType:'invalid_response'})).toEqual({statusCode:null,errorType:'invalid_response'});
  const cyclic:{errorType:string;cause?:unknown}={errorType:'PRIVATE_PAYLOAD'};cyclic.cause=cyclic;
  expect(modelErrorDetails(cyclic)).toEqual({statusCode:null});
  expect(modelErrorDetails({name:'TimeoutError',cause:{errorType:'network'}}).errorType).toBe('timeout');
});
it.each([[402,'AbortError'],[401,'AbortError'],[504,'TimeoutError'],[503,'TimeoutError']] as const)('preserves HTTP%s through safe %s round trips',async(statusCode,name)=>{
  const original={statusCode,name,message:'PRIVATE',cause:{code:'ECONNRESET'}};
  const model=withSafeModelErrors(withSafeModelErrors(new MockLanguageModelV4({doGenerate:async()=>{throw original;}})));
  const error=await Promise.resolve(model.doGenerate({prompt:[]})).catch((error:unknown)=>error);
  expect(modelErrorDetails(error)).toEqual(modelErrorDetails(original));expect(responseErrorMessage(error)).toBe(responseErrorMessage(original));expect(String(error)).not.toContain('PRIVATE');
});
