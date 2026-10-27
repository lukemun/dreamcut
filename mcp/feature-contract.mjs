// Agent-usability contract for published tools. A field an agent can send must say what it
// does, and every creator-facing feature must be findable and expressible by an agent:
// a natural request finds its capability, its field is described, and an example call
// validates. Passing this is necessary, not sufficient: `pnpm eval:features` checks that a
// model actually uses the feature. See docs/standards/tool-authoring.md#agent-usable-features.
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';

const PROPOSAL_PROPS = 'proposal.options[].operations[].props';

/** Every input field of every tool, as `tool:path`, with whether it carries a description. */
export function toolFields(tools) {
  const fields = [];
  const walk = (schema, tool, path) => {
    if (!schema || typeof schema !== 'object') return;
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
      const at = path ? `${path}.${name}` : name;
      fields.push({ id: `${tool}:${at}`, tool, path: at, described: typeof child?.description === 'string' && child.description.trim().length > 0 });
      walk(child, tool, at);
    }
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) walk(schema.items, tool, `${path}[]`);
    for (const key of ['anyOf', 'oneOf', 'allOf']) for (const branch of schema[key] ?? []) walk(branch, tool, path);
  };
  for (const tool of tools) walk(tool.inputSchema, tool.name, '');
  return [...new Map(fields.map(field => [field.id, field])).values()];
}

/** The sub-schema at a dotted path, where `[]` steps into array items. */
export function schemaAt(schema, path) {
  let node = schema;
  for (const part of path.split('.')) {
    const name = part.replace(/\[\]$/, '');
    node = node?.properties?.[name];
    if (part.endsWith('[]')) node = node?.items;
    if (!node) return null;
  }
  return node;
}

/** proposal_create arguments around one operation, so a feature case only states what is specific to it. */
export function proposalArguments(operation, projectId = 'feature-case') {
  return { project_id: projectId, proposal: {
    project_id: projectId, expected_revision: '0'.repeat(64), mode: 'workshop', decision: 'propose', summary: 'Feature case',
    assumptions: [], unresolved_gaps: [], schema_version: 2,
    options: [{ id: 'a', label: 'Feature case', recommended: true, summary: 'Feature case', operations: [operation] }],
  } };
}

/** Values at a path with `[]` wildcards, for checking an example or a model's call. */
export function valuesAt(value, path) {
  let current = [value];
  for (const part of path.split('.')) {
    const name = part.replace(/\[\]$/, '');
    current = current.map(item => item?.[name]).filter(item => item !== undefined);
    if (part.endsWith('[]')) current = current.flatMap(item => Array.isArray(item) ? item : []);
  }
  return current;
}

/**
 * Whether arguments set the expected field: to `equals` when given, otherwise to any value (a
 * judgement call such as how much to crop). `also` lists other paths that express the same
 * outcome, such as an animated punch-in through keyframes instead of a static scale.
 */
export function expectationMet(args, expect) {
  return [expect.path, ...(expect.also ?? [])].some(path => {
    const values = valuesAt(args, path);
    return 'equals' in expect ? values.some(value => JSON.stringify(value) === JSON.stringify(expect.equals)) : values.length > 0;
  });
}

export function caseArguments(feature) {
  return feature.example?.operation ? proposalArguments(feature.example.operation) : feature.example?.arguments;
}

/** Problems with the feature cases: unfindable requests, missing or undescribed fields, invalid examples. */
export function featureCaseViolations({ tools, cases, search }) {
  const violations = [];
  const validator = new AjvJsonSchemaValidator();
  const ids = new Set();
  for (const feature of cases) {
    const where = `feature ${feature.id}`;
    if (!feature.id || ids.has(feature.id)) violations.push(`${where}: needs a unique id`);
    ids.add(feature.id);
    const tool = tools.find(item => item.name === feature.tool);
    if (!tool) { violations.push(`${where}: tool ${feature.tool} is not published`); continue; }
    if (!Array.isArray(feature.requests) || feature.requests.length < 2) violations.push(`${where}: list at least two natural requests a creator might type`);
    for (const request of feature.requests ?? []) {
      // A feature entry (kind 'feature') reaches the capability that owns its field.
      const found = [...new Set(search(request).slice(0, 5).flatMap(entry => entry.kind === 'feature' ? [entry.capability, entry.id] : [entry.id]))];
      if (!found.includes(feature.capability)) violations.push(`${where}: catalog search "${request}" does not reach ${feature.capability} (got ${found.join(', ') || 'nothing'}); add search aliases to docs/tools/registry.json`);
    }
    const field = schemaAt(tool.inputSchema, feature.field);
    if (!field) violations.push(`${where}: ${feature.tool} has no field ${feature.field}`);
    else if (!field.description?.trim()) violations.push(`${where}: ${feature.tool} field ${feature.field} needs a description an agent can act on`);
    const args = caseArguments(feature);
    if (!args) { violations.push(`${where}: add an example operation or arguments`); continue; }
    const result = validator.getValidator(tool.inputSchema)(args);
    if (!result.valid) violations.push(`${where}: example call is rejected by ${feature.tool}: ${result.errorMessage}`);
    if (feature.expect && !expectationMet(args, feature.expect)) {
      violations.push(`${where}: example does not set ${feature.expect.path}${'equals' in feature.expect ? ` to ${JSON.stringify(feature.expect.equals)}` : ''}`);
    }
  }
  return violations;
}

/**
 * Description ratchet: a field may be undescribed only if the frozen allowance lists it, and
 * the allowance only shrinks (a described or removed field must leave it). Proposal props
 * added after the baseline must also be covered by a feature case.
 */
export function fieldContractViolations({ tools, allowance, propsBaseline, cases }) {
  const fields = toolFields(tools);
  const byId = new Map(fields.map(field => [field.id, field]));
  const allowed = new Set(allowance);
  const violations = [];
  for (const field of fields) if (!field.described && !allowed.has(field.id)) violations.push(`${field.id}: new agent-facing field needs a description`);
  for (const id of allowed) {
    const field = byId.get(id);
    if (!field) violations.push(`${id}: listed as undescribed but no longer exists; remove it from docs/tools/undescribed-fields.json`);
    else if (field.described) violations.push(`${id}: now described; remove it from docs/tools/undescribed-fields.json`);
  }
  const baseline = new Set(propsBaseline);
  const covered = new Set(cases.filter(feature => feature.tool === 'proposal_create').map(feature => feature.field));
  for (const field of fields) {
    if (field.tool !== 'proposal_create' || !field.path.startsWith(`${PROPOSAL_PROPS}.`)) continue;
    const prop = field.path.slice(PROPOSAL_PROPS.length + 1);
    if (prop.includes('.') || prop.includes('[]') || baseline.has(prop) || covered.has(field.path)) continue;
    violations.push(`proposal_create:${field.path}: new creator-facing prop needs a feature case in docs/tools/feature-cases.json`);
  }
  return violations;
}
