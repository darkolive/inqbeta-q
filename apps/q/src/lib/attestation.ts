/*
 * Internal compliance, external verification, in the app (ADR-Q-038;
 * q-core attestation.ts), 6 October 2026.
 *
 * A reviewer or compliance officer writes an evidence report in role; it's
 * kept in their vault and travels as a link (/attest#…). An external
 * verifier, in role in their own federation, opens it, weighs it knowing the
 * author's declaration, and signs a verification that travels back the same
 * way.
 */
import { saveLocked } from '@inqbeta/q-core/folder';
import { pack } from '@inqbeta/q-core/membership';
import { writeReport, verifyReport, type EvidenceReportReceipt, type ExternalVerificationReceipt, type Finding, type Outcome } from '@inqbeta/q-core/attestation';
import type { Acting } from '@inqbeta/q-core/inrole';
import type { Identity } from '@inqbeta/q-core/passkey';

type Done<T> = { ok: true; link: string } & T;
type Failed = { ok: false; says: string };

const linkFor = (packed: string) => `${location.origin}/attest#${packed}`;
async function keep(r: EvidenceReportReceipt | ExternalVerificationReceipt) {
	const kind = r.content.schema.includes('verification') ? 'verification' : 'report';
	await saveLocked('attestation', `${r.content.at.slice(0, 19).replace(/[:T]/g, '-')}-${kind}-${r.contentHash.slice(0, 8)}.json`, JSON.stringify(r, null, 2), 'application/json');
}

/** Write a report in role, keep it, and give the link to send to a verifier. */
export async function report(identity: Identity, acting: Acting | null, o: { subject: string; finding: Finding; says: string }): Promise<Done<{ report: EvidenceReportReceipt }> | Failed> {
	if (!acting) return { ok: false, says: 'Take up your office first: a report is written for the federation.' };
	try {
		const r = await writeReport(identity, { acting, ...o });
		await keep(r);
		return { ok: true, report: r, link: linkFor(await pack(r)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Verify a report from another federation in role, keep it, and give the link to send back. */
export async function verify(identity: Identity, acting: Acting | null, r: EvidenceReportReceipt, o: { outcome: Outcome; says: string; found?: string }): Promise<Done<{ verification: ExternalVerificationReceipt }> | Failed> {
	if (!acting) return { ok: false, says: 'Take up your office as verifier first.' };
	try {
		const v = await verifyReport(identity, r, { acting, ...o });
		await keep(v);
		return { ok: true, verification: v, link: linkFor(await pack(v)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Keep a verification that came back for your report. */
export async function keepVerification(v: ExternalVerificationReceipt): Promise<void> {
	await keep(v);
}
