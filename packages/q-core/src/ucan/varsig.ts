/*
 * Varsig — the few bytes at the front of a signed UCAN that say how it was
 * signed and how the payload was written.
 *
 *   0x34        varsig
 *   0x01        version 1
 *   0xed 0x01   key type: Ed25519
 *   0xed 0x01   curve: edwards25519
 *   0x13        hash: SHA-512 (Ed25519's own)
 *   0x71        payload encoding: DAG-CBOR
 *
 * Q signs only with Ed25519 (the key a passkey is turned into), so this is the
 * only header Q writes. Headers for P-256 and secp256k1 are recognised by name
 * so a refusal can say what was met, but are not verified yet.
 */
import { UcanError } from './errors';

export const ED25519_DAG_CBOR = Uint8Array.of(0x34, 0x01, 0xed, 0x01, 0xed, 0x01, 0x13, 0x71);

export type Varsig = { alg: 'Ed25519'; encoding: 'DAG-CBOR' };

export function readVarsig(header: Uint8Array): Varsig {
	if (header.length === ED25519_DAG_CBOR.length && header.every((b, i) => b === ED25519_DAG_CBOR[i]))
		return { alg: 'Ed25519', encoding: 'DAG-CBOR' };
	if (header[0] !== 0x34 || header[1] !== 0x01) throw new UcanError('InvalidToken', 'Not a varsig v1 header.');
	const kind = header[2] === 0xed ? 'Ed25519 with another payload encoding' : header[2] === 0xec ? 'ECDSA (P-256 or secp256k1)' : 'an unknown algorithm';
	throw new UcanError('UnsupportedSignature', `Signed with ${kind}; Q reads Ed25519 + DAG-CBOR only.`);
}
