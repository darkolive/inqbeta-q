#!/usr/bin/env node
/*
 * Fetch the official licence texts, word for word, from SPDX's licence list.
 * Run once before the first public push (and never edit the results):
 *
 *   node scripts/fetch-licences.mjs
 *
 * Writes:
 *   LICENSE        GNU Affero General Public License v3.0 — the app, node, spikes
 *   docs/LICENSE   Creative Commons Attribution 4.0 International — the docs
 * packages/*\/LICENSE (Apache-2.0) are already in place.
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://raw.githubusercontent.com/spdx/license-list-data/main/text/';
const WANT = [
	{ id: 'AGPL-3.0-or-later', to: 'LICENSE', must: 'GNU AFFERO GENERAL PUBLIC LICENSE' },
	{ id: 'CC-BY-4.0', to: 'docs/LICENSE', must: 'Attribution 4.0 International' }
];

for (const w of WANT) {
	const res = await fetch(BASE + w.id + '.txt');
	if (!res.ok) throw new Error(`${w.id}: ${res.status} ${res.statusText}`);
	const text = (await res.text()).trim() + '\n';
	if (!text.includes(w.must)) throw new Error(`${w.id}: that is not the text expected`);
	writeFileSync(w.to, text);
	console.log(`${w.to}  ←  ${w.id}  (${text.split('\n').length} lines)`);
}
