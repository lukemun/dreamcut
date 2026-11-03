/**
 * Save one shared catalog file that DreamCut Cloud serves through a short-lived link.
 *
 * The catalog endpoints (`/api/v1/sounds/<file>`, `/api/v1/visuals/<file>`) answer with
 * `{ url }`; this downloads that link to a temporary name beside the target, hashing as it
 * writes, and renames it into place only when the bytes match the catalog entry. Nothing is
 * kept on a size, hash, space or network failure.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export type CatalogDownloadLimits = {
  /** The file the bytes end up in. */
  target: string;
  /** The catalog entry's SHA-256; a download that does not match it is refused. */
  sha256?: string;
  /** Largest file accepted. */
  maxBytes: number;
  /** Free space that must remain on the target's volume after the file is written. */
  reserveBytes: number;
  /** Time allowed for the whole file. */
  timeoutMs: number;
  /** What the file is, in messages: "sound", "clip". */
  noun: string;
};

function failure(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

function freeBytes(directory: string): number | null {
  try { const stat = fs.statfsSync(directory); return stat.bavail * stat.bsize; } catch { return null; }
}

/** Download the link in a Cloud catalog response and save it to `target`. */
export async function saveCatalogDownload(linkResponse: Response, limits: CatalogDownloadLimits): Promise<string> {
  const { target, sha256, maxBytes, reserveBytes, timeoutMs, noun } = limits;
  const { url } = await linkResponse.json() as { url?: string };
  if (typeof url !== "string" || !/^https:\/\//.test(url)) throw failure("DreamCut returned an invalid download link.", 502);
  const file = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => {
    throw failure(`Could not download this ${noun}. Check the connection and try again.`, 503);
  });
  if (!file.ok || !file.body) throw failure(`The ${noun} download failed (${file.status}).`, 502);
  const declared = Number(file.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && (declared <= 0 || declared > maxBytes)) throw failure(`The downloaded ${noun} has an unexpected size.`, 502);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const needed = (Number.isFinite(declared) ? declared : maxBytes) + reserveBytes;
  const free = freeBytes(path.dirname(target));
  if (free === null || free < needed) throw failure(`Not enough free disk space to save this ${noun}.`, 507);

  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  const hash = createHash("sha256");
  let bytes = 0;
  const output = fs.openSync(temporary, "wx");
  try {
    try {
      for await (const chunk of Readable.fromWeb(file.body as import("node:stream/web").ReadableStream<Uint8Array>)) {
        bytes += chunk.length;
        if (bytes > maxBytes) throw failure(`The downloaded ${noun} has an unexpected size.`, 502);
        hash.update(chunk);
        fs.writeSync(output, chunk);
      }
    } catch (error) {
      if ((error as { status?: number }).status) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOSPC") throw failure(`Not enough free disk space to save this ${noun}.`, 507);
      throw failure(`The ${noun} download was interrupted. Check the connection and try again.`, 503);
    } finally {
      fs.closeSync(output);
    }
    if (bytes === 0) throw failure(`The downloaded ${noun} has an unexpected size.`, 502);
    if (sha256 && hash.digest("hex") !== sha256) throw failure(`The downloaded ${noun} does not match the catalog; it was not saved.`, 502);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return target;
}
