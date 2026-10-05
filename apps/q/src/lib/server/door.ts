/*
 * The door, at the mint (ADR-Q-034 step 3). The mint runs here on Vercel, not
 * on the node, so it reads the same list the gate keeps (GET /door on the
 * host's storage) and asks q-core's isLetIn. One list, one switch.
 *
 * - The door only applies to this host: if the gate's door names another
 *   host (the development site shares the node today), it isn't ours.
 * - A live host lets everyone in.
 * - If the gate can't be asked, only the founder (known from the host's own
 *   invitation) is let in: a door that can't be checked stays shut.
 */
import { isLetIn, OPENING_SOON } from '@inqbeta/q-core/door';
import { LINK_SCHEMA, type Link } from '@inqbeta/q-core/links';
import type { Host } from './mint';

interface DoorFile {
	on: boolean;
	open: boolean;
	root: string | null;
	host: string | null;
	items: unknown[];
}
let cache: { gate: string; at: number; door: DoorFile | null } | null = null;

async function readDoor(gate: string): Promise<DoorFile | null> {
	if (cache && cache.gate === gate && Date.now() - cache.at < 30_000) return cache.door;
	const r = await fetch(`${gate}/door`, { signal: AbortSignal.timeout(8_000) }).catch(() => null);
	const door = r?.ok ? ((await r.json().catch(() => null)) as DoorFile | null) : r?.status === 404 ? { on: false, open: true, root: null, host: null, items: [] } : null;
	cache = { gate, at: Date.now(), door };
	return door;
}

/** Null if `did` may act on this host now; otherwise the one sentence to say. */
export async function doorSays(did: string | undefined, host: Host, mode: 'test' | 'live'): Promise<string | null> {
	if (mode === 'live' || !host.storage) return null;
	if (!did) return OPENING_SOON;
	const door = await readDoor(host.storage);
	if (!door) return did === host.founder ? null : OPENING_SOON;
	if (!door.on || door.open || !door.root || door.host !== host.federation) return null;
	const items = Array.isArray(door.items) ? door.items : [];
	const links = items.filter((x): x is Link => (x as Link)?.schema === LINK_SCHEMA);
	const passes = items.filter((x) => (x as Link)?.schema !== LINK_SCHEMA);
	const r = await isLetIn(did, { root: door.root, host: door.host, mode: 'test', links, passes });
	return r.in ? null : r.says;
}
