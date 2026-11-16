const crypto = require('crypto');
const axios = require('axios');

const env = () => ({
  merchant: process.env.TRIPAY_MERCHANT_CODE,
  apiKey: process.env.TRIPAY_API_KEY,
  priv: process.env.TRIPAY_PRIVATE_KEY,
  base: process.env.TRIPAY_MODE === 'production' ? 'https://tripay.co.id/api' : 'https://tripay.co.id/api-sandbox'
});

const hmac = (data, key) => crypto.createHmac('sha256', key).update(data).digest('hex');

async function createTransaction({ ref, amount, method, email, returnUrl }) {
  const c = env();
  if (!c.merchant || !c.apiKey || !c.priv) throw new Error('Tripay belum dikonfigurasi');
  const body = {
    method,
    merchant_ref: ref,
    amount,
    customer_name: email.split('@')[0],
    customer_email: email,
    order_items: [{ name: 'Isi Saldo NokosID', price: amount, quantity: 1 }],
    return_url: returnUrl,
    expired_time: Math.floor(Date.now() / 1000) + 24 * 3600,
    signature: hmac(c.merchant + ref + amount, c.priv)
  };
  const r = await axios.post(c.base + '/transaction/create', body, {
    headers: { Authorization: 'Bearer ' + c.apiKey },
    timeout: 20000,
    validateStatus: () => true
  });
  if (!r.data || !r.data.success) throw new Error('Tripay: ' + (r.data && r.data.message ? r.data.message : r.status));
  return r.data.data; // { reference, checkout_url, ... }
}

function verifyCallback(rawBody, signature) {
  const c = env();
  if (!c.priv || !signature || !rawBody) return false;
  const expected = Buffer.from(hmac(rawBody, c.priv));
  const given = Buffer.from(String(signature));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

module.exports = { createTransaction, verifyCallback };
