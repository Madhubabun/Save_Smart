// Runs the backend API and the Vite dev server side by side.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', '@savesmart/backend'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev', '-w', '@savesmart/frontend'], { stdio: 'inherit' }),
];

const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { if (code) { stop(); process.exit(code); } }));
