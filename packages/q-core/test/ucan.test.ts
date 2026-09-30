/*
 * q-core's UCAN against the UCAN spec's own test vectors (and go-ucan's), so
 * "Q speaks UCAN" is a checked fact, not a claim. See fixtures/ucan/README.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pkcs8 } from '../src/did';
import { decode, encode } from '../src/ucan/cbor';
import { CID, cidFromHex } from '../src/ucan/cid';
import { fromDagJson, unbase64 } from '../src/ucan/dagjson';
import { UcanError } from '../src/ucan/errors';
import { checkPolicy, matches } from '../src/ucan/policy';
import { delegate, invoke, readDelegation, readInvocation, readToken, signerFromKeys, type Delegation } from '../src/ucan/token';
import { checkInvocation } from '../src/ucan/validate';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/ucan/${name}`, import.meta.url), 'utf8');

async function keysFromFixture(text: string): Promise<CryptoKeyPair> {
	const raw = unbase64(text);
	assert.deepEqual([...raw.slice(0, 2)], [0x80, 0x26], 'varint(0x1300)');
	const seed = raw.slice(2);
	const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8('Ed25519', seed), { name: 'Ed25519' }, true, ['sign']);
	const { x } = await crypto.subtle.exportKey('jwk', privateKey);
	const publicKey = await crypto.subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x }, { name: 'Ed25519' }, true, ['verify']);
	return { privateKey, publicKey };
}

for (const file of ['delegation.json', 'go-ucan-delegation.json']) {
	test(`reads and re-makes the delegation vectors byte for byte (${file})`, async () => {
		const data = JSON.parse(fixture(file));
		for (const v of data.valid) {
			const bytes = unbase64(v.token);
			const d = await readDelegation(bytes);
			assert.equal(d.cid.toBase32(), v.cid, v.name);
			const e = v.envelope.payload;
			assert.equal(d.payload.iss, e.iss);
			assert.equal(d.payload.aud, e.aud);
			assert.equal(d.payload.sub, e.sub);
			assert.equal(d.payload.cmd, e.cmd);
			assert.deepEqual(d.payload.pol, e.pol);
			assert.equal(d.payload.exp, e.exp);
			assert.deepEqual([...d.payload.nonce], [...unbase64(e.nonce)]);

			// Signing the same payload with the same key must give the same bytes.
			if (d.tag === 'ucan/dlg@1.0.0') {
				const issuer = Object.entries(data.principals).find(([name]) => v.name.includes(`${name} >`))!;
				const signer = await signerFromKeys(await keysFromFixture(issuer[1] as string));
				assert.equal(signer.did, e.iss);
				const again = await delegate(signer, {
					to: e.aud,
					subject: e.sub,
					cmd: e.cmd,
					pol: e.pol,
					exp: e.exp,
					nonce: unbase64(e.nonce)
				});
				assert.deepEqual([...again.bytes], [...bytes], 'identical bytes');
				assert.ok(again.cid.equals(d.cid));
			}
		}
	});
}

test('invocation vectors: the valid ones pass, the invalid ones fail for the stated reason', async () => {
	const data = JSON.parse(fixture('invocation.json'));
	const run = async (v: { invocation: unknown; proofs: unknown[]; time: number }) => {
		const inv = await readInvocation(fromDagJson(v.invocation) as Uint8Array);
		const proofs: Delegation[] = [];
		for (const p of v.proofs) proofs.push(await readDelegation(fromDagJson(p) as Uint8Array));
		return checkInvocation(inv, { proofs, at: v.time });
	};
	for (const v of data.valid) {
		await assert.doesNotReject(run(v), v.name);
	}
	for (const v of data.invalid) {
		await assert.rejects(
			run(v),
			(e: unknown) => {
				assert.ok(e instanceof UcanError, `${v.name}: ${e}`);
				assert.equal(e.code, v.error.name, `${v.name}: ${e.message}`);
				return true;
			},
			v.name
		);
	}
});

test('policy vectors', () => {
	const data = JSON.parse(fixture('policy.json'));
	for (const v of data.valid)
		for (const p of v.policies) assert.ok(matches(checkPolicy(p), v.args).ok, JSON.stringify(p));
	for (const v of data.invalid)
		for (const p of v.policies) assert.equal(matches(checkPolicy(p), v.args).ok, false, JSON.stringify(p));
});

test('policy: missing data never passes, optional data may be absent, selectors reach inside', () => {
	const args = { a: [1, 2, 3], m: { x: 'y' }, s: 'hello', b: Uint8Array.of(9, 8, 7) };
	const ok = (p: unknown) => matches(checkPolicy([p]), args).ok;
	assert.equal(ok(['==', '.nope', null]), false);
	assert.equal(ok(['not', ['==', '.nope', 1]]), false, 'not does not rescue missing data');
	assert.equal(ok(['==', '.nope?', 1]), true);
	assert.equal(ok(['==', '.a[-1]', 3]), true);
	assert.equal(ok(['==', '.a[1:]', [2, 3]]), true);
	assert.equal(ok(['==', '.["m"].x', 'y']), true);
	assert.equal(ok(['==', '.b[1]', 8]), true);
	assert.equal(ok(['==', '.s[1:3]', 'el']), true);
	assert.equal(ok(['all', '.m', ['==', '.', 'y']]), true);
	assert.equal(ok(['>', '.s', 1]), false, 'numbers only');
	assert.throws(() => checkPolicy([['==', 'a', 1]]));
	assert.throws(() => checkPolicy([['~', '.a', 1]]));
	assert.throws(() => checkPolicy([['==', '..a', 1]]));
});

test('DAG-CBOR refuses what is not canonical, and CIDs read both ways', async () => {
	assert.deepEqual([...encode({ bb: 1, a: 2, c: [true, null, 1.5, -3] })], [...encode({ c: [true, null, 1.5, -3], a: 2, bb: 1 })]);
	assert.throws(() => decode(Uint8Array.of(0xa2, 0x62, 0x62, 0x62, 0x01, 0x61, 0x61, 0x02)), /sorted/);
	assert.throws(() => decode(Uint8Array.of(0x18, 0x01)), /shortest/);
	assert.throws(() => decode(Uint8Array.of(0xf9, 0x00, 0x00)), /64-bit/);
	const cid = await CID.of(Uint8Array.of(1, 2, 3));
	assert.match(cid.toString(), /^zdpu/);
	assert.ok(CID.parse(cid.toString()).equals(cid));
	assert.ok(CID.parse(cid.toBase32()).equals(cid));
	const round = decode(encode({ link: cid })) as { link: CID };
	assert.ok(round.link.equals(cid));
	const raw = cidFromHex('a'.repeat(64));
	assert.match(raw.toBase32(), /^bafkrei/);
	assert.equal(raw.hex, 'a'.repeat(64));
});

test('a Q chain: root → powerline → site key, invoked and checked; tampering is caught', async () => {
	const gen = () => crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
	const thing = await signerFromKeys(await gen());
	const reviewer = await signerFromKeys(await gen());
	const reviewerPhone = await signerFromKeys(await gen());

	const root = await delegate(thing, { to: reviewer.did, cmd: '/inqbeta/merge', pol: [['like', '.branch', 'review-*']] });
	const line = await delegate(reviewer, { to: reviewerPhone.did, subject: null, cmd: '/' });
	const inv = await invoke(reviewerPhone, { subject: thing.did, cmd: '/inqbeta/merge', args: { branch: 'review-1' }, proofs: [root, line] });

	const read = await readInvocation(inv.bytes);
	const ok = checkInvocation(read, { proofs: [root, line] });
	assert.equal(ok.root, thing.did);
	assert.equal(ok.chain.length, 2);

	const wrongBranch = await invoke(reviewerPhone, { subject: thing.did, cmd: '/inqbeta/merge', args: { branch: 'main' }, proofs: [root, line] });
	assert.throws(() => checkInvocation(wrongBranch, { proofs: [root, line] }), { code: 'MatchError' });

	const wider = await invoke(reviewerPhone, { subject: thing.did, cmd: '/inqbeta/destroy', args: {}, proofs: [root, line] });
	assert.throws(() => checkInvocation(wider, { proofs: [root, line] }), { code: 'InvalidClaim' });

	assert.throws(() => checkInvocation(read, { proofs: [root, line], revocations: [{ revoked: line.cid, by: reviewer.did, at: 0 }] }), { code: 'Revoked' });
	assert.doesNotThrow(() => checkInvocation(read, { proofs: [root, line], revocations: [{ revoked: line.cid, by: reviewerPhone.did, at: 0 }] }), 'only an issuer on the line may revoke');

	const tampered = Uint8Array.from(inv.bytes);
	tampered[tampered.length - 5] ^= 1;
	await assert.rejects(readToken(tampered), (e: unknown) => e instanceof UcanError);
});

test('container vectors: all six forms read, and ours write sorted and read back', async () => {
	const { readContainer, writeContainer, readContainerTokens } = await import('../src/ucan/container');
	const forms = ['Bytes', 'BytesGzipped', 'Base64StdPadding', 'Base64StdPaddingGzipped', 'Base64URL', 'Base64URLGzipped'];
	const read = async (f: string) => {
		const path = new URL(`./fixtures/ucan/container-${f}`, import.meta.url);
		return readContainer(f.startsWith('Bytes') ? new Uint8Array(readFileSync(path)) : readFileSync(path, 'utf8'));
	};
	const first = await read(forms[0]);
	assert.ok(first.length > 1);
	// Each vector is its own container of ten tokens (made with an older varsig
	// header, so only the container layer is tested with them).
	for (const f of forms) assert.equal((await read(f)).length, first.length, f);

	// The vectors are for readers: their tokens are not in the bytewise order the
	// spec now requires of writers (go-ucan's writer sorts, as ours does).
	const sorted = [...first].sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)));
	for (const f of ['bytes', 'base64', 'base64url'] as const)
		assert.deepEqual((await readContainer(await writeContainer(first, f))).map((b) => [...b]), sorted.map((b) => [...b]), f);
	const asText = (await writeContainer(first, 'base64')) as string;
	assert.equal(asText[0], 'B');
	assert.equal(asText.length % 4, 1, 'padded base64 after the header');
	for (const f of ['bytes+gzip', 'base64url+gzip'] as const)
		assert.deepEqual((await readContainer(await writeContainer(first, f))).map((b) => [...b]), sorted.map((b) => [...b]));

	const gen = () => crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
	const a = await signerFromKeys(await gen());
	const d = await delegate(a, { to: a.did, cmd: '/inqbeta/read' });
	const back = await readContainerTokens(await writeContainer([d, d]));
	assert.equal(back.length, 1, 'duplicates are dropped');
	assert.ok(back[0].cid.equals(d.cid));
});

test('revocation: only an issuer on the line may revoke, and it is read back for the store', async () => {
	const { revoke, asRevocation } = await import('../src/ucan/revoke');
	const gen = () => crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
	const [owner, bob, carol] = await Promise.all([gen(), gen(), gen()].map(async (k) => signerFromKeys(await k)));
	const d1 = await delegate(owner, { to: bob.did, cmd: '/inqbeta' });
	const d2 = await delegate(bob, { to: carol.did, subject: owner.did, cmd: '/inqbeta/read' });

	await assert.rejects(revoke(carol, d2, [d1, d2]), { code: 'InvalidClaim' });
	const byOwner = await revoke(owner, d2, [d1, d2], 'left the project');
	const back = await readInvocation(byOwner.bytes);
	const known = asRevocation(back, [d1, d2]);
	assert.ok(known.revoked.equals(d2.cid));
	assert.equal(known.by, owner.did);
	assert.throws(() => asRevocation(back, [d2]), { code: 'InvalidClaim' });

	const use = await invoke(carol, { subject: owner.did, cmd: '/inqbeta/read', proofs: [d1, d2] });
	assert.doesNotThrow(() => checkInvocation(use, { proofs: [d1, d2], at: known.at - 1, revocations: [known] }), 'what came before stands');
	assert.throws(() => checkInvocation(use, { proofs: [d1, d2], revocations: [known] }), { code: 'Revoked' });
});
