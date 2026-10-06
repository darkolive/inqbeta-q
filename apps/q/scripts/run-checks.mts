/*
 * The AI runner (6 October 2026): goes through the checks a browser can
 * confirm on its own, on every page that opens without a value, signed out, at
 * a wide and a phone width, and reports each checklist, signed with its own key.
 *
 *   cd apps/q
 *   node --experimental-strip-types --no-warnings --import ../../packages/q-core/test/register.mjs \
 *     scripts/run-checks.mts --site https://inqbeta.com [--only keys] [--send]
 *
 * Needs Playwright (npm i -D playwright, or run where it's installed).
 * Without --send it prints what it found. With --send it signs each report
 * with Q_CHECKS_SEED (32 bytes, base64url; give its DID a tester pass, as for
 * any tester) and sends it to the host's node.
 *
 * What it can't confirm it says so: checks needing a person are left for a
 * person, and a page's own "AI can check" items are left "not checked" until
 * each has its own written test. It never passes what it didn't look at.
 */
import { readFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { allChecks, report, type Checklist, type Result } from '../../../packages/q-core/src/checks.ts';
import { identityFromSeed } from '../../../packages/q-core/src/passkey.ts';
import { unb64url } from '../../../packages/q-core/src/canonical.ts';
import en from '../src/lib/i18n/en.ts';
import cy from '../src/lib/i18n/cy.ts';
import fr from '../src/lib/i18n/fr.ts';
import de from '../src/lib/i18n/de.ts';
import es from '../src/lib/i18n/es.ts';
import zh from '../src/lib/i18n/zh.ts';

const arg = (name: string) => {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? null : (process.argv[i + 1] ?? '');
};
const site = (arg('site') ?? 'http://localhost:3100').replace(/\/$/, '');
const only = arg('only');
const sending = process.argv.includes('--send');
const LISTS = (JSON.parse(readFileSync(new URL('../src/lib/checklists.json', import.meta.url), 'utf8')) as Checklist[]).filter((l) => !only || l.id === only);
const openable = (l: Checklist) => !(l.page.includes('[') || l.page === '/federations/one');
/* The frame's list is checked on a plain page anyone can open, looking only at what's around the page. */
const pathOf = (l: Checklist) => (l.page === '*' ? '/legal/terms' : l.page);

/* Languages: every key English has, said (not blank) in every other book. The same answer for every page. */
const books = { cy, fr, de, es, zh } as Record<string, Record<string, string>>;
const gaps = Object.entries(books).flatMap(([code, b]) => Object.keys(en).filter((k) => !b[k]?.trim()).map((k) => `${code}: ${k}`));
const languageResult: Result = gaps.length ? { check: 'lang-keys', outcome: 'fail', note: `Missing or blank: ${gaps.slice(0, 20).join(', ')}${gaps.length > 20 ? '…' : ''}` } : { check: 'lang-keys', outcome: 'pass' };

async function look(page: Page, url: string, width: number, frame = false) {
	const errors: string[] = [];
	page.removeAllListeners('console');
	page.removeAllListeners('pageerror');
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
	page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
	await page.setViewportSize({ width, height: 900 });
	const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch((e: Error) => {
		errors.push(e.message.slice(0, 200));
		return null;
	});
	await page.waitForTimeout(1500);
	const seen = await page.evaluate((frame) => {
		const visible = (e: Element) => {
			const b = e.getBoundingClientRect();
			return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== 'hidden';
		};
		/* The page's own part, or (for the frame's list) the menu, top bar and footer around it. Hidden skip links don't count. */
		const inFrame = (e: Element) => !!e.closest('header, nav, footer, aside') || !e.closest('main');
		const small = [...document.querySelectorAll('button, a.btn, [role="button"], nav a, footer a')]
			.filter(visible)
			/* Skip links, and links inside a sentence (they size with the text, as WCAG allows), don't count. */
			.filter((e) => e.getBoundingClientRect().height > 2 && !e.matches('a[href^="#"]') && !(e.matches('a:not(.btn)') && !!e.closest('p')) && inFrame(e) === frame)
			.filter((e) => e.getBoundingClientRect().height < 43.5)
			.map((e) => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 40));
		return {
			h1: document.querySelectorAll('h1').length,
			title: document.title.trim(),
			text: (document.body.innerText || '').trim().length,
			wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			small: [...new Set(small)].slice(0, 8),
			noAlt: [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).map((i) => (i.getAttribute('src') || '').slice(0, 60)).slice(0, 8),
			placeholders: [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter((i) => (i.getAttribute('placeholder') || '').trim()).map((i) => i.getAttribute('placeholder')!.slice(0, 40)).slice(0, 8)
		};
	}, frame);
	return { status: r?.status() ?? 0, errors, ...seen };
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage();
const signer = sending ? await identityFromSeed(unb64url(process.env.Q_CHECKS_SEED ?? '')) : null;
let node: string | null = null;
if (sending) {
	const home = (await (await fetch(`${site}/incubator.json`)).json().catch(() => null)) as { services?: { storage?: string } } | null;
	node = home?.services?.storage?.replace(/\/$/, '') ?? null;
	if (!node) throw new Error(`${site}/incubator.json names no storage node to send reports to.`);
	console.log(`Signing as ${signer!.did}, sending to ${node}`);
}

let problems = 0;
for (const l of LISTS) {
	const results: Result[] = [];
	const skip = (check: string, note: string) => results.push({ check, outcome: 'skip', note });
	if (openable(l)) {
		const wide = await look(page, `${site}${pathOf(l)}`, 1280, l.page === '*');
		const phone = await look(page, `${site}${pathOf(l)}`, 390, l.page === '*');
		const ok = (check: string, good: boolean, note: string) => results.push(good ? { check, outcome: 'pass' } : { check, outcome: 'fail', note });
		const errs = [...new Set([...wide.errors, ...phone.errors])];
		ok('every-loads', wide.status > 0 && wide.status < 400 && !errs.length && wide.text > 20, `Status ${wide.status}; ${errs.slice(0, 3).join(' | ') || 'the page was nearly empty'}`);
		ok('every-title', wide.h1 >= 1 && !!wide.title, `${wide.h1} main headings; tab title “${wide.title}”`);
		ok('every-signed-out', wide.status > 0 && wide.status < 400 && wide.text > 20, 'Signed out, the page was empty or refused.');
		ok('every-phone', phone.wide <= 1, `At 390 pixels it scrolls sideways by ${phone.wide} pixels.`);
		ok('every-targets', !wide.small.length && !phone.small.length, `Under 44 pixels tall: ${[...new Set([...wide.small, ...phone.small])].join(', ')}`);
		ok('every-alt', !wide.noAlt.length, `Pictures with no alt: ${wide.noAlt.join(', ')}`);
		ok('every-no-placeholders', !wide.placeholders.length, `Placeholder text: ${wide.placeholders.join(', ')}`);
	} else {
		for (const c of ['every-loads', 'every-title', 'every-signed-out', 'every-phone', 'every-targets', 'every-alt', 'every-no-placeholders']) skip(c, 'This page needs a value (a federation, a coin, a card), so the runner can’t open it alone yet.');
	}
	results.push(languageResult);
	for (const c of allChecks(l)) {
		if (results.some((r) => r.check === c.id)) continue;
		if (c.how === 'human') continue;
		skip(c.id, c.how === 'both' ? 'Needs a person to confirm.' : 'No written test for this one yet.');
	}
	const fails = results.filter((r) => r.outcome === 'fail');
	problems += fails.length;
	console.log(`${fails.length ? '✗' : '✓'} ${l.id}`);
	for (const f of fails) console.log(`    ${f.check}: ${f.note}`);
	if (signer && node) {
		const r = await report(signer, l, { by: 'ai', name: 'AI runner', site, device: 'Chromium, signed out, 1280 and 390 wide', results });
		const sent = await fetch(`${node}/checks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
		if (!sent.ok) console.log(`    not kept: ${((await sent.json().catch(() => ({}))) as { says?: string }).says ?? sent.status}`);
	}
}
await browser.close();
console.log(`\n${LISTS.length} checklists, ${problems} problems.`);
