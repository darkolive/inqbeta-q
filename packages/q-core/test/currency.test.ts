import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCurrency, currencyFrom, minorDigits, minorPerCredit, money, creditsWorth, currencyName } from '../src/currency';

test('one credit is one whole unit, in the currency’s own minor units', () => {
	assert.equal(minorPerCredit('GBP'), 100);
	assert.equal(minorPerCredit('EUR'), 100);
	assert.equal(minorPerCredit('JPY'), 1);
	assert.equal(minorDigits('BHD'), 3);
	assert.equal(creditsWorth(3, 'GBP'), '£3.00');
	assert.equal(creditsWorth(3, 'EUR'), '€3.00');
	assert.equal(money(250, 'GBP'), '£2.50');
	assert.equal(money(250, 'JPY'), 'JP¥250');
});

test('currencies are checked; anything unknown falls back to pounds', () => {
	assert.ok(isCurrency('GBP') && isCurrency('USD'));
	assert.ok(!isCurrency('gbp') && !isCurrency('POUNDS') && !isCurrency('ZZZ') && !isCurrency(100));
	assert.equal(currencyFrom(' eur '), 'EUR');
	assert.equal(currencyFrom('nonsense'), 'GBP');
	assert.equal(currencyFrom(undefined), 'GBP');
	assert.equal(currencyName('GBP'), 'british pound');
});
