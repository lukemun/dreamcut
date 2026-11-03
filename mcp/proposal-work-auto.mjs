// Server-recorded proposal timing. proposal_create and motion_graphic_prepare open and close
// proposal-work spans themselves (src/lib/observability/proposal-work.ts), keyed by MCP session and
// project, so a retro has phase times even when the agent never calls proposal_work_record. The
// agent's own attempts are separate records; recording never changes a tool's result or failure.

/** The tools whose calls are timed, and the phase each one marks. */
export const AUTO_WORK_PHASES = { motion_graphic_prepare: "preparation", proposal_create: "validation" };

/** The staged proposal's id, from the shapes proposal_create returns. */
export function savedProposalId(result) {
  const id = result?.proposal?.id ?? result?.proposal_id ?? result?.id;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

/**
 * `post(projectId, body)` sends one proposal-work event to the editor and returns its reply.
 * One open attempt per project; a saved proposal closes it so the next card starts a new one.
 */
export function createAutoProposalWork({ post, sessionId }) {
  const attempts = new Map();
  const quiet = async (projectId, body) => { try { return await post(projectId, body); } catch { return null; } };
  const attemptFor = async projectId => {
    if (attempts.has(projectId)) return attempts.get(projectId);
    const started = await quiet(projectId, { action: "start", recorded_by: "server", ...(sessionId ? { session_id: sessionId } : {}) });
    if (typeof started?.attempt_id !== "string") return null;
    attempts.set(projectId, started.attempt_id);
    return started.attempt_id;
  };
  return {
    /** Run `invoke` inside a span for `tool`; the result and any error pass through unchanged. */
    async around(tool, projectId, invoke) {
      const phase = AUTO_WORK_PHASES[tool];
      if (!phase || typeof projectId !== "string" || !projectId) return invoke();
      const attemptId = await attemptFor(projectId);
      const span = attemptId ? await quiet(projectId, { action: "begin", attempt_id: attemptId, phase, recorded_by: "server" }) : null;
      const spanId = typeof span?.span_id === "string" ? span.span_id : null;
      let outcome = "completed", result;
      try {
        result = await invoke();
        return result;
      } catch (error) {
        outcome = "failed";
        throw error;
      } finally {
        if (attemptId && spanId) await quiet(projectId, { action: "end", attempt_id: attemptId, span_id: spanId, outcome, recorded_by: "server" });
        const proposalId = tool === "proposal_create" && outcome === "completed" ? savedProposalId(result) : null;
        if (attemptId && proposalId) {
          await quiet(projectId, { action: "saved", attempt_id: attemptId, proposal_id: proposalId, recorded_by: "server" });
          attempts.delete(projectId);
        }
      }
    },
    /** For tests: the attempt currently open for a project. */
    openAttempt(projectId) { return attempts.get(projectId) ?? null; },
  };
}
