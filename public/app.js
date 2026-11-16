const $ = id => document.getElementById(id);
const rp = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
let catalog = null, orders = [], mode = 'login', timer;
async function api(method, url, body) {
 const r = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body:body?JSON.stringify(body):undefined });
 let data={}; try{data=await r.json();}catch(_){}
 if(r.status===401&&url!=='/api/login'&&url!=='/api/register'){showAuth();throw new Error(data.error||'Sesi berakhir.');}
 if(!r.ok)throw new Error(data.error||'Terjadi kesalahan.'); return data;
}
function msg(t,ok){const a=$('alert');a.textContent=t;a.className='alert'+(ok?' ok':'');clearTimeout(timer);timer=setTimeout(()=>a.classList.add('hidden'),5000);}
function setBalance(b){$('balance').textContent=rp(b);}
function curPrice(){const s=catalog.services.find(x=>x.id===$('svc').value),c=catalog.countries.find(x=>x.id===$('cty').value);return s&&c?Math.round(s.basePrice*c.multiplier):0;}
function showAuth(){$('auth-view').classList.remove('hidden');$('app-view').classList.add('hidden');$('nav-user').classList.add('hidden');}
function renderOrders(){
 const box=$('orders');if(!orders.length){box.innerHTML='<p class="empty-state">Belum ada pesanan nomor.</p>';return;}
 box.innerHTML=orders.map(o=>{
  let st;
  if(o.status==='WAITING'||o.status==='PENDING')st=`<div class="otp-box"><div class="order-meta">Menunggu SMS...</div><button class="btn btn-danger" data-cancel="${esc(o.id)}">Batalkan</button></div>`;
  else if(o.status==='RECEIVED')st=`<div class="otp-box"><div class="order-meta">Kode OTP Masuk</div><div class="otp-code" data-copy="${esc(o.otp)}" title="Klik untuk salin">${esc(o.otp)}</div></div>`;
  else st='<span class="order-meta">Dibatalkan (saldo dikembalikan)</span>';
  return `<div class="order-item"><div><div class="order-meta">${esc(o.serviceName)} • ${esc(o.countryName)} • #${esc(o.id)}</div><div class="phone-display" data-copy="${esc(o.phone)}" title="Klik untuk salin">${esc(o.phone||'...')} 📋</div><div class="order-meta">Biaya: ${rp(o.price)}</div></div>${st}</div>`;
 }).join('');
}
function renderDeposits(list){$('deposits').innerHTML=list.length?'<div class="muted" style="margin-bottom:.25rem">Riwayat isi saldo</div>'+list.map(d=>`<div class="dep-row"><span>${rp(d.amount)} • ${esc(d.status)}</span>${d.status==='UNPAID'&&d.checkoutUrl?`<a href="${esc(d.checkoutUrl)}" target="_blank" rel="noopener">Bayar</a>`:''}</div>`).join(''):'';}
async function refresh(){try{const[o,d]=await Promise.all([api('GET','/api/orders'),api('GET','/api/deposits')]);orders=o.orders;setBalance(o.balance);renderOrders();renderDeposits(d.deposits);}catch(_){}}
async function enterApp(me){
 $('auth-view').classList.add('hidden');$('app-view').classList.remove('hidden');$('nav-user').classList.remove('hidden');$('nav-email').textContent=me.user.email;setBalance(me.user.balance);
 if(!catalog){catalog=await api('GET','/api/catalog');$('svc').innerHTML=catalog.services.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');$('cty').innerHTML=catalog.countries.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} (${esc(c.code)})</option>`).join('');$('method').innerHTML=catalog.methods.map(m=>`<option value="${esc(m.code)}">${esc(m.name)}</option>`).join('');}
 $('price').textContent=rp(curPrice());refresh();
}
async function init(){try{await enterApp(await api('GET','/api/me'));}catch(_){showAuth();}}
$('svc').addEventListener('change',()=>$('price').textContent=rp(curPrice()));
$('cty').addEventListener('change',()=>$('price').textContent=rp(curPrice()));
$('auth-switch').addEventListener('click',e=>{e.preventDefault();mode=mode==='login'?'register':'login';const reg=mode==='register';$('auth-title').textContent=reg?'Daftar':'Masuk';$('btn-auth').textContent=reg?'Daftar':'Masuk';$('auth-switch-text').textContent=reg?'Sudah punya akun?':'Belum punya akun?';$('auth-switch').textContent=reg?'Masuk':'Daftar';$('password').autocomplete=reg?'new-password':'current-password';});
$('btn-auth').addEventListener('click',async()=>{const a=$('auth-alert');a.classList.add('hidden');try{await api('POST',mode==='login'?'/api/login':'/api/register',{email:$('email').value,password:$('password').value});$('password').value='';await enterApp(await api('GET','/api/me'));}catch(e){a.textContent=e.message;a.classList.remove('hidden');}});
$('btn-logout').addEventListener('click',async()=>{try{await api('POST','/api/logout',{});}catch(_){}orders=[];showAuth();});
$('btn-order').addEventListener('click',async e=>{e.target.disabled=true;try{const r=await api('POST','/api/orders',{serviceId:$('svc').value,countryId:$('cty').value});setBalance(r.balance);await refresh();}catch(err){msg(err.message);}finally{e.target.disabled=false;}});
$('btn-deposit').addEventListener('click',async e=>{e.target.disabled=true;try{const r=await api('POST','/api/deposits',{amount:$('amount').value,method:$('method').value});window.open(r.checkoutUrl,'_blank','noopener');msg('Halaman pembayaran dibuka. Saldo bertambah otomatis setelah pembayaran terkonfirmasi.',true);refresh();}catch(err){msg(err.message);}finally{e.target.disabled=false;}});
$('orders').addEventListener('click',async e=>{const c=e.target.closest('[data-cancel]');if(c){try{const r=await api('POST',`/api/orders/${encodeURIComponent(c.dataset.cancel)}/cancel`,{});setBalance(r.balance);await refresh();}catch(err){msg(err.message);}return;}const y=e.target.closest('[data-copy]');if(y&&y.dataset.copy){try{await navigator.clipboard.writeText(y.dataset.copy);msg('Disalin: '+y.dataset.copy,true);}catch(_){msg('Salin manual: '+y.dataset.copy);}}});
setInterval(()=>{if(!$('app-view').classList.contains('hidden')&&!document.hidden)refresh();},4000);
init();
