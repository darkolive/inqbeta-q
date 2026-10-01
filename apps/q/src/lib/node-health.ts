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
