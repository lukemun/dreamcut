import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("./PanelShortcutSettings.tsx", import.meta.url), "utf8");
const palette = readFileSync(new URL("../../../app/editor-glass.css", import.meta.url), "utf8");

function luminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red! * 0.2126 + green! * 0.7152 + blue! * 0.0722;
}

function contrast(foreground: string, background: string) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

test("shortcut recorder uses semantic surfaces and readable text in both appearances", () => {
  assert.doesNotMatch(component, /NativeSelect|<select|<option/);
  // Rows sit directly on the Settings section's --chrome-panel surface (no box of their own, 2026-10-12 QA);
  // the contrast checks below still cover ink on that surface.
  for (const token of ["--chrome-raised", "--ink", "--ink-muted", "--chrome-line-strong"]) {
    assert.ok(component.includes(`var(${token})`), `${token} must style the shortcut controls`);
  }
  for (const theme of ["light", "dark"]) {
    const block = palette.match(new RegExp(`html\\[data-editor-theme="${theme}"\\] \\{([\\s\\S]*?)\\n\\}`))?.[1];
    assert.ok(block, `${theme} appearance palette exists`);
    const value = (token: string) => block.match(new RegExp(`--${token}: (#[0-9a-f]{6})`))?.[1];
    for (const surface of ["chrome-panel", "chrome-raised"]) {
      for (const ink of ["ink", "ink-muted"]) {
        assert.ok(contrast(value(ink)!, value(surface)!) >= 4.5, `${theme} ${ink} on ${surface} needs readable contrast`);
      }
    }
  }
});
