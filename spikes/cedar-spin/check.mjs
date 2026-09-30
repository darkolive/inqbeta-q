// With `spin up` running in this folder: node check.mjs
// Sends every exported case to the Spin component and compares with what the
// WASM engine decided in Q.
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../cedar-rust/money-spend.actions.json', import.meta.url), 'utf8'));
const url = process.env.SPIN_URL ?? 'http://127.0.0.1:3000/decide';
let failed = 0;
for (const e of data.expected) {
	for (const chain of ['core', 'club']) {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ chain, principal: data.principal, resource: data.resource, facts: e.facts })
		});
		const got = await res.json();
		const ok = got.holds === e[chain].holds && JSON.stringify(got.rules) === JSON.stringify(e[chain].rules) && got.action === data.chains[chain].hash;
		if (!ok) failed++;
		console.log(`${ok ? 'ok  ' : 'FAIL'} ${chain} ${e.name}${ok ? '' : `: spin ${JSON.stringify(got)} / wasm ${JSON.stringify(e[chain])}`}`);
	}
}
console.log(failed ? `${failed} failed` : 'Spin and WASM agree on every decision and rule.');
process.exit(failed ? 1 : 0);
