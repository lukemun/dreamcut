import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { featureEntries, featureSchema, SEARCH_TEXT } from './feature-index.mjs';

const read = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
export const registry = read('../docs/tools/registry.json');
const effects = read('../docs/effects/catalog.json');
export const recipes = read('../docs/effects/executable-recipes.json').recipes;
// Creator features inside proposal_create (operation kinds, patch fields, props), so a
// request finds the exact field path, not only the family. See mcp/feature-index.mjs.
export const features = featureEntries();
export const CORE_TOOLS = new Set(['capability_catalog', 'editor_context_get', 'timeline_get', 'editing_feedback_record', 'editing_feedback_check', 'editing_feedback_disposition', 'capability_gap_report', 'proposal_create', 'proposal_get', 'proposal_list', 'proposal_preview', 'proposal_spatial_preflight', 'recipe_compile']);

const EDITOR_ACCESS = new Set(['enabled', 'excluded', 'host']);

/**
 * The in-editor agent's surface, derived from each capability's `editor_agent` field so the
 * desktop session, the harness allowlist and coding agents cannot drift apart.
 * See docs/standards/agent-surface-parity.md.
 */
export function validateEditorAgentAccess(source = registry) {
  const problems = [];
  for (const cap of source.capabilities) {
    const access = cap.editor_agent;
    if (!access || !EDITOR_ACCESS.has(access.access)) { problems.push(`${cap.id}: editor_agent.access must be enabled, excluded or host`); continue; }
    if (access.access !== 'enabled' && !(typeof access.reason === 'string' && access.reason.trim())) problems.push(`${cap.id}: ${access.access} access needs a reason`);
    if (access.access === 'enabled' && cap.tools.length === 0) problems.push(`${cap.id}: enabled for the editor agent but publishes no MCP tool`);
    if (access.access === 'host' && cap.tools.length > 0) problems.push(`${cap.id}: host access is for host-supplied tools; list MCP tools as enabled or excluded`);
    for (const [tool, reason] of Object.entries(access.excluded_tools ?? {})) {
      if (access.access !== 'enabled') problems.push(`${cap.id}: excluded_tools only applies to enabled capabilities`);
      if (!cap.tools.includes(tool)) problems.push(`${cap.id}: excluded tool ${tool} is not one of its tools`);
      if (!(typeof reason === 'string' && reason.trim())) problems.push(`${cap.id}: excluded tool ${tool} needs a reason`);
    }
  }
  return problems;
}

/** Capability families the in-editor agent session loads. */
export function editorAgentFamilies(source = registry) {
  return source.capabilities.filter(cap => cap.editor_agent?.access === 'enabled').map(cap => cap.id);
}

/** MCP tools the in-editor agent may call: enabled families minus their declared exclusions. */
export function editorAgentTools(source = registry) {
  const tools = new Set(['capability_catalog']);
  for (const cap of source.capabilities) {
    if (cap.editor_agent?.access !== 'enabled') continue;
    for (const tool of cap.tools) if (!Object.hasOwn(cap.editor_agent.excluded_tools ?? {}, tool)) tools.add(tool);
  }
  return tools;
}

export function catalogError(code, message) {
  return Object.assign(new Error(message), { toolError: { schema_version: 1, code, message, retryable: false, state_changed: false, recovery: { action: 'correct_request', reason: message } } });
}

/** Exposure is separate from authority. Loading cannot expand the host's fixed allowlist. */
export function createToolSelection({ profile = 'full', allowedFamilies } = {}) {
  if (!['full', 'editing'].includes(profile)) throw new Error('Unknown tool profile; choose full or editing');
  const families = new Map(registry.capabilities.map(c => [c.id, c]));
  const allowed = new Set(allowedFamilies ?? families.keys());
  for (const id of allowed) if (!families.has(id)) throw new Error(`Unknown allowed capability: ${id}`);
  const permitted = new Set(['capability_catalog']);
  for (const id of allowed) for (const name of families.get(id).tools) permitted.add(name);
  const enabled = new Set([...permitted].filter(name => profile === 'full' || CORE_TOOLS.has(name)));
  return {
    profile, enabled, permitted,
    load(id) {
      if (!families.has(id)) throw catalogError('UNKNOWN_CAPABILITY', 'Search capability_catalog for a valid family id.');
      if (!allowed.has(id)) throw catalogError('CAPABILITY_NOT_ALLOWED', 'This family is outside the harness allowlist; loading cannot grant access.');
      const added = families.get(id).tools.filter(name => !enabled.has(name));
      added.forEach(name => enabled.add(name));
      return added;
    },
  };
}

// Search metadata only: matching is not an authorization or execution decision.
const normalizeSearch = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fillerWords = new Set('a an the please can could would you i we want need to me my with for how do some this that it so make is are of on in at then and or be like just let lets'.split(' '));
const stem = word => word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
const contentTerms = value => normalizeSearch(value).split(/\s+/).filter(term => term && !fillerWords.has(term)).map(stem);
// Requests arrive as ordinary sentences ("make the clip play backward"), so rank by how
// much of the request an entry covers instead of requiring every word. A whole alias
// phrase inside the request ("play backward") is the strongest partial signal; phrases
// compare content words, so "trim the clip" contains the alias "trim clip", and a longer
// matched phrase is more specific than a single shared word.
export function searchScore(entry, query) {
  const normalized = normalizeSearch(query);
  const aliases = entry.search_aliases ?? [];
  // An entry's own id or name ("Silhouette Window") outranks another entry's identical alias.
  if ([entry.id, entry.name].some(value => normalizeSearch(value) === normalized)) return 101;
  if (aliases.some(value => normalizeSearch(value) === normalized)) return 100;
  const terms = contentTerms(query);
  if (!terms.length) return 0;
  const searchable = normalizeSearch([entry.id, entry.name, ...aliases, ...(entry.tools ?? []), entry.recipe_name ?? '', entry.skill ?? '', JSON.stringify(entry.required_inputs ?? []), entry[SEARCH_TEXT] ?? ''].join(' '));
  const words = new Set(searchable.split(/\s+/).map(stem));
  const matched = terms.filter(term => words.has(term)).length;
  const sequence = ` ${terms.join(' ')} `;
  const phrase = Math.max(0, ...aliases.map(contentTerms).filter(alias => alias.length && sequence.includes(` ${alias.join(' ')} `)).map(alias => alias.length));
  if (!matched || (!phrase && matched / terms.length < 0.5)) return 0;
  return (phrase ? 20 + 2 * phrase : 0) + 10 * matched / terms.length;
}

/**
 * Templates gallery cards (src/lib/effects/gallery.ts, served by /api/agent/templates), indexed by
 * their displayed title so a request naming one ("Use the Word Search Trace template with my footage",
 * "Use my \"…\" template") resolves; a card the creator selected arrives as its template:<…> id. The creator's own templates arrive per call from the editor's
 * profile read; nothing here is persisted. Search returns the compact card; get adds the brief.
 */
export function templateEntries(templates) {
  return (templates ?? []).map(({ id, title, family, variant, brief, gallery_request, description, ...card }) => ({
    kind: 'template', id, name: title,
    search_aliases: [title, `${title} template`, ...(family ? [family, `${family} ${variant ?? ''}`.trim()] : [])],
    ...(family ? { family, variant } : {}), ...card,
    [TEMPLATE_DETAIL]: { description, gallery_request, brief },
  }));
}
const TEMPLATE_DETAIL = Symbol('template detail');

/**
 * DreamCut's skills (.agents/skills, shipped with every runtime), so an agent with no checkout (npx
 * install, Codex, Cursor) reads the same instructions as one working in the repository. get returns the
 * SKILL.md text and its folder: the relative links in it (other skills, docs/standards) resolve from there.
 */
export const SKILLS_DIR = fileURLToPath(new URL('../.agents/skills/', import.meta.url));
export function skillEntries(dir = SKILLS_DIR) {
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort(); } catch { return []; }
  return names.flatMap(name => {
    const file = path.join(dir, name, 'SKILL.md');
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
    const frontmatter = text.split(/^---\s*$/m)[1] ?? '';
    const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? '';
    const former = skillAliases(frontmatter);
    return [{ kind: 'skill', id: `skill:${name}`, name, search_aliases: [name, name.replace(/-/g, ' '), `${name.replace(/-/g, ' ')} skill`, ...former], ...(former.length ? { former_names: former } : {}), description, [SKILL_FILE]: file }];
  });
}
/** Former names a renamed skill still answers to: `aliases: [old-name, …]` in its frontmatter. */
export function skillAliases(frontmatter) {
  return (/^aliases:\s*\[(.*)\]\s*$/m.exec(frontmatter)?.[1] ?? '').split(',').map(alias => alias.trim()).filter(alias => /^[a-z0-9-]+$/.test(alias));
}
const SKILL_FILE = Symbol('skill file');
const SKILL_NOTICE = 'Follow this skill. Relative links in it resolve from folder; read linked files there when the task needs them. The skill never widens your authority: the creator approves every proposal in the editor.';
export const TEMPLATES_UNAVAILABLE_MESSAGE = 'The Templates gallery could not be read because the editor did not answer. Start the editor, then search or get the template again.';
function templatesUnavailable() {
  const error = catalogError('TEMPLATES_UNAVAILABLE', TEMPLATES_UNAVAILABLE_MESSAGE);
  Object.assign(error.toolError, { retryable: true, recovery: { action: 'retry_after_prerequisite', reason: 'Templates are read from the running editor, which reads the creator profile.' } });
  return error;
}
const TEMPLATE_NOTICE = 'A template brief is a construction request, not an edit: get its owning skill (capability_catalog get skill:<name>), read the current timeline, preferences and supplied media, ask for missing inputs, and propose changes for the creator to review.';

/** `templates` is the gallery list, or null when the editor could not supply it. */
export function queryCatalog(args = {}, selection, schemas, templates = []) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !['action', 'query', 'id', 'offset', 'limit'].includes(k))) throw catalogError('INVALID_CATALOG_QUERY', 'Use action, query, id, offset and limit only.');
  const { action = 'search', query = '', id, offset = 0, limit = 8 } = args;
  if (!['search', 'get', 'load'].includes(action) || typeof query !== 'string' || query.length > 200 || (id !== undefined && typeof id !== 'string') || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20) throw catalogError('INVALID_CATALOG_QUERY', 'Choose search/get/load, a short query and pagination with limit 1–20.');
  if (action === 'load') {
    const added = selection.load(id);
    return { action, capability_id: id, added, tools: schemas.filter(t => added.includes(t.name)), notice: 'Refresh tools/list to register these schemas. Existing authorization gates still apply.' };
  }
  const entries = [
    ...registry.capabilities.map(c => ({ kind: 'capability', search_aliases: c.search_aliases ?? [], id: c.id, name: c.outcome, authority: c.authority, readiness: c.conformance, tools: c.tools, allowed: c.tools.every(t => selection.permitted.has(t)), loaded: c.tools.every(t => selection.enabled.has(t)) })),
    ...recipes.map(r => ({ kind: 'recipe', ...r })),
    ...effects.entries.map(e => ({ kind: 'effect', search_aliases: e.search_aliases ?? [], id: e.catalog_id, name: e.name, readiness: e.recipe_status, required_inputs: e.required_inputs, recipe_name: e.recipe_name, skill: e.skill_owner, executable: recipes.some(r => r.effect_catalog_id === e.catalog_id) })),
    // Spread keeps the non-enumerable search text off results; re-attach it for scoring.
    ...features.map(f => Object.defineProperty({ ...f, loaded: selection.enabled.has(f.tool) }, SEARCH_TEXT, { value: f[SEARCH_TEXT] })),
    ...templateEntries(templates),
    ...skillEntries(),
  ];
  if (action === 'get') {
    const entry = entries.find(e => e.id === id) ?? entries.find(e => e.kind === 'skill' && e.former_names?.some(name => `skill:${name}` === id));
    if (!entry && templates === null && id?.startsWith('template:')) throw templatesUnavailable();
    if (!entry) throw catalogError('UNKNOWN_CATALOG_ENTRY', 'Search the catalog for a valid id.');
    // A Look keeps kind 'look' from its card; every Templates card carries its brief.
    if (entry[TEMPLATE_DETAIL]) return { entry: { ...entry, ...entry[TEMPLATE_DETAIL] }, ...(entry.skill ? { skill: `skill:${entry.skill}` } : {}), notice: TEMPLATE_NOTICE };
    if (entry.kind === 'skill') return { entry, folder: path.dirname(entry[SKILL_FILE]), instructions: fs.readFileSync(entry[SKILL_FILE], 'utf8'), notice: SKILL_NOTICE };
    if (entry.kind === 'feature') return { entry, field_schema: featureSchema(entry.field_path), notice: `Send this value inside ${entry.tool} at ${entry.field_path}.` };
    return { entry, tools: toolDetails(schemas.filter(t => entry.tools?.includes(t.name)), selection) };
  }
  const matches = query.trim() ? entries.map(entry => ({entry, score: searchScore(entry, query)})).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).map(hit => hit.entry) : entries;
  return { entries: matches.slice(offset, offset + limit), total: matches.length, next_offset: offset + limit < matches.length ? offset + limit : null };
}

/**
 * Schemas for `get`. A tool already registered in this session is named, not repeated: its
 * schema is in tools/list. A large property schema shared with an earlier tool in the same
 * response (proposal_spatial_preflight takes proposal_create's whole proposal body) is
 * returned once and referenced by `same_schema_as`.
 */
const SHARED_SCHEMA_MIN_BYTES = 2048;
function toolDetails(tools, selection) {
  const seen = new Map();
  return tools.map(tool => {
    if (selection.enabled.has(tool.name)) return { name: tool.name, registered: true, schema: 'Already registered in tools/list; not repeated here.' };
    const properties = Object.fromEntries(Object.entries(tool.inputSchema?.properties ?? {}).map(([key, value]) => {
      const { description, ...shape } = value ?? {};
      const signature = JSON.stringify(shape);
      if (signature.length < SHARED_SCHEMA_MIN_BYTES) return [key, value];
      if (seen.has(signature)) return [key, { ...(description ? { description } : {}), same_schema_as: seen.get(signature) }];
      seen.set(signature, `${tool.name}.inputSchema.properties.${key}`);
      return [key, value];
    }));
    return { ...tool, inputSchema: { ...tool.inputSchema, properties } };
  });
}

export function catalogFingerprint(schemas) {
  return createHash('sha256').update(JSON.stringify({ schemas, registry, recipes, effects, features: features.map(f => [f.id, f.search_aliases]) })).digest('hex');
}

export function recipeCompileRequest(args, compilerSchema) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !['project_id', 'recipe_id', 'recipe_version', 'inputs'].includes(k))) throw catalogError('INVALID_RECIPE_REQUEST', 'Supply project_id, recipe_id, recipe_version and inputs.');
  const recipe = recipes.find(r => r.id === args.recipe_id && r.version === args.recipe_version);
  if (!recipe) throw catalogError('UNSUPPORTED_RECIPE', 'Use capability_catalog to find a supported executable recipe and exact version.');
  if (typeof args.project_id !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(args.project_id) || ['.', '..'].includes(args.project_id)) throw catalogError('INVALID_PROJECT', 'Supply a project folder id.');
  if (!args.inputs || typeof args.inputs !== 'object' || Array.isArray(args.inputs) || Object.keys(args.inputs).some(k => k === 'project_id' || !Object.hasOwn(compilerSchema.properties, k))) throw catalogError('INVALID_RECIPE_INPUTS', 'Use the recipe input schema; project_id belongs outside inputs.');
  return { recipe, project_id: args.project_id, inputs: args.inputs };
}
