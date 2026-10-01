/* Which app's built-in browser are we in? (apps/q/src/lib/in-app.ts) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inAppBrowser } from '../../../apps/q/src/lib/in-app';

test('Messenger, Facebook and Instagram are named; Chrome and Safari are not in-app', () => {
	const messenger = 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/MESSENGER;FBAV/480.0.0.0;]';
	assert.deepEqual(inAppBrowser(messenger), { app: 'Messenger', android: true, ios: false });
	assert.equal(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]')?.app, 'Facebook');
	assert.equal(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 350.0')?.app, 'Instagram');
	assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'), null);
	assert.equal(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), null);
	/* An unnamed Android WebView is still in-app, just without a name. */
	assert.equal(inAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')?.app, '');
});
