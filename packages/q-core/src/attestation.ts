/*
 * Internal compliance, external verification (ADR-Q-038, 6 October 2026).
 *
 * Darren: "you can have someone internally that does a compliance check …
 * their declaration would be that they are employed by the company
 * themselves. So they are going to have a conflict … but that does not mean
 * that they cannot act responsibly, do their job diligently, and sign it off.
 * … an external verifier would just need to look at the evidence report
 * produced by the compliance person, know that they are an employee, so does
 * the report suggest any conflict or bias, and if not, accept the report as a
 * good and honest answer. That's amazing empowerment for everybody."
 *
 *   evidence report          signed in role by a reviewer or compliance
 *                            officer: what was checked, the finding, the
 *                            evidence it rests on. It carries their acting
 *                            (office, mandates, take-up with its declaration).
 *   external verification    signed in role by a verifier of ANOTHER
 *                            federation, with their own declaration: it names
 *                            the report, copies the author's declaration word
 *                            for word (what they weighed), and says accepted,
 *                            accepted with notes, or not accepted, naming the
 *                            bias or gap.
 *
 * Pure: no storage, no window.
 */
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import type { Identity } from './passkey';
import { actingCovers, type Acting } from './inrole';
import { OFFICE_COMMANDS } from './offices';

export const EVIDENCE_REPORT_SCHEMA = 'inqbeta.evidence-report/1';
export const EXTERNAL_VERIFICATION_SCHEMA = 'inqbeta.external-verification/1';
export const ASSURANCE_SOURCE = 'inqbeta:q/assurance';

export type Finding = 'meets' | 'meets-with-notes' | 'does-not-meet';
export const FINDINGS: { id: Finding; called: string }[] = [
	{ id: 'meets', called: 'Meets what it should' },
	{ id: 'meets-with-notes', called: 'Meets it, with notes' },
	{ id: 'does-not-meet', called: 'Doesn’t meet it' }
];
export type Outcome = 'accepted' | 'accepted-with-notes' | 'not-accepted';
export const OUTCOMES: { id: Outcome; called: string }[] = [
	{ id: 'accepted', called: 'Accepted: a good and honest answer' },
	{ id: 'accepted-with-notes', called: 'Accepted, with notes' },
	{ id: 'not-accepted', called: 'Not accepted' }
];

/** Which offices write reports, and the command each needs. */
const REPORTERS: Record<string, string> = { reviewer: `${OFFICE_COMMANDS.review}/report`, compliance: `${OFFICE_COMMANDS.compliance}/report`, caretaker: `${OFFICE_COMMANDS.compliance}/report` };

export interface EvidenceReport {
	schema: typeof EVIDENCE_REPORT_SCHEMA;
	source: typeof ASSURANCE_SOURCE;
	federation: string;
	/** What was checked, in a few words. */
	subject: string;
	finding: Finding;
	/** The report itself, in plain words. */
	says: string;
	/** The receipts it rests on, by content hash. */
	evidence: string[];
	/** Who wrote it, in which office, with their declaration. */
	acting: Acting;
	at: string;
}
export type EvidenceReportReceipt = SealedReceipt & { content: EvidenceReport };

export interface ExternalVerification {
	schema: typeof EXTERNAL_VERIFICATION_SCHEMA;
	source: typeof ASSURANCE_SOURCE;
	/** The report, by content hash, and whose it is. */
	report: string;
	reportFederation: string;
	/** The author's declaration, word for word: what the verifier weighed. */
	authorDeclared: string;
	outcome: Outcome;
	/** Bias, conflict or gaps found; required when not accepted. */
	found?: string;
	says: string;
	/** The verifier, acting as verifier of their own federation, with their own declaration. */
	acting: Acting;
	at: string;
}
export type ExternalVerificationReceipt = SealedReceipt & { content: ExternalVerification };

type Signing = Pick<Identity, 'did' | 'publicKey' | 'signing'>;
type Check = { ok: true; says: string } | { ok: false; says: string };

/** Write an evidence report, in role. Throws, in plain words, on anything missing. */
export async function writeReport(identity: Signing, o: { acting: Acting; subject: string; finding: Finding; says: string; evidence?: string[] }, now = new Date()): Promise<EvidenceReportReceipt> {
	if (!o.subject.trim()) throw new Error('Say what was checked.');
	if (!o.says.trim()) throw new Error('Write what you found.');
	if (!FINDINGS.some((f) => f.id === o.finding)) throw new Error('Choose a finding.');
	const content: EvidenceReport = {
		schema: EVIDENCE_REPORT_SCHEMA,
		source: ASSURANCE_SOURCE,
		federation: o.acting.federation,
		subject: o.subject.trim(),
		finding: o.finding,
		says: o.says.trim(),
		evidence: [...(o.evidence ?? [])],
		acting: o.acting,
		at: now.toISOString()
	};
	const r = (await sealWith(identity, content)) as EvidenceReportReceipt;
	const c = await checkReport(r, { now });
	if (!c.ok) throw new Error(c.says);
	return r;
}

/** Does a report hold: signed, written in an office that may report, with a declaration? */
export async function checkReport(x: unknown, o: { now?: Date; revoked?: Set<string> } = {}): Promise<Check> {
	const r = x as EvidenceReportReceipt;
	const c = r?.content;
	if (c?.schema !== EVIDENCE_REPORT_SCHEMA) return { ok: false, says: 'This isn’t an evidence report.' };
	if (!(await checkReceipt(r)).ok) return { ok: false, says: 'The report isn’t signed by who it says.' };
	const cmd = REPORTERS[c.acting?.office ?? ''];
	if (!cmd) return { ok: false, says: 'Reports are written by a reviewer or a compliance officer.' };
	const a = await actingCovers(r.did, c.acting, { federation: c.federation, cmd, now: o.now ?? new Date(c.at), revoked: o.revoked });
	if (!a.ok) return { ok: false, says: a.says };
	return { ok: true, says: `Written by its ${c.acting.office === 'compliance' ? 'compliance officer' : c.acting.office}, in role${a.interest ? `, with an interest declared: ${a.interest}` : ', with no conflict of interest declared'}.` };
}

/** What the author declared when they took up the office, word for word. */
export const declaredBy = (r: EvidenceReportReceipt): string => r.content.acting.takenUp.content.words ?? '';

/** Verify a report from outside, in role as verifier of another federation. */
export async function verifyReport(
	identity: Signing,
	report: EvidenceReportReceipt,
	o: { acting: Acting; outcome: Outcome; says: string; found?: string },
	now = new Date()
): Promise<ExternalVerificationReceipt> {
	const r = await checkReport(report);
	if (!r.ok) throw new Error(`The report doesn’t hold: ${r.says}`);
	if (o.acting.federation === report.content.federation) throw new Error('An external verifier comes from another federation.');
	if (!OUTCOMES.some((x) => x.id === o.outcome)) throw new Error('Choose an outcome.');
	if (!o.says.trim()) throw new Error('Say what you weighed.');
	if (o.outcome !== 'accepted' && !o.found?.trim()) throw new Error('Say what you found: the bias, conflict or gap.');
	const content: ExternalVerification = {
		schema: EXTERNAL_VERIFICATION_SCHEMA,
		source: ASSURANCE_SOURCE,
		report: report.contentHash,
		reportFederation: report.content.federation,
		authorDeclared: declaredBy(report),
		outcome: o.outcome,
		...(o.found?.trim() ? { found: o.found.trim() } : {}),
		says: o.says.trim(),
		acting: o.acting,
		at: now.toISOString()
	};
	const v = (await sealWith(identity, content)) as ExternalVerificationReceipt;
	const c = await checkVerification(v, report, { now });
	if (!c.ok) throw new Error(c.says);
	return v;
}

/** Does a verification hold, for this report: signed, by a verifier of another federation in role, having weighed the author's declaration? */
export async function checkVerification(x: unknown, report: EvidenceReportReceipt, o: { now?: Date; revoked?: Set<string> } = {}): Promise<Check> {
	const v = x as ExternalVerificationReceipt;
	const c = v?.content;
	if (c?.schema !== EXTERNAL_VERIFICATION_SCHEMA) return { ok: false, says: 'This isn’t an external verification.' };
	if (!(await checkReceipt(v)).ok) return { ok: false, says: 'The verification isn’t signed by who it says.' };
	if (c.report !== report.contentHash || c.reportFederation !== report.content.federation) return { ok: false, says: 'It verifies a different report.' };
	if (c.acting?.federation === report.content.federation) return { ok: false, says: 'The verifier is from the same federation: it isn’t external.' };
	if (c.authorDeclared !== declaredBy(report)) return { ok: false, says: 'It doesn’t carry what the author declared, word for word.' };
	if (c.outcome !== 'accepted' && !c.found?.trim()) return { ok: false, says: 'It doesn’t say what was found.' };
	const a = await actingCovers(v.did, c.acting, { federation: c.acting?.federation ?? '', cmd: `${OFFICE_COMMANDS.verify}/report`, now: o.now ?? new Date(c.at), revoked: o.revoked });
	if (!a.ok) return { ok: false, says: a.says };
	return { ok: true, says: `${OUTCOMES.find((x) => x.id === c.outcome)!.called}, by an external verifier${a.interest ? ` who declared an interest: ${a.interest}` : ' with no conflict of interest declared'}.` };
}
