# Break Cycle Form — Personals Support

**Date:** 2026-05-21
**Status:** Approved design

## Summary

The Breaks section of the Break Cycle form currently lets the user add a list of
break-number inputs and submit them as Break records in Airtable. This change
adds a second entry type, **Personal**, alongside regular Breaks. A Personal
captures a customer name instead of a break number. Each list row is visually
tagged with its type, and each row becomes its own record in the Airtable
**Break** table with a `Type` of `"Break"` or `"Personal"`.

## Goals

- Add an **Add Personal** button beside the existing **Add Break** button.
- Let the list hold a mix of Break rows and Personal rows in any order.
- Make each row's type visually obvious (gold for Break, orange for Personal).
- Write each row to Airtable with the correct `Type`, `Break Number`, and
  `Customer Name` values.
- Keep the existing "at least one entry" submit requirement.

## Non-goals

- No Airtable schema changes — the `Type`, `Break Number`, and `Customer Name`
  fields already exist (see below).
- No changes to the Show record, the rollback logic, or the action/QR pages.
- No backward compatibility for the old `breakNumbers` payload — the front end
  and API ship together.

## Airtable schema (already in place — verified)

Base **Headline Break Tracking** (`appDkOUbdCUWP3nfU`), table **Break**
(`tblN6W33J35pLLqvT`):

- `Type` — single select, choices: **`Break`** and **`Personal`** (exact names).
- `Break Number` — single line text.
- `Customer Name` — single line text. Field description: *"Customer name for
  Personal type entries. Leave blank for regular breaks."*
- `Show ID` — linked record to the Show table (unchanged).
- `Show Name`, `Breaker`, `Show Room` — lookup values pulled through the
  `Show ID` link; they populate automatically and are not written directly.

## User-facing behavior

### Buttons

The single **Add Break** button is replaced by two buttons side by side inside a
flex wrapper:

- **Add Break** — gold dashed style, unchanged behavior. Appends a Break row.
- **Add Personal** — orange dashed style. Appends a Personal row.

### Rows

Each row keeps the existing layout (input + remove button). The badge that today
shows a `01/02` sequence number instead shows the row **type**:

- **Break row** — gold `BREAK` badge, input placeholder "Break number",
  maxlength 50.
- **Personal row** — orange `PERSONAL` badge, input placeholder
  "Customer name", maxlength 100.

Both inputs remain `type="text"`. The remove button behaves as today (hidden
when only one row remains).

### Validation

Unchanged rule: at least one row must exist and every row's input must be
non-empty. Error copy is reworded to cover both types, e.g. "Fill in every break
number and customer name, or remove the empty rows." A fresh or reset form
starts with one **Break** row.

### Success view

The success summary counts all entries and names the types present:

- Mixed: `"2 breaks · 1 personal"`
- Single type: `"3 breaks"` or `"1 personal"`

Singular/plural is handled per type.

## Data flow

### Payload shape

The submit payload replaces `breakNumbers` with a single ordered `entries`
array, preserving on-screen row order:

```json
{
  "showName": "Friday Night Football",
  "breakerName": "John Smith",
  "showRoom": "Studio 2",
  "entries": [
    { "type": "Break", "value": "12" },
    { "type": "Personal", "value": "Jane Doe" }
  ]
}
```

The submit handler iterates `.break-row` elements directly (reading
`data-type` and the input value) rather than using `FormData.getAll`, so row
order and type are preserved.

### Airtable record creation

Each entry becomes one Break record:

- **Break** → `{ "Type": "Break", "Break Number": value, "Show ID": [showId] }`
  (`Customer Name` left unset).
- **Personal** → `{ "Type": "Personal", "Customer Name": value,
  "Show ID": [showId] }` (`Break Number` left unset).

Batch creation (10 records per request) and the existing rollback-on-failure
behavior are unchanged.

## Implementation outline

### 1. `break-cycle.html`

- Replace the lone `#add-break-btn` with a `.break-add-actions` flex wrapper
  containing `#add-break-btn` ("Add Break") and `#add-personal-btn`
  ("Add Personal").
- Update the section label to "Breaks & Personals"; keep the "(at least one)"
  hint.

### 2. `style.css`

- Add orange accent CSS variables mirroring the existing `--brand-gold-*` set
  (base, light, tint, hairline).
- Add an `.add-personal-btn` button variant (orange dashed border, orange text,
  orange hover tint).
- Repurpose the in-input badge as a type chip: gold for
  `.break-row.type-break`, orange for `.break-row.type-personal`.
- Error-state and remove-button styles are unchanged.

### 3. `break-cycle.js`

- Generalize `addBreakRow` into `addEntryRow(type, focus)`:
  - Sets the row's `data-type` and `type-break` / `type-personal` class.
  - Sets badge text (`BREAK` / `PERSONAL`), input placeholder, and maxlength
    (50 for Break, 100 for Personal).
- Wire `#add-break-btn` → `addEntryRow('Break')` and `#add-personal-btn` →
  `addEntryRow('Personal')`.
- The badge no longer shows an index; `renumberRows` reduces to toggling
  remove-button visibility.
- Submit handler builds the `entries` array by iterating `.break-row` elements
  in DOM order.
- Validation (`validateBreaks`) keeps the same rule with reworded copy.
- Success view computes the mixed/singular type summary.
- Reset starts the form with one Break row.

### 4. `api/submit-break-cycle.js`

- Add `Type` and `Customer Name` to the `BREAK_FIELDS` map.
- Accept and validate `entries`: each item must have `type ∈ {Break, Personal}`
  and a non-empty `value`; Break values ≤ 50 chars, Personal values ≤ 100
  chars; at least one entry required. Reject otherwise with a 400.
- Build break records conditionally on `type` per the rules above.
- Show-record creation, batching, and rollback are unchanged.

## Error handling

- Front end: empty rows are highlighted and block submission with the reworded
  group error, identical to today's behavior.
- API: invalid or empty `entries`, bad `type` values, or over-length values
  return `400` with a descriptive `error` message. Airtable failures still
  return `502` and trigger rollback of the Show and any created Break records.

## Testing

- Submit only Breaks → records created with `Type = "Break"` and
  `Break Number` set.
- Submit only Personals → records created with `Type = "Personal"` and
  `Customer Name` set.
- Submit a mix in a specific order → records reflect the correct types and the
  on-screen order.
- Submit with an empty row → blocked client-side; if forced, API rejects with
  400.
- Submit with zero rows → blocked client-side and rejected by the API.
- Over-length break number / customer name → API rejects with 400.
- Success summary shows correct counts and pluralization for mixed and
  single-type submissions.
