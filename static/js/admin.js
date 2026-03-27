/* ═══════════════════════════════════════════════
   ScriptMate — Admin Dashboard JS (Static / GitHub Pages)
   All API calls replaced with localStorage reads.
   Admin password checked locally (configurable below).
═══════════════════════════════════════════════ */
'use strict';

/* ── CONFIG: Change this password ── */
const ADMIN_PASSWORD = 'ScriptMate@2025';

/* ── Helpers ── */
const g       = id => document.getElementById(id);
const setText = (id,v) => { const e=g(id); if(e) e.textContent=v; };
const xss     = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').trim().substring(0,600);

/* ── LocalStorage keys (must match main.js) ── */
const ORDERS_KEY = 'sm5_orders';
const LS = {
  get(k){ try{return JSON.parse(localStorage.getItem(k));}catch{return null;} },
  set(k,v){ try{localStorage.setItem(k,JSON.stringify(v));}catch{} },
};

/* ── Auth (session-only) ── */
let isLoggedIn = sessionStorage.getItem('sm_admin_authed') === '1';

/* ── Charts registry ── */
const PALETTE = ['#2a9d5c','#5b8dee','#d4a843','#9b72eb','#e05252','#22c5a4','#e89c45'];
const charts  = {};

function chartDefaults(extra={}) {
  return {
    responsive:true, maintainAspectRatio:false,
    plugins:{
      legend:{labels:{color:'#6a7a8e',font:{family:"'DM Sans',sans-serif",size:11}}},
      tooltip:{bodyFont:{family:"'JetBrains Mono',monospace"},titleFont:{family:"'DM Sans',sans-serif"}}
    },
    scales:{
      x:{ticks:{color:'#4e5e70',font:{family:"'DM Sans',sans-serif",size:10}},grid:{color:'rgba(232,237,245,0.05)'}},
      y:{ticks:{color:'#4e5e70',font:{family:"'DM Sans',sans-serif",size:10}},grid:{color:'rgba(232,237,245,0.05)'}}
    },
    ...extra
  };
}

function makeChart(id,config) {
  if(charts[id]){charts[id].destroy();delete charts[id];}
  const ctx=g(id); if(!ctx) return;
  charts[id]=new Chart(ctx,config);
}

/* ── Orders state ── */
let allOrders=[], filteredOrders=[], sortKey='created_at', sortDir=-1;

/* ── LOGIN ── */
function doLogin() {
  const pwd=g('adminPwd').value;
  if(!pwd){g('loginErr').classList.add('show');return;}
  if(pwd !== ADMIN_PASSWORD) {
    g('loginErr').classList.add('show');
    g('adminPwd').classList.add('err-f');
    return;
  }
  sessionStorage.setItem('sm_admin_authed','1');
  isLoggedIn=true;
  g('loginGate').style.display='none';
  g('dashboard').classList.remove('hidden');
  loadAll();
}

function doLogout() {
  sessionStorage.removeItem('sm_admin_authed');
  isLoggedIn=false;
  g('loginGate').style.display='flex';
  g('dashboard').classList.add('hidden');
  g('adminPwd').value='';
}

function autoLogin() {
  if(isLoggedIn) {
    g('loginGate').style.display='none';
    g('dashboard').classList.remove('hidden');
    loadAll();
  }
}

/* ── Load all (from localStorage) ── */
function loadAll() {
  const orders = LS.get(ORDERS_KEY) || [];
  allOrders = orders;
  filteredOrders = [...allOrders];

  const stats = computeStats(allOrders);
  renderKPIs(stats);
  renderAllCharts(stats, allOrders);
  renderTable(filteredOrders);
  renderSummaryStats(allOrders);
  setText('ordersCount', `${allOrders.length} orders`);
  toast(`Loaded ${allOrders.length} orders ✓`);
}

/* ── Compute stats locally (mirrors Flask /api/admin/stats) ── */
function computeStats(orders) {
  const s = {};
  s.total_orders  = orders.length;
  s.total_revenue = orders.reduce((a,o)=>a+(o.grand_total||0),0);
  s.total_pages   = orders.reduce((a,o)=>a+(o.pages||0),0);
  s.avg_order     = orders.length ? s.total_revenue/orders.length : 0;

  s.by_work_type = {};
  s.by_level = {};
  s.revenue_by_level = {};
  s.by_pages_bucket = {'1–5':0,'6–15':0,'16–30':0,'31+':0};

  orders.forEach(o => {
    const wt = o.work_type||'Other';
    s.by_work_type[wt] = (s.by_work_type[wt]||0)+1;
    const lv = o.level||'Other';
    s.by_level[lv] = (s.by_level[lv]||0)+1;
    s.revenue_by_level[lv] = Math.round(((s.revenue_by_level[lv]||0)+(o.grand_total||0))*100)/100;
    const pg = o.pages||0;
    if(pg<=5) s.by_pages_bucket['1–5']++;
    else if(pg<=15) s.by_pages_bucket['6–15']++;
    else if(pg<=30) s.by_pages_bucket['16–30']++;
    else s.by_pages_bucket['31+']++;
  });

  // Revenue trend: group by date, last 14 days
  const byDate = {};
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-14);
  orders.forEach(o => {
    const dt = (o.created_at||'').substring(0,10);
    if(dt && new Date(dt)>=cutoff) {
      byDate[dt] = Math.round(((byDate[dt]||0)+(o.grand_total||0))*100)/100;
    }
  });
  s.recent_revenue = Object.entries(byDate)
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([date,revenue])=>({date,revenue}));

  return s;
}

function renderKPIs(s) {
  setText('k_orders', s.total_orders||0);
  setText('k_rev', '₹'+Number(s.total_revenue||0).toFixed(0));
  setText('k_pages', s.total_pages||0);
  setText('k_avg', '₹'+Number(s.avg_order||0).toFixed(0));
}

function renderAllCharts(s, orders) {
  renderWorkTypeChart(s.by_work_type||{});
  renderLevelChart(s.by_level||{});
  renderTrendChart(s.recent_revenue||[]);
  renderPagesChart(s.by_pages_bucket||{});
  renderRevLevelChart(s.revenue_by_level||{});
  renderSemChart(orders);
  renderGraphsChart(orders);
  renderRevWtChart(orders);
}

function renderWorkTypeChart(data) {
  const labels=Object.keys(data),vals=Object.values(data);
  makeChart('chartWorkType',{type:'bar',data:{labels,datasets:[{label:'Orders',data:vals,
    backgroundColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]+'bb'),
    borderColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]),borderWidth:1,borderRadius:6}]},
    options:chartDefaults({plugins:{...chartDefaults().plugins,legend:{display:false}}})});
}
function renderLevelChart(data) {
  const labels=Object.keys(data),vals=Object.values(data);
  makeChart('chartLevel',{type:'doughnut',data:{labels,datasets:[{data:vals,
    backgroundColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]+'bb'),
    borderColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]),borderWidth:2,hoverOffset:8}]},
    options:chartDefaults({scales:{},cutout:'65%'})});
}
function renderTrendChart(data) {
  const sorted=[...data];
  makeChart('chartTrend',{type:'line',data:{
    labels:sorted.map(d=>d.date),
    datasets:[{label:'Revenue (₹)',data:sorted.map(d=>d.revenue),
      borderColor:'#2a9d5c',backgroundColor:'rgba(42,157,92,0.07)',
      fill:true,tension:.4,pointBackgroundColor:'#2a9d5c',
      pointRadius:4,pointHoverRadius:6,borderWidth:2}]},
    options:chartDefaults()});
}
function renderPagesChart(data) {
  const labels=Object.keys(data),vals=Object.values(data);
  makeChart('chartPages',{type:'bar',data:{labels,datasets:[{label:'Orders',data:vals,
    backgroundColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]+'bb'),
    borderColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]),borderWidth:1,borderRadius:6}]},
    options:chartDefaults({indexAxis:'y',plugins:{...chartDefaults().plugins,legend:{display:false}}})});
}
function renderRevLevelChart(data) {
  const labels=Object.keys(data),vals=Object.values(data);
  makeChart('chartRevLevel',{type:'bar',data:{labels,datasets:[{label:'Revenue (₹)',data:vals,
    backgroundColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]+'bb'),
    borderColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]),borderWidth:1,borderRadius:8}]},
    options:chartDefaults()});
}
function renderSemChart(orders) {
  const bySem={};
  orders.forEach(o=>{const s=`Sem ${o.semester||'?'}`;bySem[s]=(bySem[s]||0)+1;});
  const sorted=Object.entries(bySem).sort((a,b)=>a[0].localeCompare(b[0]));
  makeChart('chartSem',{type:'bar',data:{
    labels:sorted.map(x=>x[0]),
    datasets:[{label:'Orders',data:sorted.map(x=>x[1]),
      backgroundColor:'rgba(91,141,238,0.65)',borderColor:'#5b8dee',borderWidth:1,borderRadius:6}]},
    options:chartDefaults({plugins:{...chartDefaults().plugins,legend:{display:false}}})});
}
function renderGraphsChart(orders) {
  const withG=orders.filter(o=>o.has_graphs).length, noG=orders.length-withG;
  makeChart('chartGraphs',{type:'pie',data:{
    labels:['With Graphs','Without Graphs'],
    datasets:[{data:[withG,noG],
      backgroundColor:['rgba(42,157,92,0.8)','rgba(100,116,139,0.5)'],
      borderColor:['#2a9d5c','#475569'],borderWidth:2,hoverOffset:10}]},
    options:chartDefaults({scales:{}})});
}
function renderRevWtChart(orders) {
  const byWt={};
  orders.forEach(o=>{const wt=o.work_type||'Other';byWt[wt]=(byWt[wt]||0)+(o.grand_total||0);});
  const labels=Object.keys(byWt),vals=Object.values(byWt);
  makeChart('chartRevWt',{type:'doughnut',data:{labels,datasets:[{data:vals.map(v=>Math.round(v)),
    backgroundColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]+'bb'),
    borderColor:labels.map((_,i)=>PALETTE[i%PALETTE.length]),borderWidth:2,hoverOffset:8}]},
    options:chartDefaults({scales:{},cutout:'60%',
      plugins:{...chartDefaults().plugins,tooltip:{callbacks:{label:ctx=>` ₹${ctx.parsed}`}}}})});
}

/* ── Summary stats ── */
function renderSummaryStats(orders) {
  if(!orders.length){g('summaryStats').innerHTML='<p style="color:var(--mist3);font-size:.82rem">No data yet. Place an order or seed demo data.</p>';return;}
  const total=orders.length;
  const revenue=orders.reduce((s,o)=>s+(o.grand_total||0),0);
  const pages=orders.reduce((s,o)=>s+(o.pages||0),0);
  const maxRev=Math.max(...orders.map(o=>o.grand_total||0));
  const withG=orders.filter(o=>o.has_graphs).length;
  g('summaryStats').innerHTML=`<div class="summary-grid">
    <div class="summ-item"><div class="summ-lbl">Total Orders</div><div class="summ-val">${total}</div></div>
    <div class="summ-item"><div class="summ-lbl">Total Revenue</div><div class="summ-val">₹${revenue.toFixed(2)}</div></div>
    <div class="summ-item"><div class="summ-lbl">Total Pages</div><div class="summ-val">${pages}</div></div>
    <div class="summ-item"><div class="summ-lbl">Avg Pages/Order</div><div class="summ-val">${(pages/total).toFixed(1)}</div></div>
    <div class="summ-item"><div class="summ-lbl">Avg Revenue</div><div class="summ-val">₹${(revenue/total).toFixed(2)}</div></div>
    <div class="summ-item"><div class="summ-lbl">Highest Order</div><div class="summ-val">₹${maxRev.toFixed(2)}</div></div>
    <div class="summ-item"><div class="summ-lbl">With Graphs</div><div class="summ-val">${withG} (${((withG/total)*100).toFixed(0)}%)</div></div>
    <div class="summ-item"><div class="summ-lbl">Graph Revenue</div><div class="summ-val">₹${orders.reduce((s,o)=>s+(o.graph_charge||0),0).toFixed(2)}</div></div>
  </div>`;
}

/* ── Table ── */
const LEVEL_BADGE = {'B.Tech':'b-blue','Degree':'b-green','Masters':'b-purple','Diploma':'b-amber'};
const WTYPE_BADGE = {'Assignment':'b-green','Class Work':'b-blue','Record':'b-amber','Observation':'b-purple'};

function renderTable(orders) {
  const body=g('ordersBody');
  setText('ordersCount',`${orders.length} orders`);
  if(!orders.length){
    body.innerHTML=`<tr><td colspan="10" class="no-data">No orders found. ${allOrders.length?'Adjust your filters.':'No orders yet — seed demo data or place an order!'}</td></tr>`;
    return;
  }
  body.innerHTML=orders.map(o=>`<tr>
    <td class="td-id">${xss(o.id||'—')}</td>
    <td class="td-name">${xss(o.full_name||'—')}</td>
    <td style="font-size:.76rem" title="${xss(o.college||'')}">${xss((o.college||'—').substring(0,18))}${(o.college||'').length>18?'…':''}</td>
    <td style="font-size:.76rem">${xss((o.subject||'—').substring(0,20))}${(o.subject||'').length>20?'…':''}</td>
    <td><span class="badge ${LEVEL_BADGE[o.level]||'b-green'}">${xss(o.level||'—')}</span></td>
    <td><span class="badge ${WTYPE_BADGE[o.work_type]||'b-green'}">${xss(o.work_type||'—')}</span></td>
    <td style="font-family:var(--mono);font-size:.76rem">${o.pages||0}</td>
    <td class="td-amt">₹${Number(o.grand_total||0).toFixed(2)}</td>
    <td style="font-size:.7rem;color:var(--mist3);white-space:nowrap">${fmtDate(o.created_at)}</td>
    <td><div class="td-action">
      <button class="act-btn" onclick="viewOrder('${xss(o.id)}')">👁 View</button>
      <button class="act-btn del" onclick="confirmDelete('${xss(o.id)}')">🗑</button>
    </div></td>
  </tr>`).join('');
}

function filterOrders() {
  const q=(g('searchQ').value||'').toLowerCase();
  const lv=g('filterLvl').value, wt=g('filterWt').value;
  filteredOrders=allOrders.filter(o=>{
    const mq=!q||[o.id,o.full_name,o.subject,o.college,o.email].some(v=>(v||'').toLowerCase().includes(q));
    return mq&&(!lv||o.level===lv)&&(!wt||o.work_type===wt);
  });
  applySortAndRender();
}

function sortTable(key) {
  if(sortKey===key)sortDir*=-1;else{sortKey=key;sortDir=1;}
  applySortAndRender();
}

function applySortAndRender() {
  filteredOrders.sort((a,b)=>{
    let av=a[sortKey]??'',bv=b[sortKey]??'';
    if(typeof av==='number') return (av-bv)*sortDir;
    return String(av).localeCompare(String(bv))*sortDir;
  });
  renderTable(filteredOrders);
}

/* ── View order ── */
function viewOrder(oid) {
  const o = allOrders.find(x=>x.id===oid);
  if(!o){toast('Order not found.','err');return;}
  g('modalTitle').textContent='🔖 '+o.id;
  g('modalBody').innerHTML=`
    <div class="info-section"><h3 class="info-sec-title">Customer</h3>
      <div class="info-grid">
        <div class="info-item"><div class="ik">Name</div><div class="iv">${xss(o.full_name)}</div></div>
        <div class="info-item"><div class="ik">Phone</div><div class="iv">${xss(o.phone)}</div></div>
        <div class="info-item"><div class="ik">Email</div><div class="iv" style="font-size:.74rem">${xss(o.email)}</div></div>
        <div class="info-item"><div class="ik">Date</div><div class="iv" style="font-size:.73rem">${fmtDate(o.created_at)}</div></div>
      </div></div>
    <div class="info-section"><h3 class="info-sec-title">Academic</h3>
      <div class="info-grid">
        <div class="info-item"><div class="ik">College</div><div class="iv" style="font-size:.76rem">${xss(o.college)}</div></div>
        <div class="info-item"><div class="ik">Roll No.</div><div class="iv">${xss(o.roll_number)}</div></div>
        <div class="info-item"><div class="ik">Level</div><div class="iv">${xss(o.level)} — Year ${o.year}</div></div>
        <div class="info-item"><div class="ik">Semester</div><div class="iv">Sem ${o.semester}</div></div>
        <div class="info-item"><div class="ik">Work Type</div><div class="iv">${xss(o.work_type)}</div></div>
        <div class="info-item"><div class="ik">Subject</div><div class="iv">${xss(o.subject)}</div></div>
      </div></div>
    <div class="info-section"><h3 class="info-sec-title">Pricing</h3>
      <div class="live-bill">
        <div class="lb-row"><span class="lb-l">Pages</span><span class="lb-v">${o.pages}</span></div>
        <div class="lb-row"><span class="lb-l">Graphs</span><span class="lb-v">${o.has_graphs?'Yes ✓':'No'}</span></div>
        <div class="lb-row"><span class="lb-l">Base Cost</span><span class="lb-v">₹${Number(o.base_cost).toFixed(2)}</span></div>
        <div class="lb-row"><span class="lb-l">Graph Charges</span><span class="lb-v">₹${Number(o.graph_charge).toFixed(2)}</span></div>
        <div class="lb-total"><span>Grand Total</span><span class="lb-total-v">₹${Number(o.grand_total).toFixed(2)}</span></div>
      </div></div>
    ${o.instructions?`<div class="info-section"><h3 class="info-sec-title">Instructions</h3>
      <div style="background:rgba(255,255,255,.03);border-radius:9px;padding:12px;font-size:.8rem;color:var(--mist2);line-height:1.6">${xss(o.instructions)}</div>
    </div>`:''}
    ${o.file_name?`<div class="info-section"><h3 class="info-sec-title">Reference File</h3>
      <div style="font-size:.8rem;color:var(--sage)">📎 ${xss(o.file_name)}</div></div>`:''}`;
  window._modalOrder = o;
  g('modalOverlay').classList.remove('hidden');
}

function closeModal(){g('modalOverlay').classList.add('hidden');}

/* ── Delete order ── */
function confirmDelete(oid) {
  if(!confirm(`Delete order ${oid}?\n\nThis cannot be undone.`)) return;
  allOrders = allOrders.filter(o=>o.id!==oid);
  filteredOrders = filteredOrders.filter(o=>o.id!==oid);
  LS.set(ORDERS_KEY, allOrders);
  toast(`Order ${oid} deleted.`);
  renderTable(filteredOrders);
  renderSummaryStats(allOrders);
  const stats = computeStats(allOrders);
  renderKPIs(stats);
  renderAllCharts(stats, allOrders);
  closeModal();
}

function printModalBill() {
  const o=window._modalOrder; if(!o) return;
  const order={id:o.id,created_at:o.created_at,display:fmtDate(o.created_at),
    customer:{name:o.full_name,phone:o.phone,email:o.email},
    academic:{college:o.college,roll:o.roll_number,level:o.level,year:o.year,sem:o.semester,workType:o.work_type},
    order:{subject:o.subject,pages:o.pages,graphs:!!o.has_graphs},
    pricing:{base:o.base_cost,gc:o.graph_charge,total:o.grand_total}};
  const w=window.open('','_blank');
  w.document.write(buildBillHTML(order)); w.document.close();
  setTimeout(()=>w.print(),350);
}

/* ── View switching ── */
function switchView(view,el) {
  document.querySelectorAll('.dash-view').forEach(v=>v.classList.add('hidden'));
  g('view-'+view).classList.remove('hidden');
  document.querySelectorAll('.sb-link').forEach(l=>l.classList.remove('active'));
  if(el) el.classList.add('active');
  const titles={overview:'Overview',orders:'All Orders',analytics:'Analytics'};
  const subs={overview:'All time statistics',orders:'Search & filter orders',analytics:'Deep data insights'};
  setText('viewTitle',titles[view]||view);
  setText('viewSub',subs[view]||'');
}


/* ── Date formatter ── */
function fmtDate(ts) {
  if(!ts) return '—';
  try{return new Date(ts).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}
  catch{return String(ts).substring(0,16);}
}

/* ── Bill HTML builder ── */
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
  <div class="header"><div class="logo-box">✒️</div>
    <div><div class="brand">Script<span>Mate</span></div><div style="font-size:11px;color:#666">Academic Handwriting Service</div></div>
    <div class="bill-meta"><strong>INVOICE</strong><br/>${fmtDate(o.created_at)}</div></div>
  <div class="badge">🔖 ${xss(o.id)}</div>
  <div class="section"><div class="sec-title">Customer</div><div class="grid">
    <div class="item"><div class="ik">Name</div><div class="iv">${xss(o.customer?.name||o.full_name||'—')}</div></div>
    <div class="item"><div class="ik">Phone</div><div class="iv">${xss(o.customer?.phone||o.phone||'—')}</div></div>
    <div class="item"><div class="ik">Email</div><div class="iv" style="font-size:12px">${xss(o.customer?.email||o.email||'—')}</div></div>
    <div class="item"><div class="ik">Date</div><div class="iv" style="font-size:11px">${fmtDate(o.created_at)}</div></div>
  </div></div>
  <div class="section"><div class="sec-title">Academic</div><div class="grid">
    <div class="item"><div class="ik">College</div><div class="iv" style="font-size:12px">${xss(o.academic?.college||o.college||'—')}</div></div>
    <div class="item"><div class="ik">Roll No.</div><div class="iv">${xss(o.academic?.roll||o.roll_number||'—')}</div></div>
    <div class="item"><div class="ik">Level</div><div class="iv">${xss(o.academic?.level||o.level||'—')}</div></div>
    <div class="item"><div class="ik">Semester</div><div class="iv">Sem ${o.academic?.sem||o.semester||'—'}</div></div>
  </div></div>
  <div class="section"><div class="sec-title">Bill</div>
    <table class="bill-table">
      <tr><td>Subject</td><td>${xss(o.order?.subject||o.subject||'—')}</td></tr>
      <tr><td>Work Type</td><td>${xss(o.academic?.workType||o.work_type||'—')}</td></tr>
      <tr><td>Pages</td><td>${o.order?.pages||o.pages||0}</td></tr>
      <tr><td>Graphs</td><td>${(o.order?.graphs||o.has_graphs)?'Yes':'No'}</td></tr>
      <tr><td>Base Cost</td><td>₹${Number(o.pricing?.base||o.base_cost||0).toFixed(2)}</td></tr>
      <tr><td>Graph Charges (+₹3/page)</td><td>₹${Number(o.pricing?.gc||o.graph_charge||0).toFixed(2)}</td></tr>
      <tr class="total-row"><td><strong>Grand Total</strong></td><td><strong>₹${Number(o.pricing?.total||o.grand_total||0).toFixed(2)}</strong></td></tr>
    </table></div>
  <div class="footer">ScriptMate — Academic Handwriting Service · ht786098@gmail.com<br/>Thank you for your order!</div>
  </body></html>`;
}

function toast(msg,type='') {
  const old=document.querySelector('.toast'); if(old) old.remove();
  const t=document.createElement('div');
  t.className='toast'+(type?' t-'+type:'');
  t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3500);
}

document.addEventListener('DOMContentLoaded',()=>{
  autoLogin();
  g('adminPwd')?.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  g('modalOverlay')?.addEventListener('click',e=>{if(e.target===g('modalOverlay'))closeModal();});
});
