import fs from 'node:fs';
import path from 'node:path';

export const NATIVE_PREVIEW_BINARY='dreamcut-native-preview';
/** Cargo package name before the DreamCut rename; existing builds keep working until rebuilt. */
const LEGACY_NATIVE_PREVIEW_BINARY='openedit-native-preview';

/** The built Rust helper: the DreamCut build when present, else a helper built under the OpenEdit name. */
export function nativePreviewBinary(root=process.cwd()){
 const directory=path.join(root,'native/preview/target/release');
 const current=path.join(directory,NATIVE_PREVIEW_BINARY),legacy=path.join(directory,LEGACY_NATIVE_PREVIEW_BINARY);
 return !fs.existsSync(current)&&fs.existsSync(legacy)?legacy:current;
}
