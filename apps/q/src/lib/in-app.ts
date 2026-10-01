/*
 * Opened inside another app's browser (Messenger, Facebook, Instagram…)?
 * Those built-in browsers don't do passkeys, so a link shared in a chat lands
 * on a page that can't sign anyone in. Saying which app, and how to get to a
 * real browser, is the whole fix (1 October 2026, Darren's phone, Messenger).
 */
const APPS: [RegExp, string][] = [
	[/messenger/i, 'Messenger'],
	[/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'],
	[/Instagram/, 'Instagram'],
	[/LinkedInApp/, 'LinkedIn'],
	[/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
	[/Snapchat/, 'Snapchat'],
	[/\bLine\//, 'LINE'],
	[/WhatsApp/, 'WhatsApp']
];

export interface InApp {
	app: string;
	android: boolean;
	ios: boolean;
}

export function inAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): InApp | null {
	const android = /Android/.test(ua);
	const ios = /iPhone|iPad|iPod/.test(ua);
	const named = APPS.find(([re]) => re.test(ua))?.[1];
	/* An Android WebView that isn't a browser says "; wv)". */
	const app = named ?? (android && /; wv\)/.test(ua) ? '' : null);
	return app === null ? null : { app, android, ios };
}

/** On Android: the same page, opened in Chrome. */
export function chromeIntent(href = location.href): string {
	const u = new URL(href);
	return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
