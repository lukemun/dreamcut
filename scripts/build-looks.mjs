// Motion-graphic looks are supplied by DreamCut per graphic (src/lib/hyperframes/look-bundle.ts):
// the runtime, the drawing kit and the one look a graphic uses, after any looks it builds on (read as
// `DreamcutMotion.LOOKS.<id>`). Nothing is generated into the repo.
// `buildLooks` joins the runtime, the kit and the given looks (default: every registered look) in
// memory, for previewing looks outside a project. Run directly, it checks that every look in
// looks.json has its code and details and builds into a bundle that parses and registers that look.
import fs from "node:fs";
import path from "node:path";

const LOOKS_DIR = ".agents/skills/motion-graphics/looks";

function read(dir, file) {
  return fs.readFileSync(path.join(dir, file), "utf8").trimEnd();
}

const BASE_LOOK_RE = /DreamcutMotion\.LOOKS(?:\.([a-z0-9_]+)|\[["']([a-z0-9-]+)["']\])/g;

/** The looks a look's code reads from another look. */
function basesOf(dir, id) {
  return [...read(dir, `${id}.js`).matchAll(BASE_LOOK_RE)].map((m) => m[1] ?? m[2]).filter((base) => base !== id);
}

/** The given looks with the looks they build on, bases first, each once. */
function withBases(dir, ids, seen = new Set()) {
  return ids.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const bases = basesOf(dir, id).filter((base) => fs.existsSync(path.join(dir, `${base}.js`)));
    return [...withBases(dir, bases, seen), id];
  });
}

export function buildLooks(root = process.cwd(), ids) {
  const dir = path.join(root, LOOKS_DIR);
  const order = ids ?? JSON.parse(fs.readFileSync(path.join(dir, "looks.json"), "utf8")).order;
  return [read(dir, "runtime.js"), read(dir, "kit.js"), ...withBases(dir, order).map((id) => read(dir, `${id}.js`))].join("\n\n") + "\n";
}

export function checkLooks(root = process.cwd()) {
  const dir = path.join(root, LOOKS_DIR);
  const { order } = JSON.parse(fs.readFileSync(path.join(dir, "looks.json"), "utf8"));
  const problems = [];
  for (const id of order) {
    if (!fs.existsSync(path.join(dir, `${id}.json`))) problems.push(`${id}: missing ${id}.json`);
    if (!fs.existsSync(path.join(dir, `${id}.js`))) { problems.push(`${id}: missing ${id}.js`); continue; }
    const bundle = buildLooks(root, [id]);
    try { new Function(bundle); } catch (error) { problems.push(`${id}: its bundle does not parse (${error.message})`); }
    if (!bundle.includes(`register("${id}"`)) problems.push(`${id}: ${id}.js does not register "${id}"`);
    for (const base of basesOf(dir, id)) {
      if (!order.includes(base)) problems.push(`${id}: builds on "${base}", which is not a look in looks.json`);
      else if (!bundle.includes(`register("${base}"`)) problems.push(`${id}: its bundle is missing "${base}", the look it builds on`);
    }
  }
  return { problems, count: order.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { problems, count } = checkLooks();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`${count} looks build into their own bundles.`);
}
