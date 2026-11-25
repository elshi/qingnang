import fs from 'node:fs/promises';
import {catalog as coreCatalog,yizongParts} from './catalog.mjs';
import {BATCH} from './common.mjs';
export const catalog=BATCH==='core-50'?coreCatalog:JSON.parse(await fs.readFile(new URL('./catalog-extra-300.json',import.meta.url),'utf8'));
if(catalog.length!==(BATCH==='core-50'?50:300)||new Set(catalog.map(b=>b.key)).size!==catalog.length)throw new Error('Unexpected batch catalogue size');
export {yizongParts};
