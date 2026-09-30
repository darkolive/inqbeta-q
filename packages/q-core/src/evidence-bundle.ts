/*
 * Evidence Bundle Format (ADR-006)
 *
 * Implements PATH A (fingerprint) and PATH B (equivalence) semantics
 * for evidence bundles.
 *
 * PATH A: deterministic fingerprint for package identity
 * PATH B: noise-tolerant equivalence for comparison/convergence
 */
import { canonical, sha256 } from './canonical';
import type { KernelReceipt } from './receipts';

/** Evidence bundle following ADR-006 */
export interface EvidenceBundle {
	/** Bundle version */
	version: '1.0';
	/** Correlation ID (parent intent) */
	correlation: string;
	/** Planned offer IDs */
	planSurface: string[];
	/** Execution receipts */
	executionEvidence: KernelReceipt[];
}

/** Bundle verification result */
export interface BundleVerification {
	valid: boolean;
	errors: string[];
}

/**
 * PATH A: Create deterministic fingerprint
 *
 * This is the "bundle-as-provided" identity surface.
 * Used for: package identity, anchoring, stable hashes
 */
export async function fingerprintBundle(bundle: EvidenceBundle): Promise<string> {
	// Canonical form for PATH A
	const canonicalForm = {
		correlation: bundle.correlation,
		planSurface: [...bundle.planSurface].sort(), // Deterministic ordering
		executionEvidence: bundle.executionEvidence.map((e) => ({
			receiptId: e.hash,
			type: e.type,
			subject: e.subject,
			previous: e.previous,
			canonical: e.canonical,
			createdAt: e.createdAt
		}))
	};

	const bytes = canonical(canonicalForm);
	return sha256(bytes);
}

/**
 * PATH B: Create equivalence canonical form
 *
 * This is the noise-tolerant comparison surface.
 * Used for: diff, convergence reporting
 */
export function canonicalForEquivalence(bundle: EvidenceBundle): string {
	// Collapse duplicates by receipt ID, keep lexicographically smallest
	const byReceiptId = new Map<string, KernelReceipt>();
	for (const receipt of bundle.executionEvidence) {
		const existing = byReceiptId.get(receipt.hash);
		if (!existing) {
			byReceiptId.set(receipt.hash, receipt);
		} else {
			// Keep lexicographically smallest
			const existingBytes = canonical(existing);
			const newBytes = canonical(receipt);
			if (newBytes < existingBytes) {
				byReceiptId.set(receipt.hash, receipt);
			}
		}
	}

	// Canonical form for PATH B
	const canonicalForm = {
		correlation: bundle.correlation,
		planSurface: [...bundle.planSurface].sort(),
		executionEvidence: Array.from(byReceiptId.values())
			.map((e) => ({
				receiptId: e.hash,
				type: e.type,
				subject: e.subject,
				previous: e.previous,
				canonical: e.canonical,
				createdAt: e.createdAt
			}))
			.sort((a, b) => a.receiptId.localeCompare(b.receiptId))
	};

	return canonical(canonicalForm);
}

/**
 * Check if two bundles are equivalent under PATH B
 */
export async function areEquivalent(bundleA: EvidenceBundle, bundleB: EvidenceBundle): Promise<boolean> {
	const canonicalA = canonicalForEquivalence(bundleA);
	const canonicalB = canonicalForEquivalence(bundleB);
	return canonicalA === canonicalB;
}

/**
 * Verify bundle structural validity
 */
export function verifyBundle(bundle: EvidenceBundle): BundleVerification {
	const errors: string[] = [];

	// Check required fields
	if (!bundle.correlation) {
		errors.push('Missing correlation field');
	}

	if (!Array.isArray(bundle.executionEvidence)) {
		errors.push('executionEvidence must be an array');
	}

	// Check for duplicate receipt IDs that undermine uniqueness
	const receiptIds = bundle.executionEvidence.map((e) => e.hash);
	const uniqueIds = new Set(receiptIds);
	if (uniqueIds.size !== receiptIds.length) {
		errors.push('Duplicate receipt IDs undermine uniqueness');
	}

	// Check plan surface has no duplicates
	if (bundle.planSurface) {
		const planIds = bundle.planSurface;
		const uniquePlans = new Set(planIds);
		if (uniquePlans.size !== planIds.length) {
			errors.push('Duplicate planned offer IDs');
		}
	}

	// Check receipt chain integrity
	for (const receipt of bundle.executionEvidence) {
		if (!receipt.hash) {
			errors.push('Receipt missing hash');
		}
		if (!receipt.subject) {
			errors.push('Receipt missing subject');
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

/**
 * Check if bundle is canonical (valid + no noise)
 */
export function isCanonical(bundle: EvidenceBundle): boolean {
	const verification = verifyBundle(bundle);
	if (!verification.valid) return false;

	// No orphan receipts (all referenced in planSurface)
	const receiptSubjects = new Set(bundle.executionEvidence.map((e) => e.subject));
	const orphanReceipts = bundle.executionEvidence.filter((e) => !receiptSubjects.has(e.subject));

	return orphanReceipts.length === 0;
}
