import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ensureProviderPatch} from '../../scripts/patch-provider-cancellation.mjs';
import {ChatMemoryRuntime} from '../../src/lib/memory/runtime';
import type {Bash} from 'just-bash';
const owned:string[]=[];
afterEach(()=>{vi.unstubAllGlobals();for(const root of owned.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(version='3.1.0',unknown=false){
  const root=mkdtempSync(path.join(tmpdir(),'portia-patch-'));owned.push(root);
  const directory=path.join(root,'node_modules/@openrouter/ai-sdk-provider');mkdirSync(path.join(directory,'dist'),{recursive:true});
  writeFileSync(path.join(directory,'package.json'),JSON.stringify({version}));
  const source=readFileSync('node_modules/@openrouter/ai-sdk-provider/dist/index.js','utf8').replace('    cancel(reason) {\n      return reader.cancel(reason);\n    }','    cancel(reason) {\n      reader.cancel(reason);\n    }');
  writeFileSync(path.join(directory,'dist/index.js'),unknown?'unexpected':source);return root;
}
it('requires the reviewed patch and applies it idempotently to pristine package bytes',()=>{
  const root=fixture();expect(()=>ensureProviderPatch({root,checkOnly:true})).toThrow('missing');
  expect(ensureProviderPatch({root})).toBe('applied');expect(ensureProviderPatch({root})).toBe('verified');expect(ensureProviderPatch({root,checkOnly:true})).toBe('verified');
});
it.each([['unknown version','99.0.0',false],['unknown hash','3.1.0',true]] as const)('refuses %s instead of silently altering dependencies',(_name,version,unknown)=>{
  const root=fixture(version,unknown),file=path.join(root,'node_modules/@openrouter/ai-sdk-provider/dist/index.js'),before=readFileSync(file,'utf8');
  expect(()=>ensureProviderPatch({root})).toThrow();expect(readFileSync(file,'utf8')).toBe(before);
});
it('restricts the serving memory runtime while retaining SQLite and inert hostile values',async()=>{
  const runtime=await ChatMemoryRuntime.restore(null);
  const shell=(runtime as unknown as {shell:Bash}).shell;
  for(const command of ['printf %.1000f 1','/usr/bin/printf x','command printf x','builtin printf x','awk BEGIN{}','curl https://example.com','wget https://example.com','python3 -c 1','js-exec 1']){
    const result=await shell.exec(command);expect(result.exitCode,command).not.toBe(0);
  }
  const value="x'); DROP TABLE facts; -- $(printf 'bad')";
  await runtime.apply([{kind:'remember',key:'inert',value,source:'chat-a'}]);
  expect(await runtime.facts()).toEqual([{key:'inert',value,sources:['chat-a']}]);
},15_000);
