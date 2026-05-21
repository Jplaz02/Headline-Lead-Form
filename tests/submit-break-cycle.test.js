import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEntries, buildBreakRecords } from '../api/submit-break-cycle.js';

test('parseEntries accepts a mix of breaks and personals in order', () => {
    const { entries, error } = parseEntries([
        { type: 'Break', value: '12' },
        { type: 'Personal', value: 'Jane Doe' },
        { type: 'Break', value: '13' },
    ]);
    assert.equal(error, null);
    assert.deepEqual(entries, [
        { type: 'Break', value: '12' },
        { type: 'Personal', value: 'Jane Doe' },
        { type: 'Break', value: '13' },
    ]);
});

test('parseEntries trims values and drops empty rows', () => {
    const { entries, error } = parseEntries([
        { type: 'Break', value: '  12  ' },
        { type: 'Personal', value: '   ' },
    ]);
    assert.equal(error, null);
    assert.deepEqual(entries, [{ type: 'Break', value: '12' }]);
});

test('parseEntries rejects a non-array payload', () => {
    const { entries, error } = parseEntries(undefined);
    assert.equal(entries, null);
    assert.match(error, /at least one/i);
});

test('parseEntries rejects an empty list', () => {
    const { entries, error } = parseEntries([]);
    assert.equal(entries, null);
    assert.match(error, /at least one/i);
});

test('parseEntries rejects a list with only empty values', () => {
    const { entries, error } = parseEntries([{ type: 'Break', value: '' }]);
    assert.equal(entries, null);
    assert.match(error, /at least one/i);
});

test('parseEntries rejects an unknown entry type', () => {
    const { entries, error } = parseEntries([{ type: 'Wibble', value: 'x' }]);
    assert.equal(entries, null);
    assert.match(error, /break or a personal/i);
});

test('parseEntries rejects an over-long break number', () => {
    const { entries, error } = parseEntries([{ type: 'Break', value: 'x'.repeat(51) }]);
    assert.equal(entries, null);
    assert.match(error, /50 characters/i);
});

test('parseEntries rejects an over-long customer name', () => {
    const { entries, error } = parseEntries([{ type: 'Personal', value: 'x'.repeat(101) }]);
    assert.equal(entries, null);
    assert.match(error, /100 characters/i);
});

test('parseEntries allows a break number of exactly 50 characters', () => {
    const { entries, error } = parseEntries([{ type: 'Break', value: 'x'.repeat(50) }]);
    assert.equal(error, null);
    assert.equal(entries.length, 1);
});

test('parseEntries allows a customer name of exactly 100 characters', () => {
    const { entries, error } = parseEntries([{ type: 'Personal', value: 'x'.repeat(100) }]);
    assert.equal(error, null);
    assert.equal(entries.length, 1);
});

test('parseEntries rejects an item with no type key', () => {
    const { entries, error } = parseEntries([{ value: 'foo' }]);
    assert.equal(entries, null);
    assert.match(error, /break or a personal/i);
});

test('parseEntries caps the result at 100 entries', () => {
    const raw = Array.from({ length: 101 }, (_, i) => ({ type: 'Break', value: String(i + 1) }));
    const { entries, error } = parseEntries(raw);
    assert.equal(error, null);
    assert.equal(entries.length, 100);
});

test('buildBreakRecords maps a Break to the Break Number field', () => {
    const records = buildBreakRecords([{ type: 'Break', value: '12' }], 'recABC');
    assert.deepEqual(records, [
        {
            fields: {
                Type: 'Break',
                'Break Number': '12',
                'Show ID': ['recABC'],
            },
        },
    ]);
});

test('buildBreakRecords maps a Personal to the Customer Name field', () => {
    const records = buildBreakRecords([{ type: 'Personal', value: 'Jane Doe' }], 'recABC');
    assert.deepEqual(records, [
        {
            fields: {
                Type: 'Personal',
                'Customer Name': 'Jane Doe',
                'Show ID': ['recABC'],
            },
        },
    ]);
});

test('buildBreakRecords preserves order and leaves the unused field unset', () => {
    const records = buildBreakRecords(
        [
            { type: 'Break', value: '1' },
            { type: 'Personal', value: 'A' },
        ],
        'recX'
    );
    assert.equal(records[0].fields['Break Number'], '1');
    assert.equal(records[0].fields['Customer Name'], undefined);
    assert.equal(records[1].fields['Customer Name'], 'A');
    assert.equal(records[1].fields['Break Number'], undefined);
});
