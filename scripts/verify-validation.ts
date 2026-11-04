import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
await mkdir(resolve('.local'), { recursive: true });
const dir = await mkdtemp(resolve('.local/validation-probe-'));
try {
  const probe = join(dir, 'probe.test.ts'),
    config = join(dir, 'vitest.config.mjs');
  await writeFile(
    probe,
    "import {it,expect} from 'vitest'; it('intentional fixture failure signal',()=>expect('fixture_should_fail').toBe('expected_failure_signal'));\n",
  );
  await writeFile(
    config,
    `export default { test: { include: [${JSON.stringify(probe)}] } };\n`,
  );
  let detected = false;
  try {
    execFileSync(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'run', '--config', config],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const result = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    detected =
      result.status === 1 &&
      String(result.stdout) + String(result.stderr) !== '' &&
      String(result.stdout).includes('1 failed') &&
      String(result.stderr).includes('expected_failure_signal');
  }
  if (!detected)
    throw new Error(
      'Validation did not detect the deliberate assertion failure',
    );
  console.log(
    'Validation guard passed: the deliberate fixture assertion failed as expected.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
