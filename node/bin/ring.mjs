#!/usr/bin/env node
/*
 * Ring darren's bell, as friend (ADR-Q-014): seal a receipt, put it in the
 * storage unit, then send the bellboy a sealed notice saying who and what.
 *
 *   node node/bin/ring.mjs <friend password> ["Title"] ["What it says"]
 *
 * Reads the test key from apps/q/.env.local (node/bin/bell-setup.sh writes
 * it), so Q can open what this seals. Needs Nebula up and mosquitto_pub.
 * Sealing is the dev stand-in, AES-GCM — the same one lib/bellboy.ts opens.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [pw, title = 'Meet at the green', says = 'Meet at the green at six'] = process.argv.slice(2);
if (!pw) {
	console.error('usage: node node/bin/ring.mjs <friend password> ["Title"] ["What it says"]');
	process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const conf = Object.fromEntries(
	readFileSync(join(root, 'apps/q/.env.local'), 'utf8')
		.split('\n')
		.filter((l) => /^PUBLIC_BELLBOY_\w+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const KEY = conf.PUBLIC_BELLBOY_KEY, TO = conf.PUBLIC_BELLBOY_INBOX ?? 'darren';
if (!/^[0-9a-f]{64}$/.test(KEY ?? '')) {
	console.error('No test key in apps/q/.env.local — run node/bin/bell-setup.sh first.');
	process.exit(1);
}
const MESH = '10.42.0.1', STORE = `http://${MESH}:8888`;

const key = await crypto.subtle.importKey('raw', Buffer.from(KEY, 'hex'), 'AES-GCM', false, ['encrypt']);
async function seal(bytes) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
	return Buffer.concat([iv, ct]);
}
const sha256 = async (b) => Buffer.from(await crypto.subtle.digest('SHA-256', b)).toString('hex');

// 1. The receipt, sealed, into the storage unit.
const receipt = { schema: 'inqbeta.receipt/test', says, from: 'friend', at: new Date().toISOString(), nonce: crypto.randomUUID() };
const sealed = await seal(Buffer.from(JSON.stringify(receipt)));
const hash = await sha256(sealed);
const url = `${STORE}/holding/${hash}`;
const form = new FormData();
form.append('file', new Blob([sealed]), hash);
const put = await fetch(url, { method: 'POST', body: form }).catch((e) => ({ ok: false, status: e.message }));
if (!put.ok) {
	console.error(`Couldn't put it in the storage unit (${put.status}). Is Nebula running?`);
	process.exit(1);
}
console.log(`1. Sealed receipt in the storage unit: holding/${hash.slice(0, 12)}…`);

// 2. The notice, sealed, to the bellboy.
const notice = { schema: 'inqbeta.notice/1', receipt: hash, from: 'friend', title, kind: 'message', collect: [url] };
const noticeSealed = (await seal(Buffer.from(JSON.stringify(notice)))).toString('base64');
const pub = spawnSync('mosquitto_pub', ['-h', MESH, '-u', 'friend', '-P', pw, '-q', '1', '-t', `q/in/${TO}`, '-m', noticeSealed], { encoding: 'utf8' });
if (pub.status !== 0) {
	console.error(`The bellboy didn't take it: ${pub.stderr.trim() || pub.status}`);
	process.exit(1);
}
console.log(`2. Rang ${TO}'s bellboy: "${title}" (${noticeSealed.length} bytes, sealed)`);
console.log('Now look at the bell in Q.');
