/*
 * Channels, from the browser's side.
 *
 * The passkey comes first (decided 2026-09-19), so there is always an identity
 * by the time any of this runs. An earlier version had to carry a proved
 * address across the gap between verifying it and signing in, because the
 * address was proved before the identity existed. Putting the passkey first
 * deleted that gap, and everything that held it open.
 *
 * What is left is two steps, both signed by you:
 *
 *   claim    say where you can be reached. Q leaves a receipt at a location
 *            and sends only the location. Nothing else travels.
 *   confirm  open the receipt with your passkey, hand back the witness inside
 *            it, and get Q's signed word for what it saw.
 *
 * Then the channel receipt is built here — sealed to you and to Q's sender —
 * and written into your folder. Binding an address to an identity is your
 * statement, so it is signed by you and never by the server.
 */
import {
	buildChannel,
	isVerifiedChannel,
	openChannelAddress,
	type ChannelKind,
	type ChannelProof,
	type ChannelUse,
	type VerifiedChannel
} from '@inqbeta/q-core/channels';
import { seal, type SealedToPeople } from '@inqbeta/q-core/seal';
import { saveLocked, readItem, type FolderItem } from '@inqbeta/q-core/folder';
import { signerFor, type Identity } from '@inqbeta/q-core/passkey';

/**
 * What the receipt page is handed.
 *
 * Declared here rather than inferred through SvelteKit's generated types,
 * because the page and the load that feeds it should agree on one written-down
 * shape — and because a page that cannot be typechecked without a build step
 * is a page nobody typechecks.
 */
export type ClaimView =
	| { gone: true; says: string }
	| { gone: false; token: string; did: string; sealed: SealedToPeople };

/* One ask per tab. A public key does not change between two clicks. */
let asked: Promise<string | null> | null = null;

/** Q's sending DID, or null on a server with no sending key. */
export function sendingDid(): Promise<string | null> {
	if (!asked) {
		asked = fetch('/api/channels/service')
			.then((r) => r.json())
			.then((d) => (typeof d?.did === 'string' ? d.did : null))
			.catch(() => null);
	}
	return asked;
}

export type Said = { ok: true } | { ok: false; says: string };

/**
 * Ask Q to leave a receipt at an address.
 *
 * Signed, because a DID is public: without this anyone could have Q send to
 * any address in anyone's name. `at` goes into what is signed so an old
 * signature cannot be replayed for ever.
 */
export async function claimChannel(identity: Identity, kind: ChannelKind, address: string): Promise<Said> {
	const at = new Date().toISOString();
	const signature = await signerFor(identity).signCanonical({
		act: 'channel.claim',
		did: identity.did,
		kind,
		address: address.trim().toLowerCase(),
		at
	});
	try {
		const res = await fetch('/api/channels/claim', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ did: identity.did, kind, address: address.trim().toLowerCase(), at, signature })
		});
		const out = await res.json();
		return out.ok ? { ok: true } : { ok: false, says: out.error ?? 'The receipt could not be sent.' };
	} catch {
		return { ok: false, says: 'Could not reach the server.' };
	}
}

/**
 * Having opened the receipt, tell Q what was inside it.
 *
 * The witness came out of a seal only this passkey could open, so signing it
 * says both halves at once: the address received the location, and this
 * identity opened what was there.
 */
export async function confirmClaim(
	identity: Identity,
	token: string,
	witness: string
): Promise<{ ok: true; kind: ChannelKind; address: string; proof: ChannelProof } | { ok: false; says: string }> {
	const signature = await signerFor(identity).signCanonical({
		act: 'channel.confirm',
		did: identity.did,
		witness
	});
	try {
		const res = await fetch('/api/channels/confirm', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, witness, signature })
		});
		const out = await res.json();
		return out.ok ? out : { ok: false, says: out.error ?? 'That could not be confirmed.' };
	} catch {
		return { ok: false, says: 'Could not reach the server.' };
	}
}

/**
 * Write a verified channel into the folder.
 *
 * `uses` is what was actually agreed. A channel made at sign-in is 'sign-in'
 * and nothing else — someone proving they can read their email has not asked
 * to be marketed at. Settings is where the rest get added, one press at a time.
 */
export async function saveChannel(
	identity: Identity,
	p: { kind: ChannelKind; address: string; proof: ChannelProof },
	uses: ChannelUse[] = ['sign-in']
): Promise<{ ok: true; channel: VerifiedChannel } | { ok: false; says: string }> {
	try {
		const channel = await buildChannel({
			did: identity.did,
			kind: p.kind,
			address: p.address,
			uses,
			serviceDid: (await sendingDid()) ?? undefined,
			proof: p.proof
		});
		const sealed = await seal({ ...channel, namespace: 'channel' });
		await saveLocked('channels', `channel-${channel.kind}-${channel.id}.json`, JSON.stringify(sealed, null, 2), 'application/json');
		return { ok: true, channel };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The channel could not be saved.' };
	}
}

/**
 * Change what a channel is for.
 *
 * Written as a NEW receipt rather than an edit. The old one keeps its own
 * signature and its own timestamp, so the record reads as a sequence of things
 * you agreed to, in order, rather than one mutable row that says whatever it
 * says today. Only the newest counts; the earlier ones remain the evidence for
 * what was true before.
 *
 * Needs your key, because the address has to come out of the old seal to go
 * into the new one. Q's sender cannot do this, by design: what a channel may be
 * used for is not the sender's to decide.
 */
export async function updateChannelUses(
	identity: Identity,
	channel: VerifiedChannel,
	uses: ChannelUse[]
): Promise<{ ok: true; channel: VerifiedChannel } | { ok: false; says: string }> {
	const address = await openChannelAddress(channel, identity);
	if (!address) return { ok: false, says: 'That channel was not sealed to your passkey.' };
	if (!channel.proof) return { ok: false, says: 'That channel has no proof to carry over.' };
	return saveChannel(identity, { kind: channel.kind, address, proof: channel.proof }, uses);
}

/** Read a channel back out of a folder item, or null if that is not what it is. */
export async function channelFrom(item: FolderItem): Promise<VerifiedChannel | null> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		const content = json?.content ?? json;
		return isVerifiedChannel(content) ? content : null;
	} catch {
		return null;
	}
}
