// Names each unknown field in rejected tool arguments and the closest accepted ones.
// The validator's own text ("must NOT have additional properties") omits the field,
// which leaves a model guessing; this only explains a failure, it never accepts input.
const MAX_LISTED = 12;
// Names a model copies from read shapes (timeline_get) that the write vocabulary spells differently.
const READ_SHAPE_REDIRECTS = Object.freeze({
  keyframes: ['playback_speed_steps', 'playback_reverse', 'transition_keyframes'],
  reverse: ['playback_reverse'],
  speed: ['playback_speed_steps', 'playback_rate'],
});
const UUID_PATTERN = /\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}/;

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** Accepted names closest to `name`: shared words first, then spelling. */
export function closestFields(name, allowed, limit = 5) {
  const words = new Set(String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return [...allowed]
    .map(field => ({ field, shared: field.toLowerCase().split(/[^a-z0-9]+/).filter(word => words.has(word)).length, edit: distance(String(name).toLowerCase(), field.toLowerCase()) }))
    .sort((a, b) => b.shared - a.shared || a.edit - b.edit)
    .slice(0, limit).map(item => item.field);
}

/** Unknown fields in `value` under a closed object schema: where each was, its name, and what is accepted there. */
export function unknownFields(schema, value, path = '') {
  const found = [];
  const visit = (node, data, at) => {
    if (!node || typeof node !== 'object' || data == null || typeof data !== 'object') return;
    if (Array.isArray(data)) { if (node.items && typeof node.items === 'object') data.forEach((item, index) => visit(node.items, item, `${at}[${index}]`)); return; }
    if (!node.properties) return;
    const allowed = Object.keys(node.properties);
    for (const [key, child] of Object.entries(data)) {
      const where = at ? `${at}.${key}` : key;
      if (key in node.properties) visit(node.properties[key], child, where);
      else if (node.additionalProperties === false) {
        const redirects = (READ_SHAPE_REDIRECTS[key] ?? []).filter(field => allowed.includes(field));
        const listed = allowed.length <= MAX_LISTED;
        found.push({ path: where, field: key, listed, suggested: listed ? allowed : [...new Set([...redirects, ...closestFields(key, allowed)])] });
      }
    }
  };
  visit(schema, value, path);
  return found;
}

/** Unknown fields as hints a model can act on. */
export function unknownFieldHints(schema, value, path = '') {
  return unknownFields(schema, value, path)
    .map(item => `${item.path} is not an accepted field; ${item.listed ? 'accepted here' : 'closest accepted'}: ${item.suggested.join(', ')}`);
}

/** Required fields a validator message reports missing, as dotted paths. */
export function missingFields(message) {
  return [...String(message).matchAll(/data((?:\/[^\s/,]+)*) must have required property '([^']+)'/g)]
    .map(([, pointer, field]) => [...pointer.split('/').filter(Boolean).map(part => /^\d+$/.test(part) ? `[${part}]` : part), field].join('.').replace(/\.\[/g, '['));
}

/** Each field the validator rejected, with its own description, so a model reads what the field means. */
export function rejectedFieldNotes(schema, message) {
  const notes = new Map();
  for (const [, pointer] of String(message).matchAll(/data((?:\/[^\s/,]+)+)/g)) {
    let node = schema; const parts = [];
    for (const segment of pointer.split('/').filter(Boolean)) {
      if (/^\d+$/.test(segment)) { node = node?.items; parts.push(`[${segment}]`); }
      else { node = node?.properties?.[segment]; parts.push(`${parts.length ? '.' : ''}${segment}`); }
      if (!node) break;
    }
    if (node?.description) notes.set(parts.join(''), node.description);
  }
  // A missing required field is reported on its parent; name the field and what it means.
  for (const [, pointer, field] of String(message).matchAll(/data((?:\/[^\s/,]+)*) must have required property '([^']+)'/g)) {
    let node = schema; const parts = [];
    for (const segment of pointer.split('/').filter(Boolean)) {
      if (/^\d+$/.test(segment)) { node = node?.items; parts.push(`[${segment}]`); }
      else { node = node?.properties?.[segment]; parts.push(`${parts.length ? '.' : ''}${segment}`); }
    }
    const child = node?.properties?.[field];
    if (child) notes.set(`${parts.join('')}${parts.length ? '.' : ''}${field}`, child.description ?? 'Required; add it.');
  }
  return [...notes].map(([field, description]) => `${field}: ${description}`);
}

/** Validator text without full regex bodies: a UUID pattern reads as "must be a UUID", others as "the expected format". */
export function trimValidatorPatterns(text) {
  const replace = (pattern) => (UUID_PATTERN.test(pattern) ? 'must be a UUID' : 'must match the expected format');
  return String(text)
    .replace(/must match pattern "((?:\\.|[^"\\])*)"/g, (_, pattern) => replace(pattern))
    .replace(/must match pattern \/((?:\\.|[^/\\\n])*)\/[a-z]*/g, (_, pattern) => replace(pattern));
}

/** One application validator (zod) issue as `path: message`, never echoing its regex. */
export function describeValidationIssue(issue) {
  const path = Array.isArray(issue?.path) ? issue.path.reduce((at, part) => typeof part === 'number' ? `${at}[${part}]` : `${at}${at ? '.' : ''}${part}`, '') : '';
  let message = issue?.format === 'uuid' ? 'must be a UUID' : trimValidatorPatterns(issue?.message ?? 'is invalid');
  if (issue?.code === 'unrecognized_keys' && Array.isArray(issue.keys)) message = `unrecognized field(s): ${issue.keys.join(', ')}`;
  return `${path || '(request)'}: ${message.slice(0, 240)}`;
}

/**
 * Descriptions for fields an application validator rejected. Issue paths are relative to the
 * request body, which a tool may nest under one argument (e.g. `proposal`), so each top-level
 * object argument is tried as a prefix.
 */
export function issueFieldNotes(schema, issues) {
  const prefixes = ['', ...Object.entries(schema?.properties ?? {}).filter(([, node]) => node?.type === 'object').map(([key]) => key)];
  const pointers = [];
  for (const issue of issues ?? []) {
    if (!Array.isArray(issue?.path) || !issue.path.length) continue;
    const prefix = prefixes.find(candidate => rejectedFieldNotes(schema, `data/${[candidate, ...issue.path].filter(part => part !== '').join('/')}`).length);
    if (prefix !== undefined) pointers.push(`data/${[prefix, ...issue.path].filter(part => part !== '').join('/')}`);
  }
  return rejectedFieldNotes(schema, pointers.join(' '));
}

/** The validator's message followed by named unknown fields and the rejected fields' meanings. */
export function explainInvalidArguments(schema, args, message) {
  const trimmed = trimValidatorPatterns(message);
  const hints = [...unknownFieldHints(schema, args).slice(0, 8), ...rejectedFieldNotes(schema, message).slice(0, 4)];
  return hints.length ? `${trimmed}\n${hints.join('\n')}` : trimmed;
}
