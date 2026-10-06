/*
 * From the flow to a price (ADR-Q-028 §5a, 3–4 October 2026).
 *
 * Darren: "Once we've got the data on how it flows and how much space is being
 * used … then we can calculate what the credit cost is. And then once we've
 * got the credit cost, we can set a price for minting."
 *
 * The relay publishes daily totals (/relay/stats): files and bytes in, and
 * byte-hours held. With what the node costs to run, that gives what an hour of
 * holding a gigabyte really costs — at today's use, and if the node were full
 * — and so what to charge in credits, and what a credit should be worth.
 * Nothing here decides: it shows the sums, and the host chooses.
 */
export interface FlowDay {
	day: string;
	in: { items: number; bytes: number };
	arrived: { items: number; bytes: number; byteHours: number };
	timedOut: { items: number; bytes: number; byteHours: number };
}

export interface Flow {
	days: number;
	files: number;
	bytesIn: number;
	byteHours: number;
	/** How long a file waits, on average, before it's let go (hours). */
	meanHours: number;
	/** How many timed out rather than arriving: a cloud that never came back. */
	timedOut: number;
}

const GB = 1024 ** 3;
const HOURS_PER_MONTH = 730;

/** What the relay's days add up to. */
export function flowOf(days: FlowDay[]): Flow {
	const t = days.reduce(
		(a, d) => ({
			files: a.files + (d.in?.items ?? 0),
			bytesIn: a.bytesIn + (d.in?.bytes ?? 0),
			byteHours: a.byteHours + (d.arrived?.byteHours ?? 0) + (d.timedOut?.byteHours ?? 0),
			left: a.left + (d.arrived?.items ?? 0) + (d.timedOut?.items ?? 0),
			timedOut: a.timedOut + (d.timedOut?.items ?? 0),
			heldBytes: a.heldBytes + (d.arrived?.bytes ?? 0) + (d.timedOut?.bytes ?? 0)
		}),
		{ files: 0, bytesIn: 0, byteHours: 0, left: 0, timedOut: 0, heldBytes: 0 }
	);
	return { days: days.length, files: t.files, bytesIn: t.bytesIn, byteHours: t.byteHours, meanHours: t.heldBytes ? t.byteHours / t.heldBytes : 0, timedOut: t.timedOut };
}

export interface Costing {
	/** The node's running cost over the days measured, in pence. */
	costPence: number;
	/** At today's use: what each GB-hour held cost (pence), and each GB passed through. Null with no use yet. */
	perGBHourNow: number | null;
	perGBNow: number | null;
	/** If the relay's space were full all the time: the floor a price can't go below and break even. */
	perGBHourFull: number;
}

/** What holding really costs, from the flow and the node's monthly cost (pence) and relay space (GB). */
export function costOf(flow: Flow, monthlyPence: number, capacityGB: number): Costing {
	const costPence = monthlyPence * (Math.max(1, flow.days) / 30);
	const gbHours = flow.byteHours / GB;
	const gb = flow.bytesIn / GB;
	return {
		costPence,
		perGBHourNow: gbHours > 0 ? costPence / gbHours : null,
		perGBNow: gb > 0 ? costPence / gb : null,
		perGBHourFull: monthlyPence / (Math.max(0.001, capacityGB) * HOURS_PER_MONTH)
	};
}

/**
 * A price in credits. `perGBHourPence` is the cost chosen (usually the
 * full-use floor plus a margin), in minor units of the mint's currency;
 * `minorPerCredit` is one unit of it (100 for pounds: one credit is £1,
 * ADR-Q-042 §3). Says how many credits a GB held for an hour, and for a day,
 * should cost.
 */
export function priceOf(perGBHourPence: number, minorPerCredit: number, margin = 0.2) {
	const withMargin = perGBHourPence * (1 + margin);
	return {
		perGBHourPence: withMargin,
		creditsPerGBHour: minorPerCredit > 0 ? withMargin / minorPerCredit : null,
		/** A GB held for a day, in credits. */
		creditsPerGBDay: minorPerCredit > 0 ? (withMargin * 24) / minorPerCredit : null
	};
}
