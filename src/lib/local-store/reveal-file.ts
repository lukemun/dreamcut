import { spawn } from "node:child_process";
import path from "node:path";

/** The file manager command that selects one file in its folder. */
function revealCommand(file: string): [string, string[]] {
  if (process.platform === "darwin") return ["open", ["-R", file]];
  if (process.platform === "win32") return ["explorer.exe", [`/select,${file}`]];
  return ["xdg-open", [path.dirname(file)]];
}

/** Show a file in Finder (or the platform's file manager). The editor's server runs on this computer. */
export async function revealInFileManager(file: string): Promise<void> {
  const [command, args] = revealCommand(file);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}
