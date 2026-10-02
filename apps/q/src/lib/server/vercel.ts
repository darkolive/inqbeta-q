/*
 * Sending a key from this computer to the live site on Vercel (ADR-Q-018 §5).
 * Development only: called by routes/api/host/vercel, with the token, project
 * and team from this computer's .env. Nothing here runs on Vercel.
 *
 * Vercel's API (checked 2 October 2026):
 *   GET   /v10/projects/{project}/env        the settings it has (names, types, targets)
 *   PATCH /v9/projects/{project}/env/{id}    change one, keeping its type and targets
 *   POST  /v10/projects/{project}/env        add one
 * A secret is added as 'sensitive': Vercel can't show it back, even to us.
 * Sensitive settings can only target production and preview.
 */
export interface VercelPlace {
	token: string;
	project: string;
	/** A team id (team_…) or slug, when the project belongs to a team. */
	team?: string;
}
export interface VercelSetting {
	id: string;
	key: string;
	type: string;
	target: string[];
	updatedAt?: number;
}

const API = 'https://api.vercel.com';

function query(p: VercelPlace): string {
	if (!p.team) return '';
	return p.team.startsWith('team_') ? `?teamId=${encodeURIComponent(p.team)}` : `?slug=${encodeURIComponent(p.team)}`;
}

async function ask<T>(p: VercelPlace, method: string, path: string, body?: unknown): Promise<T> {
	const r = await fetch(`${API}${path}${query(p)}`, {
		method,
		headers: { authorization: `Bearer ${p.token}`, 'content-type': 'application/json' },
		...(body === undefined ? {} : { body: JSON.stringify(body) })
	});
	if (r.status === 401 || r.status === 403) throw new Error('Vercel said no. Check the token, and that it can reach this project.');
	if (r.status === 404) throw new Error(`Vercel can’t find a project called “${p.project}”.`);
	if (!r.ok) {
		const said = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
		throw new Error(said?.error?.message ?? `Vercel answered ${r.status}.`);
	}
	return (await r.json()) as T;
}

/** The settings the live site has: names and where they apply. Never their values. */
export async function vercelSettings(p: VercelPlace): Promise<VercelSetting[]> {
	const got = await ask<{ envs?: VercelSetting[] }>(p, 'GET', `/v10/projects/${encodeURIComponent(p.project)}/env`);
	return (got.envs ?? []).map((e) => ({ id: e.id, key: e.key, type: e.type, target: Array.isArray(e.target) ? e.target : [String(e.target)], updatedAt: e.updatedAt }));
}

/**
 * Send one setting. Every existing entry for it that the live site or its
 * previews use is changed in place; if there's none, one is added for both.
 * Returns how many places on Vercel now hold it.
 */
export async function sendToVercel(p: VercelPlace, key: string, value: string, secret: boolean): Promise<number> {
	const live = (await vercelSettings(p)).filter((e) => e.key === key && e.target.some((t) => t === 'production' || t === 'preview'));
	const base = `/v9/projects/${encodeURIComponent(p.project)}/env`;
	for (const e of live) await ask(p, 'PATCH', `${base}/${encodeURIComponent(e.id)}`, { value });
	if (live.length) return live.length;
	await ask(p, 'POST', `/v10/projects/${encodeURIComponent(p.project)}/env`, {
		key,
		value,
		type: secret ? 'sensitive' : 'encrypted',
		target: ['production', 'preview'],
		comment: 'Sent from the founder’s own computer by Q (ADR-Q-018).'
	});
	return 1;
}
