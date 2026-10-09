// npm run pack → dist/gsc-full-render-<version>.zip for the Chrome Web Store: what npm run build
// put in dist/extension/, and nothing else.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export function pack(dir, zip) {
  rmSync(zip, { force: true });
  execFileSync('zip', ['-X', '-q', '-r', zip, '.'], { cwd: dir });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = `${root}dist/extension`;
  const { version } = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  const name = `gsc-full-render-${version}.zip`;
  pack(dir, `${root}dist/${name}`);
  console.log(`dist/${name}`);
}
