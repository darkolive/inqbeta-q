/*
 * The receipt location.
 *
 * The link in the email points here and carries nothing else. What this load
 * returns is the claim SEALED to the DID that made it — so a stranger who
 * follows the link, a mail provider that logged it, and a browser without the
 * passkey all get the same thing: ciphertext and a DID.
 *
 * The seal is made fresh on each visit rather than stored. It costs a few
 * milliseconds and means there is no pile of sealed claims anywhere waiting to
 * be read.
 */
import type { PageServerLoad } from './$types';
import { sealTo } from '@inqbeta/q-core/seal';
import { openClaim } from '$lib/server/claims';
import type { ClaimView } from '$lib/channels';

export const prerender = false;
export const ssr = true;

export const load: PageServerLoad = async ({ params }): Promise<ClaimView> => {
	let claim;
	try {
		claim = await openClaim(params.token);
	} catch {
		return { gone: true, says: 'Channels are not set up on this server.' };
	}
	if (!claim) {
		return { gone: true, says: 'This receipt has expired, or was never one of ours.' };
	}

	const { sealed } = await sealTo(
		{ kind: claim.kind, address: claim.address, witness: claim.witness },
		[claim.did],
		'a channel claim'
	);

	return { gone: false, token: params.token, did: claim.did, sealed };
};
