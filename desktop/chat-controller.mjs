import fs from 'node:fs/promises';
import path from 'node:path';
import { AGENT_PROVIDERS, conversationExists, resetConversation } from './conversation-reset.mjs';
import { chatTranscript, replayContext, transcriptMessages } from './chat-transcript.mjs';
import { openDesktopEditingSession } from './editing-session.mjs';
import { createEpisodeLog } from './activity-journal.mjs';
import { LOCAL_MODEL_LABELS, defaultLocalModel } from './local-session.mjs';

const LABELS = { codex: 'Codex', claude: 'Claude', local: 'Local' };
const localModelChoices = agent => (agent?.models ?? []).map(name => ({ model: name, label: LOCAL_MODEL_LABELS[name] ?? name, isDefault: name === defaultLocalModel(agent.models, agent.defaultModel) }));
export const CHAT_ACTIONS = ['status', 'history', 'connect', 'send', 'cancel', 'disconnect', 'new-conversation', 'login', 'models', 'prewarm'];
const SEND_LIMIT_BYTES = 64000;
// What a message was sent with (selected clips, marks, page context), as the creator saw it.
export const chatAttachments = value => Array.isArray(value) ? value.slice(0, 100)
  .filter(item => item && typeof item.kind === 'string' && typeof item.label === 'string' && item.kind.trim() && item.label.trim())
  .map(item => ({ kind: item.kind.slice(0, 40), label: item.label.slice(0, 200) })) : [];

// Host-neutral chat owner shared by the Electron window bridge and the local browser
// route. Hosts supply the current project and an event sink; they cannot choose
// paths, tools, permissions or credentials. agents: host-discovered providers.
// login: the host's shared agent sign-in (agent-login.mjs); one per host, not per project.
// models: the host's lease-free model catalog (agent-models.mjs) for the picker.
export function createChatController({ projectNow, deliver, origin, projectsRoot, userData, agents, env, serviceToken, harnessRoot, login, models,
  openEditing = openDesktopEditingSession, resetEditing = resetConversation, closedMessage = 'Editing window closed.', episodes = createEpisodeLog({ origin, serviceToken }) }) {
  let session, sessionProject, sessionProvider, disposed = false, queue = Promise.resolve(), sendEpoch = 0;
  // DreamCut's own record of the conversation; `reply` collects the visible answer of the turn in flight.
  let transcript, reply;
  const serialize = task => { const next = queue.then(task); queue = next.catch(() => {}); return next; };
  const close = async () => { const previous = session; session = undefined; sessionProject = undefined; sessionProvider = undefined; if (previous) await previous.close(); };
  const status = () => ({ providers: AGENT_PROVIDERS.map(provider => ({ provider, label: LABELS[provider], available: Boolean(agents[provider]),
    authentication: agents[provider]?.authentication ?? 'unknown' })) });
  const resolveProject = async projectId => {
    const root = await fs.realpath(projectsRoot);
    const project = await fs.realpath(path.join(root, projectId));
    if (path.dirname(project) !== root) throw Error('Project is outside this workspace.');
    await fs.access(path.join(project, 'timeline.json'));
    return project;
  };
  const transcriptFor = async projectId => {
    if (transcript?.projectId !== projectId) transcript = { projectId, store: await chatTranscript(userData, await resolveProject(projectId)) };
    return transcript.store;
  };
  const finishReply = status => {
    const finished = reply; reply = undefined;
    // The training episode closes with the turn, carrying the visible reply.
    if (finished) episodes.end(status, finished.text);
    if (!finished) return;
    if (!finished.text.trim()) {
      // A turn cut off before any reply leaves a visible record instead of silence.
      if (status === 'completed') return;
      const text = status === 'interrupted' ? `${LABELS[finished.provider] ?? 'The agent'} stopped before replying.` : `${LABELS[finished.provider] ?? 'The agent'} could not finish a reply.`;
      void finished.store.append({ kind: 'notice', text, provider: finished.provider }).catch(() => {});
      if (!disposed && projectNow() === finished.projectId) deliver({ projectId: finished.projectId, type: 'notice', text });
      return;
    }
    void finished.store.append({ kind: 'assistant', text: finished.text, provider: finished.provider, model: finished.model, status })
      .then(count => finished.store.advanceCursor(finished.provider, count)).catch(() => {});
  };
  const call = (action, text) => {
    if (!CHAT_ACTIONS.includes(action)) return Promise.reject(Error('Unsupported chat action.'));
    // Stop must not wait behind the send it is intended to interrupt. Session
    // creation remains serialized; cancellation never opens a new session.
    if (action === 'cancel') {
      if (disposed) return Promise.reject(Error(closedMessage));
      const projectId = projectNow();
      if (!projectId) return Promise.reject(Error('Open a project before using the editing assistant.'));
      sendEpoch++;
      if (sessionProject !== projectId) return Promise.resolve();
      return Promise.resolve(session?.cancel());
    }
    if (action === 'status') return Promise.resolve(status());
    // Loading a chosen model ahead of the first message never waits behind other work.
    if (action === 'prewarm') {
      const payload = typeof text === 'object' && text !== null ? text : {};
      if (disposed || !session?.prewarm || sessionProvider !== payload.provider || sessionProject !== projectNow()) return Promise.resolve();
      return session.prewarm(typeof payload.model === 'string' && payload.model ? payload.model : undefined);
    }
    // The saved conversation is readable without connecting, so a reload shows it at once.
    if (action === 'history') {
      if (disposed) return Promise.reject(Error(closedMessage));
      const projectId = projectNow();
      if (!projectId) return Promise.reject(Error('Open a project before using the editing assistant.'));
      return transcriptFor(projectId).then(store => store.events()).then(transcriptMessages);
    }
    // Listing models opens no conversation, so it never takes the project's lease.
    if (action === 'models') {
      const provider = typeof text === 'object' && text !== null ? text.provider : undefined;
      if (!AGENT_PROVIDERS.includes(provider)) return Promise.reject(Error('Unsupported editing agent.'));
      if (!agents[provider]) return Promise.resolve({ models: [] });
      // Local models are the installed, qualified files; listing them starts nothing.
      if (provider === 'local') return Promise.resolve({ models: localModelChoices(agents.local) });
      if (!models) return Promise.resolve({ models: [] });
      return models.list(provider, { executable: agents[provider].executable, env }).then(list => ({ models: list }));
    }
    // Sign-in belongs to the agent, not the project, and must not wait behind a turn.
    if (action === 'login') {
      if (!login) return Promise.reject(Error('Sign-in is not available here.'));
      const payload = typeof text === 'object' && text !== null ? text : {};
      if (payload.provider !== 'claude') return Promise.reject(Error('Only Claude signs in from DreamCut.'));
      return login.call({ step: payload.step, code: payload.code }, agents.claude?.executable).then(result => {
        if (result.status === 'signed-in' && agents.claude) agents.claude.authentication = 'signed-in';
        return result;
      });
    }
    const requestEpoch = sendEpoch;
    return serialize(async () => {
      if (disposed) throw Error(closedMessage);
      const projectId = projectNow();
      if (!projectId) throw Error('Open a project before using the editing assistant.');
      if (sessionProject && sessionProject !== projectId) await close();
      if (action === 'disconnect') { await close(); return; }
      const payload = typeof text === 'object' && text !== null ? text : {};
      const provider = payload.provider ?? 'codex';
      if (!AGENT_PROVIDERS.includes(provider)) throw Error('Unsupported editing agent.');
      const model = action === 'send' ? payload.model : undefined;
      if (action === 'send' && typeof text === 'object' && text !== null) text = payload.text;
      if (model !== undefined && (typeof model !== 'string' || !model || model.length > 160)) throw Error('Invalid model selection.');
      // `display` is what the creator typed; `text` may carry attached page context.
      const attachments = action === 'send' ? chatAttachments(payload.attachments) : undefined;
      const display = action === 'send' && typeof payload.display === 'string' && payload.display.trim() && Buffer.byteLength(payload.display) <= SEND_LIMIT_BYTES ? payload.display : undefined;
      if (action === 'send' && (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 64000)) throw Error('Invalid chat message.');
      if (action === 'new-conversation') {
        await close();
        const project = await resolveProject(projectId);
        if (disposed || projectNow() !== projectId) throw Error('The open project changed. Conversation was not reset.');
        // The conversation is shared by every agent, so each agent's saved session is archived with it.
        for (const each of AGENT_PROVIDERS) {
          if (each === provider || await conversationExists(userData, project, each)) await resetEditing({ userData, projectDirectory: project, provider: each });
        }
        await (await transcriptFor(projectId)).archive();
        return;
      }
      const agent = agents[provider];
      if (!agent) throw Error(`Install and sign in to ${LABELS[provider]} before connecting.`);
      if (session && sessionProvider !== provider) await close();
      const store = await transcriptFor(projectId);
      if (!session) {
        const project = await resolveProject(projectId);
        sessionProject = projectId; sessionProvider = provider;
        let resumed = null; // the agent's own history, present only when it reopened its saved session
        // A local session warms the creator's remembered model rather than the default.
        const localModel = action === 'connect' && agent.models?.includes(payload.model) ? payload.model : agent.defaultModel;
        const open = () => openEditing({ provider, executable: agent.executable, ...(provider === 'local' ? { models: agent.models, defaultModel: localModel } : {}), projectDirectory: project, userData, env, origin, serviceToken, harnessRoot,
          onToolRecord: value => { if (reply) episodes.tool(value); },
          onEvent: value => {
            // DreamCut's record is what the panel shows; the agent's copy only seeds an older conversation.
            if (value.type === 'history') { resumed = value; return; }
            if (value.type === 'text' && reply) { reply.text += value.text ?? ''; episodes.text(value.text); }
            if (value.type === 'reasoning' && reply) episodes.reasoning(value.text);
            if (value.type === 'model' && reply && typeof value.model === 'string') { reply.model = value.model; episodes.model(value.model); }
            if (value.type === 'completed') finishReply(value.status);
            if (value.type === 'disconnected') { finishReply('interrupted'); void serialize(close); }
            if (!disposed && projectNow() === projectId) deliver({ projectId, ...value });
          } });
        try {
          try { session = await open(); }
          catch (error) {
            // When DreamCut holds the conversation, an agent session that cannot be reopened
            // (its tools changed) is archived and replaced; the new one receives the history.
            if (!/session tools differ/i.test(error?.message ?? '') || !(await store.events()).length) throw error;
            await resetEditing({ userData, projectDirectory: project, provider });
            resumed = null;
            session = await open();
            const notice = `Started a fresh ${LABELS[provider]} session because DreamCut's editing tools changed. It received this conversation as context.`;
            await store.append({ kind: 'notice', text: notice, provider });
            if (!disposed && projectNow() === projectId) deliver({ projectId, type: 'notice', text: notice });
          }
          if (session.interrupted?.length) {
            const notice = 'Your last request was interrupted. The agent will check what finished before continuing.';
            await store.append({ kind: 'notice', text: notice, provider });
            if (!disposed && projectNow() === projectId) deliver({ projectId, type: 'notice', text: notice });
          }
          const events = await store.events();
          if (resumed && !events.length && resumed.messages?.length) {
            // A conversation that predates DreamCut's record: keep what the agent still has.
            const count = await store.append(resumed.messages.filter(item => ['user', 'assistant'].includes(item.role) && typeof item.text === 'string')
              .map(item => ({ kind: item.role, text: item.text, provider, model: item.model, imported: true })));
            await store.setCursor(provider, count);
            if (!disposed && projectNow() === projectId) deliver({ projectId, type: 'history', ...transcriptMessages(await store.events()) });
          } else if (!resumed) await store.setCursor(provider, 0); // A fresh agent session has seen nothing yet.
        } catch (error) { if (session) await close(); sessionProject = undefined; sessionProvider = undefined; throw error; }
      }
      // Navigation may have occurred while the connection was starting.
      if (disposed || projectNow() !== projectId) { await close(); throw Error('The open project changed. Message was not sent.'); }
      if (action === 'connect') return session.models ? await session.models() : undefined;
      if (action === 'send' && requestEpoch === sendEpoch) {
        // Turns this agent has not seen (it is new, or another agent answered since) travel as quoted context.
        const events = await store.events();
        const context = replayContext(events.slice((await store.cursor(provider)) ?? 0), Math.max(0, SEND_LIMIT_BYTES - Buffer.byteLength(text) - 512));
        const count = await store.append({ kind: 'user', text: display ?? text, provider, model, ...(attachments?.length ? { attachments } : {}) });
        reply = { store, provider, model, text: '', projectId };
        const contract = await session.contract?.().catch(() => undefined);
        episodes.begin({ projectId, provider, model, display: display ?? text, sent: context + text, attachments, contract });
        try { await session.send(context + text, model); }
        catch (error) { reply = undefined; episodes.end('failed'); throw error; }
        await store.advanceCursor(provider, count);
      }
    });
  };
  let disposal;
  return {
    call,
    /** Close the session when the host's project no longer matches it. */
    projectChanged() { if (sessionProject && projectNow() !== sessionProject) void serialize(close); },
    dispose() {
      if (disposal) return disposal;
      disposed = true; sendEpoch++;
      // Closing the active transport releases a pending send. Then drain queued
      // work, including a connection that was still starting when we closed.
      const immediate = close();
      disposal = Promise.allSettled([immediate, serialize(close)]).then(results => {
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      });
      return disposal;
    },
  };
}
