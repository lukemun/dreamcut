import fs from 'node:fs';
import path from 'node:path';
import {projectDir} from '@/lib/local-store/paths';
import {visualCatalogMediaRoot} from '@/lib/local-store/visual-catalog';
/** Local native reads match the editor's managed media, visual catalog and public assets. */
export function nativeSourcePath(projectId:string,url:string){
 if(!/^[a-zA-Z0-9_-]+$/.test(projectId))throw Error('Invalid project');
 const prefix=`/api/projects/${projectId}/media/`;
 let directory:string,relative:string;
 if(url.startsWith(prefix)){directory=path.join(projectDir(projectId),'media');relative=url.slice(prefix.length);}
 else if(url.startsWith('/api/visual-catalog/media/')){relative=url.slice('/api/visual-catalog/media/'.length);const personal=/^_personal\//.test(decodeURIComponent(relative));directory=visualCatalogMediaRoot(decodeURIComponent(relative));if(personal)relative=relative.slice(relative.indexOf('/')+1);}
 else if(url.startsWith('/')&&!url.startsWith('//')&&!url.startsWith('/api/')){directory=path.resolve('public');relative=url.slice(1);}
 else throw Error('Only this project’s local media, visual catalog and public assets are allowed');
 if(/[?#]/.test(relative))throw Error('Native media URL must not contain query or fragment');
 const root=fs.realpathSync(directory),file=fs.realpathSync(path.resolve(root,decodeURIComponent(relative)));
 if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw Error('Media path outside project or asset root');
 const stat=fs.statSync(file);return {file,identity:`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`};
}
