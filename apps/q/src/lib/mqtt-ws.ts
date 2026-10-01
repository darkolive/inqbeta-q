/*
 * The smallest MQTT 3.1.1 client that does what the bell needs, over a
 * WebSocket (ADR-Q-014 §4). Connect with a lasting session, subscribe to one
 * inbox at QoS 1, acknowledge what arrives, keep the line alive — and, since
 * 1 October 2026, ring someone else's bellboy: one QoS 1 PUBLISH of a sealed
 * notice (linking up, ADR-Q-015).
 *
 * Why not the `mqtt` package: one dependency fewer for ~150 lines we can read,
 * and every byte of it is in the spec (OASIS MQTT 3.1.1, §3).
 */

export interface MqttOptions {
	url: string;
	clientId: string;
	username?: string;
	password?: string;
	/** false keeps the session, so the broker holds notices while you're away. */
	clean?: boolean;
	keepalive?: number;
	onMessage: (topic: string, payload: Uint8Array) => void;
	onClose?: (why: string) => void;
}

export interface MqttLine {
	close(): void;
	/** Publish at QoS 1. Resolves when the broker acknowledges it. */
	publish(topic: string, payload: string): Promise<void>;
}

const te = new TextEncoder();
const td = new TextDecoder();

function str(s: string): Uint8Array {
	const b = te.encode(s);
	return Uint8Array.of(b.length >> 8, b.length & 0xff, ...b);
}
function remaining(n: number): number[] {
	const out: number[] = [];
	do {
		let byte = n % 128;
		n = Math.floor(n / 128);
		if (n > 0) byte |= 0x80;
		out.push(byte);
	} while (n > 0);
	return out;
}
function packet(type: number, body: Uint8Array): Uint8Array {
	return Uint8Array.of(type, ...remaining(body.length), ...body);
}
function concat(...parts: Uint8Array[]): Uint8Array {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let i = 0;
	for (const p of parts) out.set(p, (i += p.length) - p.length);
	return out;
}

const CONNACK_SAYS = ['', 'the broker refused the protocol version', 'the broker refused this client id', 'the bellboy is unavailable', 'wrong inbox or password', 'not allowed'];

/** Connect, sign in, subscribe. Resolves once the subscription is acknowledged. */
export function connectMqtt(o: MqttOptions, topics: string[]): Promise<MqttLine> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(o.url, ['mqtt']);
		ws.binaryType = 'arraybuffer';
		const keepalive = o.keepalive ?? 60;
		let buf: Uint8Array = new Uint8Array(0);
		let ping: ReturnType<typeof setInterval> | undefined;
		let settled = false;
		let nextId = 1;
		const waiting = new Map<number, () => void>();
		const line: MqttLine = {
			close() {
				if (ping) clearInterval(ping);
				send(Uint8Array.of(0xe0, 0));
				ws.onclose = null;
				ws.close();
			},
			publish(topic, payload) {
				const id = nextId++ & 0xffff || 1;
				return new Promise((done, failed) => {
					const t = setTimeout(() => failed(new Error('The bellboy didn’t acknowledge it.')), 10_000);
					waiting.set(id, () => (clearTimeout(t), done()));
					send(packet(0x32, concat(str(topic), Uint8Array.of(id >> 8, id & 0xff), te.encode(payload))));
				});
			}
		};
		const fail = (why: string) => {
			if (ping) clearInterval(ping);
			if (!settled) {
				settled = true;
				reject(new Error(why));
			} else o.onClose?.(why);
		};
		const send = (p: Uint8Array) => ws.readyState === WebSocket.OPEN && ws.send(p);

		ws.onopen = () => {
			const flags = (o.username ? 0x80 : 0) | (o.password ? 0x40 : 0) | (o.clean === false ? 0 : 0x02);
			const body = concat(
				str('MQTT'),
				Uint8Array.of(4, flags, keepalive >> 8, keepalive & 0xff),
				str(o.clientId),
				o.username ? str(o.username) : new Uint8Array(0),
				o.password ? str(o.password) : new Uint8Array(0)
			);
			send(packet(0x10, body));
		};
		ws.onerror = () => fail('Could not reach the bellboy. Is this device on the mesh?');
		ws.onclose = () => fail('The line to the bellboy closed.');
		ws.onmessage = (e) => {
			buf = concat(buf, new Uint8Array(e.data as ArrayBuffer));
			for (;;) {
				if (buf.length < 2) return;
				/* Remaining length: up to four bytes, seven bits each. */
				let len = 0, mul = 1, i = 1, byte: number;
				do {
					if (i >= buf.length) return;
					byte = buf[i++];
					len += (byte & 0x7f) * mul;
					mul *= 128;
				} while (byte & 0x80);
				if (buf.length < i + len) return;
				const head = buf[0];
				const body = buf.slice(i, i + len);
				buf = buf.slice(i + len);
				handle(head, body);
			}
		};

		function handle(head: number, body: Uint8Array) {
			const type = head >> 4;
			if (type === 2) {
				/* CONNACK */
				if (body[1] !== 0) return fail(CONNACK_SAYS[body[1]] ?? `refused (${body[1]})`);
				ping = setInterval(() => send(Uint8Array.of(0xc0, 0)), (keepalive * 1000) / 2);
				if (!topics.length) {
					/* Only here to ring someone: no subscription to wait for. */
					settled = true;
					return resolve(line);
				}
				const subs = concat(...topics.map((t) => concat(str(t), Uint8Array.of(1))));
				send(packet(0x82, concat(Uint8Array.of(0, 1), subs)));
			} else if (type === 9) {
				/* SUBACK */
				if ([...body.slice(2)].some((r) => r === 0x80)) return fail('The bellboy refused this inbox.');
				settled = true;
				resolve(line);
			} else if (type === 3) {
				/* PUBLISH */
				const qos = (head >> 1) & 3;
				const tlen = (body[0] << 8) | body[1];
				const topic = td.decode(body.slice(2, 2 + tlen));
				let at = 2 + tlen;
				if (qos > 0) {
					send(Uint8Array.of(0x40, 2, body[at], body[at + 1]));
					at += 2;
				}
				o.onMessage(topic, body.slice(at));
			}
			else if (type === 4) {
				/* PUBACK for something we published. */
				waiting.get((body[0] << 8) | body[1])?.();
				waiting.delete((body[0] << 8) | body[1]);
			}
			/* PINGRESP (13) and anything else: nothing to do. */
		}
	});
}
