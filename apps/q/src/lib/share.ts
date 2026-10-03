/*
 * The share set (ADR-Q-029): the ways out of Q for a link, written once.
 * ShareLink (to one person: AirDrop and more, email, WhatsApp, text, a code)
 * and ShareLinks (Q itself, in the footer: the social sites) both use these.
 * No platform scripts: every way is a plain address or the device's own
 * share sheet, so nothing loads and nothing is tracked until someone shares.
 */

/** Whether this device has its own share sheet (AirDrop and more on Apple; most phones). Browser only. */
export const hasShareSheet = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Apple devices call the share sheet "AirDrop and more". */
export const isApple = () => typeof navigator !== 'undefined' && /iPhone|iPad|Macintosh/.test(navigator.userAgent);

/** Open the share sheet. Closing it without choosing isn't a problem: 'closed', not an error. */
export async function openShareSheet(what: { title: string; text?: string; url: string }): Promise<'shared' | 'closed' | 'failed'> {
	try {
		await navigator.share({ title: what.title, ...(what.text ? { text: what.text } : {}), url: what.url });
		return 'shared';
	} catch (e) {
		return e instanceof DOMException && e.name === 'AbortError' ? 'closed' : 'failed';
	}
}

/** Copy to the clipboard; true if it worked. */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/** Plain share addresses, each opening the person's own app with the words and the link written in. */
export function shareAddresses(text: string, url: string, subject = '') {
	const body = text ? `${text}\n\n${url}` : url;
	const e = (s: string) => encodeURIComponent(s);
	return {
		email: `mailto:?subject=${e(subject)}&body=${e(body)}`,
		whatsapp: `https://wa.me/?text=${e(body)}`,
		text: `sms:?&body=${e(body)}`,
		facebook: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`,
		linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}`,
		bluesky: `https://bsky.app/intent/compose?text=${e(`${text} ${url}`.trim())}`
	};
}
