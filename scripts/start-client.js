const path = require('path');
const { execFileSync } = require('child_process');

const clientDir = path.join(__dirname, '..', 'client');
const viteBin = path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');

execFileSync(process.execPath, [viteBin], {
  stdio: 'inherit',
  cwd: clientDir,
});
