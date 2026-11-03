/** The local editor's browser-facing origin. Next may reconstruct request.url with its
 * internal hostname and default port (the desktop service listens on a random port),
 * so Host is the authority; never trust forwarded host headers. */
export function editorRequestOrigin(request: Request) {
 const url=new URL(request.url);
 const host=request.headers.get('host') ?? url.host;
 const expected=`${url.protocol}//${host}`;
 const authority=new URL(expected);
 if(authority.host!==host || !['localhost','127.0.0.1','[::1]'].includes(authority.hostname)) throw new Error('Frame capture requires the local editor.');
 return expected;
}
export function assertEditorOrigin(request: Request) {
 const expected=editorRequestOrigin(request);
 const origin=request.headers.get('origin');
 const site=request.headers.get('sec-fetch-site');
 if((origin && origin!==expected) || (site && site!=='same-origin' && site!=='none')) throw new Error('Cross-origin preview access is forbidden.');
 return expected;
}
