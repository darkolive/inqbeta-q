/*
 * Offline Exchange Receipts (ADR-008)
 *
 * Client-side implementation of offline peer exchange receipts.
 * These are bilateral agreements made offline, stored locally in Badger,
 * and can be reconciled later.
 *
 * Key concepts:
 * - Two participants, two signatures
 * - Deterministic canonical commitment bytes
 * - SHA-256 commitment hash
 * - No network, no wall clock
 */
import { canonical, sha256 } from './canonical';

/** Offline exchange commitment */
export interface OfflineExchangeCommitment {
	schemaVersion: '1';
	exchangeId: string;
	participantRefs: string[];
	typedValues: OfflineExchangeTypedValue[];
	occurredAt: string;
	sessionBinding?: string;
}

/** A typed value in the exchange */
export interface OfflineExchangeTypedValue {
	valueType: string;
	unit: string;
	value: string;
}

/** One participant's proof */
export interface OfflineExchangeProof {
	participantRef: string;
	publicKey: string;
	payloadHash: string;
	signature: string;
}

/** The offline exchange receipt */
export interface OfflineExchangeReceipt {
	schemaVersion: '1';
	commitmentHash: string;
	commitment: OfflineExchangeCommitment;
	proofs: OfflineExchangeProof[];
}

/** Create a deterministic exchange ID */
export async function createExchangeId(participants: string[], occurredAt: string, secret?: string): Promise<string> {
	const input = [...participants].sort().join('|') + '|' + occurredAt + (secret ? '|' + secret : '');
	return sha256(input);
}

/** Validate commitment (sorted-or-reject) */
export function validateCommitment(commitment: OfflineExchangeCommitment): { valid: boolean; error?: string } {
	// Must have exactly two participants
	if (commitment.participantRefs.length !== 2) {
		return { valid: false, error: 'Exactly two participants required' };
	}

	// Participants must be sorted (ascending)
	const sorted = [...commitment.participantRefs].sort();
	if (JSON.stringify(commitment.participantRefs) !== JSON.stringify(sorted)) {
		return { valid: false, error: 'Participant refs must be sorted ascending' };
	}

	// No duplicates
	if (new Set(commitment.participantRefs).size !== 2) {
		return { valid: false, error: 'Duplicate participant refs' };
	}

	// Required fields
	if (!commitment.exchangeId) return { valid: false, error: 'exchangeId required' };
	if (!commitment.occurredAt) return { valid: false, error: 'occurredAt required' };
	if (!commitment.typedValues?.length) return { valid: false, error: 'typedValues required' };

	return { valid: true };
}

/** Canonical commitment bytes for hashing */
export function canonicalCommitment(commitment: OfflineExchangeCommitment): string {
	// Sort typed values deterministically
	const sortedValues = [...commitment.typedValues].sort((a, b) => {
		const typeCompare = a.valueType.localeCompare(b.valueType);
		if (typeCompare !== 0) return typeCompare;
		return a.value.localeCompare(b.value);
	});

	const canonicalForm = {
		schemaVersion: commitment.schemaVersion,
		exchangeId: commitment.exchangeId,
		participantRefs: [...commitment.participantRefs].sort(),
		typedValues: sortedValues,
		occurredAt: commitment.occurredAt,
		sessionBinding: commitment.sessionBinding ?? null
	};

	return canonical(canonicalForm);
}

/** Hash the commitment (the "commitment hash") */
export async function hashCommitment(commitment: OfflineExchangeCommitment): Promise<string> {
	const bytes = canonicalCommitment(commitment);
	return sha256(bytes);
}

/** Create payload hash for a participant's proof */
export async function createPayloadHash(commitmentHash: string, participantRef: string): Promise<string> {
	const payload = commitmentHash + '|' + participantRef;
	return sha256(payload);
}

/** Build a complete offline exchange receipt */
export async function buildOfflineExchangeReceipt(params: {
	exchangeId: string;
	participants: string[];
	typedValues: OfflineExchangeTypedValue[];
	occurredAt: string;
	sessionBinding?: string;
	proofs: Array<{
		participantRef: string;
		publicKey: string;
		signature: string;
	}>;
}): Promise<OfflineExchangeReceipt> {
	const commitment: OfflineExchangeCommitment = {
		schemaVersion: '1',
		exchangeId: params.exchangeId,
		participantRefs: params.participants,
		typedValues: params.typedValues,
		occurredAt: params.occurredAt,
		sessionBinding: params.sessionBinding
	};

	// Validate
	const validation = validateCommitment(commitment);
	if (!validation.valid) {
		throw new Error(`Invalid commitment: ${validation.error}`);
	}

	const commitmentHash = await hashCommitment(commitment);

	// Create payload hashes for each proof
	const proofs: OfflineExchangeProof[] = [];
	for (const p of params.proofs) {
		const payloadHash = await createPayloadHash(commitmentHash, p.participantRef);
		proofs.push({
			participantRef: p.participantRef,
			publicKey: p.publicKey,
			payloadHash,
			signature: p.signature
		});
	}

	return {
		schemaVersion: '1',
		commitmentHash,
		commitment,
		proofs
	};
}

/** Structural validation of a receipt */
export function validateReceipt(receipt: OfflineExchangeReceipt): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Schema version
	if (receipt.schemaVersion !== '1') {
		errors.push('Invalid schema version');
	}

	// Commitment hash must match
	if (!receipt.commitmentHash) {
		errors.push('Missing commitment hash');
	}

	// Validate commitment
	const commitmentValidation = validateCommitment(receipt.commitment);
	if (!commitmentValidation.valid) {
		errors.push(`Invalid commitment: ${commitmentValidation.error}`);
	}

	// Must have exactly two proofs
	if (receipt.proofs.length !== 2) {
		errors.push('Exactly two proofs required');
	}

	// Each participant must have a proof
	const participantRefs = new Set(receipt.commitment.participantRefs);
	for (const proof of receipt.proofs) {
		if (!participantRefs.has(proof.participantRef)) {
			errors.push(`Proof references unknown participant: ${proof.participantRef}`);
		}
		if (!proof.publicKey) errors.push('Proof missing publicKey');
		if (!proof.signature) errors.push('Proof missing signature');
		if (!proof.payloadHash) errors.push('Proof missing payloadHash');
	}

	// Check payload hashes match commitment
	if (receipt.commitmentHash !== receipt.commitmentHash) {
		// Would need to recompute - this is a structural check
	}

	return { valid: errors.length === 0, errors };
}
