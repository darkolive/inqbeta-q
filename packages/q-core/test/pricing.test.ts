/* From the flow to a price (ADR-Q-028 §5a). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costOf, flowOf, priceOf } from '../src/pricing';

const GB = 1024 ** 3;
const day = (inGB: number, gbHours: number, timedOut = 0) => ({ day: 'x', in: { items: 10, bytes: inGB * GB }, arrived: { items: 10 - timedOut, bytes: inGB * GB, byteHours: gbHours * GB }, timedOut: { items: timedOut, bytes: 0, byteHours: 0 } });

test('the flow adds up: files, gigabytes, gigabyte-hours, how long things wait', () => {
	const f = flowOf([day(2, 4), day(1, 2, 1)]);
	assert.equal(f.days, 2);
	assert.equal(f.files, 20);
	assert.equal(f.bytesIn, 3 * GB);
	assert.equal(f.byteHours, 6 * GB);
	assert.equal(f.meanHours, 2);
	assert.equal(f.timedOut, 1);
});

test('what holding costs: at today’s use, and the floor if the node were full', () => {
	const c = costOf(flowOf([day(2, 4), day(1, 2)]), 600, 20); // £6 a month, 20 GB of relay space
	assert.equal(c.costPence, 40); // two days of £6 a month
	assert.ok(Math.abs(c.perGBHourNow! - 40 / 6) < 1e-9);
	assert.ok(Math.abs(c.perGBNow! - 40 / 3) < 1e-9);
	assert.ok(Math.abs(c.perGBHourFull - 600 / (20 * 730)) < 1e-9);
	assert.equal(costOf(flowOf([]), 600, 20).perGBHourNow, null, 'no use yet: no figure, not a made-up one');
});

test('a price in credits, for a GB-hour and a GB-day', () => {
	const p = priceOf(0.05, 1, 0.2);
	assert.ok(Math.abs(p.perGBHourPence - 0.06) < 1e-12);
	assert.ok(Math.abs(p.creditsPerGBHour! - 0.06) < 1e-12);
	assert.ok(Math.abs(p.creditsPerGBDay! - 1.44) < 1e-12);
});
