// Klien provider nomor OTP berformat SMS-Activate (getNumber / getStatus / setStatus).
const axios = require('axios');

class ProviderError extends Error {
  constructor(raw) {
    super('Provider: ' + raw);
    this.raw = raw;
    const map = {
      NO_NUMBERS: 'Stok nomor sedang kosong untuk kombinasi ini. Coba negara lain.',
      NO_BALANCE: 'Layanan sedang tidak tersedia. Silakan coba beberapa saat lagi.',
      BAD_SERVICE: 'Layanan ini sedang tidak tersedia.'
    };
    this.userMessage = map[raw] || 'Layanan sedang gangguan, silakan coba lagi nanti.';
  }
}

async function call(params) {
  const base = process.env.PROVIDER_BASE_URL;
  const key = process.env.PROVIDER_API_KEY;
  if (!base || !key) throw new ProviderError('NOT_CONFIGURED');
  const r = await axios.get(base, {
    params: { api_key: key, ...params },
    timeout: 15000,
    responseType: 'text',
    transformResponse: x => x
  });
  return String(r.data).trim();
}

async function getNumber(service, country) {
  const t = await call({ action: 'getNumber', service, country });
  const p = t.split(':');
  if (p[0] === 'ACCESS_NUMBER' && p[1] && p[2]) return { id: p[1], phone: p[2] };
  throw new ProviderError(t);
}

// -> { status: 'WAITING' | 'RECEIVED' | 'CANCELLED', code? }
async function getStatus(id) {
  const t = await call({ action: 'getStatus', id });
  if (t.startsWith('STATUS_OK:')) return { status: 'RECEIVED', code: t.slice('STATUS_OK:'.length) };
  if (t === 'STATUS_WAIT_CODE' || t.startsWith('STATUS_WAIT_RETRY') || t === 'STATUS_WAIT_RESEND') return { status: 'WAITING' };
  if (t === 'STATUS_CANCEL') return { status: 'CANCELLED' };
  throw new ProviderError(t);
}

// true hanya jika provider benar-benar membatalkan (aman untuk refund)
async function cancel(id) {
  const t = await call({ action: 'setStatus', id, status: 8 });
  if (t === 'ACCESS_CANCEL') return { ok: true };
  return { ok: false, raw: t }; // contoh: EARLY_CANCEL_DENIED, BAD_STATUS
}

async function finish(id) {
  try { await call({ action: 'setStatus', id, status: 6 }); } catch (_) {}
}

module.exports = { getNumber, getStatus, cancel, finish, ProviderError };
