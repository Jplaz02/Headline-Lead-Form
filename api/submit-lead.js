const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_E164_RE = /^\+[1-9]\d{6,14}$/;
const ALLOWED_INTERESTS = ['Breaks', 'Singles', 'Both'];
const ALLOWED_SPORTS = ['Football', 'Basketball', 'Baseball', 'Hockey', 'Other'];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('MAKE_WEBHOOK_URL env var is not configured');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
    if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim().replace(/\s+/g, '');
    const phoneCountry = String(body.phoneCountry || '').trim().toUpperCase().slice(0, 2) || null;
    const phoneDialCode = String(body.phoneDialCode || '').trim().slice(0, 6) || null;
    const interest = String(body.interest || '').trim();
    const sportsRaw = Array.isArray(body.sports) ? body.sports : [];
    const sports = sportsRaw
        .map((s) => String(s).trim())
        .filter((s) => ALLOWED_SPORTS.includes(s));
    const referral = String(body.referral || '').trim().slice(0, 200);

    if (!firstName || firstName.length > 100) {
        return res.status(400).json({ error: 'First name is required' });
    }
    if (!lastName || lastName.length > 100) {
        return res.status(400).json({ error: 'Last name is required' });
    }
    if (!email || !EMAIL_RE.test(email) || email.length > 200) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!phone || !PHONE_E164_RE.test(phone)) {
        return res.status(400).json({ error: 'Valid phone number is required' });
    }
    if (!ALLOWED_INTERESTS.includes(interest)) {
        return res.status(400).json({ error: 'Please select an interest' });
    }
    if (sports.length === 0) {
        return res.status(400).json({ error: 'Please select at least one sport' });
    }

    const payload = {
        firstName,
        lastName,
        email,
        phone,
        phoneCountry,
        phoneDialCode,
        interest,
        sports,
        sportsList: sports.join(', '),
        referral: referral || null,
        submittedAt: new Date().toISOString(),
        userAgent: req.headers['user-agent'] || null,
        ip:
            (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
            req.socket?.remoteAddress ||
            null,
    };

    try {
        const upstream = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!upstream.ok) {
            const text = await upstream.text().catch(() => '');
            console.error('Make webhook failed', upstream.status, text);
            return res.status(502).json({ error: 'Upstream webhook failed' });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Error forwarding to Make:', err);
        return res.status(502).json({ error: 'Network error' });
    }
}

function safeJson(str) {
    try { return JSON.parse(str); } catch { return null; }
}
