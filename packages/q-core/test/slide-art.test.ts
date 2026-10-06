/*
 * Slide art (ADR-Q-033, Make it final; 6 October 2026). What matters: an AI's
 * SVG is rebuilt from an allowlist, so nothing that runs, links out or
 * writes words gets through, whatever tricks it tries; good drawing and
 * animation survive intact; what was dropped is said.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanArt, cleanCss, artRefOf, ART_MOST } from '../src/slide-art';

const GOOD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" width="999">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--q-olive-soft)"/></linearGradient></defs>
<style>
.you { animation: lean 1.2s ease-in-out 0.4s both; transform-box: fill-box; transform-origin: center bottom; fill: var(--q-orange); }
@keyframes lean { from { transform: rotate(0deg) } 50% { transform: rotate(-6deg) } to { transform: rotate(0) } }
.ripple { animation: ripple 1s ease-out 1s infinite; offset-path: path('M10 10 C 50 0, 90 0, 130 10'); }
</style>
<rect width="640" height="320" fill="url(#sky)"/>
<g class="you"><circle cx="200" cy="140" r="30"/><path d="M160 240a40 40 0 0 1 80 0z"/></g>
<use href="#sky"/>
</svg>`;

test('good drawing and animation survive; the root is always the stage', () => {
	const r = cleanArt(GOOD)!;
	assert.ok(r.svg.startsWith('<svg viewBox="0 0 640 320" xmlns="http://www.w3.org/2000/svg">'), r.svg.slice(0, 80));
	assert.ok(!r.svg.includes('999'), 'width is the player’s to set');
	assert.match(r.svg, /<linearGradient id="sky"/);
	assert.match(r.svg, /@keyframes lean\{from\{transform:rotate\(0deg\)\}50%\{transform:rotate\(-6deg\)\}to\{transform:rotate\(0\)\}\}/);
	assert.match(r.svg, /animation:lean 1\.2s ease-in-out 0\.4s both/);
	assert.match(r.svg, /offset-path:path\('M10 10 C 50 0, 90 0, 130 10'\)/);
	assert.match(r.svg, /fill="url\(#sky\)"/);
	assert.match(r.svg, /<use href="#sky"\/>/);
	assert.deepEqual(r.dropped, []);
});

test('nothing that runs, links out, loads or writes gets through', () => {
	const evil = `<svg onload="alert(1)">
<script>alert(1)</script>
<foreignObject><div>hi</div></foreignObject>
<a href="https://evil.example"><circle r="5"/></a>
<image href="https://evil.example/x.png"/>
<use href="https://evil.example/s.svg#x"/>
<use xlink:href="data:image/svg+xml;base64,AAAA"/>
<circle r="5" onclick="alert(1)" fill="url(https://evil.example/f)" style="fill:red;background:url(http://x);behavior:url(x.htc)"/>
<rect width="10" height="10" fill="javascript:alert(1)"/>
<text x="10" y="10">Buy now</text>
<style>@import url(https://evil.example/x.css); body { display:none } .a{animation:x 1s} @font-face{src:url(https://x)} .b{background-image:url(https://x)}</style>
<animate attributeName="href" to="javascript:alert(1)"/>
<set attributeName="onmouseover" to="alert(1)"/>
<path d="M0 0L10 10"/>
</svg>`;
	const r = cleanArt(evil)!;
	for (const bad of ['script', 'alert', 'onload', 'onclick', 'foreignObject', 'evil.example', 'javascript', 'data:', 'Buy now', '@import', '@font-face', 'background', '<a', '<image', '<animate', '<set', 'behavior', 'display'])
		assert.ok(!r.svg.toLowerCase().includes(bad.toLowerCase()), `${bad} got through: ${r.svg}`);
	assert.match(r.svg, /<path d="M0 0L10 10"\/>/);
	assert.match(r.svg, /body\{\}|\.a\{animation:x 1s\}/);
	assert.ok(r.dropped.includes('<script>'));
	assert.ok(r.dropped.includes('an event handler'));
	assert.ok(r.dropped.includes('writing (there is never writing in the pictures)'));
	assert.ok(r.dropped.includes('a link out of the picture'));
});

test('tricks with case, entities, CDATA and comments don’t help', () => {
	const r = cleanArt(`<SVG><ScRiPt>x</ScRiPt><circle r="1" fill="&#106;avascript:x"/><style><![CDATA[.a{fill:red}]]></style><!-- <script>x</script> --><circle r="2" style="fill:u&#114;l(http://x)"/><rect width="1" height="1"/></SVG>`)!;
	assert.ok(!/script/i.test(r.svg));
	assert.ok(!r.svg.includes('http://x'));
	assert.match(r.svg, /\.a\{fill:red\}/);
	assert.ok(!/url\(|javascript/i.test(r.svg), 'numeric entities are never decoded into anything');
	assert.ok(!r.svg.includes('&#'), 'an entity left in is escaped, so it stays harmless text');
});

test('the CSS cleaner keeps keyframes and plain rules only', () => {
	const css = cleanCss('.x{opacity:0;animation:fade 1s 2s both} @keyframes fade{0%{opacity:0}100%{opacity:1}} @media screen{.x{opacity:1}} .y:hover{fill:red} html body .z{position:fixed}');
	assert.match(css, /^\.x\{opacity:0;animation:fade 1s 2s both\}/);
	assert.match(css, /@keyframes fade\{0%\{opacity:0\}100%\{opacity:1\}\}/);
	assert.ok(!css.includes('@media'));
	assert.ok(!css.includes('position'));
});

test('no drawing, no root svg, or too big: nothing', () => {
	assert.equal(cleanArt('<div>hi</div>'), null);
	assert.equal(cleanArt('<svg><text>only words</text></svg>'), null);
	assert.equal(cleanArt(42), null);
	assert.equal(cleanArt(`<svg>${'<circle r="1"/>'.repeat(ART_MOST / 10)}</svg>`), null);
	assert.ok(cleanArt('Here you go:\n```svg\n<svg><circle r="3"/></svg>\n```'), 'an svg inside a reply is found');
});

test('an art reference is a real hash and a sensible length', async () => {
	const { artHash } = await import('../src/slide-art');
	assert.ok(artRefOf({ hash: await artHash('<svg/>') }), 'the hash Q makes is one Q keeps');
	assert.equal(artRefOf({ hash: 'x' }), null);
	assert.deepEqual(artRefOf({ hash: 'a'.repeat(43), seconds: 999, model: 'm' }), { hash: 'a'.repeat(43), seconds: 60, model: 'm' });
	assert.equal(artRefOf({ hash: 'a'.repeat(64) }), null);
});
