import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const children = [
  spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js')], { stdio: 'inherit' }),
  spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), 'watch', 'server/index.ts'], { stdio: 'inherit' }),
];
let closing = false;

function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}

for (const child of children) {
  child.on('exit', (code) => close(code ?? 1));
  child.on('error', () => close(1));
}
process.on('SIGINT', () => close(0));
process.on('SIGTERM', () => close(0));
