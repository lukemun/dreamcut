import readline from 'node:readline';

/**
 * The MCP connection during DreamCut's first download. Agent apps start a plugin's MCP server with the
 * session and give up after about 30 s, but the first runtime download takes minutes. So the launcher
 * answers at once with one progress tool, installs in the background, then starts the real server,
 * replays the agent's `initialize` to it, forwards everything from then on and tells the agent its tools
 * changed. Messages that arrive during the hand-over are queued, never dropped.
 *
 * `install()` resolves to the runtime folder; `status()` describes progress; `start(runtime)` spawns the
 * real server with piped stdio. Returns a promise of the real server's exit code.
 */
export const SETUP_TOOL = 'dreamcut_setup_status';
const REPLAY_ID = '__dreamcut_bootstrap_initialize';

export function serveWhileInstalling({ install, status, start, input = process.stdin, output = process.stdout, version = '0' }) {
  const write = message => output.write(`${JSON.stringify(message)}\n`);
  let initialize = null, child = null, live = false, failure = null, guidance = null, closed = false;
  const queued = [];
  let resolveExit;
  const exited = new Promise(resolve => { resolveExit = resolve; });

  // A failure with guidance (no ready-made editor for this computer) tells the agent what to do instead.
  const text = () => guidance ?? (failure
    ? `DreamCut could not finish installing: ${failure}. Run \`npx dreamcut install\` in a terminal to see the details, then restart this session.`
    : `${status()} DreamCut's tools appear here when it finishes; this happens only once.`);
  const answer = message => {
    const { id, method, params } = message;
    if (id == null) return; // Notifications need no reply.
    if (method === 'initialize') {
      initialize = message;
      write({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion ?? '2024-11-05', capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'dreamcut', version }, instructions: `DreamCut is finishing its first-time setup. Call ${SETUP_TOOL} to report progress to the user; the full DreamCut tools appear when setup completes.` } });
    } else if (method === 'ping') write({ jsonrpc: '2.0', id, result: {} });
    else if (method === 'tools/list') write({ jsonrpc: '2.0', id, result: { tools: [{ name: SETUP_TOOL,
      description: 'Report DreamCut\'s first-time download progress. DreamCut\'s editing tools appear when it completes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] } });
    else if (method === 'tools/call') write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: text() }], isError: params?.name !== SETUP_TOOL || Boolean(failure) } });
    else if (method === 'resources/list') write({ jsonrpc: '2.0', id, result: { resources: [] } });
    else if (method === 'prompts/list') write({ jsonrpc: '2.0', id, result: { prompts: [] } });
    else write({ jsonrpc: '2.0', id, error: { code: -32601, message: `${method} is unavailable until DreamCut finishes installing.` } });
  };

  const lines = readline.createInterface({ input });
  lines.on('line', line => {
    if (!line.trim()) return;
    if (live) { child.stdin.write(`${line}\n`); return; }
    if (child) { queued.push(line); return; } // Handing over: the real server answers these.
    let message;
    try { message = JSON.parse(line); } catch { return; }
    answer(message);
  });
  lines.on('close', () => { closed = true; if (child) child.stdin.end(); else resolveExit(0); });

  install().then(runtime => {
    if (closed) return; // The agent left before setup finished; the install is kept for next time.
    child = start(runtime);
    child.on('exit', (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
    const replies = readline.createInterface({ input: child.stdout });
    replies.on('line', line => {
      if (!live) {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        if (message.id !== REPLAY_ID) return;
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
        live = true;
        for (const pending of queued.splice(0)) child.stdin.write(`${pending}\n`);
        write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
        return;
      }
      output.write(`${line}\n`);
    });
    const params = initialize?.params ?? { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dreamcut-launcher', version } };
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: REPLAY_ID, method: 'initialize', params })}\n`);
  }, error => {
    // fetch reports network failures as "fetch failed" with the reason in `cause`.
    failure = error.cause?.message ? `${error.message} (${error.cause.message})` : error.message;
    guidance = error.guidance ?? null;
    process.stderr.write(`DreamCut setup failed: ${failure}\n`);
  });
  return { exited, get child() { return child; } };
}
