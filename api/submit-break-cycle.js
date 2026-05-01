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
    showLink: 'Show ID',
};

// Airtable allows up to 10 records per batch create.
const AIRTABLE_BATCH_SIZE = 10;

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
    const breakNumbersRaw = Array.isArray(body.breakNumbers) ? body.breakNumbers : [];
    const breakNumbers = breakNumbersRaw
        .map((n) => String(n).trim())
        .filter(Boolean)
        .slice(0, 100);

    if (!showName || showName.length > 200) {
        return res.status(400).json({ error: 'Show Name is required' });
    }
    if (!breakerName || breakerName.length > 200) {
        return res.status(400).json({ error: 'Breaker Name is required' });
    }
    if (!ALLOWED_SHOW_ROOMS.includes(showRoom)) {
        return res.status(400).json({ error: 'Please select a valid Show Room' });
    }
    if (breakNumbers.length === 0) {
        return res.status(400).json({ error: 'At least one break is required' });
    }
    if (breakNumbers.some((n) => n.length > 50)) {
        return res.status(400).json({ error: 'Break numbers must be 50 characters or fewer' });
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
            return res.status(502).json({ error: 'Could not create show record' });
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

    const breakRecords = breakNumbers.map((num) => ({
        fields: {
            [BREAK_FIELDS.breakNumber]: num,
            [BREAK_FIELDS.showLink]: [showRecordId],
        },
    }));

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
                return res.status(502).json({ error: 'Could not create break records' });
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
