# Break Cycle Personals Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Personal" entry type alongside regular Breaks in the Break Cycle form, so each list row can capture either a break number or a customer name and is written to Airtable with the correct `Type`.

**Architecture:** Front end (static HTML/CSS/JS) gains a second "Add Personal" button and color-coded type badges per row; the submit payload changes from a `breakNumbers` string array to an ordered `entries` array of `{type, value}` objects. The serverless API extracts two pure functions — `parseEntries` (validation/normalization) and `buildBreakRecords` (Airtable field mapping) — which are unit-tested with Node's built-in test runner.

**Tech Stack:** Vanilla HTML/CSS/JS, Vercel serverless functions (ESM, Node 18+), Airtable REST API, `node:test` for unit tests (zero new dependencies).

---

## File Structure

- `package.json` — Modify: add a `test` script.
- `tests/submit-break-cycle.test.js` — Create: unit tests for the two extracted pure functions.
- `api/submit-break-cycle.js` — Modify: add `parseEntries` and `buildBreakRecords` exports, extend `BREAK_FIELDS`, wire the handler to use them.
- `break-cycle.html` — Modify: add the "Add Personal" button and update the section label.
- `style.css` — Modify: add orange accent variables, the `.add-personal-btn` variant, type-badge styles, and the buttons wrapper.
- `break-cycle.js` — Modify: generalize row creation to support both entry types, build the `entries` payload, update validation and the success summary.

The two pure functions live in `api/submit-break-cycle.js` (not a new file) because the file is small (~190 lines) and the codebase keeps each API endpoint self-contained in one file. Test files live in `tests/` (not `api/`) so Vercel does not deploy them as serverless functions.

---

## Task 1: Test runner setup + `parseEntries`

**Files:**
- Modify: `package.json`
- Create: `tests/submit-break-cycle.test.js`
- Modify: `api/submit-break-cycle.js`

- [ ] **Step 1: Add the test script to `package.json`**

Replace the entire contents of `package.json` with:

```json
{
    "name": "headline-lead-form",
    "version": "1.0.0",
    "private": true,
    "type": "module",
    "engines": {
        "node": ">=18"
    },
    "scripts": {
        "test": "node --test tests/"
    }
}
```

- [ ] **Step 2: Write the failing tests for `parseEntries`**

Create `tests/submit-break-cycle.test.js` with this exact content:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEntries } from '../api/submit-break-cycle.js';

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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — the test file cannot link, with `SyntaxError: The requested module '../api/submit-break-cycle.js' does not provide an export named 'parseEntries'` (the function is not exported yet).

- [ ] **Step 4: Implement `parseEntries`**

In `api/submit-break-cycle.js`, find this block:

```js
// Airtable allows up to 10 records per batch create.
const AIRTABLE_BATCH_SIZE = 10;
```

Insert the following immediately after it (before `export default async function handler`):

```js

// ───── Entry parsing & record building ─────
const ENTRY_TYPES = ['Break', 'Personal'];
const MAX_BREAK_VALUE = 50;
const MAX_PERSONAL_VALUE = 100;
const MAX_ENTRIES = 100;

export function parseEntries(rawEntries) {
    if (!Array.isArray(rawEntries)) {
        return { entries: null, error: 'At least one break or personal is required' };
    }

    const entries = [];
    for (const item of rawEntries) {
        if (!item || typeof item !== 'object') continue;
        const type = String(item.type || '').trim();
        const value = String(item.value || '').trim();
        if (!value) continue;
        if (!ENTRY_TYPES.includes(type)) {
            return { entries: null, error: 'Each entry must be a Break or a Personal' };
        }
        const maxLength = type === 'Break' ? MAX_BREAK_VALUE : MAX_PERSONAL_VALUE;
        if (value.length > maxLength) {
            return {
                entries: null,
                error: type === 'Break'
                    ? 'Break numbers must be 50 characters or fewer'
                    : 'Customer names must be 100 characters or fewer',
            };
        }
        entries.push({ type, value });
    }

    if (entries.length === 0) {
        return { entries: null, error: 'At least one break or personal is required' };
    }

    return { entries: entries.slice(0, MAX_ENTRIES), error: null };
}
```

- [ ] **Step 5: Run the tests to verify `parseEntries` passes**

Run: `npm test`
Expected: The 9 `parseEntries` tests PASS. The 3 `buildBreakRecords` tests do not exist yet (added in Task 2), so total = 9 passing.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/submit-break-cycle.test.js api/submit-break-cycle.js
git commit -m "feat: add parseEntries validation for break/personal entries"
```

---

## Task 2: `buildBreakRecords`

**Files:**
- Modify: `api/submit-break-cycle.js`
- Modify: `tests/submit-break-cycle.test.js`

- [ ] **Step 1: Write the failing tests for `buildBreakRecords`**

First, update the import line in `tests/submit-break-cycle.test.js`. Change:

```js
import { parseEntries } from '../api/submit-break-cycle.js';
```

to:

```js
import { parseEntries, buildBreakRecords } from '../api/submit-break-cycle.js';
```

Then append these tests to the end of `tests/submit-break-cycle.test.js`:

```js

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — the test file cannot link, with `SyntaxError: The requested module '../api/submit-break-cycle.js' does not provide an export named 'buildBreakRecords'` (the function is not exported yet). This blocks the whole file, including the `parseEntries` tests, until Step 4 adds the export.

- [ ] **Step 3: Extend `BREAK_FIELDS`**

In `api/submit-break-cycle.js`, find this block:

```js
const BREAK_FIELDS = {
    breakNumber: 'Break Number',
    showLink: 'Show ID',
};
```

Replace it with:

```js
const BREAK_FIELDS = {
    breakNumber: 'Break Number',
    customerName: 'Customer Name',
    type: 'Type',
    showLink: 'Show ID',
};
```

- [ ] **Step 4: Implement `buildBreakRecords`**

In `api/submit-break-cycle.js`, find the closing brace of the `parseEntries` function (the line `}` directly after `return { entries: entries.slice(0, MAX_ENTRIES), error: null };`). Insert the following immediately after it:

```js

export function buildBreakRecords(entries, showRecordId) {
    return entries.map((entry) => {
        const fields = {
            [BREAK_FIELDS.type]: entry.type,
            [BREAK_FIELDS.showLink]: [showRecordId],
        };
        if (entry.type === 'Break') {
            fields[BREAK_FIELDS.breakNumber] = entry.value;
        } else {
            fields[BREAK_FIELDS.customerName] = entry.value;
        }
        return { fields };
    });
}
```

- [ ] **Step 5: Run the tests to verify all pass**

Run: `npm test`
Expected: PASS — all 12 tests pass (9 `parseEntries` + 3 `buildBreakRecords`).

- [ ] **Step 6: Commit**

```bash
git add tests/submit-break-cycle.test.js api/submit-break-cycle.js
git commit -m "feat: add buildBreakRecords mapping for break/personal entries"
```

---

## Task 3: Wire the API handler to use the new functions

**Files:**
- Modify: `api/submit-break-cycle.js`

- [ ] **Step 1: Replace the `breakNumbers` extraction**

In `api/submit-break-cycle.js`, inside `handler`, find this block:

```js
    const breakNumbersRaw = Array.isArray(body.breakNumbers) ? body.breakNumbers : [];
    const breakNumbers = breakNumbersRaw
        .map((n) => String(n).trim())
        .filter(Boolean)
        .slice(0, 100);
```

Replace it with:

```js
    const { entries, error: entriesError } = parseEntries(body.entries);
```

- [ ] **Step 2: Replace the `breakNumbers` validation**

In the same file, find this block:

```js
    if (breakNumbers.length === 0) {
        return res.status(400).json({ error: 'At least one break is required' });
    }
    if (breakNumbers.some((n) => n.length > 50)) {
        return res.status(400).json({ error: 'Break numbers must be 50 characters or fewer' });
    }
```

Replace it with:

```js
    if (entriesError) {
        return res.status(400).json({ error: entriesError });
    }
```

- [ ] **Step 3: Replace the break-record construction**

In the same file, find this block:

```js
    const breakRecords = breakNumbers.map((num) => ({
        fields: {
            [BREAK_FIELDS.breakNumber]: num,
            [BREAK_FIELDS.showLink]: [showRecordId],
        },
    }));
```

Replace it with:

```js
    const breakRecords = buildBreakRecords(entries, showRecordId);
```

- [ ] **Step 4: Run the tests to confirm no regression**

Run: `npm test`
Expected: PASS — all 12 tests still pass (the handler is not directly tested, but the extracted functions it now depends on are unchanged).

- [ ] **Step 5: Sanity-check the handler reads cleanly**

Run: `node --check api/submit-break-cycle.js`
Expected: no output, exit code 0 (file parses with no syntax errors). Confirm by reading the file that `breakNumbers` is no longer referenced anywhere.

- [ ] **Step 6: Commit**

```bash
git add api/submit-break-cycle.js
git commit -m "feat: accept entries payload with break/personal types in API"
```

---

## Task 4: Add the "Add Personal" button and update the label

**Files:**
- Modify: `break-cycle.html`

- [ ] **Step 1: Update the section label**

In `break-cycle.html`, find this block:

```html
              <label
                >Break Numbers <span class="req-mark">*</span>
                <span class="label-hint">(at least one)</span></label
              >
```

Replace it with:

```html
              <label
                >Breaks &amp; Personals <span class="req-mark">*</span>
                <span class="label-hint">(at least one)</span></label
              >
```

- [ ] **Step 2: Replace the single button with two buttons**

In `break-cycle.html`, find this block:

```html
              <button type="button" class="add-break-btn" id="add-break-btn">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Add Break</span>
              </button>
```

Replace it with:

```html
              <div class="break-add-actions">
                <button type="button" class="add-break-btn" id="add-break-btn">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>Add Break</span>
                </button>
                <button
                  type="button"
                  class="add-break-btn add-personal-btn"
                  id="add-personal-btn"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  <span>Add Personal</span>
                </button>
              </div>
```

- [ ] **Step 3: Commit**

```bash
git add break-cycle.html
git commit -m "feat: add Add Personal button to break cycle form"
```

---

## Task 5: Style the Personal button and type badges

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Add orange accent variables**

In `style.css`, find this block inside `:root`:

```css
    --brand-gold-tint: rgba(212, 175, 55, 0.08);
    --brand-gold-hairline: rgba(212, 175, 55, 0.18);
```

Replace it with:

```css
    --brand-gold-tint: rgba(212, 175, 55, 0.08);
    --brand-gold-hairline: rgba(212, 175, 55, 0.18);

    --accent-orange: #E8843C;
    --accent-orange-light: #F2A86B;
    --accent-orange-tint: rgba(232, 132, 60, 0.09);
    --accent-orange-hairline: rgba(232, 132, 60, 0.22);
```

- [ ] **Step 2: Replace the index badge styles with type-badge styles**

In `style.css`, find this block:

```css
.break-row .break-index {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--brand-gold);
    letter-spacing: 0.15em;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    user-select: none;
}
```

Replace it with:

```css
.break-row .break-type-badge {
    position: absolute;
    left: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
}

.break-row.type-break .break-type-badge {
    color: var(--brand-gold);
    background: var(--brand-gold-tint);
    border: 1px solid var(--brand-gold-hairline);
}

.break-row.type-personal .break-type-badge {
    color: var(--accent-orange);
    background: var(--accent-orange-tint);
    border: 1px solid var(--accent-orange-hairline);
}
```

- [ ] **Step 3: Widen the input's left padding to clear the badge**

In `style.css`, find this line inside the `.break-row input` rule:

```css
    padding: 1rem 1.15rem 1rem 3.4rem;
```

Replace it with:

```css
    padding: 1rem 1.15rem 1rem 5.3rem;
```

- [ ] **Step 4: Add the buttons wrapper and the Personal button variant**

In `style.css`, find this block:

```css
.add-break-btn:focus-visible {
    outline: 2px solid var(--brand-gold);
    outline-offset: 2px;
}
```

Replace it with:

```css
.add-break-btn:focus-visible {
    outline: 2px solid var(--brand-gold);
    outline-offset: 2px;
}

.break-add-actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-bottom: 0.85rem;
}

.add-personal-btn {
    border-color: var(--accent-orange-hairline);
    color: var(--accent-orange);
}

.add-personal-btn:hover {
    border-color: var(--accent-orange);
    background: var(--accent-orange-tint);
    color: var(--accent-orange-light);
}

.add-personal-btn:focus-visible {
    outline-color: var(--accent-orange);
}
```

Note: the `.break-list` rule already has `margin-bottom: 0.85rem`, so the spacing below the row list is unchanged; the `.break-add-actions` `margin-bottom` separates the buttons from the error message below.

- [ ] **Step 5: Commit**

```bash
git add style.css
git commit -m "feat: style Add Personal button and break/personal type badges"
```

---

## Task 6: Rewrite the form logic to support both entry types

**Files:**
- Modify: `break-cycle.js`

- [ ] **Step 1: Replace the entire contents of `break-cycle.js`**

Replace the whole file with this exact content:

```js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('break-form');
    const submitBtn = document.getElementById('submit-btn');
    const formMessage = document.getElementById('form-message');
    const formView = document.getElementById('form-view');
    const successView = document.getElementById('success-view');
    const successSummary = document.getElementById('success-summary');
    const successShowName = document.getElementById('success-show-name');
    const headerTitle = document.getElementById('header-title');
    const headerSub = document.getElementById('header-sub');
    const breakList = document.getElementById('break-list');
    const addBreakBtn = document.getElementById('add-break-btn');
    const addPersonalBtn = document.getElementById('add-personal-btn');
    const resetBtn = document.getElementById('reset-btn');

    const SUBMIT_ENDPOINT = '/api/submit-break-cycle';

    // ───── Entry type config ─────
    const ENTRY_CONFIG = {
        Break: {
            rowClass: 'type-break',
            badge: 'Break',
            placeholder: 'Break number',
            maxlength: 50,
            removeLabel: 'Remove break',
        },
        Personal: {
            rowClass: 'type-personal',
            badge: 'Personal',
            placeholder: 'Customer name',
            maxlength: 100,
            removeLabel: 'Remove personal',
        },
    };

    // ───── Dynamic entry rows ─────
    let entryCounter = 0;

    const updateRemoveButtons = () => {
        const rows = breakList.querySelectorAll('.break-row');
        rows.forEach((row) => {
            const removeBtn = row.querySelector('.break-remove-btn');
            if (removeBtn) removeBtn.style.display = rows.length > 1 ? 'flex' : 'none';
        });
    };

    const addEntryRow = (type, focus = true) => {
        const cfg = ENTRY_CONFIG[type];
        if (!cfg) return;
        entryCounter += 1;
        const id = `entry-${entryCounter}`;
        const row = document.createElement('div');
        row.className = `break-row ${cfg.rowClass}`;
        row.dataset.type = type;
        row.innerHTML = `
            <div class="break-input-wrap">
                <span class="break-type-badge">${cfg.badge}</span>
                <input
                    type="text"
                    name="entryValue"
                    id="${id}"
                    placeholder="${cfg.placeholder}"
                    maxlength="${cfg.maxlength}"
                    autocomplete="off"
                    required
                />
            </div>
            <button type="button" class="break-remove-btn" aria-label="${cfg.removeLabel}">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        breakList.appendChild(row);

        const input = row.querySelector('input');
        input.addEventListener('input', () => {
            if (row.classList.contains('has-error')) {
                row.classList.remove('has-error');
                clearGroupError('breaks-group', 'breaks-error');
            }
        });

        row.querySelector('.break-remove-btn').addEventListener('click', () => {
            const rows = breakList.querySelectorAll('.break-row');
            if (rows.length <= 1) return;
            row.remove();
            updateRemoveButtons();
        });

        updateRemoveButtons();
        if (focus) input.focus();
    };

    addBreakBtn.addEventListener('click', () => addEntryRow('Break', true));
    addPersonalBtn.addEventListener('click', () => addEntryRow('Personal', true));

    // Start with one break row
    addEntryRow('Break', false);

    // ───── Validation helpers ─────
    const setFieldError = (input, message) => {
        const group = input.closest('.input-group');
        const errorEl = document.getElementById(`${input.id}-error`);
        if (message) {
            group.classList.add('has-error');
            input.setAttribute('aria-invalid', 'true');
            if (errorEl) errorEl.textContent = message;
        } else {
            group.classList.remove('has-error');
            input.removeAttribute('aria-invalid');
            if (errorEl) errorEl.textContent = '';
        }
    };

    const validateField = (input) => {
        const value = input.value.trim();
        if (!value) {
            const labelText = input.previousElementSibling?.firstChild?.textContent?.trim() || 'This field';
            setFieldError(input, `${labelText} is required.`);
            return false;
        }
        setFieldError(input, '');
        return true;
    };

    const setGroupError = (groupId, errorId, message) => {
        const group = document.getElementById(groupId);
        const errorEl = document.getElementById(errorId);
        if (message) {
            group.classList.add('has-error');
            if (errorEl) errorEl.textContent = message;
        } else {
            group.classList.remove('has-error');
            if (errorEl) errorEl.textContent = '';
        }
    };

    const clearGroupError = (groupId, errorId) => setGroupError(groupId, errorId, '');

    const validateShowRoom = () => {
        const selected = form.querySelector('input[name="showRoom"]:checked');
        if (!selected) {
            setGroupError('showRoom-group', 'showRoom-error', 'Please pick a studio.');
            return false;
        }
        setGroupError('showRoom-group', 'showRoom-error', '');
        return true;
    };

    const validateEntries = () => {
        const rows = breakList.querySelectorAll('.break-row');
        if (rows.length === 0) {
            setGroupError('breaks-group', 'breaks-error', 'Please add at least one break or personal.');
            return false;
        }

        let allValid = true;
        rows.forEach((row) => {
            const input = row.querySelector('input');
            if (!input.value.trim()) {
                row.classList.add('has-error');
                allValid = false;
            } else {
                row.classList.remove('has-error');
            }
        });

        if (!allValid) {
            setGroupError('breaks-group', 'breaks-error', 'Fill in every break number and customer name, or remove the empty rows.');
            return false;
        }

        setGroupError('breaks-group', 'breaks-error', '');
        return true;
    };

    const validateForm = () => {
        const textInputs = form.querySelectorAll('.form-section input[required][type="text"]');
        let firstInvalid = null;
        let allValid = true;
        textInputs.forEach((input) => {
            // Skip entry inputs — handled by validateEntries
            if (input.name === 'entryValue') return;
            const valid = validateField(input);
            if (!valid) {
                allValid = false;
                if (!firstInvalid) firstInvalid = input;
            }
        });
        if (!validateShowRoom()) {
            allValid = false;
            if (!firstInvalid) firstInvalid = document.getElementById('showRoom-group');
        }
        if (!validateEntries()) {
            allValid = false;
            if (!firstInvalid) firstInvalid = document.getElementById('breaks-group');
        }
        if (firstInvalid && typeof firstInvalid.scrollIntoView === 'function') {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (firstInvalid.tagName === 'INPUT') firstInvalid.focus();
        }
        return allValid;
    };

    // Live error clearing on the static fields
    form.querySelectorAll('#showName, #breakerName').forEach((input) => {
        input.addEventListener('input', () => {
            const group = input.closest('.input-group');
            if (group.classList.contains('has-error')) validateField(input);
        });
        input.addEventListener('blur', () => {
            if (input.value.trim()) validateField(input);
        });
    });

    form.querySelectorAll('input[name="showRoom"]').forEach((el) => {
        el.addEventListener('change', validateShowRoom);
    });

    // ───── Submit ─────
    const summarizeEntries = (entries) => {
        const breaks = entries.filter((e) => e.type === 'Break').length;
        const personals = entries.filter((e) => e.type === 'Personal').length;
        const parts = [];
        if (breaks) parts.push(`${breaks} break${breaks === 1 ? '' : 's'}`);
        if (personals) parts.push(`${personals} personal${personals === 1 ? '' : 's'}`);
        return parts.join(' · ') || '0 entries';
    };

    const showSuccessView = (record) => {
        formView.hidden = true;
        successView.hidden = false;
        if (headerTitle) {
            headerTitle.innerHTML = `Logged. <span class="text-gold">Nice.</span>`;
        }
        if (headerSub) {
            headerSub.textContent = 'Your show and breaks are in Airtable.';
        }
        if (successSummary) {
            successSummary.textContent = summarizeEntries(record?.entries || []);
        }
        if (successShowName) {
            successShowName.textContent = record?.showName || '';
        }
    };

    const resetView = () => {
        successView.hidden = true;
        formView.hidden = false;
        if (headerTitle) {
            headerTitle.innerHTML = `Start a <span class="text-gold">Break Cycle</span>`;
        }
        if (headerSub) {
            headerSub.textContent = 'Log a show and its breaks. Each break gets linked back to the show automatically.';
        }
        form.reset();
        breakList.innerHTML = '';
        entryCounter = 0;
        addEntryRow('Break', false);
        formMessage.classList.remove('show', 'success', 'error');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (resetBtn) resetBtn.addEventListener('click', resetView);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitBtn.classList.contains('loading')) return;

        formMessage.classList.remove('show', 'success', 'error');

        if (!validateForm()) {
            formMessage.textContent = 'Please complete the highlighted fields before submitting.';
            formMessage.className = 'error show';
            return;
        }

        const formData = new FormData(form);
        const entries = Array.from(breakList.querySelectorAll('.break-row'))
            .map((row) => ({
                type: row.dataset.type,
                value: row.querySelector('input').value.trim(),
            }))
            .filter((entry) => entry.value);

        const data = {
            showName: formData.get('showName').trim(),
            breakerName: formData.get('breakerName').trim(),
            showRoom: formData.get('showRoom'),
            entries,
        };

        submitBtn.classList.add('loading');
        submitBtn.disabled = true;

        try {
            const response = await fetch(SUBMIT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                console.error('Submission error payload:', err);
                const detail = err.airtableError && (err.airtableError.message || err.airtableError.type)
                    ? ` (Airtable: ${err.airtableError.message || err.airtableError.type})`
                    : '';
                throw new Error(`${err.error || 'Submission failed'}${detail}`);
            }

            showSuccessView(data);
        } catch (error) {
            console.error('Error submitting break cycle:', error);
            formMessage.textContent = error.message && error.message !== 'Submission failed'
                ? error.message
                : 'Oops! Something went wrong. Please try again.';
            formMessage.className = 'error show';
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });
});
```

- [ ] **Step 2: Sanity-check the file parses**

Run: `node --check break-cycle.js`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add break-cycle.js
git commit -m "feat: support break and personal entry rows in break cycle form"
```

---

## Task 7: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `npm test`
Expected: PASS — all 12 tests pass.

- [ ] **Step 2: Start the form locally**

Run: `npx vercel dev` (requires the Airtable env vars from `.env.example` set in `.env`, or run it against a Vercel preview deployment instead).
Open `http://localhost:3000/break-cycle` in a browser.

- [ ] **Step 3: Verify the UI**

Confirm by observation:
- Two buttons appear side by side: "Add Break" (gold dashed) and "Add Personal" (orange dashed).
- The form starts with one Break row showing a gold `BREAK` badge and "Break number" placeholder.
- Clicking "Add Personal" appends a row with an orange `PERSONAL` badge and "Customer name" placeholder.
- The badge text is fully visible and does not overlap typed input text.
- With two or more rows, each row shows its remove (×) button; with one row the remove button is hidden.

- [ ] **Step 4: Verify validation**

- Submitting with an empty row highlights that row red and blocks submission with the message "Fill in every break number and customer name, or remove the empty rows."
- Removing all rows down to one empty row and submitting still blocks submission.

- [ ] **Step 5: Verify submission and Airtable records**

Submit a show with a mix — e.g. one Break "12", one Personal "Jane Doe", one Break "13" — and confirm:
- The success view shows a summary like "2 breaks · 1 personal".
- In the Airtable **Break** table (base `appDkOUbdCUWP3nfU`, table `tblN6W33J35pLLqvT`), three new records exist linked to the new Show, with: the two Breaks having `Type = Break` and `Break Number` set / `Customer Name` blank; the Personal having `Type = Personal` and `Customer Name` set / `Break Number` blank.
- Repeat with Breaks only (summary reads "3 breaks") and Personals only (summary reads "1 personal").

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

If Step 3–5 surfaced small fixes (e.g. badge padding tweak), commit them:

```bash
git add -A
git commit -m "fix: address break cycle personals verification findings"
```

If no fixes were needed, this step is a no-op.

---

## Self-Review Notes

**Spec coverage:** Two buttons (Task 4) ✓; type-tagged rows with distinct color (Tasks 5, 6) ✓; `Type`/`Break Number`/`Customer Name` field mapping (Task 2) ✓; Show ID link and lookups unchanged (Task 3 keeps `showLink`, no Show changes) ✓; at-least-one-entry validation client-side (Task 6 `validateEntries`) and server-side (Task 1 `parseEntries`) ✓; success summary wording (Task 6 `summarizeEntries`) ✓.

**Type consistency:** `parseEntries` returns `{entries, error}`; the handler destructures `{entries, error: entriesError}` (Task 3). `buildBreakRecords(entries, showRecordId)` signature matches its call site. Front-end `entries` items are `{type, value}`, matching what `parseEntries` expects. Row `data-type` values are `'Break'`/`'Personal'`, matching `ENTRY_CONFIG` keys, `ENTRY_TYPES`, and the Airtable `Type` choice names exactly.

**No placeholders:** every step contains complete code or an exact command.
