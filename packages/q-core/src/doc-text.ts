/*
 * The words in a document, for the story engine's references (5 October
 * 2026). No libraries: a web page's text from its HTML, and a Word file's
 * text from inside its zip (word/document.xml), unpacked with the
 * platform's own DecompressionStream. PDFs aren't read yet: the person is
 * asked to paste their text.
 *
 * Pure, and the same in the browser, on the server and in Node's tests.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', pound: '£', euro: '€', copy: '©' };

/** Character references made into characters (&amp; &#39; &#x2019; and the common names). */
export function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
		if (e[0] === '#') {
			const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
			return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
		}
		return ENTITIES[e.toLowerCase()] ?? m;
	});
}

/** A web page's readable words, and its title: no scripts, styles, menus' markup or tags. */
export function htmlToText(html: string): { title: string; text: string } {
	const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();
	const body = html
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<(br|hr)\b[^>]*>/gi, '\n')
		.replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|header|footer|main|nav|figure|figcaption|dd|dt)>/gi, '\n')
		.replace(/<li\b[^>]*>/gi, '\n• ')
		.replace(/<[^>]+>/g, ' ');
	const text = decodeEntities(body)
		.split('\n')
		.map((l) => l.replace(/[ \t ]+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
	return { title, text };
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** One file out of a zip, by name: its bytes, or null when it isn't there. */
export async function unzipOne(zip: Uint8Array, name: string): Promise<Uint8Array | null> {
	/* The end of the central directory: the last "PK\x05\x06" within the final 64 KB. */
	let end = -1;
	for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
		if (u32(zip, i) === 0x06054b50) {
			end = i;
			break;
		}
	}
	if (end < 0) throw new Error('That isn’t a Word file Q can open.');
	const count = u16(zip, end + 10);
	let at = u32(zip, end + 16);
	const dec = new TextDecoder();
	for (let n = 0; n < count && at + 46 <= zip.length; n++) {
		if (u32(zip, at) !== 0x02014b50) break;
		const method = u16(zip, at + 10);
		const size = u32(zip, at + 20);
		const nameLen = u16(zip, at + 28);
		const extra = u16(zip, at + 30);
		const comment = u16(zip, at + 32);
		const local = u32(zip, at + 42);
		const here = dec.decode(zip.subarray(at + 46, at + 46 + nameLen));
		if (here === name) {
			const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
			const data = zip.subarray(start, start + size);
			if (method === 0) return data;
			if (method !== 8) throw new Error('That Word file is packed in a way Q can’t open yet.');
			const out = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
			return new Uint8Array(await new Response(out).arrayBuffer());
		}
		at += 46 + nameLen + extra + comment;
	}
	return null;
}

/** A Word (.docx) file's words, a paragraph a line. */
export async function docxText(bytes: Uint8Array): Promise<string> {
	const xml = await unzipOne(bytes, 'word/document.xml');
	if (!xml) throw new Error('That Word file has no words Q can find.');
	const s = new TextDecoder().decode(xml);
	const text = s
		.replace(/<w:tab\/>/g, ' ')
		.replace(/<w:br\/>/g, '\n')
		.replace(/<\/w:p>/g, '\n')
		.replace(/<[^>]+>/g, '');
	return decodeEntities(text)
		.split('\n')
		.map((l) => l.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.join('\n');
}

/** The kinds of file a reference can be read from, by ending. */
export const READABLE = ['.txt', '.md', '.markdown', '.csv', '.json', '.html', '.htm', '.docx'] as const;
export const isReadable = (name: string) => READABLE.some((e) => name.toLowerCase().endsWith(e));

/** A file's words: plain text as it is, a web page or Word file read for its words. */
export async function fileText(name: string, bytes: Uint8Array): Promise<string> {
	const lower = name.toLowerCase();
	if (lower.endsWith('.pdf')) throw new Error('Q can’t read PDFs yet. Open it, copy the words, and paste them in as notes.');
	if (lower.endsWith('.docx')) return docxText(bytes);
	if (!isReadable(lower)) throw new Error('Q can read text, Markdown, web pages and Word files. For anything else, paste the words in.');
	const text = new TextDecoder().decode(bytes);
	return lower.endsWith('.html') || lower.endsWith('.htm') ? htmlToText(text).text : text;
}
