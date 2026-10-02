/*
 * This computer's own host (ADR-Q-018): the files set-up writes.
 *
 * Run in a scratch folder, because the server module writes beside the app
 * it runs in (process.cwd()).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHomeFile, readMark, writeLogo, writeMark, writeHomeFile } from '../../../apps/q/src/lib/server/host';

const here = process.cwd();
function inScratch(fn: (dir: string) => void) {
	const dir = mkdtempSync(join(tmpdir(), 'q-host-'));
	mkdirSync(join(dir, 'static'));
	process.chdir(dir);
	try {
		fn(dir);
	} finally {
		process.chdir(here);
	}
}

test('a fresh copy has no mark, and no host file is read as none', () =>
	inScratch((dir) => {
		assert.equal(readMark(), null);
		assert.equal(readHomeFile(), null);
		writeFileSync(join(dir, 'static', 'incubator.json'), '{"schema":"something-else"}');
		assert.equal(readHomeFile(), null, 'a file that isn’t a host file is not one');
	}));

test('the mark is written and read back', () =>
	inScratch(() => {
		const m = writeMark({ federation: 'did:key:zFed', founder: 'did:key:zMe', how: 'founded' });
		assert.equal(m.schema, 'inqbeta.host-local/1');
		assert.deepEqual(readMark(), m);
	}));

test('the host file is written where the site serves it', () =>
	inScratch((dir) => {
		writeHomeFile({ schema: 'inqbeta.home-federation/1', federation: 'did:key:zFed', name: 'Test', purpose: 'p', invitation: 'x', until: '2027-01-01T00:00:00Z' });
		assert.equal(JSON.parse(readFileSync(join(dir, 'static', 'incubator.json'), 'utf8')).name, 'Test');
		assert.equal(readHomeFile()?.name, 'Test');
	}));

test('a logo is kept under static/host and named by its fingerprint', () =>
	inScratch((dir) => {
		const png = 'data:image/png;base64,' + Buffer.from('not really a png').toString('base64');
		const at = writeLogo(png);
		assert.match(at, /^\/host\/logo\.png\?v=[0-9a-f]{12}$/);
		assert.ok(existsSync(join(dir, 'static', 'host', 'logo.png')));
	}));

test('a logo that isn’t a picture, is too big, or carries script is refused', () =>
	inScratch(() => {
		assert.throws(() => writeLogo('data:text/html;base64,PGI+'), /picture/);
		assert.throws(() => writeLogo('data:image/png;base64,' + Buffer.alloc(600 * 1024).toString('base64')), /too big/);
		const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
		assert.throws(() => writeLogo(svg), /scripts/);
	}));

import { servicesFrom } from '../../../apps/q/src/lib/host-services';

test('services say whether a key is set, and only its last four, never the key', () => {
	const s = servicesFrom({ RESEND_API_KEY: 're_abcdefghijkl1234', Q_MAIL_FROM: 'Q <q@example.org>', CF_TURN_KEY_ID: 'id' });
	const email = s.find((x) => x.id === 'email')!;
	assert.equal(email.is, 'on');
	assert.deepEqual(email.settings.map((x) => x.shows), ['1234', 'Q <q@example.org>']);
	assert.ok(!JSON.stringify(s).includes('abcdefghijkl'), 'no more of a secret than its last four');
	assert.equal(s.find((x) => x.id === 'calls')!.is, 'part');
	assert.equal(s.find((x) => x.id === 'ai')!.is, 'off');
	assert.equal(servicesFrom({ Q_OTP_SECRET: 'short' }).find((x) => x.id === 'own')!.settings[1].shows, '', 'a short secret shows nothing at all');
});

import { readEnvFile, setEnvValue } from '../../../apps/q/src/lib/server/env-file';
import { endsOf } from '../../../apps/q/src/lib/host-services';

test('.env: one line changes; comments and other settings stay as they were', () =>
	inScratch((dir) => {
		const f = join(dir, '.env');
		writeFileSync(f, '# Resend\nRESEND_API_KEY=old\n\n# mine\nSOMETHING_ELSE="keep me"\n');
		setEnvValue('RESEND_API_KEY', 're_new1234567');
		setEnvValue('Q_MAIL_FROM', 'Q <q@example.org>');
		const text = readFileSync(f, 'utf8');
		assert.match(text, /^# Resend\nRESEND_API_KEY=re_new1234567\n\n# mine\nSOMETHING_ELSE="keep me"\nQ_MAIL_FROM="Q <q@example.org>"\n$/);
		assert.deepEqual(readEnvFile(), { RESEND_API_KEY: 're_new1234567', SOMETHING_ELSE: 'keep me', Q_MAIL_FROM: 'Q <q@example.org>' });
		assert.throws(() => setEnvValue('RESEND_API_KEY', 'two\nlines'), /one line/);
		assert.throws(() => setEnvValue('bad name', 'x'), /setting name/);
	}));

test('a setting changed in .env but not yet running says restart; set dates come from records', () => {
	const s = servicesFrom({ RESEND_API_KEY: 're_abcdefghijkl9999' }, { running: { RESEND_API_KEY: 're_old' }, setAt: { RESEND_API_KEY: '2026-10-02T18:00:00Z' } });
	const key = s.find((x) => x.id === 'email')!.settings[0];
	assert.equal(key.restart, true);
	assert.equal(key.setAt, '2026-10-02T18:00:00Z');
	assert.equal(s.find((x) => x.id === 'email')!.settings[1].restart, undefined, 'unset in both is no change');
	assert.equal(endsOf('re_abcdefghijkl9999', true), '9999');
	assert.equal(endsOf('Q <q@x.org>', false), 'Q <q@x.org>');
});
