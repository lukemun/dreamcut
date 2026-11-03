import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { testPythonEnv } from './test-python.mjs';

try {
  const env = testPythonEnv();
  const files = process.argv.slice(2);
  const result = files.length
    ? spawnSync(process.execPath, ['--import', 'tsx', '--test-concurrency=4', '--test', ...files], { env, stdio: 'inherit' })
    : spawnSync(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).scripts['test:node'], { env, shell: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
