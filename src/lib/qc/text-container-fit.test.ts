import assert from "node:assert/strict";
import test from "node:test";

import type { QcElement } from "./check-timeline";
import { checkTextContainerFitElement, type TextContainerFitContract } from "./text-container-fit";

const sourceUrl = "/media/card-v1.png";

function element(contract?: TextContainerFitContract): QcElement {
  return {
    id: "card",
    type: "still",
    lane_key: "visual_0",
    timeline_start: 1,
    duration: 2,
    volume: 0,
    fade_in: 0,
    fade_out: 0,
    source_url: sourceUrl,
    props: { requires_text_container_fit: true, text_container_fit_contract: contract },
  };
}

function contract(ink: { x: number; y: number; width: number; height: number }): TextContainerFitContract {
  return {
    version: 1,
    validated_source_url: sourceUrl,
    canvas: { width: 1080, height: 1920 },
    slots: [{ id: "conversion", label: "1% CONVERSION", container: { x: 100, y: 100, width: 400, height: 100 }, ink }],
  };
}

test("prominent text requires a measurement receipt", () => {
  assert.deepEqual(checkTextContainerFitElement(element()).map((f) => f.code), ["text_container_fit_unmeasured"]);
});

test("a stale receipt cannot certify a changed source", () => {
  const stale = contract({ x: 140, y: 130, width: 320, height: 40 });
  stale.validated_source_url = "/media/old.png";
  assert.deepEqual(checkTextContainerFitElement(element(stale)).map((f) => f.code), ["text_container_fit_stale"]);
});

test("underfill fails even though the label technically fits", () => {
  assert.ok(checkTextContainerFitElement(element(contract({ x: 200, y: 135, width: 200, height: 30 }))).some((f) => f.code === "text_container_underfilled"));
});

test("overflow and off-center geometry fail independently", () => {
  const codes = checkTextContainerFitElement(element(contract({ x: 105, y: 110, width: 380, height: 60 }))).map((f) => f.code);
  assert.ok(codes.includes("text_container_overfilled"));
  assert.ok(codes.includes("text_container_misaligned"));
});

test("snug measured type centered in its container passes", () => {
  assert.deepEqual(checkTextContainerFitElement(element(contract({ x: 140, y: 130, width: 320, height: 40 }))), []);
});
