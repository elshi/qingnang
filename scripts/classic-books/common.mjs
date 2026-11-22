import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA = path.join(ROOT, 'txt/classic-books');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  await fs.writeFile(file, JSON.stringify(value,null,2)+'\n','utf8');
}
export async function readJson(file) { return JSON.parse(await fs.readFile(file,'utf8')); }
export function inside(root, relative) {
  const dest=path.resolve(root,relative);
  if (!dest.startsWith(path.resolve(root)+path.sep)) throw new Error('Path outside dataset');
  return dest;
}
export async function snapshot(url, refresh=false) {
  const stem=sha256(url).slice(0,24), relative=`raw/${stem}.html.gz`;
  const metaFile=path.join(DATA,`raw/${stem}.json`), rawFile=path.join(DATA,relative);
  if(!refresh) {
    try {
      const metadata=await readJson(metaFile), html=gunzipSync(await fs.readFile(rawFile)).toString('utf8');
      if(metadata.url!==url || sha256(html)!==metadata.sha256) throw new Error('Snapshot checksum mismatch');
      return {html,metadata};
    } catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  let failure;
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const res=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'Qingnang-classic-books/1.0 (public-domain text archival)'}});
      if(!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      const html=await res.text();
      if(!html.includes('</html>')) throw new Error(`Incomplete HTML: ${url}`);
      const metadata={url,final_url:res.url,retrieved_at:new Date().toISOString(),etag:res.headers.get('etag'),last_modified:res.headers.get('last-modified'),sha256:sha256(html),bytes:Buffer.byteLength(html),file:relative};
      await fs.mkdir(path.dirname(rawFile),{recursive:true});
      await fs.writeFile(rawFile,gzipSync(html,{level:9}));
      await writeJson(metaFile,metadata);
      return {html,metadata};
    } catch(e) {failure=e;if(attempt<2) await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
  }
  throw failure;
}
