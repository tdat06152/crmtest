// ═══════════════════════════════════════════════════════════
// CRM Dashboard — Frontend Application
// ═══════════════════════════════════════════════════════════

const API = '';
const COLORS = ['#38bdf8','#34d399','#a78bfa','#f472b6','#fb923c','#fbbf24','#22d3ee','#818cf8','#f87171','#6ee7b7'];
const BAR_CLASSES = ['blue','green','purple','pink','orange','cyan','indigo','red'];

// ─── Utilities ──────────────────────────────────────────
function fmt(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : Math.round(n).toLocaleString(); }
function fmtUSD(n) { return '$' + fmt(n); }
function pct(n) { return n.toFixed(1) + '%'; }

function getFilters() {
  const p = new URLSearchParams();
  const from = document.getElementById('filter-from').value;
  const to = document.getElementById('filter-to').value;
  const country = document.getElementById('filter-country').value;
  const industry = document.getElementById('filter-industry').value;
  const owner = document.getElementById('filter-owner').value;
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  if (country) p.set('country', country);
  if (industry) p.set('industry', industry);
  if (owner) p.set('owner', owner);
  return p.toString();
}

async function fetchJSON(url) {
  const q = getFilters();
  const res = await fetch(`${API}${url}${q ? '?'+q : ''}`);
  return res.json();
}

// ─── Tab Switching ──────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
}

function resetFilters() {
  document.getElementById('filter-from').value = '2024-01-01';
  document.getElementById('filter-to').value = '2026-12-31';
  document.getElementById('filter-country').value = '';
  document.getElementById('filter-industry').value = '';
  document.getElementById('filter-owner').value = '';
  loadAll();
}

// ─── Chart Builders ─────────────────────────────────────
function buildBarChart(data, colorClass) {
  const entries = Object.entries(data);
  if (!entries.length) return '<div class="empty-state">No data</div>';
  const max = Math.max(...entries.map(e => e[1]), 1);
  return `<div class="bar-chart">${entries.map(([k,v], i) =>
    `<div class="bar-group"><div class="bar-value">${fmt(v)}</div><div class="bar ${colorClass || BAR_CLASSES[i%BAR_CLASSES.length]}" style="height:${Math.max((v/max)*100,2)}%"></div><div class="bar-label" title="${k}">${k.length>8?k.slice(0,8)+'…':k}</div></div>`
  ).join('')}</div>`;
}

function buildHBarChart(data, colorClass, isUSD) {
  const entries = Object.entries(data).sort((a,b) => b[1]-a[1]);
  if (!entries.length) return '<div class="empty-state">No data</div>';
  const max = Math.max(...entries.map(e => e[1]), 1);
  return `<div class="h-bar-chart">${entries.map(([k,v], i) =>
    `<div class="h-bar-row"><div class="h-bar-label">${k}</div><div class="h-bar-track"><div class="h-bar-fill ${colorClass || BAR_CLASSES[i%BAR_CLASSES.length]}" style="width:${Math.max((v/max)*100,3)}%">${isUSD?fmtUSD(v):fmt(v)}</div></div></div>`
  ).join('')}</div>`;
}

function buildFunnel(data, labels, colors) {
  const entries = labels.map((l,i) => [l, data[l]||0]);
  const max = Math.max(...entries.map(e => e[1]), 1);
  const funnelColors = colors || ['#38bdf8','#22d3ee','#34d399','#a78bfa','#f472b6','#fb923c','#f87171'];
  return `<div class="funnel-chart">${entries.map(([k,v],i) =>
    `<div class="funnel-step"><div class="funnel-label">${k}</div><div class="funnel-bar-container"><div class="funnel-bar" style="width:${Math.max((v/max)*100,5)}%;background:${funnelColors[i%funnelColors.length]}">${v}</div></div><div class="funnel-count">${v}</div></div>`
  ).join('')}</div>`;
}

function buildDonut(data, colors) {
  const entries = Object.entries(data);
  const total = entries.reduce((s,e) => s+e[1], 0) || 1;
  const cs = colors || COLORS;
  let offset = 0;
  const radius = 54, circ = 2 * Math.PI * radius;
  const segments = entries.map(([k,v],i) => {
    const pctVal = v/total;
    const dash = pctVal * circ;
    const gap = circ - dash;
    const o = offset;
    offset += dash;
    return `<circle cx="75" cy="75" r="${radius}" fill="none" stroke="${cs[i%cs.length]}" stroke-width="18" stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${-o}" opacity="0.9"/>`;
  });
  const legend = entries.map(([k,v],i) =>
    `<div class="legend-item"><div class="legend-dot" style="background:${cs[i%cs.length]}"></div>${k}<span class="legend-value">${fmt(v)} (${(v/total*100).toFixed(0)}%)</span></div>`
  ).join('');
  return `<div class="donut-container"><svg class="donut-svg" viewBox="0 0 150 150">${segments.join('')}</svg><div class="donut-legend">${legend}</div></div>`;
}

function buildTable(headers, rows) {
  return `<table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td${i>0?' class="num"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function kpi(label, value, cls, sub) {
  return `<div class="kpi-card ${cls}"><div class="kpi-label">${label}</div><div class="kpi-value ${cls}">${value}</div>${sub?`<div class="kpi-sub">${sub}</div>`:''}</div>`;
}

// ─── Load Filters ───────────────────────────────────────
async function loadFilters() {
  const d = await fetch(`${API}/api/filters`).then(r=>r.json());
  const cs = document.getElementById('filter-country');
  const is = document.getElementById('filter-industry');
  const os = document.getElementById('filter-owner');
  d.countries.forEach(c => { const o = document.createElement('option'); o.value=c; o.textContent=c; cs.appendChild(o); });
  d.industries.forEach(c => { const o = document.createElement('option'); o.value=c; o.textContent=c; is.appendChild(o); });
  d.owners.forEach(c => { const o = document.createElement('option'); o.value=c; o.textContent=c; os.appendChild(o); });
}

// ─── Tab Loaders ────────────────────────────────────────
async function loadBusiness() {
  const d = await fetchJSON('/api/business-analysis');
  const el = document.getElementById('tab-business');
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('Total MRR', fmtUSD(d.totalMRR), 'blue', 'Monthly Recurring Revenue')}
      ${kpi('Total ARR', fmtUSD(d.totalARR), 'green', 'Annual Recurring Revenue')}
      ${kpi('Customers', fmt(d.totalCustomers), 'purple')}
      ${kpi('Avg Health Score', d.avgHealthScore.toFixed(0)+'/100', 'orange')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">📍 MRR by Country</div>${buildBarChart(d.mrrByCountry, 'blue')}</div>
      <div class="chart-card"><div class="chart-title">🏭 MRR by Industry</div>${buildBarChart(d.mrrByIndustry, 'cyan')}</div>
      <div class="chart-card"><div class="chart-title">⚠️ Churn Risk Distribution</div>${buildDonut(d.churnRisk, ['#f87171','#fbbf24','#34d399'])}</div>
      <div class="chart-card"><div class="chart-title">📏 Revenue by Segment</div>
        ${buildDonut(
          Object.fromEntries(Object.entries(d.segments).map(([k,v])=>[k+' ($'+fmt(v.mrr)+')', v.count])),
          ['#38bdf8','#a78bfa','#fb923c']
        )}
        ${buildTable(['Segment','Count','Total MRR'],Object.entries(d.segments).map(([k,v])=>[k,v.count,fmtUSD(v.mrr)]))}
      </div>
    </div>`;
}

async function loadReporting() {
  const d = await fetchJSON('/api/reporting');
  const el = document.getElementById('tab-reporting');
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('Total Activities', fmt(d.totalActivities), 'blue')}
      ${kpi('Total Tickets', fmt(d.totalTickets), 'purple')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">📞 Activities by Type</div>${buildBarChart(d.actByType, 'blue')}</div>
      <div class="chart-card"><div class="chart-title">🎯 Activity Outcomes</div>${buildDonut(d.actByOutcome)}</div>
      <div class="chart-card"><div class="chart-title">🎫 Tickets by Status</div>${buildDonut(d.ticketsByStatus, ['#34d399','#38bdf8','#fbbf24','#f87171','#a78bfa'])}</div>
      <div class="chart-card"><div class="chart-title">📊 Weekly Activity Volume</div>
        ${(()=>{
          const weeks = Object.entries(d.weekly).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
          if(!weeks.length) return '<div class="empty-state">No data</div>';
          const types = ['Meeting','Call','Demo'];
          const max = Math.max(...weeks.map(([,v])=>types.reduce((s,t)=>s+(v[t]||0),0)),1);
          return `<div class="stacked-bar-chart">${weeks.map(([wk,v])=>{
            const total = types.reduce((s,t)=>s+(v[t]||0),0);
            return `<div class="stacked-row"><div class="stacked-label">${wk.slice(5)}</div><div class="stacked-track">${types.map((t,i)=>{
              const w = total?((v[t]||0)/max*100):0;
              return `<div class="stacked-segment" style="width:${w}%;background:${COLORS[i]}" title="${t}: ${v[t]||0}">${v[t]||''}</div>`;
            }).join('')}</div></div>`;
          }).join('')}</div><div style="margin-top:12px;display:flex;gap:16px">${types.map((t,i)=>`<div class="legend-item"><div class="legend-dot" style="background:${COLORS[i]}"></div>${t}</div>`).join('')}</div>`;
        })()}
      </div>
    </div>`;
}

async function loadAnalytics() {
  const d = await fetchJSON('/api/analytics');
  const el = document.getElementById('tab-analytics');
  const stages = ['Discovery','Demo','Proposal','Negotiation','Closed Won','Closed Lost'];
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('Total Leads', fmt(d.totalLeads), 'blue')}
      ${kpi('Opportunities', fmt(d.totalOpportunities), 'purple')}
      ${kpi('Pipeline Value', fmtUSD(d.totalPipelineValue), 'green')}
      ${kpi('Win Rate', pct(d.winRate), 'orange')}
      ${kpi('Won Revenue', fmtUSD(d.wonRevenue), 'green')}
      ${kpi('Weighted Forecast', fmtUSD(d.weightedForecast), 'blue')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">🔽 Lead Funnel</div>
        ${buildFunnel(d.leadFunnel, ['New','Contacted','Qualified','Proposal','Negotiation','Won','Lost'])}
      </div>
      <div class="chart-card"><div class="chart-title">📊 Pipeline by Stage</div>
        ${buildTable(['Stage','Count','Value','Weighted'], stages.map(s => [s, d.pipeline[s]?.count||0, fmtUSD(d.pipeline[s]?.value||0), fmtUSD(d.pipeline[s]?.weightedValue||0)]))}
        <div style="margin-top:16px">${buildBarChart(Object.fromEntries(stages.map(s=>[s, d.pipeline[s]?.value||0])))}</div>
      </div>
    </div>`;
}

async function loadProductOwner() {
  const d = await fetchJSON('/api/product-owner');
  const el = document.getElementById('tab-product-owner');
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('Expansion Value', fmtUSD(d.totalExpansionValue), 'green')}
      ${kpi('Feature Requests', fmt(d.featureRequestCount), 'purple')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">🚀 Expansion by Product</div>
        ${buildTable(['Product','Count','Value'], Object.entries(d.expansionByProduct).map(([k,v])=>[k,v.count,fmtUSD(v.value)]))}
        <div style="margin-top:16px">${buildHBarChart(Object.fromEntries(Object.entries(d.expansionByProduct).map(([k,v])=>[k,v.value])), 'green', true)}</div>
      </div>
      <div class="chart-card"><div class="chart-title">💡 Feature Requests by Priority</div>${buildDonut(d.frByPriority, ['#f87171','#fb923c','#fbbf24','#34d399'])}</div>
      <div class="chart-card"><div class="chart-title">📋 Feature Requests by Status</div>${buildDonut(d.frByStatus)}</div>
    </div>`;
}

async function loadProductDesign() {
  const d = await fetchJSON('/api/product-design');
  const el = document.getElementById('tab-product-design');
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('Avg CSAT', d.avgCSAT.toFixed(2)+'/5', d.avgCSAT>=4?'green':'orange')}
      ${kpi('Resolved Tickets', fmt(d.totalResolvedTickets), 'blue')}
      ${kpi('Onboarding Issues', fmt(d.onboardingCount), 'purple')}
      ${kpi('Avg Onboarding Resolution', d.avgOnboardingResolution.toFixed(1)+'h', 'orange')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">⭐ CSAT Distribution</div>${buildBarChart(d.csatDist, 'green')}</div>
      <div class="chart-card"><div class="chart-title">🎓 Onboarding by Priority</div>${buildDonut(d.onboardingByPriority, ['#f87171','#fb923c','#fbbf24','#34d399'])}</div>
    </div>`;
}

async function loadRnD() {
  const d = await fetchJSON('/api/rnd');
  const el = document.getElementById('tab-rnd');
  const bugMonths = Object.entries(d.bugsByMonth).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('Total Bugs', fmt(d.totalBugs), 'red')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">🐛 Bug Trend (Monthly)</div>${buildBarChart(Object.fromEntries(bugMonths), 'red')}</div>
      <div class="chart-card"><div class="chart-title">🔥 Bugs by Priority</div>${buildDonut(d.bugByPriority, ['#f87171','#fb923c','#fbbf24','#34d399'])}</div>
      <div class="chart-card"><div class="chart-title">📡 Acquisition Channels (Count)</div>${buildHBarChart(d.channels, 'blue')}</div>
      <div class="chart-card"><div class="chart-title">💰 Channel MRR Contribution</div>${buildHBarChart(d.channelMRR, 'green', true)}</div>
    </div>`;
}

async function loadProjectMgmt() {
  const d = await fetchJSON('/api/project-management');
  const el = document.getElementById('tab-project-mgmt');
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('Open Opportunities', fmt(d.totalOpenOpps), 'blue')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">⏱️ Avg Resolution Hours by Support Owner</div>
        ${buildTable(['Owner','Tickets','Avg Hours'], Object.entries(d.ownerResolution).map(([k,v])=>[k,v.count,v.avg+'h']))}
        <div style="margin-top:16px">${buildHBarChart(Object.fromEntries(Object.entries(d.ownerResolution).map(([k,v])=>[k,v.avg])), 'orange')}</div>
      </div>
      <div class="chart-card"><div class="chart-title">📂 Open Opportunities by Owner</div>
        ${buildTable(['Owner','Count','Value'], Object.entries(d.oppsByOwner).sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>[k,v.count,fmtUSD(v.value)]))}
        <div style="margin-top:16px">${buildHBarChart(Object.fromEntries(Object.entries(d.oppsByOwner).map(([k,v])=>[k,v.count])), 'purple')}</div>
      </div>
    </div>`;
}

async function loadCTO() {
  const d = await fetchJSON('/api/cto');
  const el = document.getElementById('tab-cto');
  const months = Object.entries(d.criticalBugsByMonth).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('Critical Bugs', fmt(d.criticalBugCount), 'red', 'Urgent + High Priority')}
      ${kpi('Total Bugs', fmt(d.totalBugs), 'orange')}
      ${kpi('Deals in Negotiation', fmt(d.negotiatingDealCount), 'purple')}
      ${kpi('Negotiation Value', fmtUSD(d.negotiatingValue), 'blue')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">🚨 Critical Bugs Trend</div>${buildBarChart(Object.fromEntries(months), 'red')}</div>
      <div class="chart-card"><div class="chart-title">🐛 Bugs by Status</div>${buildDonut(d.bugsByStatus)}</div>
    </div>`;
}

async function loadQC() {
  const d = await fetchJSON('/api/qc');
  const el = document.getElementById('tab-qc');
  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('No Response Rate', pct(d.noResponseRate), d.noResponseRate>20?'red':'green')}
      ${kpi('No Response Count', fmt(d.noResponseCount), 'orange')}
      ${kpi('Total Activities', fmt(d.totalActivities), 'blue')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">🎫 Issue Type Distribution</div>${buildDonut(d.issueTypes)}</div>
      <div class="chart-card"><div class="chart-title">📊 Issue Types (Bar)</div>${buildBarChart(d.issueTypes)}</div>
    </div>`;
}

async function loadOperations() {
  const d = await fetchJSON('/api/operations');
  const el = document.getElementById('tab-operations');
  // Build heatmap
  const cells = Object.entries(d.inPersonByCountry).sort((a,b)=>b[1]-a[1]);
  const maxCells = Math.max(...cells.map(e=>e[1]),1);
  const heatmapHTML = cells.length ? `<div class="heatmap-grid">${cells.map(([k,v]) => {
    const intensity = Math.max(0.3, v/maxCells);
    return `<div class="heatmap-cell" style="background:rgba(56,189,248,${intensity})"><div class="heatmap-city">${k}</div><div class="heatmap-count">${v} visits</div></div>`;
  }).join('')}</div>` : '<div class="empty-state">No in-person data</div>';

  el.innerHTML = `
    <div class="kpi-row">
      ${kpi('In-Person Activities', fmt(d.inPersonCount), 'green')}
    </div>
    <div class="charts-grid">
      <div class="chart-card"><div class="chart-title">🗺️ In-Person Activities by Region</div>${heatmapHTML}</div>
      <div class="chart-card"><div class="chart-title">📱 Support Channel Distribution</div>${buildDonut(d.channelDist)}</div>
      <div class="chart-card full-width"><div class="chart-title">📊 Channel Volume</div>${buildHBarChart(d.channelDist, 'blue')}</div>
    </div>`;
}

// ─── Upload Tab ─────────────────────────────────────────
let selectedFiles = [];

function fmtBytes(bytes) {
  if (bytes >= 1e6) return (bytes/1e6).toFixed(1) + ' MB';
  if (bytes >= 1e3) return (bytes/1e3).toFixed(1) + ' KB';
  return bytes + ' B';
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) + ' ' +
         d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}

async function loadUpload() {
  const [summary, history] = await Promise.all([
    fetch(`${API}/api/data-summary`).then(r=>r.json()),
    fetch(`${API}/api/upload-history`).then(r=>r.json()),
  ]);

  const el = document.getElementById('tab-upload');
  const icons = { customers: '👥', leads: '🎯', opportunities: '💼', activities: '📞', supportTickets: '🎫' };
  const colors = { customers: 'rgba(56,189,248,0.15)', leads: 'rgba(52,211,153,0.15)', opportunities: 'rgba(167,139,250,0.15)', activities: 'rgba(251,146,60,0.15)', supportTickets: 'rgba(244,114,182,0.15)' };

  el.innerHTML = `
    <div class="upload-section">
      <!-- Drop Zone -->
      <div class="chart-card upload-zone-wrapper">
        <div class="chart-title">📤 Upload CSV Data Files</div>
        <div class="upload-dropzone" id="upload-dropzone">
          <span class="upload-icon">📁</span>
          <div class="upload-title">Drop your CSV files here</div>
          <div class="upload-subtitle">or click to browse • Supports multiple files</div>
          <div class="upload-hint">Accepted: customers.csv, leads.csv, opportunities.csv, activities.csv, support_tickets.csv</div>
          <input type="file" class="upload-input" id="upload-input" multiple accept=".csv">
        </div>
        <div class="upload-file-list" id="upload-file-list"></div>
        <div style="text-align:center;margin-top:16px">
          <button class="btn-upload" id="btn-upload" disabled onclick="doUpload()">📤 Upload & Update Dashboard</button>
        </div>
        <div id="upload-progress"></div>
        <div id="upload-results"></div>
      </div>

      <!-- Current Data Sources -->
      <div class="chart-card">
        <div class="chart-title">📂 Current Data Sources</div>
        <div class="data-sources-grid">
          ${Object.entries(summary).map(([k,v]) => `
            <div class="data-source-card">
              <div class="data-source-icon" style="background:${colors[k]||'rgba(255,255,255,0.06)'}">${icons[k]||'📄'}</div>
              <div class="data-source-info">
                <div class="data-source-name">${v.file}</div>
                <div class="data-source-rows">${v.rows.toLocaleString()} rows loaded</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Upload History -->
      <div class="chart-card">
        <div class="chart-title">🕐 Upload History</div>
        ${history.length ? buildTable(
          ['File', 'Date', 'Rows', 'Cols', 'Size'],
          history.slice(0, 15).map(h => [h.file, fmtTime(h.timestamp), h.rows, h.columns, fmtBytes(h.size)])
        ) : '<div class="empty-state">No uploads yet. Upload your first CSV file to get started.</div>'}
      </div>
    </div>
  `;

  // Attach drag & drop + click handlers
  const dropzone = document.getElementById('upload-dropzone');
  const input = document.getElementById('upload-input');

  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', () => { handleFiles(input.files); input.value = ''; });
}

function handleFiles(fileList) {
  for (const f of fileList) {
    if (!f.name.endsWith('.csv')) continue;
    // Avoid duplicates
    if (selectedFiles.find(s => s.name === f.name)) continue;
    selectedFiles.push(f);
  }
  renderFileList();
}

function removeFile(idx) {
  selectedFiles.splice(idx, 1);
  renderFileList();
}

function renderFileList() {
  const container = document.getElementById('upload-file-list');
  const btn = document.getElementById('btn-upload');
  if (!container) return;

  container.innerHTML = selectedFiles.map((f, i) => `
    <div class="upload-file-card">
      <span class="file-icon">📄</span>
      <span class="file-name">${f.name}</span>
      <span class="file-size">${fmtBytes(f.size)}</span>
      <span class="file-remove" onclick="removeFile(${i})">✕</span>
    </div>
  `).join('');

  btn.disabled = selectedFiles.length === 0;
}

async function doUpload() {
  if (!selectedFiles.length) return;

  const btn = document.getElementById('btn-upload');
  const progressEl = document.getElementById('upload-progress');
  const resultsEl = document.getElementById('upload-results');
  btn.disabled = true;
  btn.textContent = '⏳ Uploading…';

  progressEl.innerHTML = `
    <div class="upload-progress">
      <div class="progress-bar-track"><div class="progress-bar-fill" id="progress-fill" style="width:10%"></div></div>
      <div class="progress-text" id="progress-text">Uploading ${selectedFiles.length} file(s)…</div>
    </div>
  `;
  resultsEl.innerHTML = '';

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('files', f));

  // Animate progress
  const fill = document.getElementById('progress-fill');
  const pText = document.getElementById('progress-text');
  fill.style.width = '40%';

  try {
    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
    fill.style.width = '80%';
    pText.textContent = 'Processing response…';

    const data = await res.json();
    fill.style.width = '100%';

    if (data.error && !data.results) {
      pText.textContent = 'Upload failed';
      resultsEl.innerHTML = `<div class="result-item error"><span class="result-badge error">Error</span>${data.error}</div>`;
    } else {
      pText.textContent = data.reloaded ? '✅ Dashboard data reloaded!' : 'Upload complete';
      resultsEl.innerHTML = `<div class="upload-results">${data.results.map(r => `
        <div class="result-item ${r.status}">
          <span class="result-badge ${r.status}">${r.status}</span>
          <strong>${r.file}</strong>
          ${r.status === 'success' ? `— ${r.rows} rows, ${r.columns} columns` : `— ${r.message}`}
        </div>
      `).join('')}</div>`;

      // Refresh dashboard data
      if (data.reloaded) {
        selectedFiles = [];
        renderFileList();
        setTimeout(async () => {
          await loadAll();
          await loadUpload(); // Refresh the upload tab too
        }, 500);
      }
    }
  } catch (err) {
    fill.style.width = '100%';
    fill.style.background = 'var(--gradient-red)';
    pText.textContent = 'Upload failed';
    resultsEl.innerHTML = `<div class="result-item error"><span class="result-badge error">Error</span>Network error: ${err.message}</div>`;
  }

  btn.textContent = '📤 Upload & Update Dashboard';
  btn.disabled = selectedFiles.length === 0;
}

// ─── Load All ───────────────────────────────────────────
async function loadAll() {
  const loading = '<div class="loading"><div class="spinner"></div>Loading data…</div>';
  document.querySelectorAll('.tab-content').forEach(t => { if(!t.innerHTML.trim() || t.classList.contains('active')) t.innerHTML = loading; });

  await Promise.all([
    loadBusiness(), loadReporting(), loadAnalytics(),
    loadProductOwner(), loadProductDesign(), loadRnD(),
    loadProjectMgmt(), loadCTO(), loadQC(), loadOperations(),
    loadUpload()
  ]);
}

// ─── Init ───────────────────────────────────────────────
(async () => {
  await loadFilters();
  await loadAll();
})();
