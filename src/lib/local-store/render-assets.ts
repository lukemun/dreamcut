/** One local URL contract for preparation fingerprints and the isolated renderer. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resolveMediaPath} from './media';
import {resolveMusicCatalogFile} from './music-catalog';
import {resolveSfxCatalogFile} from './sfx-catalog';
import {resolveImageCatalogFile} from './image-catalog';
import {resolveVisualCatalogFile} from './visual-catalog';

export function resolveRenderAsset(source: string, origin: string, publicRoot = path.resolve('public'), allowDirectory = false): string {
  const url = new URL(source, origin);
  if (url.origin !== new URL(origin).origin || url.search || url.hash) throw new Error(`Unsupported render asset: ${source}`);
  const segments = url.pathname.split('/').map(decodeURIComponent);
  if (segments.some(s => s === '..' || s === '.' || /[\\\0]/.test(s) || s.includes('/'))) throw new Error('Invalid asset path');
  const project = url.pathname.match(/^\/api\/(?:projects|trailers)\/([^/]+)\/media\/(.+)$/);
  let file: string | null;
  if (project) file = resolveMediaPath(decodeURIComponent(project[1]), project[2].split('/').map(decodeURIComponent));
  else {
    const catalog = url.pathname.match(/^\/api\/(music|sfx|image|visual)-catalog\/media\/(.+)$/);
    if (catalog) {
      const resolvers = {music: resolveMusicCatalogFile, sfx: resolveSfxCatalogFile, image: resolveImageCatalogFile, visual: resolveVisualCatalogFile};
      file = resolvers[catalog[1] as keyof typeof resolvers](decodeURIComponent(catalog[2]));
    } else {
      if (url.pathname.startsWith('/api/')) throw new Error(`Unsupported asset endpoint: ${url.pathname}`);
      file = path.resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(path.resolve(publicRoot) + path.sep)) throw new Error('Invalid public asset path');
    }
  }
  if (!file || (!fs.statSync(file).isFile() && !(allowDirectory && fs.statSync(file).isDirectory()))) throw new Error(`Missing render asset: ${source}`);
  return file;
}

export function renderAssetFiles(value: unknown, origin: string, publicRoot?: string): string[] {
  const files = new Set<string>();
  function visit(item: unknown) {
    if (Array.isArray(item)) return item.forEach(visit);
    if (item && typeof item === 'object') return Object.values(item).forEach(visit);
    if (typeof item !== 'string') return;
    if (item.startsWith('data:')) { if (item.startsWith('data:image/svg')) throw new Error('Inline SVG dependencies are unverified'); return; }
    if (/url\(/i.test(item)) throw new Error('Embedded CSS resources are unverified');
    if (!/^(https?:|\/|blob:|file:)/.test(item)) return;
    const file = resolveRenderAsset(item, origin, publicRoot, true);
    if (path.extname(file).toLowerCase() === '.svg') throw new Error('SVG dependencies are unverified');
    const collect = (entry:string) => {
      const stat=fs.lstatSync(entry);
      if(stat.isDirectory())for(const child of fs.readdirSync(entry).sort())collect(path.join(entry,child));
      else if(stat.isFile())files.add(entry);
      else throw new Error('Untracked render dependency type');
    };
    collect(file);
  }
  visit(value);
  return [...files].sort();
}

export function createRenderAssetHasher(runtimeVersion: string, publicRoot?: string) {
  const memo = new Map<string, {stamp: string; hash: string}>();
  return (input: unknown, origin: string): string => {
    const assets = renderAssetFiles(input, origin, publicRoot).map(file => {
      const stamp = () => {const s = fs.statSync(file, {bigint:true}); return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;};
      const before = stamp(); let saved = memo.get(file);
      if (saved?.stamp !== before) {
        const hash = createHash('sha256'), fd = fs.openSync(file, 'r'), buffer = Buffer.alloc(1024*1024);
        try {let n; while ((n = fs.readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0,n));} finally {fs.closeSync(fd);}
        if (stamp() !== before) throw new Error(`Asset changed while reading: ${file}`);
        saved = {stamp:before, hash:hash.digest('hex')}; memo.set(file,saved);
      }
      return [file,saved.hash];
    });
    return createHash('sha256').update(JSON.stringify({runtimeVersion,assets})).digest('hex');
  };
}
