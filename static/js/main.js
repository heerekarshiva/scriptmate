/* ═══════════════════════════════════════════════
   ScriptMate — Static Frontend JS (GitHub Pages)
   All backend calls replaced with localStorage.
═══════════════════════════════════════════════ */
'use strict';

/* ── Helpers ── */
const g       = id => document.getElementById(id);
const setText = (id,v) => { const e=g(id); if(e) e.textContent=v; };
const xss     = s => String(s??'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#x27;').replace(/\//g,'&#x2F;')
  .trim().substring(0,800);

/* ── Client-side rate limiter ── */
const RL = {
  K:'sm5_rl', W:3600000, M:5,
  ok() {
    const now=Date.now();
    let d=JSON.parse(localStorage.getItem(this.K)||'[]');
    d=d.filter(t=>now-t<this.W);
    if(d.length>=this.M) return false;
    d.push(now); localStorage.setItem(this.K,JSON.stringify(d)); return true;
  },
  remaining() {
    const now=Date.now();
    const d=JSON.parse(localStorage.getItem(this.K)||'[]').filter(t=>now-t<this.W);
    return Math.max(0, this.M-d.length);
  }
};

/* ── LocalStorage helpers ── */
const LS = {
  U:'sm5_user', H:'sm5_hist', ORDERS:'sm5_orders',
  get(k){ try{return JSON.parse(localStorage.getItem(k));}catch{return null;} },
  set(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch{} },
  del(k){ localStorage.removeItem(k); }
};

/* ── Pricing (pure local — same formula as backend) ── */
function calcPrice(pages, hasGraphs) {
  const base = pages <= 15 ? pages * 5 : (75 + (pages - 15) * 3);
  const gc   = hasGraphs ? pages * 3 : 0;
  return { base_cost: Math.round(base*100)/100, graph_charge: Math.round(gc*100)/100, grand_total: Math.round((base+gc)*100)/100 };
}

/* ── Validators ── */
const V = {
  name:    v => v.trim().length >= 3,
  phone:   v => /^\+?[\d\s\-]{10,15}$/.test(v.trim()),
  email:   v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
  college: v => v.trim().length >= 3,
  roll:    v => v.trim().length >= 2,
  sel:     v => v && v !== '',
  subject: v => v.trim().length >= 2,
  pages:   v => parseInt(v)>=1 && parseInt(v)<=500,
};

function setErr(fid,eid,show) {
  const f=g(fid),e=g(eid);
  if(f) f.classList.toggle('err-f',show);
  if(e) e.classList.toggle('show',show);
}
function vf(fid,eid,rule) {
  const el=g(fid);
  const ok=el&&V[rule]?V[rule](el.value):(el&&el.value!=='');
  setErr(fid,eid,!ok); return ok;
}

/* ── Step state ── */
let curStep = 1;
let uploadedDisplayName = '';
let _pricing = null;

/* ── Year options by level ── */
function updateYearOptions() {
  const level = g('f_level').value;
  const maxYear = level === 'Masters' ? 2 : level === 'Diploma' ? 3 : 4;
  const sel = g('f_year');
  const cur = sel.value;
  sel.innerHTML = '<option value="">—</option>';
  for(let i=1;i<=maxYear;i++){
    const o=document.createElement('option');
    o.value=i; o.textContent=i;
    if(parseInt(cur)===i) o.selected=true;
    sel.appendChild(o);
  }
}

/* ── Stepper ── */
function nextStep(n) {
  if(n>curStep) {
    if(curStep===1 && !validateS1()) return;
    if(curStep===2 && !validateS2()) return;
  }
  g('s'+curStep).classList.add('hidden');
  g('s'+n).classList.remove('hidden');
  curStep=n; renderStepper(n);
  if(n===1) loadSaved();
  if(n===3) calcBillLocal();
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderStepper(step) {
  for(let i=1;i<=4;i++) {
    const c=g('sc'+i),l=g('sl'+i);
    if(!c) continue;
    c.className='step-circle'; l.className='step-lbl';
    if(i<step){c.classList.add('done');l.classList.add('done');c.textContent='✓';}
    else if(i===step){c.classList.add('active');l.classList.add('active');c.textContent=i;}
    else{c.textContent=i;}
  }
  for(let i=1;i<=3;i++){const cn=g('cn'+i);if(cn)cn.classList.toggle('done',i<step);}
  g('progFill').style.width=((step-1)/3*100)+'%';
}

function validateS1() {
  const a=vf('f_name','e_name','name');
  const b=vf('f_phone','e_phone','phone');
  const c=vf('f_email','e_email','email');
  if(!a||!b||!c){toast('Please fill in all required fields.','err');return false;}
  savePersonal(); return true;
}
function validateS2() {
  const a=vf('f_college','e_college','college');
  const b=vf('f_roll','e_roll','roll');
  const c=vf('f_level','e_level','sel');
  const d=vf('f_year','e_year','sel');
  const e=vf('f_sem','e_sem','sel');
  const wt=!!document.querySelector('input[name="wtype"]:checked');
  g('e_wtype').classList.toggle('show',!wt);
  if(!a||!b||!c||!d||!e||!wt){toast('Please complete all academic details.','err');return false;}
  return true;
}

/* ── Local save/load ── */
function savePersonal() {
  LS.set(LS.U,{
    name:  xss(g('f_name').value),
    phone: xss(g('f_phone').value),
    email: xss(g('f_email').value),
  });
}
function loadSaved() {
  const d=LS.get(LS.U);
  if(d&&(d.name||d.email)) {
    if(d.name)  g('f_name').value=d.name;
    if(d.phone) g('f_phone').value=d.phone;
    if(d.email) g('f_email').value=d.email;
    g('autofillBar').classList.remove('hidden');
  }
}
function clearSaved() {
  LS.del(LS.U);
  ['f_name','f_phone','f_email'].forEach(id=>{const e=g(id);if(e)e.value='';});
  g('autofillBar').classList.add('hidden');
  toast('Saved data cleared.');
}

/* ── Pricing (fully local) ── */
function calcBillLocal() {
  const pg=parseInt(g('f_pages').value)||0, gr=g('f_graphs').checked;
  const p = calcPrice(pg, gr);
  _pricing = p;
  setText('b_pg',pg);
  setText('b_base','₹'+p.base_cost.toFixed(2));
  setText('b_graph','₹'+p.graph_charge.toFixed(2));
  setText('b_total','₹'+p.grand_total.toFixed(2));
}

function chgPg(d) {
  const inp=g('f_pages');
  inp.value=Math.max(1,Math.min(500,(parseInt(inp.value)||0)+d));
  calcBillLocal();
}

/* ── File handling (local only — note filename, no upload) ── */
function handleFile(inp) {
  const f=inp.files[0], err=g('e_file');
  if(!f) return;
  const allowed=['application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const extOk = /\.(pdf|doc|docx)$/i.test(f.name);
  if((!allowed.includes(f.type) && !extOk) || f.size>10*1024*1024) {
    err.classList.add('show'); inp.value=''; return;
  }
  err.classList.remove('show');
  uploadedDisplayName = f.name;
  g('fileInfoTxt').textContent = xss(f.name)+' ('+(f.size/1024/1024).toFixed(2)+' MB)';
  g('fileInfo').classList.remove('hidden');
  toast('File noted: '+xss(f.name));
}

/* Drag and drop */
document.addEventListener('DOMContentLoaded', () => {
  const fd_ = document.getElementById('fileDrop');
  if(fd_) {
    ['dragover','dragleave','drop'].forEach(ev=>{
      fd_.addEventListener(ev,e=>{
        e.preventDefault();
        fd_.classList.toggle('drag',ev==='dragover');
        if(ev==='drop'){g('f_file').files=e.dataTransfer.files;handleFile(g('f_file'));}
      });
    });
  }
});

/* ── Generate order ID ── */
function genOrderId() {
  const now = new Date();
  const ts = now.getFullYear().toString().slice(2)
    + String(now.getMonth()+1).padStart(2,'0')
    + String(now.getDate()).padStart(2,'0')
    + String(now.getHours()).padStart(2,'0')
    + String(now.getMinutes()).padStart(2,'0')
    + String(now.getSeconds()).padStart(2,'0');
  const rand = Math.random().toString(36).substring(2,8).toUpperCase();
  return 'SM-'+ts+'-'+rand;
}

/* ── Submit order — stored locally + WhatsApp notify ── */
function submitOrder() {
  const a=vf('f_subject','e_subject','subject');
  const pg=parseInt(g('f_pages').value)||0;
  const pb=pg>=1&&pg<=500;
  setErr('f_pages','e_pages',!pb);
  const terms=g('f_terms').checked;
  g('e_terms').classList.toggle('show',!terms);
  if(!a||!pb||!terms){toast('Please fix the errors above.','err');return;}
  if(!RL.ok()){toast('Too many submissions. Please wait before retrying.','err');return;}

  const gr=g('f_graphs').checked;
  const pricing = calcPrice(pg, gr);
  const orderId = genOrderId();
  const createdAt = new Date().toISOString();

  const payload = {
    id: orderId,
    created_at: createdAt,
    full_name:    g('f_name').value.trim(),
    phone:        g('f_phone').value.trim(),
    email:        g('f_email').value.trim(),
    college:      g('f_college').value.trim(),
    roll_number:  g('f_roll').value.trim(),
    level:        g('f_level').value,
    year:         parseInt(g('f_year').value),
    semester:     parseInt(g('f_sem').value),
    work_type:    document.querySelector('input[name="wtype"]:checked')?.value||'',
    subject:      g('f_subject').value.trim(),
    pages:        pg,
    has_graphs:   gr,
    instructions: g('f_instructions').value.trim(),
    file_name:    uploadedDisplayName,
    base_cost:    pricing.base_cost,
    graph_charge: pricing.graph_charge,
    grand_total:  pricing.grand_total,
  };

  /* Save to localStorage orders store */
  let orders = LS.get(LS.ORDERS) || [];
  orders.unshift(payload);
  if(orders.length > 500) orders = orders.slice(0, 500);
  LS.set(LS.ORDERS, orders);

  const order = {
    id: orderId, created_at: createdAt,
    display: new Date(createdAt).toLocaleString('en-IN',{
      day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'
    }),
    customer:{name:payload.full_name, phone:payload.phone, email:payload.email},
    academic:{college:payload.college, roll:payload.roll_number, level:payload.level,
              year:payload.year, sem:payload.semester, workType:payload.work_type},
    order:{subject:payload.subject, pages:pg, graphs:gr,
           instructions:payload.instructions, fileName:uploadedDisplayName},
    pricing:{base:pricing.base_cost, gc:pricing.graph_charge, total:pricing.grand_total},
  };

  savePersonal();
  saveHistory(order);
  renderSuccess(order);
  nextStepDirect(4);
  toast('🎉 Order placed successfully!');
}

function nextStepDirect(n) {
  g('s'+curStep).classList.add('hidden');
  g('s'+n).classList.remove('hidden');
  curStep=n; renderStepper(n);
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ── Render success ── */
function renderSuccess(o) {
  g('finalOid').textContent='🔖 '+o.id;
  g('fin_customer').innerHTML=`
    <div class="info-item"><div class="ik">Name</div><div class="iv">${xss(o.customer.name)}</div></div>
    <div class="info-item"><div class="ik">Phone</div><div class="iv">${xss(o.customer.phone)}</div></div>
    <div class="info-item"><div class="ik">Email</div><div class="iv" style="font-size:.75rem">${xss(o.customer.email)}</div></div>
    <div class="info-item"><div class="ik">Placed On</div><div class="iv" style="font-size:.74rem">${xss(o.display)}</div></div>`;
  g('fin_academic').innerHTML=`
    <div class="info-item"><div class="ik">College</div><div class="iv" style="font-size:.78rem">${xss(o.academic.college)}</div></div>
    <div class="info-item"><div class="ik">Roll No.</div><div class="iv">${xss(o.academic.roll)}</div></div>
    <div class="info-item"><div class="ik">Level</div><div class="iv">${xss(o.academic.level)} · Yr ${o.academic.year}</div></div>
    <div class="info-item"><div class="ik">Semester</div><div class="iv">Sem ${o.academic.sem}</div></div>`;
  setText('fin_sub',   xss(o.order.subject));
  setText('fin_wt',    xss(o.academic.workType));
  setText('fin_pg',    o.order.pages+' pages');
  setText('fin_base',  '₹'+o.pricing.base.toFixed(2));
  setText('fin_graph', '₹'+o.pricing.gc.toFixed(2));
  setText('fin_total', '₹'+o.pricing.total.toFixed(2));

  const msg=encodeURIComponent(
    `Hello! I placed an order on ScriptMate.\n\nOrder ID: ${o.id}\nName: ${o.customer.name}\nPhone: ${o.customer.phone}\nSubject: ${o.order.subject}\nWork Type: ${o.academic.workType}\nLevel: ${o.academic.level} Year ${o.academic.year}, Sem ${o.academic.sem}\nPages: ${o.order.pages}\nGraphs: ${o.order.graphs?'Yes':'No'}\nTotal: ₹${o.pricing.total.toFixed(2)}\n\nPlease confirm!`
  );
  g('waBtn').onclick=()=>window.open(`https://wa.me/917207774696?text=${msg}`,'_blank');
  window._lastOrder=o;
}

/* ── Download Bill ── */
function downloadBill() {
  const o=window._lastOrder; if(!o) return;
  const w=window.open('','_blank');
  w.document.write(buildBillHTML(o));
  w.document.close();
  setTimeout(()=>w.print(),350);
}

function buildBillHTML(o) {
  return `<!DOCTYPE html><html><head><title>ScriptMate Bill — ${xss(o.id)}</title>
  <meta charset="UTF-8"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;max-width:680px;margin:0 auto;padding:36px;color:#111;font-size:14px}
    .header{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #2a9d5c}
    .logo-box{width:42px;height:42px;background:linear-gradient(135deg,#2a9d5c,#22875a);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
    .brand{font-size:22px;font-weight:800;color:#0d1117}.brand span{color:#2a9d5c}
    .bill-meta{margin-left:auto;text-align:right;font-size:12px;color:#666}
    .badge{display:inline-block;background:#f0fdf4;border:1px solid #2a9d5c;border-radius:6px;padding:5px 14px;font-family:monospace;font-size:13px;color:#22875a;margin:16px 0}
    .section{margin-top:22px;padding-top:18px;border-top:1px solid #eee}
    .sec-title{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:#888;font-weight:700;margin-bottom:10px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .item{background:#f9fafb;border-radius:7px;padding:10px 12px}
    .ik{font-size:9px;text-transform:uppercase;color:#999;margin-bottom:2px}
    .iv{font-size:13px;font-weight:600;color:#111}
    .bill-table{width:100%;border-collapse:collapse;margin-top:8px}
    .bill-table td{padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px}
    .bill-table td:last-child{text-align:right;font-weight:600}
    .total-row td{font-size:16px;font-weight:800;color:#2a9d5c;border-bottom:none;border-top:2px solid #2a9d5c;padding-top:12px}
    .footer{margin-top:32px;text-align:center;font-size:11px;color:#aaa;padding-top:16px;border-top:1px solid #eee}
    @media print{button{display:none!important}}
  </style></head><body>
  <div class="header">
    <div class="logo-box">✒️</div>
    <div><div class="brand">Script<span>Mate</span></div><div style="font-size:11px;color:#666">Academic Handwriting Service</div></div>
    <div class="bill-meta"><strong>INVOICE</strong><br/>${new Date(o.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</div>
  </div>
  <div class="badge">🔖 ${xss(o.id)}</div>
  <div class="section"><div class="sec-title">Customer Details</div>
    <div class="grid">
      <div class="item"><div class="ik">Name</div><div class="iv">${xss(o.customer.name)}</div></div>
      <div class="item"><div class="ik">Phone</div><div class="iv">${xss(o.customer.phone)}</div></div>
      <div class="item"><div class="ik">Email</div><div class="iv" style="font-size:12px">${xss(o.customer.email)}</div></div>
      <div class="item"><div class="ik">Date</div><div class="iv" style="font-size:11px">${xss(o.display)}</div></div>
    </div></div>
  <div class="section"><div class="sec-title">Academic Details</div>
    <div class="grid">
      <div class="item"><div class="ik">College</div><div class="iv" style="font-size:12px">${xss(o.academic.college)}</div></div>
      <div class="item"><div class="ik">Roll No.</div><div class="iv">${xss(o.academic.roll)}</div></div>
      <div class="item"><div class="ik">Level</div><div class="iv">${xss(o.academic.level)} — Year ${o.academic.year}</div></div>
      <div class="item"><div class="ik">Semester</div><div class="iv">Semester ${o.academic.sem}</div></div>
    </div></div>
  <div class="section"><div class="sec-title">Order & Bill Breakdown</div>
    <table class="bill-table">
      <tr><td>Subject</td><td>${xss(o.order.subject)}</td></tr>
      <tr><td>Work Type</td><td>${xss(o.academic.workType)}</td></tr>
      <tr><td>Number of Pages</td><td>${o.order.pages}</td></tr>
      <tr><td>Includes Graphs</td><td>${o.order.graphs?'Yes':'No'}</td></tr>
      <tr><td>Base Cost (first 15 @ ₹5, rest @ ₹3)</td><td>₹${o.pricing.base.toFixed(2)}</td></tr>
      <tr><td>Graph Charges (+₹3/page)</td><td>₹${o.pricing.gc.toFixed(2)}</td></tr>
      <tr class="total-row"><td><strong>Grand Total</strong></td><td><strong>₹${o.pricing.total.toFixed(2)}</strong></td></tr>
    </table></div>
  <div class="footer">ScriptMate — Academic Handwriting Service · ht786098@gmail.com<br/>Thank you for your order! Your work will be completed with care.</div>
  </body></html>`;
}

/* ── Reset ── */
function resetOrder() {
  ['f_name','f_phone','f_email','f_college','f_roll','f_subject','f_instructions']
    .forEach(id=>{const e=g(id);if(e)e.value='';});
  ['f_level','f_year','f_sem'].forEach(id=>{const e=g(id);if(e)e.selectedIndex=0;});
  document.querySelectorAll('input[name="wtype"]').forEach(r=>r.checked=false);
  g('f_graphs').checked=false; g('f_pages').value=5; g('f_terms').checked=false;
  g('fileInfo').classList.add('hidden');
  if(g('f_file')) g('f_file').value='';
  uploadedDisplayName='';
  document.querySelectorAll('.err').forEach(e=>e.classList.remove('show'));
  document.querySelectorAll('.err-f').forEach(e=>e.classList.remove('err-f'));
  g('autofillBar').classList.add('hidden');
  curStep=1; _pricing=null;
  g('s1').classList.remove('hidden');
  ['s2','s3','s4'].forEach(id=>g(id)?.classList.add('hidden'));
  renderStepper(1); loadSaved(); calcBillLocal();
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ── History ── */
function saveHistory(order) {
  let h=LS.get(LS.H)||[];
  h.unshift(order);
  if(h.length>60) h=h.slice(0,60);
  LS.set(LS.H,h);
}
function openHistory() { renderHistory(); g('histPanel').classList.remove('hidden'); g('overlay').classList.remove('hidden'); document.body.style.overflow='hidden'; }
function closeHistory() { g('histPanel').classList.add('hidden'); g('overlay').classList.add('hidden'); document.body.style.overflow=''; }
function renderHistory() {
  const hist=LS.get(LS.H)||[], body=g('histBody');
  if(!hist.length) {
    body.innerHTML=`<div class="h-empty"><div class="ei">📭</div><p>No orders yet.</p><small style="color:var(--mist3)">History appears after placing an order.</small></div>`;
    return;
  }
  const spent=hist.reduce((s,h)=>s+(h.pricing?.total||0),0);
  const pages=hist.reduce((s,h)=>s+(h.order?.pages||0),0);
  let html=`<div class="h-stats">
    <div class="h-stat"><div class="h-stat-v">${hist.length}</div><div class="h-stat-l">Orders</div></div>
    <div class="h-stat"><div class="h-stat-v">${pages}</div><div class="h-stat-l">Pages</div></div>
    <div class="h-stat"><div class="h-stat-v">₹${spent.toFixed(0)}</div><div class="h-stat-l">Spent</div></div>
  </div>`;
  hist.forEach(o=>{
    html+=`<div class="h-item">
      <div class="h-item-top"><span class="h-oid">${xss(o.id)}</span><span class="h-date">${xss(o.display||'')}</span></div>
      <div class="h-details">
        <div class="h-det">Subject: <span>${xss(o.order?.subject||'—')}</span></div>
        <div class="h-det">Type: <span>${xss(o.academic?.workType||'—')}</span></div>
        <div class="h-det">Level: <span>${xss(o.academic?.level||'—')}</span></div>
        <div class="h-det">Pages: <span>${o.order?.pages||0}</span></div>
      </div>
      <div class="h-foot"><span class="h-foot-l">Grand Total</span><span class="h-foot-v">₹${(o.pricing?.total||0).toFixed(2)}</span></div>
    </div>`;
  });
  html+=`<button class="btn btn-secondary btn-full" style="margin-top:8px;font-size:.75rem"
    onclick="if(confirm('Clear all history?')){LS.del(LS.H);renderHistory();toast('History cleared.');}">🗑 Clear History</button>`;
  body.innerHTML=html;
}

/* ── Toast ── */
function toast(msg,type='') {
  const old=document.querySelector('.toast'); if(old) old.remove();
  const t=document.createElement('div');
  t.className='toast'+(type?' t-'+type:'');
  t.textContent=msg; t.setAttribute('role','alert');
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3500);
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded',()=>{
  loadSaved(); calcBillLocal(); renderStepper(1);
  // DB badge: static mode
  const dot=g('dbDot'); if(dot) dot.classList.add('on');
  setText('dbTxt','Static Mode');

  [['f_name','e_name','name'],['f_phone','e_phone','phone'],['f_email','e_email','email'],
   ['f_college','e_college','college'],['f_roll','e_roll','roll'],['f_subject','e_subject','subject']
  ].forEach(([f,e,r])=>{ const el=g(f); if(el)el.addEventListener('blur',()=>vf(f,e,r)); });
  g('f_pages')?.addEventListener('input',calcBillLocal);
  g('f_graphs')?.addEventListener('change',calcBillLocal);
});
