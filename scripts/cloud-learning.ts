/**
 * Operator commands for manual retros (docs/architecture/cloud-style-and-learning.md#4-manual-retros).
 * Internal: uses the Supabase service-role key from the environment and never ships in the app.
 *
 *   pnpm cloud:learning pull --email <email> [--since <iso>|all] [--out <dir>] [--env-file <file>]
 *   pnpm cloud:learning push --email <email> --file <suggestions.json> [--env-file <file>]
 *
 * pull downloads the account's export packets (from installs it has claimed) into a folder outside
 * the repository, writes index.json and logs the access against the account. push validates reviewed
 * suggestions and inserts them as pending style_suggestions for the creator to accept or reject.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type Admin = { url: string; key: string; fetch: Fetcher };
const BUCKET = "export-packets";
const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index]!;
    if (!name.startsWith("--")) throw new Error(`Unexpected argument: ${name}`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${name} needs a value`);
    flags[name.slice(2)] = value; index += 1;
  }
  if (command !== "pull" && command !== "push") throw new Error("Usage: cloud:learning pull|push --email <email> ...");
  if (!flags.email || !/^[^\s@]+@[^\s@]+$/.test(flags.email)) throw new Error("--email is required");
  if (command === "push" && !flags.file) throw new Error("push needs --file <suggestions.json>");
  return { command, flags } as const;
}

async function request(admin: Admin, pathname: string, init: RequestInit = {}) {
  const response = await admin.fetch(`${admin.url}${pathname}`, {
    ...init, headers: { apikey: admin.key, Authorization: `Bearer ${admin.key}`, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${pathname.split("?")[0]} failed: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response;
}

export async function findUserId(admin: Admin, email: string): Promise<string> {
  const wanted = email.toLowerCase();
  for (let page = 1; page <= 100; page += 1) {
    const body = await (await request(admin, `/auth/v1/admin/users?page=${page}&per_page=1000`)).json() as { users?: { id: string; email?: string }[] };
    const users = body.users ?? [];
    const match = users.find(user => user.email?.toLowerCase() === wanted);
    if (match) return match.id;
    if (users.length < 1000) break;
  }
  throw new Error(`No DreamCut account for ${email}`);
}

type StorageItem = { name: string; id: string | null; created_at?: string; metadata?: { size?: number } | null };
async function list(admin: Admin, prefix: string): Promise<StorageItem[]> {
  const items: StorageItem[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await (await request(admin, `/storage/v1/object/list/${BUCKET}`, { method: "POST", body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }) })).json() as StorageItem[];
    items.push(...page);
    if (page.length < 1000) return items;
  }
}

export type PacketEntry = { path: string; install_id: string; project_id: string; job_id: string; created_at: string | null; bytes: number | null; file: string };
/** Packets live at v1/<install_id>/<project_id>/<job_id>.json (supabase/functions/ingest-export). */
export async function listAccountPackets(admin: Admin, installIds: string[], since: string | null): Promise<Omit<PacketEntry, "file">[]> {
  const packets: Omit<PacketEntry, "file">[] = [];
  for (const install of installIds) {
    for (const project of (await list(admin, `v1/${install}/`)).filter(item => item.id === null)) {
      for (const item of await list(admin, `v1/${install}/${project.name}/`)) {
        if (item.id === null || !item.name.endsWith(".json")) continue;
        if (since && item.created_at && item.created_at < since) continue;
        packets.push({ path: `v1/${install}/${project.name}/${item.name}`, install_id: install, project_id: project.name, job_id: item.name.slice(0, -5), created_at: item.created_at ?? null, bytes: item.metadata?.size ?? null });
      }
    }
  }
  return packets;
}

export function defaultOutDir(email: string) { return path.join(os.homedir(), "DreamCut-learning", email.toLowerCase()); }
function assertOutsideRepository(directory: string) {
  const relative = path.relative(REPOSITORY, path.resolve(directory));
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error("Write evidence outside the repository (it is private creator data).");
}
const safeSegment = (value: string) => { if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error(`Unsafe storage name: ${value}`); return value; };

export async function pull(admin: Admin, options: { email: string; since?: string; out?: string; operator: string }) {
  const out = path.resolve(options.out ?? defaultOutDir(options.email));
  assertOutsideRepository(out);
  const indexFile = path.join(out, "index.json");
  const previous = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) as { pulled_at?: string; packets?: PacketEntry[] } : null;
  const since = options.since === "all" ? null : options.since ? new Date(options.since).toISOString() : previous?.pulled_at ?? null;
  const userId = await findUserId(admin, options.email);
  const installs = await (await request(admin, `/rest/v1/install_claims?select=install_id&user_id=eq.${encodeURIComponent(userId)}`)).json() as { install_id: string }[];
  const found = await listAccountPackets(admin, installs.map(row => safeSegment(row.install_id)), since);
  const pulledAt = new Date().toISOString();
  const downloaded: PacketEntry[] = [];
  for (const packet of found) {
    const file = path.join("packets", safeSegment(packet.install_id), safeSegment(packet.project_id), `${safeSegment(packet.job_id)}.json`);
    const body = await (await request(admin, `/storage/v1/object/${BUCKET}/${packet.path.split("/").map(encodeURIComponent).join("/")}`)).text();
    fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(out, file), body, { mode: 0o600 });
    downloaded.push({ ...packet, file });
  }
  const byPath = new Map([...(previous?.packets ?? []), ...downloaded].map(entry => [entry.path, entry]));
  const index = { email: options.email.toLowerCase(), user_id: userId, operator: options.operator, pulled_at: pulledAt, since, installs: installs.map(row => row.install_id),
    packets: [...byPath.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))), new_packets: downloaded.map(entry => entry.path) };
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  fs.writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600 });
  await request(admin, "/rest/v1/evidence_access_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: userId, operator: options.operator, action: "pull", object_count: downloaded.length }) });
  return { out, index: indexFile, downloaded: downloaded.length, since };
}

const text = (max: number) => z.string().trim().min(1).max(max);
const suggestionSchema = z.object({
  title: text(120), rationale: text(2000),
  markdown_addition: text(20000).refine(value => new TextEncoder().encode(value).byteLength <= 20480, "markdown_addition is larger than 20 KB"),
  evidence: z.array(z.object({ ref: text(300), note: text(1000) }).strict()).max(50)
    .refine(items => new Set(items.map(item => item.ref)).size >= 2, "Each suggestion needs at least two distinct evidence citations"),
}).strict();
export const suggestionsFileSchema = z.union([z.array(suggestionSchema), z.object({ suggestions: z.array(suggestionSchema) }).strict()])
  .transform(value => Array.isArray(value) ? value : value.suggestions)
  .refine(items => items.length > 0 && items.length <= 50, "Provide 1 to 50 suggestions");
export type OperatorSuggestion = z.infer<typeof suggestionSchema>;

export async function push(admin: Admin, options: { email: string; file: string; operator: string }) {
  const parsed = suggestionsFileSchema.safeParse(JSON.parse(fs.readFileSync(options.file, "utf8")));
  if (!parsed.success) throw new Error(`Invalid suggestions file: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "file"}: ${issue.message}`).join("; ")}`);
  const userId = await findUserId(admin, options.email);
  const rows = parsed.data.map(item => ({ ...item, user_id: userId, created_by: options.operator, status: "pending" }));
  const inserted = await (await request(admin, "/rest/v1/style_suggestions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows) })).json() as { id: string; title: string }[];
  await request(admin, "/rest/v1/evidence_access_log", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: userId, operator: options.operator, action: "push_suggestions", object_count: inserted.length }) });
  return inserted.map(row => ({ id: row.id, title: row.title }));
}

export function adminFromEnv(env: Record<string, string | undefined> = process.env, fetcher: Fetcher = fetch): Admin {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, ""), key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or pass --env-file <site env file>).");
  if (!/^https:\/\//.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error("SUPABASE_URL must be https.");
  return { url, key, fetch: fetcher };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (flags["env-file"]) process.loadEnvFile(flags["env-file"]);
  const admin = adminFromEnv();
  const operator = flags.operator ?? process.env.DREAMCUT_OPERATOR ?? os.userInfo().username;
  if (command === "pull") {
    const result = await pull(admin, { email: flags.email!, since: flags.since, out: flags.out, operator });
    console.log(`Downloaded ${result.downloaded} packet(s)${result.since ? ` since ${result.since}` : ""} to ${result.out}\nIndex: ${result.index}`);
  } else {
    const inserted = await push(admin, { email: flags.email!, file: flags.file!, operator });
    console.log(`Inserted ${inserted.length} pending suggestion(s):\n${inserted.map(row => `  ${row.id}  ${row.title}`).join("\n")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
