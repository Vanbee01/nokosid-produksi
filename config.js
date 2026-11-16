// Harga jual (basePrice * multiplier) HARUS di atas harga beli dari provider Anda.
// `code` = kode layanan di provider (cek dokumentasi provider; contoh TikTok di SMS-Activate = "lf").
module.exports = {
  services: [
    { id: 'wa', name: 'WhatsApp', code: 'wa', basePrice: 3500 },
    { id: 'tg', name: 'Telegram', code: 'tg', basePrice: 2500 },
    { id: 'go', name: 'Google / Gmail', code: 'go', basePrice: 2000 },
    { id: 'ig', name: 'Instagram', code: 'ig', basePrice: 1800 },
    { id: 'tt', name: 'TikTok', code: 'lf', basePrice: 2200 }
  ],
  countries: [
    { id: '6', name: 'Indonesia', code: '+62', multiplier: 1.0 },
    { id: '7', name: 'Malaysia', code: '+60', multiplier: 1.2 },
    { id: '0', name: 'Rusia', code: '+7', multiplier: 0.9 },
    { id: '187', name: 'Amerika Serikat', code: '+1', multiplier: 1.5 }
  ],
  // Kode channel Tripay, sesuaikan dengan channel yang aktif di dashboard Tripay Anda
  methods: [
    { code: 'QRIS', name: 'QRIS' },
    { code: 'BRIVA', name: 'BRI Virtual Account' },
    { code: 'BNIVA', name: 'BNI Virtual Account' },
    { code: 'MANDIRIVA', name: 'Mandiri Virtual Account' }
  ],
  minDeposit: 10000,
  maxDeposit: 2000000,
  orderTtlMs: 15 * 60 * 1000,
  maxActiveOrders: 5
};
