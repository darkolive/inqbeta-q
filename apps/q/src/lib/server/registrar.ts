/*
 * Incubator's registrar key (ADR-Q-021 addendum, 6 October 2026): what
 * countersigns a federation registering with Incubator. Its own key, not the
 * service key, which can open sign-in channels: a registry shouldn't carry
 * that weight. 32 bytes, base64url, in Q_REGISTRAR_SEED, made on localhost
 * (Services → Registry). Its DID goes on the node as GATE_REGISTRAR, so only
 * it adds to the registry.
 */
import { env } from '$env/dynamic/private';
import { identityFromSeed, type Identity } from '@inqbeta/q-core/passkey';
import { unb64url } from '@inqbeta/q-core/canonical';

let building: Promise<Identity> | null = null;
export function registrarIdentity(): Promise<Identity> {
	building ??= (async () => {
		const seed = env.Q_REGISTRAR_SEED?.trim();
		if (!seed) throw new Error('This host isn’t a registry: Q_REGISTRAR_SEED isn’t set.');
		const raw = unb64url(seed);
		if (raw.length !== 32) throw new Error('Q_REGISTRAR_SEED should be 32 bytes.');
		return identityFromSeed(raw);
	})();
	return building.catch((e) => {
		building = null;
		throw e;
	});
}
