import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const DIST = path.resolve(__dirname, '../../dist/chrome-mv3');

export default async function globalSetup() {
  if (!fs.existsSync(DIST)) {
    console.log('\n[setup] Building extension…');
    execSync('npm run build', { stdio: 'inherit', cwd: path.resolve(__dirname, '../..') });
    console.log('[setup] Build complete.\n');
  } else {
    console.log('[setup] Using existing dist/ build.');
  }
}
