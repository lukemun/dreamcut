import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

// The editor and native shell share one artwork source; generated containers
// belong in the ignored build directory.
export async function prepareAppIcon(source, output, platform = process.platform) {
  await fs.mkdir(output, { recursive: true });
  if (platform === 'darwin') {
    const iconset = path.join(output, 'DreamCut.iconset');
    await fs.mkdir(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        await sharp(source).resize(size * scale, size * scale).png()
          .toFile(path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
      }
    }
    const icon = path.join(output, 'DreamCut.icns');
    execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', icon]);
    return icon;
  }
  if (platform === 'win32') {
    const sizes = [16, 32, 48, 256];
    const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size).png().toBuffer()));
    const header = Buffer.alloc(6 + 16 * images.length);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    images.forEach((image, index) => {
      const entry = 6 + index * 16;
      header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(image.length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += image.length;
    });
    const icon = path.join(output, 'DreamCut.ico');
    await fs.writeFile(icon, Buffer.concat([header, ...images]));
    return icon;
  }
  throw Error('Unsupported application icon platform.');
}
