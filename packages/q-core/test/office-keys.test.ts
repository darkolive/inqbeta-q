/* The office's own keys (ADR-Q-038, the office's records): post sealed to the office opens for whoever holds it, the history too. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { b64url } from '../src/canonical';
import { sealTo, openWith } from '../src/seal';
import { foundFederation, newDraft } from '../src/federations';
import { appoint, checkAppointment, currentOfficeKey, newOfficeKeyring, officeIdentities, openKeyring, sealKeyring, turnOver } from '../src/offices';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 47 + n) % 251);

test('a letter to the treasurer in 2026 opens for the treasurer of 2028, never for the one who left', async () => {
	const darren = await identityFromSeed(seed(1));
	const sam = await identityFromSeed(seed(2));
	const priya = await identityFromSeed(seed(3));
	const f = await foundFederation(signerFor(darren), { ...newDraft(), name: 'Green Space', purpose: 'Gardening.' });
	const id = f.founding.federation;
	const grant = b64url(f.grant.bytes);

	let ring = await newOfficeKeyring(id, 'treasurer');
	const samIn = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'treasurer', holder: sam.did, months: 12, says: 'Chosen.', grant, keyring: ring });
	assert.equal(samIn.officeKey, currentOfficeKey(ring)!.did, 'the appointment names the office’s key, signed');
	assert.equal((await checkAppointment(samIn)).ok, true);
	assert.equal((await checkAppointment({ ...samIn, officeKey: sam.did })).ok, false, 'the key can’t be swapped');

	/* A member writes to the office: sealed to the office's key, not to Sam. */
	const letter = (await sealTo({ text: 'Can I pay my subs in two halves?' }, [samIn.officeKey!], 'the treasurer')).sealed;
	const samRing = await openKeyring(samIn.sealedKeys!, sam);
	assert.ok(samRing);
	const [k1] = await officeIdentities(samRing!);
	assert.equal((await openWith(letter, k1)).ok, true, 'Sam, as treasurer, reads it');

	/* Sam stands down; the key turns over; Priya is appointed with every key. */
	ring = await turnOver(ring);
	const priyaIn = await appoint(signerFor(f.key), signerFor(darren), { federation: id, office: 'treasurer', holder: priya.did, months: 12, says: 'Elected.', grant, keyring: ring });
	const after = (await sealTo({ text: 'And the second half?' }, [priyaIn.officeKey!], 'the treasurer')).sealed;
	const priyaRing = await openKeyring(priyaIn.sealedKeys!, priya);
	const keys = await officeIdentities(priyaRing!);
	assert.equal(keys.length, 2);
	assert.ok((await openWith(letter, keys[0])).ok, 'Priya reads the letter from before her time');
	assert.ok((await openWith(after, keys[1])).ok);
	assert.equal(await openKeyring(priyaIn.sealedKeys!, sam), null, 'Sam can’t open Priya’s keys');
	assert.equal((await openWith(after, k1)).ok, false, 'nor the post after he left, with the key he had');
	assert.ok(await openKeyring(await sealKeyring(ring, [darren.did]), darren), 'the caretaker keeps the ring');
});
