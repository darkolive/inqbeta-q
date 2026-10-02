/*
 * Can this device reach a federation's node? Asked from the browser, each
 * time, never stored (ADR-Q-010 §10; node/HETZNER.md).
 *
 * The node's services are only on the federation's Nebula mesh, so the answer
 * is about THIS device as much as the node: "not reachable" most often means
 * this device isn't on the mesh. The words say so.
 *
 * A page served over https cannot open plain http:// or ws:// to the mesh
 * (mixed content), so from an https page the checks don't run and say why.
 * Q in development (http://localhost:3100) can run them.
 */

export type Reach =
	| { is: 'reached'; says: string }
	| { is: 'unreached'; says: string }
	| { is: 'cannot-ask'; says: string };

const WAIT_MS = 4000;

function fromSecurePage(): boolean {
	return typeof location !== 'undefined' && location.protocol === 'https:';
}
const SECURE_PAGE: Reach = {
	is: 'cannot-ask',
	says: 'Can’t check from a secure (https) page — the mesh speaks plain http inside its own encryption. Open Q locally to check.'
};

/** Dgraph's /health. Reads "healthy" and the version when it can; otherwise "it answered". */
export async function reachIndex(mesh: string, port: number): Promise<Reach> {
	if (fromSecurePage()) return SECURE_PAGE;
	const url = `http://${mesh}:${port}/health`;
	try {
		const r = await fetch(url, { signal: AbortSignal.timeout(WAIT_MS) });
		const body = (await r.json().catch(() => null)) as { status?: string; version?: string }[] | null;
		const h = Array.isArray(body) ? body[0] : null;
		return h?.status === 'healthy'
			? { is: 'reached', says: `Healthy${h.version ? `, Dgraph ${h.version}` : ''}.` }
			: { is: 'reached', says: `It answered, but didn’t say healthy (HTTP ${r.status}).` };
	} catch (e) {
		if ((e as Error)?.name === 'TimeoutError') return unreached();
		/* A refusal to share (CORS) still means it answered. Ask without reading. */
		try {
			await fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(WAIT_MS) });
			return { is: 'reached', says: 'It answered (its reply can’t be read from this page).' };
		} catch {
			return unreached();
		}
	}
}

/** The storage's filer answers at its root. Asked without reading, so CORS can't hide it. */
export async function reachStorage(mesh: string, port: number): Promise<Reach> {
	if (fromSecurePage()) return SECURE_PAGE;
	try {
		await fetch(`http://${mesh}:${port}/`, { mode: 'no-cors', signal: AbortSignal.timeout(WAIT_MS) });
		return { is: 'reached', says: 'Open — it would hold what’s sent to you until you collect it.' };
	} catch {
		return unreached();
	}
}

/** Open a WebSocket to Mosquitto and close it. Signing in isn't needed to know it's there. */
export function reachPostOffice(mesh: string, port: number): Promise<Reach> {
	if (fromSecurePage()) return Promise.resolve(SECURE_PAGE);
	return new Promise((done) => {
		let ws: WebSocket;
		try {
			ws = new WebSocket(`ws://${mesh}:${port}`, 'mqtt');
		} catch {
			return done(unreached());
		}
		const timer = setTimeout(() => {
			ws.close();
			done(unreached());
		}, WAIT_MS);
		ws.onopen = () => {
			clearTimeout(timer);
			ws.close();
			done({ is: 'reached', says: 'Open — it would tell you when something is waiting for you.' });
		};
		ws.onerror = () => {
			clearTimeout(timer);
			done(unreached());
		};
	});
}

function unreached(): Reach {
	return { is: 'unreached', says: 'No answer from this device. Is this device on the federation’s mesh (Nebula running)?' };
}

/*
 * The switchboard (coturn) is on the node's PUBLIC address, and speaks TURN,
 * not http, so it's checked the way a call uses it: ask Q for the call
 * credentials (the same ones a real call gets), then ask the browser to gather
 * a "relay" candidate through it alone. One appearing means a call could be
 * connected through it, from here, now. Works from https pages too.
 */
export async function reachSwitchboard(
	servers: RTCIceServer[],
	host: string,
	port: number
): Promise<Reach> {
	if (typeof RTCPeerConnection === 'undefined') return { is: 'cannot-ask', says: 'This browser can’t make calls, so it can’t check.' };
	const mine = servers.filter((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.includes(`${host}:${port}`)));
	if (!mine.length) return { is: 'cannot-ask', says: 'Q isn’t set to use this switchboard yet: add Q_TURN_URLS and Q_TURN_SECRET in your host’s Services, and send them to the live site.' };
	const pc = new RTCPeerConnection({ iceServers: mine, iceTransportPolicy: 'relay' });
	try {
		pc.createDataChannel('check');
		const found = new Promise<boolean>((done) => {
			const timer = setTimeout(() => done(false), 6000);
			pc.onicecandidate = (e) => {
				const c = e.candidate;
				if (c && (c.type === 'relay' || / typ relay /.test(c.candidate))) {
					clearTimeout(timer);
					done(true);
				}
				if (!c) {
					clearTimeout(timer);
					done(false);
				}
			};
		});
		await pc.setLocalDescription(await pc.createOffer());
		return (await found)
			? { is: 'reached', says: 'Open: it can connect a call between devices that can’t reach each other.' }
			: { is: 'unreached', says: 'No answer. Check the node’s firewall lets in UDP 3478 and 49160–49999, and that the switchboard is running.' };
	} catch {
		return { is: 'unreached', says: 'It couldn’t be asked from this browser.' };
	} finally {
		pc.close();
	}
}

/** Whether this page is served securely, so the mesh can't be reached from it. */
export const onSecurePage = fromSecurePage;

/*
 * From a secure page, through the node's public front door (2 October 2026).
 * The gate sits beside the bellboy, directory and storage on the node and
 * answers GET /health: up or not, and Dgraph's version, never anything they
 * hold. So the live site can show the same picture localhost does.
 */
export async function reachThroughFrontDoor(gate: string): Promise<{ postOffice: Reach; index: Reach; storage: Reach }> {
	const via = 'Checked through the node’s front door.';
	try {
		const r = await fetch(`${gate.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(WAIT_MS + 2000), cache: 'no-store' });
		if (!r.ok) throw new Error(String(r.status));
		const h = (await r.json()) as { bellboy?: { up?: boolean }; directory?: { up?: boolean; version?: string }; storage?: { up?: boolean } };
		const down: Reach = { is: 'unreached', says: `The node says it isn’t answering. ${via}` };
		return {
			postOffice: h.bellboy?.up ? { is: 'reached', says: `Open — it would tell you when something is waiting for you. ${via}` } : down,
			index: h.directory?.up ? { is: 'reached', says: `Healthy${h.directory.version ? `, Dgraph ${h.directory.version}` : ''}. ${via}` } : down,
			storage: h.storage?.up ? { is: 'reached', says: `Open — it would hold what’s sent to you until you collect it. ${via}` } : down
		};
	} catch {
		const none: Reach = { is: 'unreached', says: 'The node’s front door didn’t answer, so nothing behind it could be checked.' };
		return { postOffice: none, index: none, storage: none };
	}
}
