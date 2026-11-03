import {z} from 'zod';

/** Orders this browser tab's review writes across reloads; never grants timeline authority. */
export const proposalTuningWriteSchema = z.object({
  client_id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expected_revision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ProposalTuningWrite = z.infer<typeof proposalTuningWriteSchema>;
