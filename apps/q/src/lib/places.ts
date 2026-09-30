/*
 * Places, in and out of the folder.
 *
 * A place is written like every other receipt: answers to `q/a-place`, signed
 * by the passkey, locked, in the folder. Adding a place, proving it, or seeing
 * it again writes a NEW answering — a drive proved in March and unreachable in
 * September is two facts, not a correction.
 *
 * WHAT THIS REPLACES. /network has been showing invented numbers since it was
 * written. It cannot show true ones until places exist as records rather than
 * as a type, and this is that.
 */
import {
	PLACE_Q,
	confirmation,
	newestPlaces,
	readPlace,
	type PlaceKind,
	type PlaceRecord,
	type Told
} from '@inqbeta/q-core/places';
import { buildAnswerSet } from '@inqbeta/q-core/questions';
import { seal } from '@inqbeta/q-core/seal';
import { folderState, proveFolder, readItem, saveLocked, vaultSyncs, type FolderItem } from '@inqbeta/q-core/folder';
import type { Identity } from '@inqbeta/q-core/passkey';
import { A_PLACE } from '$lib/questions/a-place';

export async function savePlace(
	identity: Identity,
	place: { called: string; kind: PlaceKind; proved?: boolean; seen?: string | null }
): Promise<{ ok: true; place: PlaceRecord; storedAs: string } | { ok: false; says: string }> {
	const answered = await buildAnswerSet({
		did: identity.did,
		set: A_PLACE,
		values: {
			[PLACE_Q.kind]: place.kind,
			[PLACE_Q.called]: place.called,
			[PLACE_Q.proved]: place.proved ?? false,
			...(place.seen ? { [PLACE_Q.seen]: place.seen } : {})
		}
	});
	if (!answered.ok) return { ok: false, says: answered.says.join(' ') };

	const record = await readPlace(answered.answers);
	if (!record) return { ok: false, says: 'A place needs a kind and a name you would recognise.' };

	try {
		const sealed = await seal({ ...answered.answers, namespace: 'places' });
		const storedAs = await saveLocked(
			'places',
			`place-${record.id.replace(/[^a-z0-9]+/gi, '-')}-${record.at.replace(/[:.]/g, '-')}.json`,
			JSON.stringify(sealed, null, 2),
			'application/json'
		);
		return { ok: true, place: record, storedAs };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : 'The place could not be saved.' };
	}
}

/** Read a place back out of a folder item, or null if it is not one. */
export async function placeFrom(item: FolderItem): Promise<PlaceRecord | null> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		return readPlace(json?.content ?? json);
	} catch {
		return null;
	}
}

/** Every place currently known, newest answering about each. */
export function placesFrom(all: PlaceRecord[]): PlaceRecord[] {
	return newestPlaces(all);
}

/**
 * Write something small there, read it back, and record what happened.
 *
 * This is the whole difference between a place a person has NAMED and a place
 * Q has CONFIRMED. It writes a new answering either way — a folder that worked
 * in March and refuses in September is two facts, and the March one is still
 * evidence of what was true then.
 *
 * Only the folder Q currently has open can be proved. A bucket needs its own
 * round trip over the wire and a drive needs plugging in; both report
 * `untried` until there is something to run, which is the honest state rather
 * than an optimistic one.
 */
export async function provePlace(
	identity: Identity,
	place: PlaceRecord
): Promise<{ ok: true; place: PlaceRecord; told: Told; leftBehind?: string } | { ok: false; says: string }> {
	if (place.kind !== 'folder' && place.kind !== 'synced') {
		return {
			ok: true,
			place,
			told: confirmation(place.kind, { tried: false }, place.called)
		};
	}

	const { proof, leftBehind } = await proveFolder();
	const told = confirmation(place.kind, proof, place.called);

	const written = await savePlace(identity, {
		called: place.called,
		kind: place.kind,
		proved: told.state === 'confirmed',
		seen: new Date().toISOString()
	});
	if (!written.ok) return written;

	return { ok: true, place: written.place, told, ...(leftBehind ? { leftBehind } : {}) };
}

/**
 * The folder Q already has open, as a place — proposed rather than typed.
 *
 * A person should not have to describe something Q is already holding. The
 * kind is worked out from what is known and not guessed at:
 *
 *   inBrowser   → 'cache'. Not a place, and the one kind that says so.
 *   vaultSyncs  → 'synced'. Asked once when the folder was chosen, believed,
 *                 because a browser is handed a folder's NAME and nothing else
 *                 — no path, no volume, no clue whether anything is watching it.
 *   otherwise   → 'folder'.
 *
 * Returns null when there is nothing open to offer, which is not a fault.
 */
export function openFolderAsPlace(): { called: string; kind: PlaceKind } | null {
	const state = folderState();
	if (state.kind !== 'ready') return null;
	return {
		called: state.name,
		kind: state.inBrowser ? 'cache' : vaultSyncs() ? 'synced' : 'folder'
	};
}

/**
 * Add a place and, where Q can, prove it in the same act.
 *
 * Naming somewhere and finding out whether it works are one thought, so they
 * are one button. A place that refuses is still recorded — what was tried and
 * what happened is the useful part, and a place that only appears once it
 * works would hide exactly the ones worth knowing about.
 */
export async function addPlace(
	identity: Identity,
	place: { called: string; kind: PlaceKind }
): Promise<{ ok: true; place: PlaceRecord; told: Told; leftBehind?: string } | { ok: false; says: string }> {
	const named = await savePlace(identity, place);
	if (!named.ok) return named;
	return provePlace(identity, named.place);
}
