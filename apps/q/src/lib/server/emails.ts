/*
 * The one email Q sends, and it asks for nothing.
 *
 * No code to type, no button that does anything, no token that grants
 * anything. A location, and a sentence saying what is there. What sits at that
 * location is sealed to a passkey, so this message — and the mail provider
 * that carried it, and anyone reading the inbox — conveys no more than the fact
 * that someone made a claim.
 *
 * That also means it is safe to be wrong. A claim sent to the wrong address
 * hands its reader nothing at all, which is why the copy can say so plainly
 * instead of warning them to act.
 *
 * Written by hand against email HTML, not web HTML — inline styles on tables,
 * no stylesheets, no webfonts. `text` goes alongside `html` every time.
 */
const OLIVE = '#556B2F';
const INK = '#12211f';
const MUTED = '#5c6b68';
const PAPER = '#ffffff';

export interface CodeEmail {
	subject: string;
	html: string;
	text: string;
}

const P = `margin:0 0 14px;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:${INK};`;
const SMALL = `margin:0;font:13px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;color:${MUTED};`;

export function receiptWaiting(url: string, minutes: number): CodeEmail {
	const html =
		`<div style="margin:0;padding:24px 12px;background:#eaf0f4;">` +
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:${PAPER};border-radius:8px;">` +
		`<tr><td style="height:4px;background:${OLIVE};border-radius:8px 8px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>` +
		`<tr><td style="padding:28px 28px 24px;">` +
		`<p style="${P}">Someone asked Q to add this address to their identity, and left a receipt for you.</p>` +
		`<p style="${P}"><a href="${url}" style="color:${OLIVE};font-weight:600;">Open the receipt</a></p>` +
		`<p style="${P}">It can only be opened with their passkey, on a device that has it. Opening it is what confirms the address — there is no code, and nothing here to type.</p>` +
		`<p style="${SMALL}">The receipt waits ${minutes} minutes and then expires. ` +
		`If this was not you, you can ignore it: this message gives its reader nothing, and the receipt will not open without the passkey.</p>` +
		`</td></tr></table></div>`;

	const text = [
		'Someone asked Q to add this address to their identity, and left a receipt for you.',
		'',
		'Open the receipt:',
		url,
		'',
		'It can only be opened with their passkey, on a device that has it. Opening it is',
		'what confirms the address — there is no code, and nothing here to type.',
		'',
		`The receipt waits ${minutes} minutes and then expires. If this was not you, you can`,
		'ignore it: this message gives its reader nothing, and the receipt will not open',
		'without the passkey.'
	].join('\n');

	return { subject: 'A Q receipt is waiting for you', html, text };
}
