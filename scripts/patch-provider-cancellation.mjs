import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const providerPatch = Object.freeze({
  version:'3.1.0',
  original:'6a34db98a9aa74622f20f517b7e28043fe8e9b61b9d2d02d47500b3bbda65645',
  patched:'10e47b9e7f2439becf5c716967458e877ddedee287a7003c6bf57a35ee4a9160',
});
const digest=source=>createHash('sha256').update(source).digest('hex');

/** Own the adapter's cancellation promise. Refuse unknown upstream bytes. */
export function ensureProviderPatch({root=process.cwd(),checkOnly=false}={}) {
  const directory=path.join(root,'node_modules/@openrouter/ai-sdk-provider');
  const manifest=JSON.parse(readFileSync(path.join(directory,'package.json'),'utf8'));
  if(manifest.version!==providerPatch.version)throw new Error('Provider cancellation patch: unreviewed package version; review/update the patch before continuing.');
  const file=path.join(directory,'dist/index.js');
  const source=readFileSync(file,'utf8');
  const hash=digest(source);
  if(hash===providerPatch.patched)return 'verified';
  if(hash!==providerPatch.original)throw new Error('Provider cancellation patch: unrecognized source hash; refusing to overwrite it.');
  if(checkOnly)throw new Error('Provider cancellation patch is missing. Run npm install (with install scripts) or node scripts/patch-provider-cancellation.mjs.');
  const before='    cancel(reason) {\n      reader.cancel(reason);\n    }';
  const after='    cancel(reason) {\n      return reader.cancel(reason);\n    }';
  const patched=source.replace(before,after);
  if(digest(patched)!==providerPatch.patched)throw new Error('Provider cancellation patch produced unexpected bytes.');
  writeFileSync(file,patched);
  return 'applied';
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  console.log('Provider cancellation patch: '+ensureProviderPatch({checkOnly:process.argv.includes('--check')}));
}
