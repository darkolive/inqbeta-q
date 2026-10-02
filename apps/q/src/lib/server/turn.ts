/*
 * Credentials for the host's own call relay (coturn), the "TURN REST API" way:
 * the relay and Q share one secret, and Q mints a username and password per
 * call that the relay can check by itself, with no list of users anywhere.
 *
 *   username   = "<expires, unix seconds>:<label>"
 *   credential = base64( HMAC-SHA1( secret, username ) )
 *
 * coturn: use-auth-secret + static-auth-secret (node/coturn/turnserver.conf).
 * The label is a hash of the caller's DID, so the relay's logs never hold a DID.
 */
const enc = new TextEncoder();

function b64(bytes: ArrayBuffer): string {
	let s = '';
	for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
	return btoa(s);
}

export async function relayCredentials(
	secret: string,
	did: string,
	o: { ttlSeconds?: number; now?: number } = {}
): Promise<{ username: string; credential: string; expires: number }> {
	const expires = Math.floor((o.now ?? Date.now()) / 1000) + (o.ttlSeconds ?? 4 * 60 * 60);
	const label = b64(await crypto.subtle.digest('SHA-256', enc.encode(did))).replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
	const username = `${expires}:${label}`;
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
	const credential = b64(await crypto.subtle.sign('HMAC', key, enc.encode(username)));
	return { username, credential, expires };
}

/** The relay's addresses, from Q_TURN_URLS: "turn:relay.example.org:3478?transport=udp, turn:…?transport=tcp". */
export function relayUrls(setting: string | undefined): string[] {
	return (setting ?? '')
		.split(',')
		.map((u) => u.trim())
		.filter((u) => /^turns?:[^\s]+$/.test(u));
}
