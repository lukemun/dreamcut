import { createHash } from 'node:crypto';

type Report = {
  projectId: string; createdAt: string;
  readDelta: { previousReportAt: string | null };
  states: Array<{ atSeconds: number; frame: number; layers: Array<{ id: string }>; read: { status: string };
    caption?: { safeAreaViolations: string[] } | null;
    spatialRelations?: Array<{ expectation?: { status: string } | null }>;
  }>;
};

/** Navigation index, never a substitute for a report or question-specific review. */
export function frameChangeBrief(report: Report, reportPath: string, reportBytes: string, previousTimes: number[]) {
  const currentTimes = new Set(report.states.map(state => state.atSeconds));
  return {
    schema_version: 1, project_id: report.projectId, created_at: report.createdAt,
    evidence: { path: reportPath, sha256: createHash('sha256').update(reportBytes).digest('hex'), previous_report_at: report.readDelta.previousReportAt },
    sampled_frames: report.states.length,
    inspect: report.states.filter(state => state.read.status !== 'unchanged').map(state => ({
      at_seconds: state.atSeconds, frame: state.frame, status: state.read.status,
      visible_element_ids: [...new Set(state.layers.map(layer => layer.id))],
    })),
    unchanged_at: report.states.filter(state => state.read.status === 'unchanged').map(state => state.atSeconds),
    attention: report.states.flatMap(state => {
      const violations = state.caption?.safeAreaViolations ?? [];
      const failed = state.spatialRelations?.filter(relation => relation.expectation?.status === 'fail').length ?? 0;
      return violations.length || failed ? [{ at_seconds: state.atSeconds, safe_area_violations: violations, failed_expectations: failed }] : [];
    }),
    no_longer_sampled_at: previousTimes.filter(time => !currentTimes.has(time)),
    next_check: 'Inspect changed/new samples for the current question. For a new question, inspect every relevant sample, including unchanged ones. Read the full report for measurements, findings and coverage.',
    limits: 'Pixel novelty only. Visible elements are context, not a claim that each changed. Removed sample times are coverage changes, not deleted clips. No test or approval is waived; unsampled intervals remain unverified.',
  };
}
