const EVENTS_TABLE_ID = 'tbllS5BreaRk7Sawp';

const EVENT_FIELDS = {
    action: 'Action',
    scannedBy: 'Scanned By',
    recordId: 'Record ID',
};

const ALLOWED_ACTIONS = [
    'Start Sorting',
    'Finish Sorting',
    'Start Shipping',
    'Finish Shipping',
];

const RECORD_ID_PATTERN = /^rec[A-Za-z0-9]{14}$/;

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

    const breakId = String(body.breakId || '').trim();
    const action = String(body.action || '').trim();
    const scannedBy = String(body.scannedBy || '').trim();

    if (!RECORD_ID_PATTERN.test(breakId)) {
        return res.status(400).json({ error: 'Invalid break id' });
    }
    if (!ALLOWED_ACTIONS.includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }
    if (!scannedBy || scannedBy.length > 200) {
        return res.status(400).json({ error: 'Your Name is required' });
    }

    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };

    let airtableRes;
    try {
        airtableRes = await fetch(
            `https://api.airtable.com/v0/${baseId}/${EVENTS_TABLE_ID}`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    fields: {
                        [EVENT_FIELDS.action]: action,
                        [EVENT_FIELDS.scannedBy]: scannedBy,
                        [EVENT_FIELDS.recordId]: breakId,
                    },
                }),
            }
        );
    } catch (err) {
        console.error('Network error creating Event:', err);
        return res.status(502).json({ error: 'Network error creating event' });
    }

    if (!airtableRes.ok) {
        const text = await airtableRes.text().catch(() => '');
        console.error('Airtable Event create failed', airtableRes.status, text);
        return res.status(502).json({
            error: 'Could not create event record',
            airtableStatus: airtableRes.status,
            airtableError: parseAirtableError(text),
        });
    }

    const json = await airtableRes.json();
    return res.status(200).json({ ok: true, eventId: json.id });
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
