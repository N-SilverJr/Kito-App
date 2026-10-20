import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const children = [];

function run(name, args) {
  const child = spawn(npm, args, { stdio: 'inherit', shell: isWindows, env: process.env });
  children.push(child);
  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[dev] ${name} exited with code ${code}`);
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev] starting API on :8787 and web on :5173');
run('server', ['run', 'dev', '-w', '@nutripals/server']);
run('web', ['run', 'dev', '-w', '@nutripals/web']);
