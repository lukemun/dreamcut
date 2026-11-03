import assert from "node:assert/strict";
import test from "node:test";
import { groupControlLabels } from "./control-label-groups";

test("three or more labels sharing a first word become a heading and short labels", () => {
  const labels = ["Build length", "Title hold", "Word 1", "Word 2", "Word 3", "Accent", "Ticker colour", "Ticker low price", "Ticker closing price", "Ticker volatility"];
  assert.deepEqual(groupControlLabels(labels), [
    { group: null, label: "Build length" },
    { group: null, label: "Title hold" },
    { group: null, label: "Word 1" },
    { group: null, label: "Word 2" },
    { group: null, label: "Word 3" },
    { group: null, label: "Accent" },
    { group: "Ticker", label: "Colour" },
    { group: "Ticker", label: "Low price" },
    { group: "Ticker", label: "Closing price" },
    { group: "Ticker", label: "Volatility" },
  ]);
  assert.deepEqual(groupControlLabels(["Ticker low", "Ticker high"]).map(item => item.group), [null, null], "two are left as they are");
  // A numbered label is not cut to "3 detail" under a "Step" heading.
  assert.deepEqual(groupControlLabels(["Step 3", "Step 3 detail", "Step time", "Step change"]).map(item => item.label),
    ["Step 3", "Step 3 detail", "Step time", "Step change"]);
});
