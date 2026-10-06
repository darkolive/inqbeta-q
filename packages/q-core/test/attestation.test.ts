/* Internal compliance, external verification (ADR-Q-038, 6 October 2026). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { b64url } from '../src/canonical';
import { foundFederation, newDraft } from '../src/federations';
import { appoint } from '../src/offices';
import { actingCovers, takeUp, type InRoleReceipt } from '../src/inrole';
import { checkReport, checkVerification, declaredBy, verifyReport, writeReport } from '../src/attestation';

const NOW = new Date('2026-10-06T12:00:00Z');
const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 41 + n) % 251);
const EMPLOYED = 'Employed by Green Space.';

async function world() {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const audit = await identityFromSeed(seed(3));
	const vera = await identityFromSeed(seed(4));
	const green = await foundFederation(signerFor(darren), { ...newDraft(NOW), name: 'Green Space', purpose: 'Gardening.' }, { now: NOW });
	const checkers = await foundFederation(signerFor(audit), { ...newDraft(NOW), name: 'Fair Checks', purpose: 'Independent verification.' }, { now: NOW });
	const g = green.founding.federation;
	const c = checkers.founding.federation;
	const compliance = await appoint(signerFor(green.key), signerFor(darren), { federation: g, office: 'compliance', holder: sam.did, months: 12, says: 'Hired as compliance officer.', grant: b64url(green.grant.bytes), standingInterest: EMPLOYED }, NOW);
	const verifier = await appoint(signerFor(checkers.key), signerFor(audit), { federation: c, office: 'verifier', holder: vera.did, months: 12, says: 'Chosen by the members.', grant: b64url(checkers.grant.bytes) }, NOW);
	const samUp = (await takeUp(sam, { federation: g, name: 'Green Space', office: 'compliance', declaration: { kind: 'interest', says: EMPLOYED } }, NOW)) as InRoleReceipt;
	const veraUp = (await takeUp(vera, { federation: c, name: 'Fair Checks', office: 'verifier', declaration: { kind: 'none' } }, NOW)) as InRoleReceipt;
	return { darren, sam, vera, g, c, compliance, verifier, samActing: { federation: g, office: 'compliance', mandates: compliance.tokens, takenUp: samUp }, veraActing: { federation: c, office: 'verifier', mandates: verifier.tokens, takenUp: veraUp } };
}

test('a standing interest is in the mandate: a take-up that leaves it out is refused', async () => {
	const { sam, g, compliance } = await world();
	assert.equal(compliance.standingInterest, EMPLOYED);
	const quiet = (await takeUp(sam, { federation: g, name: 'Green Space', office: 'compliance', declaration: { kind: 'none' } }, NOW)) as InRoleReceipt;
	const no = await actingCovers(sam.did, { federation: g, office: 'compliance', mandates: compliance.tokens, takenUp: quiet }, { federation: g, cmd: '/fed/compliance/report', now: NOW });
	assert.match((no as { says: string }).says, /comes with an interest you must declare/);
});

test('the compliance officer, an employee, writes a report; it says so', async () => {
	const { sam, samActing } = await world();
	const r = await writeReport(sam, { acting: samActing, subject: 'Safeguarding records, September', finding: 'meets-with-notes', says: 'All records present; two signed late.' }, NOW);
	const c = await checkReport(r);
	assert.equal(c.ok, true);
	assert.match(c.says, /interest declared: Employed by Green Space/);
	assert.match(declaredBy(r), /I may have a conflict of interest, and I declare it: Employed by Green Space\./);
});

test('an external verifier weighs it, knowing who wrote it, and accepts it', async () => {
	const { sam, vera, samActing, veraActing } = await world();
	const r = await writeReport(sam, { acting: samActing, subject: 'Safeguarding records, September', finding: 'meets', says: 'All present.' }, NOW);
	const v = await verifyReport(vera, r, { acting: veraActing, outcome: 'accepted', says: 'Read knowing the author is employed by the club; no sign of bias; the evidence supports it.' }, NOW);
	assert.equal(v.content.authorDeclared, declaredBy(r), 'what the verifier weighed, word for word');
	assert.match((await checkVerification(v, r)).says, /Accepted: a good and honest answer, by an external verifier with no conflict of interest declared/);
});

test('refused: a verifier from the same federation; not saying what was found; tampering; the wrong office', async () => {
	const { sam, vera, samActing, veraActing } = await world();
	const r = await writeReport(sam, { acting: samActing, subject: 'Accounts', finding: 'meets', says: 'Fine.' }, NOW);
	await assert.rejects(verifyReport(sam, r, { acting: samActing, outcome: 'accepted', says: 'Mine.' }, NOW), /another federation/);
	await assert.rejects(verifyReport(vera, r, { acting: veraActing, outcome: 'not-accepted', says: 'No.' }, NOW), /Say what you found/);
	const v = await verifyReport(vera, r, { acting: veraActing, outcome: 'not-accepted', says: 'The evidence doesn’t support “fine”.', found: 'The report skips the two late payments the author oversaw.' }, NOW);
	assert.equal((await checkVerification(v, r)).ok, true);
	assert.equal((await checkVerification({ ...v, content: { ...v.content, authorDeclared: 'No conflict.' } }, r)).ok, false);
	await assert.rejects(writeReport(vera, { acting: veraActing, subject: 'x', finding: 'meets', says: 'x' }, NOW), /reviewer or a compliance officer/);
});

test('a report and its verification travel as links and come back whole', async () => {
	const { pack, unpack, isEvidenceReport, isExternalVerification } = await import('../src/membership');
	const { sam, vera, samActing, veraActing } = await world();
	const r = await writeReport(sam, { acting: samActing, subject: 'Accounts', finding: 'meets', says: 'Fine.' }, NOW);
	const back = await unpack(await pack(r));
	assert.ok(isEvidenceReport(back) && (await checkReport(back)).ok);
	const v = await verifyReport(vera, r, { acting: veraActing, outcome: 'accepted', says: 'Weighed.' }, NOW);
	const vb = await unpack(await pack(v));
	assert.ok(isExternalVerification(vb) && (await checkVerification(vb, r)).ok);
	assert.ok((await pack(r)).length < 12_000, 'short enough for a link');
});
