export function resolveAudioAutomationSampleFrame({
  frame,
  durationInFrames,
  framesPerSample,
  transitionOutFrames = 0,
}: {
  frame: number;
  durationInFrames: number;
  framesPerSample: number;
  transitionOutFrames?: number;
}) {
  const boundedFrame = Math.min(durationInFrames, Math.max(0, Math.round(frame)));
  const transitionOutStart = Math.max(0, durationInFrames - Math.max(0, transitionOutFrames));

  // Short narration-owned transition fades are frame cues. Coarse sampling can
  // round a fade backward into the final spoken phoneme, so preserve every
  // frame inside the transition window and sample only the steady body.
  if (transitionOutFrames > 0 && boundedFrame >= transitionOutStart) {
    return boundedFrame;
  }

  return Math.min(
    durationInFrames,
    Math.max(0, Math.round(boundedFrame / Math.max(1, framesPerSample)) * Math.max(1, framesPerSample)),
  );
}
