import { spawn } from 'node:child_process';

function runOnce(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${signal || code}`));
    });
  });
}

await runOnce('src/migrate.mjs');
if (process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) await runOnce('src/bootstrap-owner.mjs');

const children = [
  spawn(process.execPath, ['src/server.mjs'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['src/worker.mjs'], { stdio: 'inherit', env: process.env })
];

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

const result = await Promise.race(children.map((child, index) => new Promise((resolve) => {
  child.once('error', (error) => resolve({ index, code: 1, error }));
  child.once('exit', (code, signal) => resolve({ index, code: code ?? 1, signal }));
})));

console.error(JSON.stringify({ level: 'error', event: 'production_child_exited', ...result }));
stop('SIGTERM');
await Promise.allSettled(children.filter((child) => child.exitCode === null).map((child) => new Promise((resolve) => child.once('exit', resolve))));
process.exit(result.code || 1);
