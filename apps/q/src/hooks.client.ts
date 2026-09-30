/*
 * Runs once in the browser before anything else.
 *
 * The passkey's home domain (passkey.ts, decided 26 September 2026): the root
 * every Q address sits under. Unset — localhost, a *.vercel.app test site —
 * passkeys belong to that exact address and are test identities.
 */
import { env } from '$env/dynamic/public';
import { setPasskeyDomain } from '@inqbeta/q-core/passkey';

setPasskeyDomain(env.PUBLIC_Q_PASSKEY_DOMAIN);
