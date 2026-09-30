/*
 * DoStudy — course evidence capture. The first feature pack.
 *
 * Recognises what DoStudy saves: course receipts (bundles of a signed chain),
 * founding records, membership credentials, reads, and sealed notes. Knows the
 * shapes by their schema names only; nothing is imported from DoStudy itself.
 */
import type { Feature, Found } from './registry';

type Receipt = {
	schema?: string;
	courseId?: string;
	event?: string;
	at?: string;
	author?: { name?: string; organisation?: string };
	body?: { unit?: { title?: string; aim?: string; level?: number }; schema?: string; forWhom?: string } & Record<string, unknown>;
};

const EVENTS: Record<string, { text: string; tone: NonNullable<Found['status']>['tone'] }> = {
	'course.drafted': { text: 'Draft', tone: 'waiting' },
	'course.named': { text: 'Named', tone: 'plain' },
	'course.revised': { text: 'Revised', tone: 'plain' },
	'course.submitted': { text: 'Sent for review', tone: 'needs-you' },
	'review.opened': { text: 'In review', tone: 'needs-you' },
	'review.noted': { text: 'Noted', tone: 'plain' },
	'review.resolved': { text: 'Reviewed', tone: 'good' }
};

const day = (iso?: string) =>
	iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const dostudy: Feature = {
	id: 'dostudy',
	federation: 'DoStudy',
	title: 'Courses',
	description: 'Courses you have written, named, sent for review or read — the evidence DoStudy captures.',
	icon: 'courses',
	href: '/f/dostudy',
	recognise(json, item) {
		if (!json || typeof json !== 'object') return null;
		const o = json as Record<string, unknown>;
		const out: Found[] = [];
		const base = { feature: 'dostudy', item };

		if (o.schema === 'dostudy.read/2') {
			const r = o as { courseId?: string; by?: string; at?: string; standing?: string; reactions?: unknown[] };
			out.push({
				...base,
				kind: 'read',
				key: `read:${item.diskPath}`,
				title: `Read by ${r.by ?? 'someone'}`,
				meta: `${r.standing === 'reviewer' ? 'Review' : 'Colleague read'} · ${r.reactions?.length ?? 0} reactions · ${day(r.at)}`,
				at: r.at ?? '',
				status: { text: 'Read', tone: 'plain' }
			});
			return out;
		}

		const chain: Receipt[] = Array.isArray(o.chain)
			? (o.chain as Receipt[])
			: o.schema === 'dostudy.receipt/1'
				? [o as Receipt]
				: Array.isArray(json) && (json as Receipt[])[0]?.schema === 'dostudy.receipt/1'
					? (json as Receipt[])
					: [];

		const genesis = o.genesis as { schema?: string; name?: string; purpose?: string; foundedAt?: string; founder?: { name?: string }; federationId?: string } | undefined;
		if (genesis?.schema === 'dostudy.genesis/1') {
			out.push({
				...base,
				kind: 'federation',
				key: `federation:${genesis.federationId ?? genesis.name}`,
				title: genesis.name ?? 'A federation',
				description: genesis.purpose,
				meta: `Founded by ${genesis.founder?.name ?? 'someone'} · ${day(genesis.foundedAt)}`,
				at: genesis.foundedAt ?? '',
				status: { text: 'Founded', tone: 'good' }
			});
		}
		const cred = o.credential as { schema?: string; name?: string; status?: string; roles?: string[]; issuer?: { name?: string }; asAt?: string; goodUntil?: string } | undefined;
		if (cred?.schema === 'dostudy.credential/1') {
			const stale = cred.goodUntil ? cred.goodUntil < new Date().toISOString() : false;
			out.push({
				...base,
				kind: 'membership',
				key: `membership:${cred.issuer?.name}:${cred.name}`,
				title: cred.issuer?.name ?? 'A federation',
				description: `${cred.name ?? 'A member'} — ${(cred.roles ?? []).join(', ') || 'member'}`,
				meta: `As at ${day(cred.asAt)}${cred.goodUntil ? ` · good until ${day(cred.goodUntil)}` : ''}`,
				at: cred.asAt ?? '',
				status: stale ? { text: 'Out of date', tone: 'waiting' } : { text: cred.status ?? 'Member', tone: 'good' }
			});
		}

		if (chain.length) {
			const last = chain[chain.length - 1];
			const withUnit = [...chain].reverse().find((r) => r.body?.unit);
			const sealed = !!last.body && typeof last.body === 'object' && last.body.schema === 'dostudy.sealed/1';
			const unit = withUnit?.body?.unit;
			const isNote = !unit && (last.event === 'review.noted' || sealed);
			const ev = EVENTS[last.event ?? ''] ?? { text: last.event ?? 'Recorded', tone: 'plain' as const };
			out.push({
				...base,
				kind: isNote ? 'note' : 'course',
				key: isNote ? `note:${item.diskPath}` : `course:${last.courseId}`,
				title: unit?.title ?? (isNote ? 'A sealed note' : 'A course record'),
				description: unit?.aim ?? (sealed ? `Sealed for ${last.body?.forWhom ?? 'named people'}.` : undefined),
				meta: [
					unit?.level ? `Level ${unit.level}` : '',
					last.author?.name ? `by ${last.author.name}${last.author.organisation ? `, ${last.author.organisation}` : ''}` : '',
					`${chain.length} step${chain.length === 1 ? '' : 's'}`,
					day(last.at)
				]
					.filter(Boolean)
					.join(' · '),
				at: last.at ?? '',
				status: sealed ? { text: 'Sealed', tone: 'plain' } : ev
			});
		}
		return out.length ? out : null;
	}
};

/** Several files about one course (drafts, revisions) become one entry: the newest. */
export function newestPerKey(found: Found[]): Found[] {
	const by = new Map<string, Found>();
	for (const f of found) {
		const prev = by.get(f.key);
		if (!prev || f.at > prev.at) by.set(f.key, f);
	}
	return [...by.values()].sort((a, b) => b.at.localeCompare(a.at));
}
