/*
 * Q's sending key.
 *
 * A channel receipt seals its address to two keys: yours, and this one. Yours
 * so the address is always recoverable wherever your passkey reaches; this one
 * so a sign-in code can be sent to a person who has not signed in yet — which
 * is every returning person, every time, by definition.
 *
 * So this key CAN read an address that was sealed for it. Said plainly rather
 * than hidden: that is the cost of sending to someone who is not here. What it
 * buys is that an address is never a parameter. The send API is handed a
 * channel, resolves it or refuses, and no caller can point a send at an address
 * of their choosing.
 *
 * The seed is 32 bytes, base64url, in Q_SERVICE_SEED. It is a server secret of
 * the same weight as the mail key: anything holding it can open every channel
 * ever sealed to this service. $env/dynamic/private cannot be imported into a
 * component, so putting this anywhere near the browser is a build error rather
 * than a leak.
 *
 * Rotating it is not free. Channels already sealed to the old DID cannot be
 * opened by the new one — their owners can still open their own, and would have
 * to re-verify to restore sending. Rotate on compromise, not on a whim.
 */
import { env } from '$env/dynamic/private';
import { identityFromSeed, type Identity } from '@inqbeta/q-core/passkey';
import { unb64url } from '@inqbeta/q-core/canonical';

let building: Promise<Identity> | null = null;

export class NoServiceKey extends Error {
	constructor() {
		super('Q_SERVICE_SEED is not set, so Q has no sending key.');
	}
}

/** The service identity, built once per instance and kept. */
export function serviceIdentity(): Promise<Identity> {
	if (!building) building = build();
	return building;
}

async function build(): Promise<Identity> {
	const seed = env.Q_SERVICE_SEED?.trim();
	if (!seed) throw new NoServiceKey();
	let raw: Uint8Array;
	try {
		raw = unb64url(seed);
	} catch {
		throw new Error('Q_SERVICE_SEED is not base64url.');
	}
	if (raw.length !== 32) throw new Error(`Q_SERVICE_SEED should be 32 bytes, not ${raw.length}.`);
	return identityFromSeed(raw);
}

/** The DID a browser seals a channel to. Public: it is half of a key pair. */
export async function serviceDid(): Promise<string> {
	return (await serviceIdentity()).did;
}
