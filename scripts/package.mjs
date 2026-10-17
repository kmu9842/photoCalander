import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// 7-Zip's default ultra setting can exhaust its Windows 32-bit address space.
const child = spawn(process.execPath, [require.resolve('electron-builder/out/cli/cli.js'), '--win', 'portable', '--x64'], {
  stdio: 'inherit', env: { ...process.env, ELECTRON_BUILDER_COMPRESSION_LEVEL: '3' },
});
child.on('exit', code => process.exit(code ?? 1));
