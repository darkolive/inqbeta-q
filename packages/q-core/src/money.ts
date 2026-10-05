/*
 * Test mode and publishing (ADR-Q-027 §7, 3 October 2026).
 *
 * Darren: "When it is in test mode, you have a full functioning Incubator Q
 * portal, everything works … when you're satisfied, you can then go from test
 * mode to published. And it resets balances to zero. And you have to add bank
 * account details. And you have to confirm, tick, your legal responsibility …
 * And they sign it, and that produces a published ID. And that is then what
 * becomes unchangeable."
 *
 * Every host starts in test mode. Publishing is one receipt, signed by the
 * host's founder, kept in the host's public record. Its hash is the published
 * ID. The first valid one is the only one: a second is never read, and nothing
 * turns live back to test. Balances start from zero because test and live
 * credits were always kept apart (mint.ts `mode`).
 */
import { checkReceipt, type SealedReceipt } from './seal';

export const MONEY_PUBLISHED_SCHEMA = 'inqbeta.money-published/1';

/** What the operator agrees to, word for word, when they publish. */
export const RESPONSIBILITY =
	'I am publishing real money on this host. Running it is my own legal responsibility: the regulations that apply to it, the accounts and tax, and what I owe the people who use it. Incubator and Dark Olive CIC provide the software only, and are not responsible for what I do with it.';

export interface MoneyPublication {
	schema: typeof MONEY_PUBLISHED_SCHEMA;
	source: 'inqbeta:q/host';
	/** The host's federation DID. */
	host: string;
	/** The mint's DID: whose credits go live. */
	mint: string;
	/** What one credit costs, and pays out, in pence. */
	pencePerCredit: number;
	/** The coin's own name, chosen by the bank when it made its coin (ADR-Q-035): what people call it. */
	coinName?: string;
	/** How the coin looks: its shape, its colour, and a mark in the middle (ADR-Q-035). */
	coinDesign?: CoinDesign;
	/** The payout account, never more than its last four digits. */
	bank: { ends: string };
	/** The statement, as read, and that it was accepted. */
	responsibility: string;
	accepted: true;
	at: string;
}

export type MoneyPublicationReceipt = SealedReceipt & { content: MoneyPublication };

/* ---- The coin's design (ADR-Q-035, 5 October 2026) ----
 *
 * A bank designs its own coin: a shape, a colour, and a mark in the middle,
 * always carrying its QR code. Darren: "you could have a skull and
 * crossbones as the background instead of a round coin … customize your
 * own coin, but still be using the QR code."
 */
export const COIN_SHAPES = ['circle', 'square', 'hexagon', 'shield', 'skull', 'picture'] as const;
export type CoinShape = (typeof COIN_SHAPES)[number];
export const COIN_COLOURS = ['secondary', 'primary', 'tertiary', 'success', 'warning', 'error', 'surface'] as const;
export type CoinColour = (typeof COIN_COLOURS)[number];
/** A colour on a coin: a theme colour by name, the page's own surface, black, white, or a colour of its own (#rrggbb). */
export type CoinPaint = CoinColour | 'black' | 'white' | 'none' | `#${string}`;

export interface CoinDesign {
	/** Its shape; 'picture' is the bank's own picture (its logo, say) as the coin itself. */
	shape: CoinShape;
	/** The coin's colour. */
	colour: CoinPaint;
	/** The code's colour; 'surface' is the page's own. */
	ink: CoinPaint;
	/** What's behind the code: 'none' lets the coin show through. */
	plate: CoinPaint;
	/** The bank's own picture (SVG, PNG, WebP or JPEG) kept on its host: /host/coin.<ext>?v=<fingerprint>. */
	image: string;
	/** Up to two characters in the middle of the code (a letter, a symbol, an emoji); empty for none. */
	mark: string;
}

export const DEFAULT_COIN: CoinDesign = { shape: 'circle', colour: 'secondary', ink: 'surface', plate: 'none', image: '', mark: '' };

const PAINTS = new Set<string>([...COIN_COLOURS, 'black', 'white', 'none']);
const paintFrom = (x: unknown, fallback: CoinPaint): CoinPaint => (typeof x === 'string' && (PAINTS.has(x) || /^#[0-9a-fA-F]{6}$/.test(x)) ? (x as CoinPaint) : fallback);
const IMAGE = /^(\/dev)?\/host\/coin\.(webp|png|jpg|svg)(\?v=[0-9a-f]{6,64})?$/;

/** A design as one line for its setting (Q_COIN_DESIGN): "shape|colour|ink|plate|image|mark" (the mark last, as it may hold anything). */
export const coinDesignLine = (d: CoinDesign): string => [d.shape, d.colour, d.ink, d.plate, d.image, d.mark].join('|');

/** A design from anything (a setting, a publication), made safe: unknown parts fall back to the default. */
export function coinDesignFrom(x: unknown): CoinDesign {
	const fromLine = (t: string) => {
		const parts = t.split('|');
		/* The first form (5 October): "shape|colour|mark". */
		if (parts.length <= 3) return { shape: parts[0], colour: parts[1], mark: parts.slice(2).join('|') };
		const [shape, colour, ink, plate, image, ...mark] = parts;
		return { shape, colour, ink, plate, image, mark: mark.join('|') };
	};
	const d = (typeof x === 'string' ? fromLine(x.trim()) : x) as Partial<Record<keyof CoinDesign, unknown>> | null;
	const image = typeof d?.image === 'string' && IMAGE.test(d.image) ? d.image : '';
	let shape = COIN_SHAPES.includes(d?.shape as CoinShape) ? (d!.shape as CoinShape) : DEFAULT_COIN.shape;
	if (shape === 'picture' && !image) shape = DEFAULT_COIN.shape;
	return {
		shape,
		colour: paintFrom(d?.colour, DEFAULT_COIN.colour),
		ink: paintFrom(d?.ink, DEFAULT_COIN.ink),
		plate: paintFrom(d?.plate, DEFAULT_COIN.plate),
		image,
		mark: typeof d?.mark === 'string' ? [...d.mark.trim()].slice(0, 2).join('') : ''
	};
}

/** The design's fingerprint: what a register of coins would hold to tell one coin's look from another's. */
export async function coinDesignFingerprint(d: CoinDesign): Promise<string> {
	const bytes = new TextEncoder().encode(coinDesignLine(coinDesignFrom(d)));
	return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---- Your cashing-out account (ADR-Q-035, 5 October 2026) ----
 *
 * Where your pounds go when you cash out: set once, in Settings, as a
 * standing order. A stolen phone can't send money somewhere new: someone has to
 * change the account, and every change is a receipt you signed, naming the
 * one it replaces. Only the last four digits are ever shown; the full details
 * are held as a fingerprint, so a payout can be checked against them.
 */
export const PAYOUT_ACCOUNT_SCHEMA = 'inqbeta.payout-account/1';

export interface PayoutAccount {
	schema: typeof PAYOUT_ACCOUNT_SCHEMA;
	source: 'inqbeta:q/credits';
	/** Whose account: the holder's DID. */
	holder: string;
	/** The account number's last four digits. */
	ends: string;
	/** A fingerprint of the full details (SHA-256 of name, sort code and number), never the details. */
	fingerprint: string;
	/** The account it replaces, by content hash; null for the first. */
	replaces: string | null;
	at: string;
}
export type PayoutAccountReceipt = SealedReceipt & { content: PayoutAccount };

export function isPayoutAccount(x: unknown): x is PayoutAccountReceipt {
	const c = (x as PayoutAccountReceipt | null)?.content;
	return c?.schema === PAYOUT_ACCOUNT_SCHEMA && typeof c.holder === 'string' && /^\d{4}$/.test(c.ends) && typeof c.fingerprint === 'string';
}

export interface MoneyState {
	mode: 'test' | 'live';
	/** The publication receipt's hash: the published ID. */
	publishedId?: string;
	publication?: MoneyPublication;
	publishedBy?: string;
}

/** What's wrong with a publication before it's signed, each a sentence. */
export function problemsWithPublication(p: Omit<MoneyPublication, 'schema' | 'source' | 'at' | 'accepted'> & { accepted: boolean }): string[] {
	const out: string[] = [];
	if (!Number.isInteger(p.pencePerCredit) || p.pencePerCredit < 1) out.push('Set what one credit costs, in pence: at least 1.');
	if (!/^\d{4}$/.test(p.bank.ends)) out.push('Add the payout bank account.');
	if (p.responsibility !== RESPONSIBILITY) out.push('The statement must be the one shown.');
	if (!p.accepted) out.push('Tick to accept the responsibility.');
	if (!p.mint || !p.host) out.push('The host and its mint must be set up first.');
	return out;
}

/**
 * Test or live, from the host's public records. Only a publication signed by
 * the host's founder counts, and only the first.
 */
export async function moneyStateOf(records: unknown[], host: string, founder: string): Promise<MoneyState> {
	const pubs = records
		.filter((r): r is MoneyPublicationReceipt => (r as MoneyPublicationReceipt | null)?.content?.schema === MONEY_PUBLISHED_SCHEMA)
		.filter((r) => r.content.host === host && r.did === founder && r.content.accepted === true && r.content.responsibility === RESPONSIBILITY)
		.sort((a, b) => a.content.at.localeCompare(b.content.at));
	for (const p of pubs) {
		if (!(await checkReceipt(p)).ok) continue;
		return { mode: 'live', publishedId: p.contentHash, publication: p.content, publishedBy: p.did };
	}
	return { mode: 'test' };
}
