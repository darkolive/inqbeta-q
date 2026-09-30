import { sha256 } from '@inqbeta/q-core/canonical';

/** A short code for a public key, for people to compare by eye (same as DoStudy's). */
export async function fingerprint(publicKey: string): Promise<string> {
	const full = await sha256(publicKey);
	return (full.slice(0, 16).match(/.{1,4}/g) ?? []).join('-').toUpperCase();
}
