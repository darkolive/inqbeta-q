// Stops `pnpm dev` (and friends) with a plain message when the workspace has not
// been installed. Without this, pnpm falls back to any globally installed
// Turborepo — often 1.x, which reports "unknown key `tasks`" and hides the real cause.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
if (!existsSync(new URL('../node_modules/.bin/turbo', import.meta.url))) {
	console.error(`
  Not installed yet. From ${root} run:

    pnpm install

  then try again.
`);
	process.exit(1);
}
