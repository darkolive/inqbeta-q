/*
 * Components — the code a block may use, and the manifest that says what that
 * code is allowed to do.
 *
 * ADR-Q-006 (25 September 2026). Darren: "if there's code involved, it becomes
 * a component that lives in the library. But a block can contain a component."
 *
 * THREE LAYERS, ONE RULE EACH.
 *
 *   component   Code. Lives in a library, is written and checked once, and
 *               every version is its own receipt. This file does not hold
 *               code; it holds the MANIFEST that describes it.
 *   manifest    What the code may touch, what it promises, how it must behave
 *               for people, and what can be changed about it — asked as
 *               questions, like every other setting in Q.
 *   block       Data only. Names a component PINNED to one version
 *               (`q:sign-in@1.0.0`) and carries answers to its questions.
 *               It never carries code, so blocks.ts's no-behaviour rule stands.
 *
 * Where this comes from: the incubator's plugin manifests (docs/plugins in the
 * inQbeta repo) — declared capabilities, required declarations, proposed →
 * approved → activated → revoked. What it adds is the part the incubator never
 * reached: code that draws on somebody's screen, next to their passkey.
 *
 * AI-READABLE ON PURPOSE. Darren, 2026-09-25: "always keep it AI readable,
 * because this is where the models can help build these more beautifully."
 * So every field is plain words or a closed list, every closed list says what
 * each entry MEANS, the checker answers in sentences and reports everything
 * wrong at once, and describeComponent() turns a manifest into the brief a
 * person or a model reads before touching the code. A model restyling a
 * component reads `design` and `access` and must keep both true.
 *
 * Pure. No rendering, no fetching. q-core says what exists; apps draw it.
 */
import { QUESTION_SET_SCHEMA, checkSet, type QuestionSet } from './questions';
import { behaviourIn } from './behaviour';

export const COMPONENT_SCHEMA = 'inqbeta.component/1';

/**
 * How far a component is trusted.
 *
 *   core      Written by Q itself. The only tier that may touch identity, the
 *             vault, or keys — because it sits next to the passkey.
 *   approved  Written by anybody, approved by a federation's governance. Runs
 *             sandboxed (ADR-Q-006 step 4 — not built yet, so for now there
 *             are none), and may only touch what its manifest declares.
 *   draft     Being written. Can be previewed; can never be put on a page.
 */
export type Tier = 'core' | 'approved' | 'draft';
export const TIERS: { id: Tier; means: string }[] = [
	{ id: 'core', means: 'Written by Q itself. The only tier that may touch identity, the vault or keys.' },
	{ id: 'approved', means: 'Approved by a federation. Runs sandboxed and may only touch what it declares.' },
	{ id: 'draft', means: 'Being written. Can be previewed, never put on a page.' }
];

/** Where a component can run. `q` is Q itself; `site` is a published site page. */
export type Where = 'q' | 'site';
export const WHERE: { id: Where; means: string }[] = [
	{ id: 'q', means: 'Inside Q — the dashboard, Write, the Q window.' },
	{ id: 'site', means: 'On a published site page, for its visitors.' }
];

/**
 * What a component may reach. CLOSED, like the block vocabulary.
 *
 * Every entry says what it means in one sentence a person would accept or
 * refuse. `coreOnly` entries sit next to the passkey and can never be granted
 * to anything a federation approved. There is deliberately no network touch:
 * a component that needs one gets its own entry, argued for here.
 */
export const TOUCHES = [
	{ id: 'identity.passkey', coreOnly: true, means: 'Asks for a passkey and signs the person in.' },
	{ id: 'identity.who', coreOnly: false, means: 'Knows who is signed in — their DID, and nothing else about them.' },
	{ id: 'vault.open', coreOnly: true, means: 'Opens the person’s vault once they have signed in.' },
	{ id: 'vault.restore', coreOnly: true, means: 'Brings a backup the person chooses into their vault.' },
	{ id: 'keys.manage', coreOnly: true, means: 'Adds or removes ways back in: passkeys, security keys, the recovery card.' },
	{ id: 'receipts.read', coreOnly: false, means: 'Reads receipts of the kinds it names, when the person allows.' },
	{ id: 'receipts.write', coreOnly: false, means: 'Makes new receipts, each one signed by the person as they act.' },
	{ id: 'answers.read', coreOnly: false, means: 'Reads answers to the questions it names, when the person allows.' },
	{ id: 'pictures.show', coreOnly: false, means: 'Shows pictures held in the vault or on the site.' },
	{ id: 'navigate', coreOnly: false, means: 'Takes the person to another page, in Q or on the same site.' }
] as const;
export type Touch = (typeof TOUCHES)[number]['id'];
const TOUCH_BY_ID = new Map<string, (typeof TOUCHES)[number]>(TOUCHES.map((t) => [t.id, t]));

/**
 * A promise the component makes, in plain words. The incubator called these
 * required declarations: a person installing or approving a component reads
 * each one, and a model changing the code must keep each one true.
 */
export interface Commitment {
	/** `passkey-first` — stable, so an approval can cite it. */
	id: string;
	/** Short. */
	title: string;
	/** One or two sentences, no jargon. */
	text: string;
}

/**
 * How it must behave for people. Required, not advice: the checker refuses a
 * manifest that does not commit to the first three, and to targets at least
 * as big as MIN_TARGET.
 */
export interface Access {
	/** Everything it does can be done from the keyboard, with a visible focus. */
	keyboard: boolean;
	/** Every icon has a word with it. Never a picture alone. */
	labelledIcons: boolean;
	/** Nothing moves for people who have asked for less motion. */
	reducedMotion: boolean;
	/** The smallest thing a person has to press, in CSS pixels. */
	minTarget: number;
	/** Anything else it commits to, one line each. */
	notes?: string[];
}

/** WCAG 2.5.5 (AAA) target size. Neurodivergent-friendly means the generous one. */
export const MIN_TARGET = 44;

export interface ComponentManifest {
	schema: typeof COMPONENT_SCHEMA;
	/** `q:sign-in` — a prefix for who it is from, then what it is. */
	id: string;
	/** Semantic version. A block pins exactly one. */
	version: string;
	/** What it is called on a palette. */
	called: string;
	/** One line: what somebody choosing it gets. */
	does: string;
	/** A few sentences for people and models: what it is for, and how it feels to use. */
	about: string;
	tier: Tier;
	/** Who wrote it: `q:core`, or the author's DID. */
	by: string;
	runsOn: Where[];
	touches: Touch[];
	promises: Commitment[];
	access: Access;
	/**
	 * The design brief, one rule per line. What a model restyling it must keep:
	 * layout, hierarchy, tone, which Skeleton presets. Not decoration — the
	 * reason the component looks the way it does.
	 */
	design: string[];
	/** What can be changed about it, asked as questions. Ids start with the component's own id. */
	settings: QuestionSet;
	/** Where the code is. `hash` is filled at release, and a published page pins it. */
	code?: { module: string; hash?: string };
}

export interface ComponentCheck {
	ok: boolean;
	/** One line summary. */
	says: string;
	/** Everything wrong, each a sentence — all of it, not the first. */
	wrong: string[];
}

const ID = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const HASH = /^sha256-[0-9a-f]{64}$/;

export function checkComponentManifest(input: unknown): ComponentCheck {
	const m = (input ?? {}) as Record<string, unknown>;
	const wrong: string[] = [];
	const text = (k: string) => typeof m[k] === 'string' && (m[k] as string).trim().length > 0;

	const refused = behaviourIn(m);
	if (refused.length) wrong.push(`A manifest describes code; it cannot carry any. Remove: ${refused.join(', ')}.`);
	if (m.schema !== COMPONENT_SCHEMA) wrong.push(`This is not a component manifest (schema should be “${COMPONENT_SCHEMA}”).`);
	if (typeof m.id !== 'string' || !ID.test(m.id)) wrong.push('The id should be who it is from, then what it is — like “q:sign-in”.');
	if (typeof m.version !== 'string' || !SEMVER.test(m.version)) wrong.push('The version should be three numbers, like “1.0.0”.');
	for (const k of ['called', 'does', 'about', 'by'] as const) if (!text(k)) wrong.push(`It has to say ${k === 'by' ? 'who wrote it' : `what it is ${k === 'called' ? 'called' : k === 'does' ? 'for, in one line' : 'about'}`}.`);

	const tier = m.tier as Tier;
	if (!TIERS.some((t) => t.id === tier)) wrong.push('The tier should be core, approved or draft.');
	if (tier === 'core' && m.by !== 'q:core') wrong.push('Only Q itself writes core components (by: “q:core”).');
	if (tier !== 'core' && m.by === 'q:core') wrong.push('Something Q wrote is core, not approved or draft.');

	const runsOn = Array.isArray(m.runsOn) ? m.runsOn : [];
	if (!runsOn.length || runsOn.some((w) => !WHERE.some((x) => x.id === w))) wrong.push('Say where it runs: in Q, on a site, or both.');

	const touches = Array.isArray(m.touches) ? (m.touches as string[]) : null;
	if (!touches) wrong.push('Say what it touches — an empty list if nothing.');
	for (const t of touches ?? []) {
		const known = TOUCH_BY_ID.get(t);
		if (!known) wrong.push(`There is nothing called “${t}” for it to touch.`);
		else if (known.coreOnly && tier !== 'core') wrong.push(`Only Q’s own components may touch ${t}: ${known.means.toLowerCase()}`);
	}
	if (touches?.some((t) => TOUCH_BY_ID.get(t)?.coreOnly) && runsOn.includes('site')) {
		wrong.push('Something that touches identity, the vault or keys runs in Q, never on a site page.');
	}

	const promises = Array.isArray(m.promises) ? (m.promises as Record<string, unknown>[]) : [];
	if (!promises.length) wrong.push('It has to promise something a person can check.');
	for (const p of promises) {
		if (typeof p.id !== 'string' || !/^[a-z0-9-]+$/.test(p.id) || typeof p.title !== 'string' || typeof p.text !== 'string' || !p.text.trim()) {
			wrong.push('Each promise needs an id (lower-case, dashes), a title and a sentence.');
		}
	}

	const a = (m.access ?? {}) as Partial<Access>;
	if (a.keyboard !== true) wrong.push('Everything it does has to work from the keyboard.');
	if (a.labelledIcons !== true) wrong.push('Every icon needs a word with it.');
	if (a.reducedMotion !== true) wrong.push('It has to keep still for people who ask for less motion.');
	if (typeof a.minTarget !== 'number' || a.minTarget < MIN_TARGET) wrong.push(`Things to press must be at least ${MIN_TARGET}px.`);

	if (!Array.isArray(m.design) || !m.design.length || m.design.some((d) => typeof d !== 'string' || !d.trim())) {
		wrong.push('Give the design brief, one rule per line — it is what a model restyling it must keep.');
	}

	const settings = m.settings as QuestionSet | undefined;
	if (!settings || settings.schema !== QUESTION_SET_SCHEMA || !Array.isArray(settings.questions)) {
		wrong.push('Say what can be changed about it, as a question set (it may be empty).');
	} else {
		if (settings.questions.length) {
			const set = checkSet(settings);
			if (!set.ok) wrong.push(...set.says);
		}
		for (const q of settings.questions) {
			const bad = behaviourIn(q as unknown as Record<string, unknown>);
			if (bad.length) wrong.push(`The setting ${q.id} carries something that runs: ${bad.join(', ')}.`);
			if (typeof m.id === 'string' && !q.id.startsWith(`${m.id}/`)) wrong.push(`The setting ${q.id} should start with “${m.id}/”, so it cannot be mistaken for anybody else’s.`);
		}
	}

	const code = m.code as { module?: unknown; hash?: unknown } | undefined;
	if (tier !== 'draft' && (!code || typeof code.module !== 'string' || !code.module.trim())) wrong.push('Say where the code is.');
	if (code?.hash !== undefined && (typeof code.hash !== 'string' || !HASH.test(code.hash))) wrong.push('The code hash should look like “sha256-” and 64 hex characters.');

	return wrong.length
		? { ok: false, says: `${wrong.length} ${wrong.length === 1 ? 'thing needs' : 'things need'} attention.`, wrong }
		: { ok: true, says: 'This manifest says plainly what the code may do.', wrong: [] };
}

/** `q:sign-in@1.0.0` → its parts. What a block carries, so the pin is one string. */
export function pinOf(s: unknown): { id: string; version: string } | null {
	if (typeof s !== 'string') return null;
	const at = s.lastIndexOf('@');
	if (at <= 0) return null;
	const id = s.slice(0, at);
	const version = s.slice(at + 1);
	return ID.test(id) && SEMVER.test(version) ? { id, version } : null;
}

export const pin = (m: Pick<ComponentManifest, 'id' | 'version'>) => `${m.id}@${m.version}`;

/* ------------------------------------------------------------------ *
 * The core library — components Q itself wrote.
 * ------------------------------------------------------------------ */

export const SIGN_IN: ComponentManifest = {
	schema: COMPONENT_SCHEMA,
	id: 'q:sign-in',
	version: '1.0.0',
	called: 'Sign in',
	does: 'The front door: a picture, a heading, where your passkey is, and one big button.',
	about:
		'Signs a person into Q with their passkey, or makes their first one. It asks one question — where is your passkey? — with three large pictures to answer it, then offers one big button. Quiet second choices sit underneath: first time, and lost key. It is calm by design: short words, nothing moving unless something is happening, and nothing that changes the layout between choices.',
	tier: 'core',
	by: 'q:core',
	runsOn: ['q'],
	touches: ['identity.passkey', 'vault.open', 'vault.restore', 'navigate'],
	promises: [
		{ id: 'passkey-first', title: 'The passkey comes first', text: 'Nothing happens before the passkey, so there is always a DID to hash from. Opening a vault from a backup comes after it.' },
		{ id: 'nothing-kept', title: 'Nothing is kept by us', text: 'Keys and the DID are rebuilt from the passkey every time. Nothing about the person is stored or sent anywhere.' },
		{ id: 'asks-nobody', title: 'It asks nobody', text: 'Signing in fetches nothing and contacts no server. It is between the person and their own device.' }
	],
	access: {
		keyboard: true,
		labelledIcons: true,
		reducedMotion: true,
		minTarget: 44,
		notes: [
			'One question on screen at a time.',
			'The choice of where the passkey is is a real radio group, so a screen reader hears “1 of 3”.',
			'Anything that goes wrong is said once, in one plain box, as it happens.'
		]
	},
	design: [
		'Top to bottom: picture, heading, one sentence; then the question; then the big button; then the quiet choices.',
		'Where is your passkey? Three square tiles in a row — This device, Key, Phone — each a bold icon with one word under it. The chosen one is filled.',
		'One hint line under the tiles, never more.',
		'One large round primary button. Its icon shows what the person is about to touch: a fingerprint, a key or a phone; a plus when making a first key.',
		'The word under the big button says what happens: Sign in, Make my key, or Touch it now while waiting.',
		'Second choices are tonal buttons, side by side, the same size as each other, with an icon and a word.',
		'Bold icons: Lucide geometry at a heavier stroke (2.25–3). Never an icon without a word.',
		'Styling only from Skeleton presets and theme tokens — no colours of our own.',
		'Only the waiting button moves (a gentle pulse), and not at all for reduced motion.'
	],
	settings: {
		schema: QUESTION_SET_SCHEMA,
		id: 'q/component-sign-in',
		title: { 'en-GB': 'Sign in' },
		questions: [
			{ id: 'q:sign-in/title', answer: 'text', asks: { 'en-GB': 'The heading' }, optional: true },
			{ id: 'q:sign-in/line', answer: 'longtext', asks: { 'en-GB': 'One sentence under it' }, optional: true },
			{ id: 'q:sign-in/logo', answer: 'text', asks: { 'en-GB': 'The picture at the top' }, optional: true }
		]
	},
	code: { module: 'apps/q/src/lib/components/SignInBlock.svelte' }
};

/** Every component Q itself ships. Approved ones come from a federation, passed in. */
export const CORE_COMPONENTS: ComponentManifest[] = [SIGN_IN];

/**
 * The manifest a pin names, from the library given.
 *
 * Exact versions only. A page keeps the version it was made with until
 * somebody chooses to move it — an update never changes a page quietly.
 */
export function findComponent(pinned: unknown, library: ComponentManifest[] = CORE_COMPONENTS): ComponentManifest | null {
	const p = pinOf(pinned);
	if (!p) return null;
	return library.find((m) => m.id === p.id && m.version === p.version) ?? null;
}

/**
 * Whether a block's answers fit the component it names.
 *
 * Only the component's own questions (and the `q:block/…` settings every block
 * has) may be answered; every required question must be; a choice must be one
 * of its choices. A value can be words, a number, yes/no or a list of words —
 * never an object, because an object is where somebody would put a handler.
 */
export function checkComponentSettings(m: ComponentManifest, settings: Record<string, unknown> = {}): string[] {
	const wrong: string[] = [];
	const asked = new Map(m.settings.questions.map((q) => [q.id, q]));
	for (const [k, v] of Object.entries(settings)) {
		if (k.startsWith('q:block/')) continue;
		const q = asked.get(k);
		if (!q) {
			wrong.push(`${m.called} has no setting called “${k}”.`);
			continue;
		}
		const fine = ['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every((x) => typeof x === 'string'));
		if (!fine) wrong.push(`The answer to “${q.asks['en-GB'] ?? k}” should be words, a number or yes/no.`);
		if (q.answer === 'choice' && !q.choices?.some((c) => c.id === v)) wrong.push(`“${String(v)}” is not one of the choices for “${q.asks['en-GB'] ?? k}”.`);
	}
	for (const q of m.settings.questions) {
		if (!q.optional && (settings[q.id] === undefined || settings[q.id] === '')) wrong.push(`${m.called} needs an answer to “${q.asks['en-GB'] ?? q.id}”.`);
	}
	return wrong;
}

/**
 * A manifest as a brief — Markdown, for a person reviewing it or a model about
 * to work on the code. Everything that constrains the code is in it, in the
 * order somebody should read it.
 */
export function describeComponent(m: ComponentManifest): string {
	const tier = TIERS.find((t) => t.id === m.tier);
	const lines = [
		`# ${m.called} — ${pin(m)}`,
		'',
		m.does,
		'',
		m.about,
		'',
		`**Tier:** ${m.tier} — ${tier?.means ?? ''}`,
		`**Written by:** ${m.by}`,
		`**Runs:** ${m.runsOn.map((w) => WHERE.find((x) => x.id === w)?.means ?? w).join(' ')}`,
		m.code ? `**Code:** \`${m.code.module}\`${m.code.hash ? ` (${m.code.hash})` : ''}` : '**Code:** not written yet',
		'',
		'## What it may touch',
		...(m.touches.length ? m.touches.map((t) => `- \`${t}\` — ${TOUCH_BY_ID.get(t)?.means ?? 'unknown'}`) : ['- Nothing.']),
		'',
		'## What it promises',
		...m.promises.map((p) => `- **${p.title}** (\`${p.id}\`): ${p.text}`),
		'',
		'## How it must behave for people',
		`- Keyboard: ${m.access.keyboard ? 'everything works from the keyboard, with a visible focus' : 'NO'}`,
		`- Icons: ${m.access.labelledIcons ? 'every icon has a word with it' : 'NO'}`,
		`- Motion: ${m.access.reducedMotion ? 'keeps still for people who ask for less motion' : 'NO'}`,
		`- Smallest thing to press: ${m.access.minTarget}px`,
		...(m.access.notes ?? []).map((n) => `- ${n}`),
		'',
		'## Design brief (keep all of this true when changing it)',
		...m.design.map((d) => `- ${d}`),
		'',
		'## What can be changed',
		...(m.settings.questions.length
			? m.settings.questions.map((q) => `- \`${q.id}\` (${q.answer}${q.optional ? ', optional' : ''}): ${q.asks['en-GB'] ?? ''}`)
			: ['- Nothing.'])
	];
	return lines.join('\n');
}
