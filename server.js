require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const cfg = require('./config');
const provider = require('./provider');
const tripay = require('./tripay');
const PORT = parseInt(process.env.PORT, 10) || 3000;
const PROD = process.env.NODE_ENV === 'production';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '20kb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path !== '/api/webhook/tripay' && !req.is('application/json')) return res.status(415).json({ error: 'Content-Type harus application/json.' });
  next();
});
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); fail(res, 500, 'Terjadi kesalahan server.'); });
const now = () => Date.now();
function hashPassword(pw) { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); }
function checkPassword(pw, stored) { const [s, h] = stored.split(':'); const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64); const b = Buffer.from(h, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function readCookie(req, name) { const m = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '=')); return m ? decodeURIComponent(m.slice(name.length + 1)) : null; }
function startSession(res, userId) { const token = crypto.randomBytes(32).toString('hex'); db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token, userId, now() + SESSION_MS); res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: SESSION_MS, path: '/' }); }
function auth(req, res, next) { const token = readCookie(req, 'sid'); const u = token && db.prepare('SELECT u.id,u.email,u.balance FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?').get(token, now()); if (!u) return fail(res, 401, 'Silakan login terlebih dahulu.'); req.user = u; req.token = token; next(); }
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Terlalu banyak percobaan. Coba lagi nanti.' } });
app.post('/api/register', authLimiter, wrap(async (req, res) => {
 const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return fail(res, 400, 'Email tidak valid.');
 if (password.length < 8 || password.length > 100) return fail(res, 400, 'Password minimal 8 karakter.');
 if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res, 409, 'Email sudah terdaftar.');
 const r = db.prepare('INSERT INTO users(email,password_hash,created_at) VALUES(?,?,?)').run(email, hashPassword(password), now()); startSession(res, r.lastInsertRowid); res.json({ ok: true });
}));
app.post('/api/login', authLimiter, wrap(async (req, res) => {
 const email = String(req.body.email || '').trim().toLowerCase(), u = db.prepare('SELECT id,password_hash FROM users WHERE email=?').get(email);
 const ok = u && checkPassword(String(req.body.password || ''), u.password_hash);
 if (!ok) return fail(res, 401, 'Email atau password salah.');
 startSession(res, u.id); res.json({ ok: true });
}));
app.post('/api/logout', auth, (req, res) => { db.prepare('DELETE FROM sessions WHERE token=?').run(req.token); res.clearCookie('sid', { path: '/' }); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json({ user: { email: req.user.email, balance: req.user.balance } }));
app.get('/api/catalog', (req, res) => { const services = cfg.services.map(({ id, name, basePrice }) => ({ id, name, basePrice })); res.json({ services, countries: cfg.countries, methods: cfg.methods, minDeposit: cfg.minDeposit, maxDeposit: cfg.maxDeposit }); });
const credit = (userId, amount, reason, ref) => { db.prepare('UPDATE users SET balance=balance+? WHERE id=?').run(amount, userId); db.prepare('INSERT INTO ledger(user_id,delta,reason,ref,created_at) VALUES(?,?,?,?,?)').run(userId, amount, reason, ref, now()); };
const reserveOrder = db.transaction((userId, id, service, country, price) => {
 const r = db.prepare('UPDATE users SET balance=balance-? WHERE id=? AND balance>=?').run(price, userId, price); if (!r.changes) return false;
 db.prepare('INSERT INTO ledger(user_id,delta,reason,ref,created_at) VALUES(?,?,?,?,?)').run(userId, -price, 'order', id, now());
 db.prepare('INSERT INTO orders(id,user_id,service_name,country_name,price,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id, userId, service.name, country.name, price, 'PENDING', now(), now() + cfg.orderTtlMs); return true;
});
const refundOrder = db.transaction((id, newStatus) => {
 const r = db.prepare("UPDATE orders SET status=? WHERE id=? AND status IN ('PENDING','WAITING')").run(newStatus, id); if (!r.changes) return false;
 const o = db.prepare('SELECT user_id,price FROM orders WHERE id=?').get(id); credit(o.user_id, o.price, 'refund', id); return true;
});
const pub = o => ({ id:o.id, serviceName:o.service_name, countryName:o.country_name, phone:o.phone, price:o.price, status:o.status, otp:o.otp, createdAt:o.created_at, expiresAt:o.expires_at });
const balanceOf = id => db.prepare('SELECT balance FROM users WHERE id=?').get(id).balance;
app.get('/api/orders', auth, (req,res) => { const rows=db.prepare("SELECT * FROM orders WHERE user_id=? AND status!='FAILED' ORDER BY created_at DESC LIMIT 50").all(req.user.id); res.json({orders:rows.map(pub),balance:req.user.balance}); });
app.post('/api/orders', auth, wrap(async (req,res) => {
 const service=cfg.services.find(s=>s.id===req.body.serviceId), country=cfg.countries.find(c=>c.id===req.body.countryId);
 if(!service||!country) return fail(res,400,'Layanan atau negara tidak ditemukan.');
 const active=db.prepare("SELECT COUNT(*) c FROM orders WHERE user_id=? AND status IN ('PENDING','WAITING')").get(req.user.id).c;
 if(active>=cfg.maxActiveOrders) return fail(res,429,`Maksimal ${cfg.maxActiveOrders} nomor aktif sekaligus.`);
 const price=Math.round(service.basePrice*country.multiplier), id='ORD-'+crypto.randomBytes(4).toString('hex').toUpperCase();
 if(!reserveOrder(req.user.id,id,service,country,price)) return fail(res,400,'Saldo tidak mencukupi. Silakan isi saldo terlebih dahulu.');
 try { const n=await provider.getNumber(service.code,country.id); db.prepare("UPDATE orders SET status='WAITING', provider_id=?, phone=? WHERE id=?").run(n.id,'+'+n.phone.replace(/^\+/,''),id); }
 catch(e) { console.error('getNumber gagal:',e.raw||e.message); refundOrder(id,'FAILED'); return fail(res,502,e.userMessage||'Gagal menghubungi provider.'); }
 res.json({order:pub(db.prepare('SELECT * FROM orders WHERE id=?').get(id)),balance:balanceOf(req.user.id)});
}));
app.post('/api/orders/:id/cancel', auth, wrap(async (req,res) => {
 const o=db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
 if(!o) return fail(res,404,'Pesanan tidak ditemukan.'); if(o.status!=='WAITING') return fail(res,400,'Pesanan ini tidak dapat dibatalkan.');
 let r; try { r=await provider.cancel(o.provider_id); } catch(e) { console.error(e.message); return fail(res,502,'Gagal menghubungi provider, coba lagi.'); }
 if(!r.ok) { if(r.raw==='EARLY_CANCEL_DENIED') return fail(res,400,'Pembatalan baru bisa dilakukan setelah 2 menit sejak pemesanan.'); return fail(res,400,'Pesanan tidak dapat dibatalkan (mungkin OTP sudah masuk).'); }
 refundOrder(o.id,'CANCELLED'); res.json({order:pub(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)),balance:balanceOf(req.user.id)});
}));
app.get('/api/deposits', auth, (req,res) => res.json({deposits:db.prepare('SELECT ref,amount,method,status,checkout_url AS checkoutUrl,created_at AS createdAt FROM deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 20').all(req.user.id)}));
app.post('/api/deposits', auth, wrap(async (req,res) => {
 const amount=parseInt(req.body.amount,10), method=cfg.methods.find(m=>m.code===req.body.method);
 if(!method) return fail(res,400,'Metode pembayaran tidak valid.');
 if(!Number.isInteger(amount)||amount<cfg.minDeposit||amount>cfg.maxDeposit) return fail(res,400,`Nominal harus antara Rp ${cfg.minDeposit.toLocaleString('id-ID')} dan Rp ${cfg.maxDeposit.toLocaleString('id-ID')}.`);
 const ref='DP'+Date.now()+crypto.randomBytes(3).toString('hex').toUpperCase();
 db.prepare("INSERT INTO deposits(ref,user_id,amount,method,status,created_at) VALUES(?,?,?,?,'UNPAID',?)").run(ref,req.user.id,amount,method.code,now());
 try { const t=await tripay.createTransaction({ref,amount,method:method.code,email:req.user.email,returnUrl:(process.env.APP_URL||'')+'/'}); db.prepare('UPDATE deposits SET checkout_url=? WHERE ref=?').run(t.checkout_url,ref); res.json({checkoutUrl:t.checkout_url,ref}); }
 catch(e) { console.error('Tripay gagal:',e.message); db.prepare("UPDATE deposits SET status='FAILED' WHERE ref=?").run(ref); fail(res,502,'Gagal membuat pembayaran. Silakan coba lagi.'); }
}));
const markPaid=db.transaction(ref=>{ const r=db.prepare("UPDATE deposits SET status='PAID', paid_at=? WHERE ref=? AND status='UNPAID'").run(now(),ref); if(!r.changes)return false; const d=db.prepare('SELECT user_id,amount FROM deposits WHERE ref=?').get(ref); credit(d.user_id,d.amount,'deposit',ref); return true; });
app.post('/api/webhook/tripay',(req,res)=>{
 if(!tripay.verifyCallback(req.rawBody,req.get('X-Callback-Signature'))) return res.status(403).json({success:false});
 if(req.get('X-Callback-Event')!=='payment_status') return res.json({success:false});
 const {merchant_ref:ref,status}=req.body||{}; if(!ref||!db.prepare('SELECT 1 FROM deposits WHERE ref=?').get(ref)) return res.json({success:false});
 if(status==='PAID') markPaid(ref); else if(status==='FAILED'||status==='EXPIRED') db.prepare("UPDATE deposits SET status=? WHERE ref=? AND status='UNPAID'").run(status,ref);
 res.json({success:true});
});
let busy=false;
async function worker(){
 if(busy)return; busy=true;
 try {
  for(const o of db.prepare("SELECT id FROM orders WHERE status='PENDING' AND created_at<?").all(now()-120000)) refundOrder(o.id,'FAILED');
  for(const o of db.prepare("SELECT * FROM orders WHERE status='WAITING'").all()){
   try { const s=await provider.getStatus(o.provider_id);
    if(s.status==='RECEIVED'){db.prepare("UPDATE orders SET status='RECEIVED', otp=? WHERE id=? AND status='WAITING'").run(s.code,o.id);provider.finish(o.provider_id);}
    else if(s.status==='CANCELLED') refundOrder(o.id,'CANCELLED');
    else if(now()>o.expires_at){const c=await provider.cancel(o.provider_id);if(c.ok)refundOrder(o.id,'CANCELLED');}
   } catch(e){console.error('worker',o.id,e.raw||e.message);}
  }
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now());
 } finally {busy=false;}
}
setInterval(worker,5000);
app.listen(PORT,()=>console.log(`NokosID berjalan di port ${PORT} (${PROD?'production':'development'})`));
