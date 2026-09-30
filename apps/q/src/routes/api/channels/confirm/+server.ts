/*
 * Confirm a claim by showing you opened its receipt.
 *
 * The witness is 32 random bytes that exist only inside a seal addressed to
 * one DID. Handing them back, signed by that DID, says two things at once: the
 * mailbox received the location, and the passkey opened what was there. A code
 * typed off a screen only ever said the first.
 *
 * What comes back is an attestation — this identity, this address, at this
 * time, signed by Q's sender. Not a session. The channel receipt itself is
 * built and signed in the browser, because binding an address to an identity
 * is the person's statement, not ours.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { b64url, canonical } from '@inqbeta/q-core/canonical';
import { addressHash, proofDoc, type ChannelProof } from '@inqbeta/q-core/channels';
import { openClaim, sameWitness } from '$lib/server/claims';
import { serviceIdentity } from '$lib/server/service-key';
import { signedBy } from '$lib/server/signed';

export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	let body: { token?: string; witness?: string; signature?: string };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, error: 'Nothing to confirm.' }, { status: 400 });
	}
	if (!body.token || !body.witness || !body.signature) {
		return json({ ok: false, error: 'That confirmation is not complete.' }, { status: 400 });
	}

	let claim;
	try {
		claim = await openClaim(body.token);
	} catch {
		return json({ ok: false, error: 'Channels are not set up on this server.' }, { status: 503 });
	}
	if (!claim) {
		/* Expired, bent, or not ours. One answer for all three. */
		return json({ ok: false, error: 'That receipt has expired. Ask for another.' }, { status: 400 });
	}

	if (!sameWitness(body.witness, claim.witness)) {
		return json({ ok: false, error: 'That receipt was not opened.' }, { status: 403 });
	}

	/* The witness proves the seal was opened; the signature proves by whom. */
	if (!(await signedBy(claim.did, { act: 'channel.confirm', did: claim.did, witness: claim.witness }, body.signature))) {
		return json({ ok: false, error: 'That confirmation was not signed by that identity.' }, { status: 403 });
	}

	const service = await serviceIdentity();
	const verifiedAt = new Date().toISOString();
	const hash = await addressHash(claim.kind, claim.address);
	const signature = b64url(
		await crypto.subtle.sign(
			{ name: 'Ed25519' },
			service.signing.privateKey,
			new TextEncoder().encode(canonical(proofDoc(claim.did, claim.kind, hash, verifiedAt)))
		)
	);

	const proof: ChannelProof = { by: service.did, did: claim.did, addressHash: hash, verifiedAt, signature };
	return json({ ok: true, kind: claim.kind, address: claim.address, proof });
};
