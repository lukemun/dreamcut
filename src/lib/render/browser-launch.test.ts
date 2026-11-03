import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBrowserOptions } from './browser-launch.mjs';

test('dedicated browser overrides the channel without changing default installations', () => {
  assert.deepEqual(renderBrowserOptions({}), { channel: 'chrome' });
  assert.deepEqual(renderBrowserOptions({ DREAMCUT_RENDER_BROWSER_EXECUTABLE: '  /runtime/Chrome for Testing  ' }), { executablePath: '/runtime/Chrome for Testing' });
  assert.throws(() => renderBrowserOptions({ DREAMCUT_RENDER_BROWSER_EXECUTABLE: 'chrome' }), /absolute/);
});
