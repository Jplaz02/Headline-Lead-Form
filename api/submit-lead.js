const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s\-().]{7,}$/;

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
    const phone = String(body.phone || '').trim();

    if (!firstName || firstName.length > 100) {
        return res.status(400).json({ error: 'First name is required' });
    }
    if (!lastName || lastName.length > 100) {
        return res.status(400).json({ error: 'Last name is required' });
    }
    if (!email || !EMAIL_RE.test(email) || email.length > 200) {
        return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!phone || !PHONE_RE.test(phone) || phone.length > 40) {
        return res.status(400).json({ error: 'Valid phone number is required' });
    }

    const payload = {
        firstName,
        lastName,
        email,
        phone,
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
