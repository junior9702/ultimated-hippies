// Vercel serverless function: PayHero Kenya M-PESA STK Push
// Credentials and routing values MUST stay in Vercel Environment Variables.
// Required: PAYHERO_API_USERNAME, PAYHERO_API_PASSWORD, PAYHERO_CHANNEL_ID,
// PAYHERO_ACCOUNT_ID, PAYHERO_CALLBACK_URL.
// Optional: PAYHERO_BASE_URL (defaults to the current PayHero production API).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const {
    PAYHERO_API_USERNAME,
    PAYHERO_API_PASSWORD,
    PAYHERO_CHANNEL_ID,
    PAYHERO_ACCOUNT_ID,
    PAYHERO_CALLBACK_URL,
    PAYHERO_BASE_URL = 'https://api.payhero.africa'
  } = process.env;

  const missing = [];
  if (!PAYHERO_API_USERNAME) missing.push('PAYHERO_API_USERNAME');
  if (!PAYHERO_API_PASSWORD) missing.push('PAYHERO_API_PASSWORD');
  if (!PAYHERO_CHANNEL_ID) missing.push('PAYHERO_CHANNEL_ID');
  if (!PAYHERO_ACCOUNT_ID) missing.push('PAYHERO_ACCOUNT_ID');
  if (!PAYHERO_CALLBACK_URL) missing.push('PAYHERO_CALLBACK_URL');
  if (missing.length) {
    return res.status(503).json({
      success: false,
      message: 'PayHero is not fully configured. Missing: ' + missing.join(', ')
    });
  }

  const body = req.body || {};
  let phone = String(body.phone_number || '').replace(/[\s+()-]/g, '');
  if (/^0[17]\d{8}$/.test(phone)) phone = '254' + phone.slice(1);
  if (!/^254[17]\d{8}$/.test(phone)) {
    return res.status(400).json({ success: false, message: 'Invalid Kenyan phone number. Use 07XXXXXXXX or 2547XXXXXXXX.' });
  }

  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 150000) {
    return res.status(400).json({ success: false, message: 'Enter a valid whole-number amount.' });
  }

  const channelId = Number(PAYHERO_CHANNEL_ID);
  const accountId = Number(PAYHERO_ACCOUNT_ID);
  if (!Number.isInteger(channelId) || channelId < 1) {
    return res.status(500).json({ success: false, message: 'PAYHERO_CHANNEL_ID must be a valid numeric channel ID.' });
  }
  if (!Number.isInteger(accountId) || accountId < 1) {
    return res.status(500).json({ success: false, message: 'PAYHERO_ACCOUNT_ID must be a valid numeric account ID.' });
  }

  const reference = 'UH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const auth = Buffer.from(PAYHERO_API_USERNAME + ':' + PAYHERO_API_PASSWORD).toString('base64');

  try {
    const upstream = await fetch(PAYHERO_BASE_URL.replace(/\/$/, '') + '/api/v2/payments', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + auth,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        amount,
        phone_number: phone,
        provider: 'm-pesa',
        channel_id: channelId,
        account_id: accountId,
        external_reference: reference,
        callback_url: PAYHERO_CALLBACK_URL
      })
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const providerMessage = data.error_message || data.message || data.error || ('PayHero HTTP ' + upstream.status);
      return res.status(upstream.status >= 400 && upstream.status < 500 ? 400 : 502).json({
        success: false,
        message: providerMessage,
        provider_status: upstream.status,
        provider_response: data
      });
    }

    return res.status(200).json({
      success: true,
      message: 'STK Push initiated',
      reference: data.reference || reference,
      provider_response: data
    });
  } catch (e) {
    return res.status(502).json({
      success: false,
      message: 'Unable to reach PayHero. Check PAYHERO_BASE_URL and Vercel deployment logs.',
      detail: e?.message || String(e)
    });
  }
}
