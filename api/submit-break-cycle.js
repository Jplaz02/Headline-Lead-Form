const ALLOWED_SHOW_ROOMS = ['Studio 1', 'Studio 2', 'Studio 3', 'Studio 4'];

const SHOW_TABLE_ID = 'tblZoefvyymvshhyM';
const BREAK_TABLE_ID = 'tblN6W33J35pLLqvT';

const SHOW_FIELDS = {
    showName: 'Show Name',
    breaker: 'Breaker',
    showRoom: 'Show Room',
};

const BREAK_FIELDS = {
    breakNumber: 'Break Number',
    customerName: 'Customer Name',
    type: 'Type',
    showLink: 'Show ID',
};

// Airtable allows up to 10 records per batch create.
const AIRTABLE_BATCH_SIZE = 10;

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

export function buildBreakRecords(entries, showRecordId) {
    return entries.map((entry) => {
        const fields = {
            [BREAK_FIELDS.type]: entry.type,
            [BREAK_FIELDS.showLink]: [showRecordId],
        };
        if (entry.type === 'Break') {
            fields[BREAK_FIELDS.breakNumber] = entry.value;
        } else if (entry.type === 'Personal') {
            fields[BREAK_FIELDS.customerName] = entry.value;
        }
        return { fields };
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (!apiKey || !baseId) {
        console.error('AIRTABLE_API_KEY or AIRTABLE_BASE_ID env var missing');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    const showName = String(body.showName || '').trim();
    const breakerName = String(body.breakerName || '').trim();
    const showRoom = String(body.showRoom || '').trim();
    const { entries, error: entriesError } = parseEntries(body.entries);

    if (!showName || showName.length > 200) {
        return res.status(400).json({ error: 'Show Name is required' });
    }
    if (!breakerName || breakerName.length > 200) {
        return res.status(400).json({ error: 'Breaker Name is required' });
    }
    if (!ALLOWED_SHOW_ROOMS.includes(showRoom)) {
        return res.status(400).json({ error: 'Please select a valid Show Room' });
    }
    if (entriesError) {
        return res.status(400).json({ error: entriesError });
    }

    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };

    let showRecordId;
    try {
        const showRes = await fetch(
            `https://api.airtable.com/v0/${baseId}/${SHOW_TABLE_ID}`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    fields: {
                        [SHOW_FIELDS.showName]: showName,
                        [SHOW_FIELDS.breaker]: breakerName,
                        [SHOW_FIELDS.showRoom]: showRoom,
                    },
                }),
            }
        );

        if (!showRes.ok) {
            const text = await showRes.text().catch(() => '');
            console.error('Airtable Show create failed', showRes.status, text);
            return res.status(502).json({
                error: 'Could not create show record',
                airtableStatus: showRes.status,
                airtableError: parseAirtableError(text),
            });
        }

        const showJson = await showRes.json();
        showRecordId = showJson.id;
        if (!showRecordId) {
            console.error('Airtable Show create returned no id', showJson);
            return res.status(502).json({ error: 'Could not create show record' });
        }
    } catch (err) {
        console.error('Network error creating Show:', err);
        return res.status(502).json({ error: 'Network error creating show' });
    }

    const breakRecords = buildBreakRecords(entries, showRecordId);

    const createdBreakIds = [];
    try {
        for (let i = 0; i < breakRecords.length; i += AIRTABLE_BATCH_SIZE) {
            const batch = breakRecords.slice(i, i + AIRTABLE_BATCH_SIZE);
            const breakRes = await fetch(
                `https://api.airtable.com/v0/${baseId}/${BREAK_TABLE_ID}`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ records: batch }),
                }
            );

            if (!breakRes.ok) {
                const text = await breakRes.text().catch(() => '');
                console.error('Airtable Break batch failed', breakRes.status, text);
                await rollbackShow(baseId, headers, showRecordId, createdBreakIds);
                return res.status(502).json({
                    error: 'Could not create break records',
                    airtableStatus: breakRes.status,
                    airtableError: parseAirtableError(text),
                });
            }

            const breakJson = await breakRes.json();
            const ids = (breakJson.records || []).map((r) => r.id).filter(Boolean);
            createdBreakIds.push(...ids);
        }
    } catch (err) {
        console.error('Network error creating Breaks:', err);
        await rollbackShow(baseId, headers, showRecordId, createdBreakIds);
        return res.status(502).json({ error: 'Network error creating breaks' });
    }

    return res.status(200).json({
        ok: true,
        showRecordId,
        breakRecordIds: createdBreakIds,
    });
}

async function rollbackShow(baseId, headers, showRecordId, breakIds) {
    const idsToDelete = [showRecordId, ...breakIds].filter(Boolean);
    if (idsToDelete.length === 0) return;
    try {
        // Delete the show first; breaks will detach automatically. Then clean up any breaks created.
        await fetch(
            `https://api.airtable.com/v0/${baseId}/${SHOW_TABLE_ID}/${showRecordId}`,
            { method: 'DELETE', headers }
        );
        for (const id of breakIds) {
            await fetch(
                `https://api.airtable.com/v0/${baseId}/${BREAK_TABLE_ID}/${id}`,
                { method: 'DELETE', headers }
            ).catch(() => {});
        }
    } catch (err) {
        console.error('Rollback failed; manual cleanup may be needed:', err);
    }
}

function safeJson(str) {
    try { return JSON.parse(str); } catch { return null; }
}

function parseAirtableError(text) {
    if (!text) return null;
    try {
        const json = JSON.parse(text);
        if (json && json.error) {
            if (typeof json.error === 'string') return json.error;
            return {
                type: json.error.type || null,
                message: json.error.message || null,
            };
        }
        return json;
    } catch {
        return text.slice(0, 500);
    }
}
