// Prototype (DREAMCUT_COMPACT_PROPOSAL_SCHEMA=1): publish the proposal with its large
// operation sections summarised by field name. The full schema stays the server's
// validation authority, and an agent fetches one field's rules from capability_catalog
// when it needs them, so detail costs context only when used.
const COLLAPSE_BYTES = 3000;

const firstSentence = text => (String(text ?? '').match(/^[^.]*\./)?.[0] ?? '').trim();

/** One collapsed section: its type, a short purpose, and every field name it accepts. */
function summarise(name, schema) {
  const fields = Object.keys(schema.properties ?? schema.items?.properties ?? {});
  const purpose = firstSentence(schema.description);
  return {
    type: schema.type ?? 'object',
    description: `${purpose ? `${purpose} ` : ''}Fields: ${fields.join(', ')}. `
      // Feature entries exist per prop and patch field, and per operation kind.
      + `Look up a field's meaning, units and limits with capability_catalog (search in plain words, or get ${name === 'props' ? 'feature:props.<field>' : `feature:${name}`}); `
      + 'the full schema is enforced when you submit.',
  };
}

/** The published proposal_create input schema with large operation sections summarised. */
export function compactProposalInputSchema(inputSchema) {
  const compact = structuredClone(inputSchema);
  const operation = compact.properties?.proposal?.properties?.options?.items?.properties?.operations?.items;
  if (!operation?.properties) throw Error('Unexpected proposal schema shape.');
  for (const [name, schema] of Object.entries(operation.properties)) {
    if (JSON.stringify(schema).length > COLLAPSE_BYTES) operation.properties[name] = summarise(name, schema);
  }
  return compact;
}
