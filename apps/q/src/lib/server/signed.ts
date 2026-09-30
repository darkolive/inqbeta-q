/*
 * Checking that a request really came from the identity it names.
 *
 * A DID is public — anyone can type someone else's. Without this, Q would send
 * a claim to any address anybody named, which is a spam relay with a receipt
 * system bolted on. Every request that causes a message to leave, or that
 * confirms one, carries an Ed25519 signature made by the passkey behind the
 * DID it claims.
 */
import { canonical, unb64url } from '@inqbeta/q-core/canonical';
import { publicKeyFrom } from '@inqbeta/q-core/did';

export async function signedBy(did: string, doc: unknown, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify(
			{ name: 'Ed25519' },
			key,
			unb64url(signature),
			new TextEncoder().encode(canonical(doc))
		);
	} catch {
		return false;
	}
}
