# NokosID (versi produksi)

Layanan nomor virtual penerima OTP: registrasi/login, saldo per pengguna, isi saldo via **Tripay**, nomor dari provider berformat **SMS-Activate**, database SQLite, refund otomatis.

## Yang perlu Anda siapkan
1. Akun provider nomor OTP berformat SMS-Activate (isi `PROVIDER_BASE_URL` dan `PROVIDER_API_KEY`), dengan saldo di sisi provider.
2. Akun Tripay (merchant code, API key, private key). Mulai dari mode `sandbox`.
3. Domain + hosting Node.js dengan **persistent disk/volume** (SQLite menyimpan data di `DATA_DIR`).

## Langkah deploy
1. `cp .env.example .env` lalu isi semuanya (`APP_URL` = alamat publik situs, pakai HTTPS).
2. Cek `config.js`: kode layanan provider (`code`), harga jual, dan kode channel pembayaran.
3. **Pastikan harga jual lebih tinggi dari harga beli provider**, kalau tidak Anda rugi di setiap pesanan.
4. Deploy:
   - **Docker/VPS:** `docker build -t nokosid . && docker run -d -p 3000:3000 --env-file .env -v nokos-data:/app/data nokosid`, lalu taruh di belakang Nginx/Caddy dengan HTTPS.
   - **Railway/Render:** hubungkan repo, set environment variables dari `.env`, **tambahkan volume** yang di-mount ke `/app/data`, start command `npm start`.
5. Di dashboard Tripay, atur **Callback URL** ke `https://DOMAIN-ANDA/api/webhook/tripay`.
6. Uji di sandbox: daftar, isi saldo, beli nomor. Kalau sudah lancar, ubah `TRIPAY_MODE=production` dan pakai kredensial production.

## Catatan penting
- Jalankan **satu instance saja** (SQLite + worker polling OTP berjalan di proses yang sama).
- Backup rutin file `data/nokos.db`.
- Saldo hanya bertambah lewat webhook Tripay yang tanda tangannya valid. Tidak ada top-up manual.
- Refund otomatis bila: provider gagal memberi nomor, pesanan dibatalkan pengguna, atau OTP tidak masuk dalam 15 menit.
- Belum ada panel admin. Untuk melihat data: `sqlite3 data/nokos.db` (tabel `users`, `orders`, `deposits`, `ledger`).
- Tambahkan Syarat & Ketentuan serta kebijakan privasi sebelum dibuka untuk umum, dan cek aturan provider/Tripay soal penjualan nomor OTP.
