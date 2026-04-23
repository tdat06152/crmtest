const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Upload setup ──────────────────────────────────────────────────
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const UPLOAD_DIR = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const BACKUP_DIR = isVercel ? '/tmp/backups' : path.join(__dirname, 'backups');
const HISTORY_FILE = isVercel ? '/tmp/upload_history.json' : path.join(__dirname, 'upload_history.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const VALID_FILES = {
  'customers.csv': 'customers',
  'leads.csv': 'leads',
  'opportunities.csv': 'opportunities',
  'activities.csv': 'activities',
  'support_tickets.csv': 'supportTickets',
};

const upload = multer({
  dest: UPLOAD_DIR,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.csv') {
      return cb(new Error('Only .csv files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

function loadUploadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch(e) {}
  return [];
}

function saveUploadHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch(e) {}
}

// ── Load CSV data ──────────────────────────────────────────────────
function loadCSV(filename) {
  const tmpPath = path.join('/tmp', filename);
  const localPath = path.join(__dirname, filename);
  const targetPath = (isVercel && fs.existsSync(tmpPath)) ? tmpPath : localPath;
  try {
    const content = fs.readFileSync(targetPath, 'utf-8');
    return parse(content, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    console.error(`Error loading CSV: ${filename} from ${targetPath}`, err);
    return [];
  }
}

let customers, leads, opportunities, activities, supportTickets;

function reload() {
  customers = loadCSV('customers.csv');
  leads = loadCSV('leads.csv');
  opportunities = loadCSV('opportunities.csv');
  activities = loadCSV('activities.csv');
  supportTickets = loadCSV('support_tickets.csv');

  // Parse numeric fields
  customers.forEach(c => {
    c.health_score = +c.health_score;
    c.mrr_usd = +c.mrr_usd;
    c.arr_usd = +c.arr_usd;
  });
  leads.forEach(l => {
    l.estimated_deal_value_usd = +l.estimated_deal_value_usd;
    l.lead_score = +l.lead_score;
  });
  opportunities.forEach(o => {
    o.amount_usd = +o.amount_usd;
    o.probability = +o.probability;
    o.is_won = +o.is_won;
  });
  activities.forEach(a => {
    a.duration_minutes = +a.duration_minutes;
  });
  supportTickets.forEach(t => {
    t.resolution_hours = +t.resolution_hours;
    t.csat_score = +t.csat_score;
  });
}
reload();

// ── Helper: filter by date/country/industry/owner ──────────────────
function applyFilters(data, q, dateField = 'created_date') {
  let result = [...data];
  if (q.from) result = result.filter(r => r[dateField] >= q.from);
  if (q.to) result = result.filter(r => r[dateField] <= q.to);
  if (q.country) result = result.filter(r => r.country === q.country);
  if (q.industry) result = result.filter(r => r.industry === q.industry);
  if (q.owner) {
    result = result.filter(r =>
      r.account_owner === q.owner || r.owner === q.owner || r.support_owner === q.owner
    );
  }
  return result;
}

// ── Filter options ────────────────────────────────────────────────
app.get('/api/filters', (req, res) => {
  const countries = [...new Set(customers.map(c => c.country))].sort();
  const industries = [...new Set(customers.map(c => c.industry))].sort();
  const owners = [...new Set([
    ...customers.map(c => c.account_owner),
    ...leads.map(l => l.owner),
    ...opportunities.map(o => o.owner),
    ...activities.map(a => a.owner),
    ...supportTickets.map(t => t.support_owner),
  ])].sort();
  res.json({ countries, industries, owners });
});

// ── a. Business Analysis ──────────────────────────────────────────
app.get('/api/business-analysis', (req, res) => {
  const q = req.query;
  const custs = applyFilters(customers, q);

  // MRR/ARR by country
  const mrrByCountry = {};
  const mrrByIndustry = {};
  const churnRisk = { High: 0, Medium: 0, Low: 0 };
  const segments = { SMB: { count: 0, mrr: 0 }, 'Mid-Market': { count: 0, mrr: 0 }, Enterprise: { count: 0, mrr: 0 } };

  custs.forEach(c => {
    // MRR by country
    mrrByCountry[c.country] = (mrrByCountry[c.country] || 0) + c.mrr_usd;
    // MRR by industry
    mrrByIndustry[c.industry] = (mrrByIndustry[c.industry] || 0) + c.mrr_usd;
    // Churn risk based on health score
    if (c.health_score < 50) churnRisk.High++;
    else if (c.health_score < 70) churnRisk.Medium++;
    else churnRisk.Low++;
    // Segments
    if (segments[c.company_size]) {
      segments[c.company_size].count++;
      segments[c.company_size].mrr += c.mrr_usd;
    }
  });

  const totalMRR = custs.reduce((s, c) => s + c.mrr_usd, 0);
  const totalARR = custs.reduce((s, c) => s + c.arr_usd, 0);
  const avgHealthScore = custs.length ? custs.reduce((s, c) => s + c.health_score, 0) / custs.length : 0;

  res.json({
    totalMRR, totalARR, avgHealthScore,
    totalCustomers: custs.length,
    mrrByCountry, mrrByIndustry, churnRisk, segments
  });
});

// ── b. Reporting ──────────────────────────────────────────────────
app.get('/api/reporting', (req, res) => {
  const q = req.query;
  const acts = applyFilters(activities, q, 'activity_date');
  const tix = applyFilters(supportTickets, q);

  // Activities by type
  const actByType = {};
  const actByOutcome = {};
  acts.forEach(a => {
    actByType[a.activity_type] = (actByType[a.activity_type] || 0) + 1;
    actByOutcome[a.outcome] = (actByOutcome[a.outcome] || 0) + 1;
  });

  // Weekly activity breakdown
  const weekly = {};
  acts.forEach(a => {
    const d = new Date(a.activity_date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!weekly[key]) weekly[key] = { Meeting: 0, Call: 0, Demo: 0, Email: 0, WhatsApp: 0, 'Support Follow-up': 0 };
    if (weekly[key][a.activity_type] !== undefined) weekly[key][a.activity_type]++;
  });

  // Tickets by status
  const ticketsByStatus = {};
  tix.forEach(t => {
    ticketsByStatus[t.status] = (ticketsByStatus[t.status] || 0) + 1;
  });

  res.json({ actByType, actByOutcome, weekly, ticketsByStatus, totalActivities: acts.length, totalTickets: tix.length });
});

// ── c. Business Analytics (Pipeline/Funnel) ──────────────────────
app.get('/api/analytics', (req, res) => {
  const q = req.query;
  const lds = applyFilters(leads, q);
  const opps = applyFilters(opportunities, q);

  // Lead funnel
  const leadStatuses = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
  const leadFunnel = {};
  leadStatuses.forEach(s => leadFunnel[s] = 0);
  lds.forEach(l => { if (leadFunnel[l.status] !== undefined) leadFunnel[l.status]++; });

  // Pipeline by stage
  const stages = ['Discovery', 'Demo', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
  const pipeline = {};
  stages.forEach(s => pipeline[s] = { count: 0, value: 0, weightedValue: 0 });
  opps.forEach(o => {
    if (pipeline[o.stage]) {
      pipeline[o.stage].count++;
      pipeline[o.stage].value += o.amount_usd;
      pipeline[o.stage].weightedValue += o.amount_usd * o.probability;
    }
  });

  // Revenue forecast
  const totalPipelineValue = opps.reduce((s, o) => s + o.amount_usd, 0);
  const weightedForecast = opps.reduce((s, o) => s + o.amount_usd * o.probability, 0);
  const wonDeals = opps.filter(o => o.is_won === 1);
  const wonRevenue = wonDeals.reduce((s, o) => s + o.amount_usd, 0);
  const winRate = opps.length ? (wonDeals.length / opps.length * 100) : 0;

  res.json({ leadFunnel, pipeline, totalPipelineValue, weightedForecast, wonRevenue, winRate, totalLeads: lds.length, totalOpportunities: opps.length });
});

// ── d. Product Owner ──────────────────────────────────────────────
app.get('/api/product-owner', (req, res) => {
  const q = req.query;
  const opps = applyFilters(opportunities, q);
  const tix = applyFilters(supportTickets, q);

  // Expansion opportunities
  const expansionOpps = opps.filter(o => o.pipeline === 'Expansion');
  const expansionByProduct = {};
  expansionOpps.forEach(o => {
    const p = o.product || 'Unknown';
    if (!expansionByProduct[p]) expansionByProduct[p] = { count: 0, value: 0 };
    expansionByProduct[p].count++;
    expansionByProduct[p].value += o.amount_usd;
  });

  // Feature requests from tickets
  const featureRequests = tix.filter(t => t.issue_type === 'Feature Request');
  const frByPriority = {};
  featureRequests.forEach(f => {
    frByPriority[f.priority] = (frByPriority[f.priority] || 0) + 1;
  });

  res.json({
    expansionByProduct,
    totalExpansionValue: expansionOpps.reduce((s, o) => s + o.amount_usd, 0),
    featureRequestCount: featureRequests.length,
    frByPriority,
    frByStatus: featureRequests.reduce((acc, f) => { acc[f.status] = (acc[f.status] || 0) + 1; return acc; }, {})
  });
});

// ── e. Product Design ─────────────────────────────────────────────
app.get('/api/product-design', (req, res) => {
  const q = req.query;
  const tix = applyFilters(supportTickets, q);

  // CSAT distribution
  const csatDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const resolvedTix = tix.filter(t => t.status === 'Resolved' || t.status === 'Closed');
  resolvedTix.forEach(t => { csatDist[t.csat_score] = (csatDist[t.csat_score] || 0) + 1; });
  const avgCSAT = resolvedTix.length ? resolvedTix.reduce((s, t) => s + t.csat_score, 0) / resolvedTix.length : 0;

  // Onboarding tickets
  const onboarding = tix.filter(t => t.issue_type === 'Onboarding');
  const onboardingByPriority = {};
  onboarding.forEach(t => { onboardingByPriority[t.priority] = (onboardingByPriority[t.priority] || 0) + 1; });
  const avgOnboardingResolution = onboarding.length ? onboarding.reduce((s, t) => s + t.resolution_hours, 0) / onboarding.length : 0;

  res.json({ csatDist, avgCSAT, onboardingCount: onboarding.length, onboardingByPriority, avgOnboardingResolution, totalResolvedTickets: resolvedTix.length });
});

// ── f. R&D ────────────────────────────────────────────────────────
app.get('/api/rnd', (req, res) => {
  const q = req.query;
  const tix = applyFilters(supportTickets, q);
  const custs = applyFilters(customers, q);

  // Bug trends by product (join through customer)
  const bugs = tix.filter(t => t.issue_type === 'Bug');
  const bugsByMonth = {};
  bugs.forEach(b => {
    const m = b.created_date.slice(0, 7);
    bugsByMonth[m] = (bugsByMonth[m] || 0) + 1;
  });

  // Bug by priority
  const bugByPriority = {};
  bugs.forEach(b => { bugByPriority[b.priority] = (bugByPriority[b.priority] || 0) + 1; });

  // Acquisition channels
  const channels = {};
  custs.forEach(c => { channels[c.acquisition_channel] = (channels[c.acquisition_channel] || 0) + 1; });

  // Channel effectiveness (MRR per channel)
  const channelMRR = {};
  custs.forEach(c => { channelMRR[c.acquisition_channel] = (channelMRR[c.acquisition_channel] || 0) + c.mrr_usd; });

  res.json({ totalBugs: bugs.length, bugsByMonth, bugByPriority, channels, channelMRR });
});

// ── i. Project Management ─────────────────────────────────────────
app.get('/api/project-management', (req, res) => {
  const q = req.query;
  const tix = applyFilters(supportTickets, q);
  const opps = applyFilters(opportunities, q);

  // Avg resolution by support owner
  const ownerResolution = {};
  tix.forEach(t => {
    if (!ownerResolution[t.support_owner]) ownerResolution[t.support_owner] = { total: 0, count: 0 };
    ownerResolution[t.support_owner].total += t.resolution_hours;
    ownerResolution[t.support_owner].count++;
  });
  Object.keys(ownerResolution).forEach(k => {
    ownerResolution[k].avg = +(ownerResolution[k].total / ownerResolution[k].count).toFixed(1);
  });

  // Open opportunities by owner
  const openOpps = opps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
  const oppsByOwner = {};
  openOpps.forEach(o => {
    if (!oppsByOwner[o.owner]) oppsByOwner[o.owner] = { count: 0, value: 0 };
    oppsByOwner[o.owner].count++;
    oppsByOwner[o.owner].value += o.amount_usd;
  });

  res.json({ ownerResolution, oppsByOwner, totalOpenOpps: openOpps.length });
});

// ── j. CTO ────────────────────────────────────────────────────────
app.get('/api/cto', (req, res) => {
  const q = req.query;
  const tix = applyFilters(supportTickets, q);
  const opps = applyFilters(opportunities, q);

  // Critical bugs
  const criticalBugs = tix.filter(t => t.issue_type === 'Bug' && (t.priority === 'Urgent' || t.priority === 'High'));
  const criticalBugsByMonth = {};
  criticalBugs.forEach(b => {
    const m = b.created_date.slice(0, 7);
    criticalBugsByMonth[m] = (criticalBugsByMonth[m] || 0) + 1;
  });

  // Deals in negotiation
  const negotiating = opps.filter(o => o.stage === 'Negotiation' || o.stage === 'Proposal');
  const negotiatingValue = negotiating.reduce((s, o) => s + o.amount_usd, 0);

  // Bug by status
  const allBugs = tix.filter(t => t.issue_type === 'Bug');
  const bugsByStatus = {};
  allBugs.forEach(b => { bugsByStatus[b.status] = (bugsByStatus[b.status] || 0) + 1; });

  res.json({
    criticalBugCount: criticalBugs.length,
    criticalBugsByMonth,
    negotiatingDealCount: negotiating.length,
    negotiatingValue,
    totalBugs: allBugs.length,
    bugsByStatus
  });
});

// ── n. QC ─────────────────────────────────────────────────────────
app.get('/api/qc', (req, res) => {
  const q = req.query;
  const acts = applyFilters(activities, q, 'activity_date');
  const tix = applyFilters(supportTickets, q);

  // No Response rate
  const noResponse = acts.filter(a => a.outcome === 'No Response').length;
  const noResponseRate = acts.length ? +(noResponse / acts.length * 100).toFixed(1) : 0;

  // Issue type distribution
  const issueTypes = {};
  tix.forEach(t => { issueTypes[t.issue_type] = (issueTypes[t.issue_type] || 0) + 1; });

  res.json({ noResponseCount: noResponse, noResponseRate, totalActivities: acts.length, issueTypes });
});

// ── o. Operations Logistics ───────────────────────────────────────
app.get('/api/operations', (req, res) => {
  const q = req.query;
  const acts = applyFilters(activities, q, 'activity_date');

  // In-person by region (use customer country from join)
  const inPerson = acts.filter(a => a.channel === 'In-person');
  const inPersonByCountry = {};
  inPerson.forEach(a => {
    // Try to get country from customer
    const cust = a.customer_id ? customers.find(c => c.customer_id === a.customer_id) : null;
    const lead = a.lead_id ? leads.find(l => l.lead_id === a.lead_id) : null;
    const country = cust ? cust.country : (lead ? lead.country : 'Unknown');
    inPersonByCountry[country] = (inPersonByCountry[country] || 0) + 1;
  });

  // Support channels
  const channelDist = {};
  acts.forEach(a => { channelDist[a.channel] = (channelDist[a.channel] || 0) + 1; });

  res.json({ inPersonCount: inPerson.length, inPersonByCountry, channelDist });
});

// ── Customers heatmap data ────────────────────────────────────────
app.get('/api/heatmap', (req, res) => {
  const q = req.query;
  const custs = applyFilters(customers, q);
  const byCity = {};
  custs.forEach(c => {
    const key = `${c.city}, ${c.country}`;
    if (!byCity[key]) byCity[key] = { city: c.city, country: c.country, count: 0, mrr: 0 };
    byCity[key].count++;
    byCity[key].mrr += c.mrr_usd;
  });
  res.json(Object.values(byCity).sort((a, b) => b.mrr - a.mrr));
});

// ── Upload CSV files ──────────────────────────────────────────────
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const results = [];
  const history = loadUploadHistory();
  const timestamp = new Date().toISOString();

  for (const file of req.files) {
    const originalName = file.originalname.toLowerCase();

    // Check if it's a valid CRM file
    if (!VALID_FILES[originalName]) {
      fs.unlinkSync(file.path); // cleanup temp
      results.push({
        file: file.originalname,
        status: 'error',
        message: `Invalid file name. Accepted: ${Object.keys(VALID_FILES).join(', ')}`
      });
      continue;
    }

    try {
      // Validate CSV can be parsed
      const content = fs.readFileSync(file.path, 'utf-8');
      const parsed = parse(content, { columns: true, skip_empty_lines: true, trim: true });

      if (parsed.length === 0) {
        fs.unlinkSync(file.path);
        results.push({ file: file.originalname, status: 'error', message: 'CSV file is empty or has no data rows' });
        continue;
      }

      // Backup old file
      const defaultDest = path.join(__dirname, originalName);
      const tmpDest = path.join('/tmp', originalName);
      const destPath = isVercel ? tmpDest : defaultDest;

      if (fs.existsSync(destPath)) {
        const backupName = `${path.basename(originalName, '.csv')}_${timestamp.replace(/[:.]/g, '-')}.csv`;
        fs.copyFileSync(destPath, path.join(BACKUP_DIR, backupName));
      } else if (isVercel && fs.existsSync(defaultDest)) {
        // First upload on Vercel: backup the default bundled file
        const backupName = `${path.basename(originalName, '.csv')}_${timestamp.replace(/[:.]/g, '-')}.csv`;
        fs.copyFileSync(defaultDest, path.join(BACKUP_DIR, backupName));
      }

      // Overwrite with new file
      fs.copyFileSync(file.path, destPath);
      fs.unlinkSync(file.path); // cleanup temp

      const rowCount = parsed.length;
      const columns = Object.keys(parsed[0]);

      results.push({
        file: file.originalname,
        status: 'success',
        rows: rowCount,
        columns: columns.length,
        columnNames: columns
      });

      // Log to history
      history.unshift({
        file: file.originalname,
        timestamp,
        rows: rowCount,
        columns: columns.length,
        size: file.size,
      });

    } catch (err) {
      fs.unlinkSync(file.path);
      results.push({ file: file.originalname, status: 'error', message: 'Failed to parse CSV: ' + err.message });
    }
  }

  // Keep only latest 50 history entries
  saveUploadHistory(history.slice(0, 50));

  // Reload all data
  try {
    reload();
  } catch (err) {
    return res.status(500).json({ error: 'Data reload failed: ' + err.message, results });
  }

  res.json({ success: true, results, reloaded: true });
});

// ── Upload history ────────────────────────────────────────────────
app.get('/api/upload-history', (req, res) => {
  res.json(loadUploadHistory());
});

// ── Data summary (current loaded data) ────────────────────────────
app.get('/api/data-summary', (req, res) => {
  res.json({
    customers: { rows: customers.length, file: 'customers.csv' },
    leads: { rows: leads.length, file: 'leads.csv' },
    opportunities: { rows: opportunities.length, file: 'opportunities.csv' },
    activities: { rows: activities.length, file: 'activities.csv' },
    supportTickets: { rows: supportTickets.length, file: 'support_tickets.csv' },
  });
});

// ── Multer error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// ── Start server ──────────────────────────────────────────────────
if (!isVercel) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 CRM Dashboard API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
