import { createSharedPoll, sharedPoll, type PollEnvironment, type SharedPoll } from "./shared-poll";
import type { ConditionalResult } from "./shared-poll";
import type { ProposalInboxResponse } from "./timeline-client";

export const PROPOSAL_INBOX_POLL_INTERVAL_MS = 2_000;

/**
 * The project's proposal inbox (list + pending review details) as one shared,
 * visibility-aware, conditional poll. The Review panel and the toolbar badge
 * both read it, so an idle editor costs one empty 304 every interval.
 * Read-only: approval and rejection still go through their own requests.
 */
export function proposalInboxFeed(client: {
  projectId: string;
  getProposalInbox(etag: string | null): Promise<ConditionalResult<ProposalInboxResponse>>;
}, env?: PollEnvironment): SharedPoll<ProposalInboxResponse> {
  return sharedPoll(`proposal-inbox:${client.projectId}`, () => createSharedPoll({
    intervalMs: PROPOSAL_INBOX_POLL_INTERVAL_MS,
    load: (etag) => client.getProposalInbox(etag),
    env,
  }));
}
