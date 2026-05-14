'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { minorUnitToMajor } = require('../assets/quraan-buybox.js');

// Regression lock: the webhook payload sent to the OMS must carry prices in the
// currency's MAJOR unit. Shopify gives us integers in the MINOR unit (cents for
// 2-decimal currencies, millimes for 3-decimal ones). A real corrupted payload
// sent `unit_price: 7000` for a 7.000 TND product — these tests pin the scale.

test('TND (3 decimals) — millimes convert to dinars', () => {
  // 7.000 TND is stored as 7000 millimes.
  assert.equal(minorUnitToMajor(7000, 'TND'), 7);
  assert.equal(minorUnitToMajor(7500, 'TND'), 7.5);
  assert.equal(minorUnitToMajor(123456, 'TND'), 123.456);
});

test('LYD (3 decimals) — Libya, the store target market', () => {
  assert.equal(minorUnitToMajor(7000, 'LYD'), 7);
  assert.equal(minorUnitToMajor(80000, 'LYD'), 80);
});

test('USD (2 decimals) — cents convert to dollars', () => {
  assert.equal(minorUnitToMajor(7000, 'USD'), 70);
  assert.equal(minorUnitToMajor(199, 'USD'), 1.99);
});

test('JPY (0 decimals) — no minor unit, value unchanged', () => {
  assert.equal(minorUnitToMajor(7000, 'JPY'), 7000);
});

test('unknown / empty currency falls back to 2 decimals', () => {
  assert.equal(minorUnitToMajor(7000, ''), 70);
  assert.equal(minorUnitToMajor(7000, 'ZZZ'), 70);
});

test('non-numeric / missing amount is treated as 0', () => {
  assert.equal(minorUnitToMajor(undefined, 'TND'), 0);
  assert.equal(minorUnitToMajor(NaN, 'TND'), 0);
  assert.equal(minorUnitToMajor(null, 'USD'), 0);
});

test('rounds to the currency precision — no float artifacts', () => {
  // 10 millimes / 3 copies — division would otherwise leak a long float.
  const perUnit = minorUnitToMajor(10000 / 3, 'TND');
  assert.equal(perUnit, 3.333);
});

test('the exact bug from the corrupted payload no longer reproduces', () => {
  // Reported payload: unit_price/total_price/compare_at_total all = 7000 for a
  // 7.000 TND product. After the fix all three must be 7, not 7000.
  const currency = 'TND';
  const currentPrice = 7000; // minor units, as Shopify hands it to us
  const currentCompareAt = 7000;
  const currentQuantity = 1;

  assert.equal(minorUnitToMajor(currentPrice, currency), 7);
  assert.equal(minorUnitToMajor(currentCompareAt, currency), 7);
  assert.equal(
    minorUnitToMajor(currentPrice / Math.max(currentQuantity, 1), currency),
    7
  );
});
