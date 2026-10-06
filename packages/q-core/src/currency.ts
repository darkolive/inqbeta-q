/*
 * One credit is one unit of the mint's currency (ADR-Q-042 §3; ADR-Q-027
 * addendum, 5 October 2026).
 *
 * Darren: "Every federation at time of formation decides its currency … Match
 * for match, one credit equals one whole sovereign unit. So one credit equals
 * one pound, one euro, or one dollar."
 *
 * A mint names its currency once (ISO 4217: GBP, EUR, USD …) and it never
 * changes. Money is counted in the currency's minor units (pence, cents), so
 * one credit is 10^minor of them: 100 for pounds, euros and dollars, 1 for
 * yen. The minor units come from the platform's own ISO 4217 data (Intl), so
 * nothing here has to keep a table up to date.
 */

/** What a mint uses when nothing says otherwise. */
export const DEFAULT_CURRENCY = 'GBP';

/** The currencies offered first when a host chooses; any ISO 4217 code is accepted. */
export const COMMON_CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'JPY', 'CNY', 'INR'] as const;

let known: Set<string> | null = null;
function knownCodes(): Set<string> | null {
	if (known) return known;
	const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('currency');
	known = list?.length ? new Set(list) : null;
	return known;
}

/** Whether this is a currency code a mint can name: three capitals, known to ISO 4217 where the platform can say. */
export function isCurrency(x: unknown): x is string {
	if (typeof x !== 'string' || !/^[A-Z]{3}$/.test(x)) return false;
	const k = knownCodes();
	return k ? k.has(x) : true;
}

/** A currency from anything (a setting, a publication), made safe: unknown falls back to pounds. */
export const currencyFrom = (x: unknown): string => {
	const c = typeof x === 'string' ? x.trim().toUpperCase() : '';
	return isCurrency(c) ? c : DEFAULT_CURRENCY;
};

/** The currency's minor units (ISO 4217): 2 for pounds, 0 for yen, 3 for dinars. */
export function minorDigits(currency: string): number {
	try {
		return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
	} catch {
		return 2;
	}
}

/** How many minor units one credit is: one whole unit of the currency. */
export const minorPerCredit = (currency: string): number => 10 ** minorDigits(currency);

/** An amount in minor units, written in its currency: 250, 'GBP' → "£2.50"; 250, 'JPY' → "¥250". */
export function money(minor: number, currency: string, locale = 'en-GB'): string {
	const d = minorDigits(currency);
	try {
		return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(minor / 10 ** d);
	} catch {
		return `${(minor / 10 ** d).toFixed(d)} ${currency}`;
	}
}

/** What some credits are worth, written in the mint's currency: 3, 'EUR' → "€3.00". */
export const creditsWorth = (credits: number, currency: string, locale = 'en-GB'): string => money(credits * minorPerCredit(currency), currency, locale);

/** The currency's own name, for a sentence: 'GBP' → "pound sterling". */
export function currencyName(currency: string, locale = 'en-GB'): string {
	try {
		return new Intl.DisplayNames([locale], { type: 'currency' }).of(currency)?.toLowerCase() ?? currency;
	} catch {
		return currency;
	}
}
