"use client";
import { pitchRatio } from "@/lib/timeline/audio-pitch";
import { PITCH_SHIFTER_SOURCE } from "./pitch-shift-core";

/**
 * Live pitch shift for preview (timeline/audio-pitch.ts owns the field; pitch-shift-core.ts owns
 * the signal processing and its delay). Unshifted clips never pass through this node.
 */
const PROCESSOR = "dreamcut-pitch-shift";
const SOURCE = `${PITCH_SHIFTER_SOURCE}
class PitchShift extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: "ratio", defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: "k-rate" }]; }
  constructor() { super(); this.shifter = createPitchShifter(sampleRate, 2); }
  process(inputs, outputs, parameters) {
    this.shifter.process(inputs[0] || [], outputs[0], parameters.ratio[0]);
    return true;
  }
}
registerProcessor("${PROCESSOR}", PitchShift);
`;

const modules = new WeakMap<BaseAudioContext, Promise<void>>();

function loadModule(context: BaseAudioContext) {
  let loaded = modules.get(context);
  if (!loaded) {
    const url = URL.createObjectURL(new Blob([SOURCE], { type: "text/javascript" }));
    loaded = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    modules.set(context, loaded);
  }
  return loaded;
}

/** A pitch-shift node for this context, set to `semitones`; resolves once its module is loaded. */
export async function createPitchShiftNode(context: BaseAudioContext, semitones: number): Promise<AudioWorkletNode> {
  await loadModule(context);
  const node = new AudioWorkletNode(context, PROCESSOR, { outputChannelCount: [2] });
  setPitchShift(node, semitones);
  return node;
}

export function setPitchShift(node: AudioWorkletNode, semitones: number) {
  const ratio = node.parameters.get("ratio");
  if (ratio) ratio.value = pitchRatio(semitones);
}

/**
 * Routes `source` into `destination`, through a pitch-shift node once a clip asks for one.
 * Unshifted clips keep their direct connection; the node is added the first time the shift
 * leaves zero and is then retuned in place, so dragging the dial never rebuilds the graph.
 */
export class PitchShiftRoute {
  private node: AudioWorkletNode | null = null;
  private pending: Promise<void> | null = null;
  private semitones = 0;
  private disposed = false;

  constructor(private context: BaseAudioContext, private source: AudioNode, private destination: AudioNode) {
    source.connect(destination);
  }

  set(semitones: number) {
    this.semitones = semitones;
    if (this.node) { setPitchShift(this.node, semitones); return; }
    if (!semitones || this.pending || typeof AudioWorkletNode === "undefined") return;
    this.pending = createPitchShiftNode(this.context, semitones).then(node => {
      if (this.disposed) return;
      setPitchShift(node, this.semitones);
      this.source.disconnect(this.destination);
      this.source.connect(node);
      node.connect(this.destination);
      this.node = node;
    }).catch(error => {
      // The clip keeps playing unshifted rather than going silent.
      console.warn("[pitch] preview pitch shift unavailable", error);
    });
  }

  dispose() {
    this.disposed = true;
    this.node?.disconnect();
    this.node = null;
  }
}
