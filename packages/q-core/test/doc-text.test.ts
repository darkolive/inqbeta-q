/*
 * The words in a document (story engine references, 5 October 2026): a web
 * page's text, and a Word file's, with no libraries.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, docxText, fileText, htmlToText, unzipOne } from '../src/doc-text';

/* A small zip, built here: each file deflated (or stored), with a central directory. */
async function zipOf(files: Record<string, string>, deflate = true): Promise<Uint8Array> {
	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	for (const [name, body] of Object.entries(files)) {
		const raw = enc.encode(body);
		const data = deflate ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : raw;
		const n = enc.encode(name);
		const local = new Uint8Array(30 + n.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true);
		lv.setUint16(8, deflate ? 8 : 0, true);
		lv.setUint32(18, data.length, true);
		lv.setUint32(22, raw.length, true);
		lv.setUint16(26, n.length, true);
		local.set(n, 30);
		const c = new Uint8Array(46 + n.length);
		const cv = new DataView(c.buffer);
		cv.setUint32(0, 0x02014b50, true);
		cv.setUint16(10, deflate ? 8 : 0, true);
		cv.setUint32(20, data.length, true);
		cv.setUint32(24, raw.length, true);
		cv.setUint16(28, n.length, true);
		cv.setUint32(42, offset, true);
		c.set(n, 46);
		parts.push(local, data);
		central.push(c);
		offset += local.length + data.length;
	}
	const size = central.reduce((a, c) => a + c.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true);
	ev.setUint16(8, central.length, true);
	ev.setUint16(10, central.length, true);
	ev.setUint32(12, size, true);
	ev.setUint32(16, offset, true);
	const all = [...parts, ...central, end];
	const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
	let at = 0;
	for (const p of all) (out.set(p, at), (at += p.length));
	return out;
}

const DOC = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Data centres use a lot of power.</w:t></w:r></w:p><w:p><w:r><w:t>Most of it is wasted as heat &amp; water.</w:t></w:r><w:r><w:tab/><w:t>Really.</w:t></w:r></w:p></w:body></w:document>`;

test('a Word file’s words, a paragraph a line', async () => {
	for (const deflate of [true, false]) {
		const zip = await zipOf({ '[Content_Types].xml': '<Types/>', 'word/document.xml': DOC }, deflate);
		assert.equal(await docxText(zip), 'Data centres use a lot of power.\nMost of it is wasted as heat & water. Really.');
		assert.equal(await fileText('Brief.DOCX', zip), 'Data centres use a lot of power.\nMost of it is wasted as heat & water. Really.');
	}
	assert.equal(await unzipOne(await zipOf({ 'a.txt': 'x' }), 'b.txt'), null);
	await assert.rejects(docxText(new TextEncoder().encode('not a zip at all, just words')));
});

test('a web page’s words and title, without its scripts and styles', () => {
	const { title, text } = htmlToText(`<html><head><title>Why data centres &ndash; the problem</title><style>p{}</style></head><body><nav><a>Home</a></nav><script>alert(1)</script><h1>The problem</h1><p>Heat,&nbsp;water &amp; power.</p><ul><li>One</li><li>Two</li></ul><!-- hidden --></body></html>`);
	assert.equal(title, 'Why data centres – the problem');
	assert.ok(!text.includes('alert') && !text.includes('p{}') && !text.includes('hidden'));
	assert.match(text, /The problem\nHeat, water & power\./);
	assert.match(text, /• One\n• Two/);
	assert.equal(decodeEntities('&#8217;&#x2019;&rsquo;&unknown;'), '’’’&unknown;');
});

test('PDFs and unknown files are refused with what to do instead', async () => {
	await assert.rejects(fileText('report.pdf', new Uint8Array()), /paste/);
	await assert.rejects(fileText('photo.png', new Uint8Array()), /paste/);
	assert.equal(await fileText('notes.md', new TextEncoder().encode('# Hi\nthere')), '# Hi\nthere');
});
