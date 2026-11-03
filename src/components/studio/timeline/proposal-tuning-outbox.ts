import type {ProposalNumericOverride} from './timeline-client';
import type {ProposalTuningWrite} from '@/lib/agent/proposal-tuning-write';
import {proposalTuningWriteSchema} from '@/lib/agent/proposal-tuning-write';
import {z} from 'zod';

export const PROPOSAL_TUNING_OUTBOX_KEY = 'dreamcut.proposal-tuning.outbox.v1';
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export type PendingTuning = {
  projectId: string; proposalId: string; optionId: string;
  overrides: ProposalNumericOverride[]; write: ProposalTuningWrite;
};
type State = {version: 1; clientId: string; sequence: number; jobs: Record<string, PendingTuning>};
const keyFor = (job: Pick<PendingTuning, 'projectId' | 'proposalId' | 'optionId'>) => JSON.stringify([job.projectId, job.proposalId, job.optionId]);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const storedJob = z.object({projectId:z.string().min(1),proposalId:z.string().min(1),optionId:z.string().min(1),
  overrides:z.array(z.object({operation_index:z.number().int().nonnegative(),target:z.string(),field:z.string(),value:z.union([z.number().finite(),z.string(),z.array(z.number().finite())])}).strict()),
  write:proposalTuningWriteSchema}).strict();
const storedState = z.object({version:z.literal(1),clientId:proposalTuningWriteSchema.shape.client_id,sequence:z.number().int().nonnegative(),jobs:z.record(z.string(),storedJob)}).strict();

/** Only a matching, still-pending review may display a recovered intent. */
export function recoveredTuningFor(jobs: PendingTuning[], scope: {projectId:string;proposalId:string;revision:string;status:string;stale:boolean;optionIds:string[]}) {
  return jobs.filter(job => scope.status === 'pending' && !scope.stale && job.projectId === scope.projectId
    && job.proposalId === scope.proposalId && job.write.expected_revision === scope.revision && scope.optionIds.includes(job.optionId));
}

/** One latest intent per option, durably staged before a control event returns. */
export function createProposalTuningOutbox(options: {
  storage?: Storage;
  save: (job: PendingTuning) => Promise<unknown>;
  canRecover: (job: PendingTuning) => Promise<boolean>;
  onError: (error: unknown) => void;
  clientId?: () => string;
  storageError?: unknown;
}) {
  let memory: State = {version: 1, clientId: (options.clientId ?? (() => crypto.randomUUID()))(), sequence: 0, jobs: {}};
  let durable = Boolean(options.storage);
  const storageFailed = (error: unknown) => { durable = false; options.onError(error); };
  if (options.storageError) storageFailed(options.storageError);
  const read = (): State => {
    if (!durable) return memory;
    try {
      const raw = options.storage!.getItem(PROPOSAL_TUNING_OUTBOX_KEY);
      if (!raw) return memory;
      const state = storedState.parse(JSON.parse(raw)) as State;
      if (Object.entries(state.jobs).some(([key,job])=>key !== keyFor(job) || job.write.client_id !== state.clientId || job.write.sequence > state.sequence)) throw new Error('Review adjustments could not be recovered');
      memory = state;
    } catch (error) { storageFailed(error); }
    return memory;
  };
  const write = (state: State) => {
    memory = state;
    if (durable) try { options.storage!.setItem(PROPOSAL_TUNING_OUTBOX_KEY, JSON.stringify(state)); } catch (error) { storageFailed(error); }
  };
  let initial: State;
  try { initial = read(); } catch (error) { options.onError(error); initial = memory; }
  const recovered = new Set(Object.values(initial.jobs).map(job => `${job.write.client_id}:${job.write.sequence}`));
  let running: Promise<void> | null = null;
  const pending = () => clone(Object.values(read().jobs).sort((a, b) => a.write.sequence - b.write.sequence));
  const acknowledge = (job: PendingTuning) => {
    const state = read(), key = keyFor(job), current = state.jobs[key];
    if (current?.write.client_id !== job.write.client_id || current.write.sequence !== job.write.sequence) return;
    delete state.jobs[key]; write(state);
  };
  const outbox = {
    pending,
    stage(job: Omit<PendingTuning, 'write'> & {expectedRevision: string}) {
      const state = read();
      const {expectedRevision, ...target} = job;
      const next = clone({...target, write: {client_id: state.clientId, sequence: state.sequence + 1, expected_revision:expectedRevision}});
      state.sequence = next.write.sequence;
      state.jobs[keyFor(next)] = next;
      write(state);
      // Storage failure cannot provide reload durability; retain memory and save promptly.
      if (!durable) void outbox.flush();
    },
    flush(): Promise<void> {
      if (running) return running;
      running = Promise.resolve().then(async () => {
        const failed = new Set<string>();
        for (;;) {
          const job = pending().find(job => !failed.has(`${job.write.client_id}:${job.write.sequence}`));
          if (!job) return;
          try {
            if (recovered.has(`${job.write.client_id}:${job.write.sequence}`) && !await options.canRecover(job)) {
              acknowledge(job); continue;
            }
            await options.save(job);
            acknowledge(job);
          } catch (error) {
            failed.add(`${job.write.client_id}:${job.write.sequence}`);
            options.onError(error);
          }
        }
      }).catch(options.onError).finally(() => { running = null; });
      return running;
    },
  };
  return outbox;
}
