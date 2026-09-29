import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.app.json']);
run(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.server.json']);
run(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build']);
