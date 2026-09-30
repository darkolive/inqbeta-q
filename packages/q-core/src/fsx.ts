/*
 * The few file-system calls Q needs, made to work the same in every browser.
 *
 * Chrome and Edge give a real folder (showDirectoryPicker) and write with
 * createWritable. Safari gives only the browser's own private file system
 * (OPFS), and older Safari cannot write there from the page at all — only from
 * a worker, with a "sync access handle". So writing goes through writeFile(),
 * which uses createWritable when it exists and a small worker when it does not.
 * Listing goes through children(), because not every browser has values().
 */

type AnyDir = FileSystemDirectoryHandle & {
	values?: () => AsyncIterableIterator<FileSystemHandle>;
	entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
	resolve?: (h: FileSystemHandle) => Promise<string[] | null>;
};

/** Every entry in a directory. */
export async function* children(d: FileSystemDirectoryHandle): AsyncGenerator<FileSystemHandle> {
	const dir = d as AnyDir;
	if (typeof dir.values === 'function') {
		for await (const h of dir.values()) yield h;
	} else if (typeof dir.entries === 'function') {
		for await (const [, h] of dir.entries()) yield h;
	} else {
		throw new Error('This browser cannot list a folder.');
	}
}

/** Whether this browser has its own private file system. */
export function browserFilesSupported(): boolean {
	return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

/* The worker used where the page itself cannot write (Safari before createWritable). */
const WORKER = `
self.onmessage = async (e) => {
	const { id, parts, bytes } = e.data;
	try {
		let d = await navigator.storage.getDirectory();
		for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
		const f = await d.getFileHandle(parts[parts.length - 1], { create: true });
		const h = await f.createSyncAccessHandle();
		h.truncate(0);
		h.write(new Uint8Array(bytes), { at: 0 });
		h.flush();
		h.close();
		self.postMessage({ id, ok: true });
	} catch (err) {
		self.postMessage({ id, ok: false, message: String(err && err.message || err) });
	}
};`;

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();

function writer(): Worker {
	if (worker) return worker;
	worker = new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })));
	worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; message?: string }>) => {
		const w = waiting.get(e.data.id);
		if (!w) return;
		waiting.delete(e.data.id);
		if (e.data.ok) w.resolve();
		else w.reject(new Error(e.data.message ?? 'Could not write the file.'));
	};
	return worker;
}

async function toBytes(data: string | Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
	if (typeof data === 'string') return new TextEncoder().encode(data);
	if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
	return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Write a whole file, replacing what was there. */
export async function writeFile(file: FileSystemFileHandle, data: string | Blob | ArrayBuffer | Uint8Array): Promise<void> {
	const h = file as FileSystemFileHandle & { createWritable?: () => Promise<FileSystemWritableFileStream> };
	if (typeof h.createWritable === 'function') {
		const w = await h.createWritable();
		await w.write(typeof data === 'string' || data instanceof Blob ? data : new Blob([data as Uint8Array<ArrayBuffer>]));
		await w.close();
		return;
	}
	if (!browserFilesSupported()) throw new Error('This browser cannot write files.');
	const root = (await navigator.storage.getDirectory()) as AnyDir;
	const parts = typeof root.resolve === 'function' ? await root.resolve(file) : null;
	if (!parts?.length) throw new Error('This browser can only write files it keeps itself.');
	const bytes = (await toBytes(data)).slice();
	const id = nextId++;
	await new Promise<void>((resolve, reject) => {
		waiting.set(id, { resolve, reject });
		writer().postMessage({ id, parts, bytes: bytes.buffer }, [bytes.buffer]);
	});
}

/** Write `name` inside `dir`, making it if needed. */
export async function writeIn(dir: FileSystemDirectoryHandle, name: string, data: string | Blob | ArrayBuffer | Uint8Array): Promise<void> {
	await writeFile(await dir.getFileHandle(name, { create: true }), data);
}
