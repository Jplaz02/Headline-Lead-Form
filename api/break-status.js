const BREAK_TABLE_ID = 'tblN6W33J35pLLqvT';

const BREAK_FIELDS = {
    breakNumber: 'Break Number',
    status: 'Status',
};

const RECORD_ID_PATTERN = /^rec[A-Za-z0-9]{14}$/;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const id = String(req.query?.id || '').trim();
    if (!RECORD_ID_PATTERN.test(id)) {
        return res.status(400).json({ error: 'Invalid or missing break id' });
    }

    const apiKey = process.env.AIRTABLE_API_KEY;
    const baseId = process.env.AIRTABLE_BASE_ID;
    if (!apiKey || !baseId) {
        console.error('AIRTABLE_API_KEY or AIRTABLE_BASE_ID env var missing');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${BREAK_TABLE_ID}/${id}`;
    let airtableRes;
    try {
        airtableRes = await fetch(url, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
    } catch (err) {
        console.error('Network error fetching break:', err);
        return res.status(502).json({ error: 'Network error fetching break' });
    }

    if (airtableRes.status === 404) {
        return res.status(404).json({ error: 'Break not found' });
    }

    if (!airtableRes.ok) {
        const text = await airtableRes.text().catch(() => '');
        console.error('Airtable break fetch failed', airtableRes.status, text);
        return res.status(502).json({
            error: 'Could not fetch break',
            airtableStatus: airtableRes.status,
            airtableError: parseAirtableError(text),
        });
    }

    const json = await airtableRes.json();
    const fields = json.fields || {};
    return res.status(200).json({
        id: json.id,
        status: fields[BREAK_FIELDS.status] || null,
        breakNumber: fields[BREAK_FIELDS.breakNumber] || null,
    });
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
