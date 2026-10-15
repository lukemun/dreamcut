// Can a model actually use each creator-facing feature? Runs every case in
// docs/tools/feature-cases.json against a model with the editing session's own instructions
// and tool view, and passes a case when the model sends a valid proposal that sets the
// expected field. Tools are simulated: nothing is written to any project.
//
//   pnpm eval:features                        # the default installed local model
//   pnpm eval:features --model ministral --case clip-reverse --runs 3
//   pnpm eval:features --provider codex|claude [--model NAME] [--concurrency 6]   # the app's own hosted sessions
//   pnpm eval:features --endpoint https://api.example/v1 --served-model NAME --api-key-env KEY_VAR
//   pnpm eval:features --provider codex --dials agent   # A/B: the earlier contract, where the agent picks every dial
//   pnpm eval:features --journal DIR | --no-journal     # where runs are recorded as activity-journal episodes
//
// Every run is recorded as an episode in the activity journal (project "feature-case", with the
// case, request and pass on it), so `pnpm episode <id>` shows a run the way it shows a creator's turn.
//
// Results are written under private/eval-features/. See docs/standards/tool-authoring.md#agent-usable-features.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { editorAgentTools, queryCatalog, registry } from './capability-catalog.mjs';
import { toProviderTools } from './harness-adapters.mjs';
import { explainInvalidArguments } from './argument-errors.mjs';
import { expectationMet, valuesAt } from './feature-contract.mjs';
import { createEpisodeLog } from '../desktop/activity-journal.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const PROPOSAL_TOOLS = new Set(['proposal_create', 'proposal_spatial_preflight', 'proposal_preview']);
const REVISION = 'a'.repeat(64);
const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });

/** The tools an editing session offers, in the trimmed form the local runtime sends. */
/** The tools a live editor session offers, from the registry's editor_agent fields. */
export function sessionTools(catalogTools, names = editorAgentTools()) {
  const offered = catalogTools.filter(tool => names.has(tool.name));
  return { offered, provider: toProviderTools(offered.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })), { maxStringLength: 1000, maxSchemaDepth: 5, dropPatterns: true }) };
}

// The instruction sentence before the server chose default dials, kept for --dials agent A/B runs.
const AGENT_DIALS_SENTENCE = 'Build each proposal in two steps: first make its operations validate with only the fields the request needs (find the field with capability_catalog when unsure; a rejection names the field to fix), then add meaningful review controls for the dials the creator will want.';
const SERVER_DIALS_SENTENCE = /Make the operations validate with only the fields the request needs[^\n]*?link equal values across clips\./;

/** Session instructions for an A/B arm: `server` is the live contract, `agent` the earlier one. */
export function armInstructions(instructions, dials) {
  if (dials !== 'agent') return instructions;
  if (!SERVER_DIALS_SENTENCE.test(instructions)) throw Error('The editing instructions changed; update the --dials agent arm.');
  return instructions.replace(SERVER_DIALS_SENTENCE, AGENT_DIALS_SENTENCE);
}

/**
 * The server's own proposal checks, loaded from the application validator: refinements the
 * JSON schema cannot express, the authoring-time dial default, and the dials that result.
 */
export async function proposalChecker({ dials = 'server' } = {}) {
  const apply = await import(pathToFileURL(path.join(root, 'src/lib/agent/timeline-editor-agent-apply.ts')).href);
  const { describeValidationIssue } = await import('./argument-errors.mjs');
  return proposal => {
    try {
      const checked = apply.validateEditorAgentProposal(dials === 'agent' ? proposal : apply.withDefaultReviewControls(proposal), apply.EDITOR_AGENT_MAX_MUTATIONS);
      return { ok: true, options: checked.options.map(option => ({ option_id: option.id, review_controls: option.review_controls ?? [], review_controls_origin: option.review_controls_origin ?? null })),
        warnings: apply.proposalWarnings(checked) };
    } catch (error) {
      return { ok: false, error: Array.isArray(error?.issues) ? error.issues.map(describeValidationIssue).join('; ') : String(error?.message ?? error) };
    }
  };
}

/** Simulated tool results; proposals are validated against the real schema and recorded, never applied. */
export function simulatedTools({ feature, offered, projectId, checkProposal }) {
  const validator = new AjvJsonSchemaValidator();
  const selection = { permitted: new Set(offered.map(tool => tool.name)), enabled: new Set(offered.map(tool => tool.name)), load: () => [] };
  const attempts = [];
  const call = (name, args) => {
    const tool = offered.find(item => item.name === name);
    if (!tool) return { isError: true, ...text(`${name} is not available in this session.`) };
    // Validate as the server does: a tool sharing another tool's shape uses that full schema.
    const schema = tool.validationSchema ?? offered.find(item => item.name === tool._meta?.dreamcut_validated_as)?.inputSchema ?? tool.inputSchema;
    const result = validator.getValidator(schema)(args);
    if (!result.valid) {
      // Keep what the model sent (bounded) so a failing run shows which field it reached for.
      if (PROPOSAL_TOOLS.has(name)) attempts.push({ tool: name, valid: false, error: result.errorMessage, operations: JSON.stringify(valuesAt(args, 'proposal.options[].operations[]')).slice(0, 1500) });
      return { isError: true, structuredContent: { code: 'INVALID_ARGUMENTS' }, ...text(explainInvalidArguments(schema, args, result.errorMessage)) };
    }
    if (name === 'capability_catalog') return text(queryCatalog(args, selection, offered));
    if (name === 'timeline_get') return text({ project_id: projectId, revision: REVISION, selection_context: feature.eval_context, note: 'Simulated project for a feature evaluation.' });
    if (PROPOSAL_TOOLS.has(name)) {
      const checked = checkProposal?.(args.proposal ?? args);
      if (checked && !checked.ok) {
        attempts.push({ tool: name, valid: false, error: checked.error, operations: JSON.stringify(valuesAt(args, 'proposal.options[].operations[]')).slice(0, 1500) });
        return { isError: true, ...text(checked.error) };
      }
      const hit = expectationMet(args, feature.expect);
      // Which dials the creator would get, and whether one tunes the requested field.
      const field = feature.expect.path.split('.').pop();
      const controls = checked?.options?.flatMap(option => option.review_controls) ?? [];
      const dials = checked ? { main: controls.length, origin: [...new Set(checked.options.map(option => option.review_controls_origin))].join(',') || null,
        // A derived dial (mask_inset_left, media_scale_peak) tunes the field it is named for.
        requested_field: controls.some(ref => ref.field === field || ref.field.startsWith(`${field}_`)), dropped: checked.warnings.length } : undefined;
      attempts.push({ tool: name, valid: true, hit, ...(dials ? { dials } : {}), operations: JSON.stringify(valuesAt(args, 'proposal.options[].operations[]')).slice(0, 1500) });
      return text(name === 'proposal_spatial_preflight'
        ? { persisted: false, proposal_valid: true, options: checked?.options ?? [], ...(checked?.warnings.length ? { warnings: checked.warnings } : {}), note: 'Simulated preflight; spatial assessment is not run in evaluations.' }
        : { ok: true, proposal_id: 'feature-eval', status: 'pending_review', ...(checked?.warnings.length ? { warnings: checked.warnings } : {}), note: 'Recorded for evaluation; the creator reviews proposals in the editor.' });
    }
    // A feature delivered by its own tool (not a proposal), e.g. storyboard_draft, is graded on that call.
    if (name === feature.tool) {
      attempts.push({ tool: name, valid: true, hit: expectationMet(args, feature.expect), operations: JSON.stringify(args).slice(0, 1500) });
      return text({ ok: true, note: 'Recorded for evaluation; the creator reviews the result in the editor.' });
    }
    return text({ ok: true, note: 'Simulated success.' });
  };
  return { call, attempts };
}

async function chat(endpoint, model, apiKey, body) {
  const response = await fetch(new URL('chat/completions', endpoint.endsWith('/') ? endpoint : `${endpoint}/`), {
    method: 'POST', headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, ...body }), signal: AbortSignal.timeout(300_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error?.message ?? `Model endpoint returned ${response.status}`);
  return data.choices?.[0]?.message;
}

/** One attempt at one feature: up to `turns` model turns with simulated tools. */
/**
 * An episode recorder per run that writes straight to the journal (no editor server runs during
 * an eval). `journalDir` undefined means the profile's journal; null disables recording.
 */
export async function episodeRecorder(journalDir) {
  if (journalDir === null) return () => undefined;
  const { recordEpisodeBatch } = await import(pathToFileURL(path.join(root, 'src/lib/observability/activity-journal.ts')).href);
  return () => createEpisodeLog({ origin: 'http://eval.invalid', fetchImpl: async (_url, init) => { recordEpisodeBatch(JSON.parse(init.body), journalDir ?? undefined); return { ok: true }; } });
}

const contractFor = (provider, instructions, offered) => ({ kind: 'editing-contract', provider, instructions, tools: offered.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });

/** Dials on the last valid proposal_create, else the last valid preflight. */
function finalAttempt(attempts) {
  const valid = attempts.filter(attempt => attempt.valid);
  return valid.filter(attempt => attempt.tool === 'proposal_create').at(-1) ?? valid.at(-1);
}
function finalDials(attempts) { return finalAttempt(attempts)?.dials ?? null; }

export async function runCase({ feature, request, endpoint, model, apiKey, instructions, tools, offered, checkProposal, episode, run, turns = 10, extra = {} }) {
  const projectId = 'feature-case';
  const simulated = simulatedTools({ feature, offered, projectId, checkProposal });
  const sent = `${request}\n\n[Selected in the editor]\n- ${feature.eval_context}`;
  const messages = [{ role: 'system', content: instructions }, { role: 'user', content: sent }];
  const episodeId = episode?.begin({ projectId, provider: 'local', model, display: request, sent, contract: contractFor('local', instructions, offered), evaluation: { case: feature.id, run, request, expect: feature.expect } });
  const calls = [];
  let finalText = '';
  for (let turn = 0; turn < turns; turn++) {
    const message = await chat(endpoint, model, apiKey, { messages, tools, temperature: 0.3, max_tokens: 4096, ...extra });
    if (!message) break;
    messages.push({ role: 'assistant', content: message.content ?? '', ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) });
    if (message.content) { episode?.text(message.content); finalText = message.content; }
    if (!message.tool_calls?.length) break;
    for (const toolCall of message.tool_calls) {
      let args; try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch { args = null; }
      episode?.tool({ phase: 'call', id: toolCall.id, tool: toolCall.function.name, arguments: args ?? toolCall.function.arguments });
      const result = args ? simulated.call(toolCall.function.name, args) : { isError: true, ...text('Tool arguments must be JSON.') };
      episode?.tool({ phase: 'result', id: toolCall.id, tool: toolCall.function.name, result });
      calls.push({ tool: toolCall.function.name, ok: !result.isError, ...(toolCall.function.name === 'capability_catalog' && args ? { query: args.query } : {}) });
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: result.content[0].text });
    }
    if (simulated.attempts.some(attempt => attempt.valid && attempt.hit)) break;
  }
  const pass = simulated.attempts.some(attempt => attempt.valid && attempt.hit);
  episode?.end('completed', finalText, { eval_pass: pass });
  await episode?.settled();
  return { pass, calls, ...(episodeId ? { episode_id: episodeId } : {}), dials: finalDials(simulated.attempts), final_operations: finalAttempt(simulated.attempts)?.operations ?? null, invalid_attempts: simulated.attempts.filter(attempt => !attempt.valid).map(attempt => ({ error: attempt.error.slice(0, 300), operations: attempt.operations })) };
}

/**
 * One attempt through the desktop app's own Claude or Codex session (subscription sign-in,
 * the same instructions, tool bridge and journal checks), with the tool layer simulated.
 */
export async function runSessionCase({ provider, feature, request, offered, instructions, executable, model, checkProposal, episode, run, timeoutMs = 300_000 }) {
  const os = await import('node:os');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamcut-feature-eval-'));
  const project = path.join(scratch, 'feature-case'); fs.mkdirSync(project); fs.writeFileSync(path.join(project, 'timeline.json'), '{}');
  const simulated = simulatedTools({ feature, offered, projectId: 'feature-case', checkProposal });
  const calls = [];
  const editing = {
    projectId: 'feature-case', harnessRoot: root, onToolRecord: event => episode?.tool(event),
    journal: { snapshot: () => ({ operations: [] }), beginTool: async () => {}, finishTool: async () => {} },
    mcp: { list: async () => offered.map(({ name, description, inputSchema, _meta }) => ({ name, description, inputSchema, ...(_meta ? { _meta } : {}) })),
      call: async (name, args) => {
        // The real server returns tool errors as results; a thrown catalog error would end the session.
        let result; try { result = simulated.call(name, args); } catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] }; } calls.push({ tool: name, ok: !result.isError, ...(name === 'capability_catalog' ? { query: args?.query } : {}) }); return result; } },
  };
  const open = provider === 'claude'
    ? (await import(pathToFileURL(path.join(root, 'desktop/claude-session.mjs')).href)).openClaudeSession
    : (await import(pathToFileURL(path.join(root, 'desktop/codex-session.mjs')).href)).openCodexSession;
  const started = Date.now();
  let answeredBy; // the model the session reports, so receipts never say only "default"

  let finish; const done = new Promise(resolve => { finish = resolve; });
  const session = await open({ executable, projectDirectory: project, userData: path.join(scratch, 'data'), env: process.env, editing, developerInstructions: instructions, turnTimeoutMs: timeoutMs,
    onEvent: event => {
      if (event.type === 'text') { episode?.text(event.text); finalText += event.text ?? ''; }
      if (event.type === 'reasoning') episode?.reasoning(event.text);
      if (event.type === 'model' && event.model) { answeredBy = event.model; episode?.model(event.model); }
      if (['completed', 'disconnected'].includes(event.type) || (event.type === 'error' && !event.message?.includes('Could not stop'))) finish(event);
    } });
  let finalText = '', episodeId;
  try {
    const models = (await session.models()).models;
    // Accept the session's id, its label ("Sonnet 5.5") or a full model id (claude-sonnet-5-5),
    // preferring the most specific label so "sonnet-5-5" never resolves to "Sonnet 5".
    const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
    const chosen = model ? (models.find(item => item.model === model)
      ?? models.filter(item => slug(model).includes(slug(item.label)) || slug(item.label).includes(slug(model)))
        .sort((a, b) => slug(b.label).length - slug(a.label).length)[0])?.model : undefined;
    if (model && !chosen) throw Error(`No ${provider} model matches ${model}; available: ${models.map(item => item.label).join(', ')}`);
    const sent = `${request}\n\n[Selected in the editor]\n- ${feature.eval_context}`;
    episodeId = episode?.begin({ projectId: 'feature-case', provider, model: chosen, display: request, sent, contract: contractFor(provider, instructions, offered), evaluation: { case: feature.id, run, request, expect: feature.expect } });
    await session.send(sent, chosen);
    const ended = await Promise.race([done, new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), timeoutMs + 10_000))]);
    const pass = simulated.attempts.some(attempt => attempt.valid && attempt.hit);
    episode?.end(ended.type === 'completed' ? 'completed' : ended.type, finalText, { eval_pass: pass });
    await episode?.settled();
    return { pass, ...(episodeId ? { episode_id: episodeId } : {}), seconds: Math.round((Date.now() - started) / 1000), ended: ended.type, ...(ended.message ? { ended_message: ended.message } : {}), model: answeredBy ?? chosen ?? 'default', calls, dials: finalDials(simulated.attempts), final_operations: finalAttempt(simulated.attempts)?.operations ?? null, invalid_attempts: simulated.attempts.filter(attempt => !attempt.valid).map(attempt => ({ error: attempt.error.slice(0, 300), operations: attempt.operations })) };
  } finally { await session.close().catch(() => {}); fs.rmSync(scratch, { recursive: true, force: true }); }
}

async function main() {
  const option = name => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : undefined; };
  const runs = Number(option('runs') ?? 3), only = option('case');
  const { cases } = JSON.parse(fs.readFileSync(path.join(root, 'docs/tools/feature-cases.json'), 'utf8'));
  const selected = cases.filter(feature => !only || feature.id === only);
  if (!selected.length) throw Error(`No feature case ${only}`);
  const catalog = spawnSync(process.execPath, [path.join(root, 'mcp/server.mjs'), '--catalog', '--all-tools', '--profile=full'], { encoding: 'utf8', env: { ...process.env, DREAMCUT_TOOL_FAMILIES: '' } });
  if (catalog.status !== 0) throw Error(`Could not read the tool catalog:\n${catalog.stderr}`);
  const { editingInstructions } = await import(pathToFileURL(path.join(root, 'desktop/editing-session.mjs')).href);
  // Models see the published tools; calls are checked with the schemas the server validates against.
  const published = JSON.parse(catalog.stdout);
  for (const tool of published.tools) if (published.validation_schemas?.[tool.name]) tool.validationSchema = published.validation_schemas[tool.name];
  // A capability the in-editor agent is excluded from serves coding agents (for example editor_open); its own
  // case is evaluated with its tools offered alongside the editing session's.
  const codingAgentOnly = new Map(registry.capabilities.filter(item => item.editor_agent?.access === 'excluded').map(item => [item.id, item.tools]));
  const toolsFor = feature => sessionTools(published.tools, new Set([...editorAgentTools(), ...(codingAgentOnly.get(feature.capability) ?? [])]));
  const dials = option('dials') ?? 'server';
  if (!['server', 'agent'].includes(dials)) throw Error('--dials is server or agent');
  const checkProposal = await proposalChecker({ dials });
  const newEpisode = await episodeRecorder(process.argv.includes('--no-journal') ? null : option('journal'));
  const hosted = option('provider');
  if (hosted) {
    // The desktop app's own Claude or Codex session, signed in with the creator's subscription.
    if (!['claude', 'codex'].includes(hosted)) throw Error('--provider is claude or codex');
    const { discoverClaude } = await import(pathToFileURL(path.join(root, 'desktop/claude-discovery.mjs')).href);
    const { discoverCodex } = await import(pathToFileURL(path.join(root, 'desktop/codex-discovery.mjs')).href);
    const found = await (hosted === 'claude' ? discoverClaude : discoverCodex)({ env: process.env });
    if (found.state !== 'available') throw Error(`${hosted} is not available on this machine`);
    // Each run is its own remote session and scratch project, so runs can proceed in parallel.
    const jobs = selected.flatMap(feature => Array.from({ length: runs }, (_, run) => ({ feature, run, request: feature.requests[run % feature.requests.length] })));
    const concurrency = Math.max(1, Math.min(16, Number(option('concurrency') ?? 6)));
    const results = [];
    const worker = async () => {
      for (let job = jobs.shift(); job; job = jobs.shift()) {
        const { feature, run, request } = job;
        let result;
        try { result = await runSessionCase({ provider: hosted, feature, request, offered: toolsFor(feature).offered, instructions: armInstructions(editingInstructions('feature-case', hosted), dials), executable: found.executable, model: option('model'), checkProposal, episode: newEpisode(), run }); }
        catch (error) { result = { pass: false, error: error.message, calls: [], invalid_attempts: [] }; }
        results.push({ case: feature.id, run, request, ...result });
        console.log(JSON.stringify({ case: feature.id, run, request, pass: result.pass, model: result.model, error: result.error, dials: result.dials, calls: result.calls.map(call => call.query ? `${call.tool}("${call.query}")` : `${call.tool}${call.ok ? '' : ' ✗'}`) }));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return report(`${hosted}:${option('model') ?? 'default'}${dials === 'agent' ? '+agent-dials' : ''}`, selected, results, runs);
  }
  let endpoint = option('endpoint'), model = option('served-model'), server, label;
  const apiKey = option('api-key-env') ? process.env[option('api-key-env')] : undefined;
  if (!endpoint) {
    // The same local runtime and model the desktop app serves.
    const { discoverLocal } = await import(pathToFileURL(path.join(root, 'desktop/local-discovery.mjs')).href);
    const { serveLocalModel } = await import(pathToFileURL(path.join(root, 'mcp/local-model-suite.mjs')).href);
    const { defaultLocalModel } = await import(pathToFileURL(path.join(root, 'desktop/local-session.mjs')).href);
    const local = await discoverLocal({ harnessRoot: root });
    if (local.state !== 'available') throw Error('No local model is installed; pass --endpoint and --served-model to evaluate another runtime.');
    const name = defaultLocalModel(local.models, option('model'));
    server = await serveLocalModel(name, { binary: local.executable, context: 65536, verify: false });
    endpoint = `${server.endpoint}/v1`; model = server.alias; label = `local:${name}`;
  } else label = model;
  // A llama.cpp server on this machine gets the desktop session's local settings and instructions.
  const local = Boolean(server) || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(endpoint);
  const extra = local ? { chat_template_kwargs: { enable_thinking: false } } : {};
  const results = [];
  try {
    for (const feature of selected) {
      for (let run = 0; run < runs; run++) {
        const request = feature.requests[run % feature.requests.length];
        const result = await runCase({ feature, request, endpoint, model, apiKey, instructions: armInstructions(editingInstructions('feature-case', local ? 'local' : 'claude'), dials), tools: toolsFor(feature).provider, offered: toolsFor(feature).offered, checkProposal, episode: newEpisode(), run, extra });
        results.push({ case: feature.id, request, ...result });
        console.log(JSON.stringify({ case: feature.id, run, request, pass: result.pass, calls: result.calls.map(call => call.query ? `${call.tool}("${call.query}")` : `${call.tool}${call.ok ? '' : ' ✗'}`) }));
      }
    }
  } finally { await server?.stop(); }
  report(`${label}${dials === 'agent' ? '+agent-dials' : ''}`, selected, results, runs);
}

function report(label, selected, results, runs) {
  // Receipts name the proposal schema the model saw, so compact and full runs compare directly.
  if (process.env.DREAMCUT_COMPACT_PROPOSAL_SCHEMA === '1') label = `${label}+compact`;
  const summary = selected.map(feature => { const runsFor = results.filter(result => result.case === feature.id); return { case: feature.id, passed: runsFor.filter(result => result.pass).length, runs: runsFor.length }; });
  const directory = path.join(root, 'private/eval-features'); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${new Date().toISOString().replace(/[:.]/g, '-')}-${label.replace(/[^a-z0-9.-]+/gi, '_')}.json`);
  fs.writeFileSync(file, JSON.stringify({ model: label, runs, summary, results }, null, 2));
  console.log(JSON.stringify({ model: label, summary, receipt: path.relative(root, file) }));
  // A feature passes when the model uses it in a majority of runs.
  if (summary.some(item => item.passed * 2 <= item.runs)) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
