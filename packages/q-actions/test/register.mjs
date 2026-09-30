/* Lets Node run the TypeScript sources directly: extensionless relative
 * imports ('./actions') resolve to './actions.ts', as they do under Vite. */
import { register } from 'node:module';
register('./resolve.mjs', import.meta.url);
