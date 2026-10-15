/** Owned, deterministic 9:16 source artwork. No model calls or project mutations. */
import fs from 'node:fs';
import sharp from 'sharp';
async function main() {
const dir = 'public/inspector-previews/sources';
fs.mkdirSync(dir, {recursive:true});
const subject = `<g><path d="M79 103Q68 130 71 163L58 219Q57 229 67 230L79 230L91 178L101 226Q103 232 115 231L125 229L105 161L105 126L118 149L137 145L135 135L121 138L108 107Z" fill="#ed8c56"/><circle cx="89" cy="86" r="17" fill="#f2c4a0"/><path d="M72 84Q66 59 89 63Q112 60 107 85L98 73L75 84Z" fill="#202a43"/><path d="M79 168L101 166L124 230L104 232L91 184L79 232L58 232Z" fill="#344b76"/></g>`;
for (const [name, sky, far, near, sun] of [['a','#9bc3ce','#617895','#335e70','#f6e6b7'],['b','#e8b6a1','#b87982','#714f78','#fff2cb']]) {
 const background = `<defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#edf0d9"/></linearGradient></defs><rect width="180" height="320" fill="url(#s)"/><circle cx="${name==='a'?38:139}" cy="65" r="24" fill="${sun}"/><path d="M-20 185L43 98L92 179L142 83L200 179V320H0Z" fill="${far}"/><path d="M-10 230L50 165L89 210L150 151L195 220V320H0Z" fill="${near}"/><path d="M0 271Q86 241 180 272V320H0Z" fill="#233e42"/><path d="M65 320L98 252L110 252L135 320Z" fill="#d7b899"/>`;
 for (const plain of [false,true]) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 180 320">${background}${plain?'':subject}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${dir}/${name}${plain?'-background':''}.png`);
 }
}
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 180 320">${subject}</svg>`)).png().toFile(`${dir}/subject.png`);
console.log('Prepared owned 9:16 A/B stills and separate subject.');

}
main().catch(error => {console.error(error); process.exitCode = 1;});
