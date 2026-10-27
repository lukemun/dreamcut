// Serves a built dist/web-runtime folder on 127.0.0.1:4555, standing in for GitHub Releases, so the
// installed launcher downloads this checkout's runtime exactly as a user's would download a release.
//   node serve-runtime.mjs <dist\web-runtime folder>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '');
if (!fs.existsSync(path.join(root, 'latest.json'))) throw new Error(`No built runtime (latest.json) in ${root}`);
http.createServer((request, response) => {
  const file = path.join(root, decodeURIComponent(new URL(request.url ?? '/', 'http://local').pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.statusCode = 404; response.end(); return; }
  fs.createReadStream(file).pipe(response);
}).listen(4555, '127.0.0.1');
