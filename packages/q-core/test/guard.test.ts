/*
 * The navigation guard, walked route by route.
 *
 * It has gone wrong twice — once sending people away from the files page
 * because the guard named a route that does not exist, once making /keys
 * unreachable and with it the only way to sign out. Both were invisible
 * because the rules lived inside a layout effect.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OPEN_PATHS, isOpenPath, whereTo } from '../../../apps/q/src/lib/guard';

const ROUTES = join(import.meta.dirname, '..', '..', '..', 'apps', 'q', 'src', 'routes');

/** Every route the app actually has, as a path. */
function routes(dir = ROUTES, prefix = ''): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (name === 'api') continue;
			out.push(...routes(path, `${prefix}/${name}`));
		} else if (name === '+page.svelte') {
			out.push(prefix || '/');
		}
	}
	return out;
}

const SIGNED_IN = { answered: true, signedIn: true, remembered: true };
const RESUMABLE = { answered: true, signedIn: false, remembered: true };
const STRANGER = { answered: true, signedIn: false, remembered: false };

test('every open path is a route that exists', () => {
	const real = new Set(routes());
	for (const p of OPEN_PATHS) {
		assert.ok(real.has(p), `the guard lets people to ${p}, which is not a route`);
	}
});

test('a signed-in person is never sent anywhere', () => {
	for (const path of routes()) {
		assert.equal(whereTo(path, SIGNED_IN), null, `signed in and sent away from ${path}`);
	}
	/* /keys above all: it is where the keys are, and where the way out was. */
	assert.equal(whereTo('/keys', SIGNED_IN), null);
});

test('a remembered person stays put, because a touch is one press away', () => {
	for (const path of routes()) {
		assert.equal(whereTo(path, RESUMABLE), null, `remembered and sent away from ${path}`);
	}
});

test('a stranger may see the open pages and is sent home to sign in otherwise', () => {
	for (const path of routes()) {
		const to = whereTo(path, STRANGER);
		if (isOpenPath(path)) assert.equal(to, null, `${path} is open but a stranger was sent away`);
		else assert.equal(to, '/', `${path} sent a stranger to ${to}`);
	}
	/* One front door: signed out, /keys goes home too. */
	assert.equal(whereTo('/keys', STRANGER), '/');
});

test('a receipt location is reachable by anyone, because the seal is the gate', () => {
	assert.equal(whereTo('/c/some-long-token', STRANGER), null);
	assert.ok(isOpenPath('/c/anything-at-all'));
});

test('nothing happens before the passkey module has answered', () => {
	assert.equal(whereTo('/receipts', { answered: false, signedIn: false, remembered: false }), null);
});

test('the guard never sends anyone to a page it would send them away from', () => {
	/* A destination that is not open is a redirect loop. */
	for (const state of [STRANGER, RESUMABLE, SIGNED_IN]) {
		for (const path of routes()) {
			const to = whereTo(path, state);
			if (to) assert.equal(whereTo(to, state), null, `${path} → ${to} → and away again`);
		}
	}
});
