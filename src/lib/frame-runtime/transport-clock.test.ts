import test from "node:test";
import assert from "node:assert/strict";
import { PlaybackTransport, TransportClock, type TransportHost, type TransportScheduler } from "./transport-clock";

/** Deterministic scheduler: timers run by advancing a fake clock; paints run only when asked. */
function fakeScheduler() {
  let now = 0, nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const paints = new Map<number, (now: number) => void>();
  const scheduler: TransportScheduler = {
    now: () => now,
    requestPaint: callback => { const id = nextId++; paints.set(id, callback); return id; },
    cancelPaint: id => { paints.delete(id); },
    setTimer: (callback, ms) => { const id = nextId++; timers.set(id, { at: now + ms, callback }); return id; },
    clearTimer: id => { timers.delete(id as number); },
  };
  return {
    scheduler,
    get now() { return now; },
    pendingPaints: () => paints.size,
    /** Advances time, running due timers in order; animation frames stay starved. */
    tick(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].callback();
      }
      now = end;
    },
    /** Delivers one animation frame to every waiting paint callback. */
    paint() { const pending = [...paints.values()]; paints.clear(); pending.forEach(callback => callback(now)); },
  };
}

function harness(options: { duration?: number; fps?: number; buffering?: () => boolean; mediaClock?: () => number | null } = {}) {
  const clock = fakeScheduler();
  const events: Array<[string, unknown]> = [];
  const presented: number[] = [];
  const host: TransportHost = {
    fps: () => options.fps ?? 30,
    durationInFrames: () => options.duration ?? 300,
    blocked: () => false,
    buffering: options.buffering ?? (() => false),
    bufferingAtStart: () => false,
    mediaClock: options.mediaClock ?? (() => null),
    failed: () => false,
    syncMedia: () => {},
    present: frame => { presented.push(frame); },
    commitUi: () => {},
    setPlaying: () => {},
    setBuffering: () => {},
    setRate: () => {},
    emit: (name, detail) => { events.push([name, detail]); },
  };
  const transport = new PlaybackTransport(host, clock.scheduler);
  return { clock, transport, events, presented };
}

test("the anchored clock advances with elapsed time and freezes when stopped", () => {
  const clock = new TransportClock(30);
  clock.start(10, 1000);
  assert.equal(clock.position(2000), 40);
  clock.retime(30, 2, 2000);
  assert.equal(clock.position(2500), 70);
  clock.stop(2500);
  assert.equal(clock.position(9000), 70);
  assert.equal(clock.msUntil(100, 9000), Infinity);
});

test("play advances time with no animation frames at all", () => {
  const { clock, transport, events } = harness();
  transport.play();
  clock.tick(1000);
  assert.equal(transport.frame, 30);
  assert.ok(events.some(([name]) => name === "frameupdate"));
  clock.tick(500);
  assert.equal(transport.frame, 45);
});

test("a late paint catches up to transport time instead of resuming where painting stopped", () => {
  const { clock, transport } = harness();
  transport.play();
  clock.paint();
  assert.equal(transport.frame, 0);
  // Painting stalls for two seconds; even the heartbeat is skipped here by reading directly.
  assert.ok(transport.advance(clock.now + 2000));
  assert.equal(transport.frame, 60);
});

test("pause stops time and both drivers", () => {
  const { clock, transport, events } = harness();
  transport.play();
  clock.tick(500);
  transport.pause();
  const frame = transport.frame;
  clock.tick(5000);
  clock.paint();
  assert.equal(transport.frame, frame);
  assert.equal(transport.playing, false);
  assert.equal(clock.pendingPaints(), 0);
  assert.equal(events.at(-1)?.[0], "pause");
});

test("seek while playing continues from the new position", () => {
  const { clock, transport, events } = harness();
  transport.play();
  clock.tick(1000);
  transport.seek(200);
  assert.equal(transport.frame, 200);
  assert.deepEqual(events.filter(([name]) => name === "seeked").at(-1), ["seeked", { frame: 200 }]);
  clock.tick(1000);
  assert.equal(transport.frame, 230);
  assert.equal(transport.playing, true);
});

test("reaching the end pauses on the last frame and reports ended, without animation frames", () => {
  const { clock, transport, events } = harness({ duration: 60 });
  transport.play();
  clock.tick(1900);
  assert.equal(transport.frame, 57);
  assert.equal(transport.playing, true);
  clock.tick(2000);
  assert.equal(transport.frame, 59);
  assert.equal(transport.playing, false);
  assert.deepEqual(events.slice(-2).map(([name]) => name), ["pause", "ended"]);
  // Play from the end restarts at the beginning.
  transport.play();
  assert.equal(transport.frame, 0);
});

test("waiting holds time at the committed frame and resumes from it", () => {
  let waiting = false;
  const { clock, transport, events } = harness({ buffering: () => waiting });
  transport.play();
  clock.tick(1000);
  waiting = true;
  clock.tick(3000);
  assert.equal(transport.frame, 30);
  waiting = false;
  clock.tick(1000);
  assert.ok(transport.frame >= 59 && transport.frame <= 60);
  assert.deepEqual(events.filter(([name]) => name === "waiting" || name === "resume").map(([name]) => name), ["waiting", "resume"]);
});

test("an audio clock leads time and never moves the picture backwards", () => {
  let media: number | null = 90;
  const { clock, transport } = harness({ mediaClock: () => media });
  transport.play();
  clock.tick(100);
  assert.equal(transport.frame, 90);
  media = 80;
  clock.tick(100);
  assert.equal(transport.frame, 90);
  // When the audio stops supplying time, the transport continues from it.
  media = null;
  clock.tick(1000);
  assert.equal(transport.frame, 120);
});

test("rate changes keep position and scale elapsed time", () => {
  const { clock, transport } = harness();
  transport.play();
  clock.tick(1000);
  transport.setRate(2);
  clock.tick(1000);
  assert.equal(transport.frame, 90);
});
