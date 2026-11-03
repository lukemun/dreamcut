import fs from "node:fs";
import path from "node:path";

import { createColorManagedVideoPair } from "./lib/color-managed-video";

function usage(): never {
  throw new Error("Usage: color-managed-video <source> <render-authority.mov> <preview-proxy.mp4> [preview-width] [preview-height] [receipt.json]");
}

const argv = process.argv.slice(2);
if (argv[0] === "--") argv.shift();
const [sourceArg, authorityArg, proxyArg, widthArg = "540", heightArg = "960", receiptArg] = argv;
if (!sourceArg || !authorityArg || !proxyArg) usage();
const previewWidth = Number(widthArg);
const previewHeight = Number(heightArg);
if (!Number.isInteger(previewWidth) || previewWidth <= 0 || !Number.isInteger(previewHeight) || previewHeight <= 0) usage();

const receipt = createColorManagedVideoPair({
  sourcePath: path.resolve(sourceArg),
  renderAuthorityPath: path.resolve(authorityArg),
  previewProxyPath: path.resolve(proxyArg),
  previewWidth,
  previewHeight,
});
if (receiptArg) {
  const receiptPath = path.resolve(receiptArg);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
}
console.log(JSON.stringify(receipt, null, 2));
