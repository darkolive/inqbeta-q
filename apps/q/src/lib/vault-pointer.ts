/*
 * Noting where the vault is, on the passkey (q-core/pointer.ts, ADR-Q-012).
 *
 * Called at the three moments a person is already doing something on purpose
 * with their vault — syncing, backing up, signing out — so the touch it asks
 * for belongs to an action they chose. It is learnt as part of that action:
 * "sync, touch"; "sign out, touch". Offline, like the passkey itself.
 */
import { notePointer, type PointerNoted } from '@inqbeta/q-core/passkey';
import { deviceLabel, type VaultPointer } from '@inqbeta/q-core/pointer';
import { vaultHead } from '@inqbeta/q-core/folder';
import { watchCloud, type CloudState } from '$lib/autosync';

let cloud: CloudState[] = [];
watchCloud((c) => (cloud = c));

/**
 * Note the vault as it is now. `also`: places a copy has just gone that the
 * cloud state does not know about (e.g. "Downloads").
 */
export async function noteWhere(also: string[] = []): Promise<PointerNoted> {
	const here = await vaultHead().catch(() => null);
	if (!here) return { ok: false, says: 'There is no vault open to note.' };
	const carried = cloud.filter((c) => c.holdsAll).map((c) => c.called);
	const p: VaultPointer = {
		v: 1,
		at: new Date().toISOString(),
		head: here.head,
		files: here.files,
		from: deviceLabel(navigator.userAgent),
		copies: [...new Set([...carried, ...also])]
	};
	return notePointer(p);
}
