// PM2 entry script to run Next.js dev server with the correct working directory.
// This avoids Windows argument parsing issues when starting `npm run dev` via PM2.
const { spawn } = require('child_process');

// Use absolute npm path to avoid PATH issues when run as a Windows service/startup task.
const isWin = process.platform === 'win32';
const cmd = isWin ? 'cmd.exe' : 'npm';
const args = isWin ? ['/c', 'npm', 'run', 'dev'] : ['run', 'dev'];

const child = spawn(cmd, args, {
  cwd: __dirname,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));

