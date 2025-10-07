const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// PostgreSQL setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

// Internal constants (server-side only)
const INTERNAL = {
  automated_cost_per_invoice: 0.20,
  error_rate_auto: 0.1, // percent
  time_saved_per_invoice: 8, // minutes
  min_roi_boost_factor: 1.1
};

// Validation helpers
function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function validateInputs(body) {
  const errors = [];
  function reqNum(name) {
    const v = asNumber(body[name], NaN);
    if (!Number.isFinite(v) || v < 0) errors.push(`${name} must be a non-negative number`);
    return v;
  }

  const inputs = {
    scenario_name: typeof body.scenario_name === 'string' ? body.scenario_name : '',
    monthly_invoice_volume: reqNum('monthly_invoice_volume'),
    num_ap_staff: reqNum('num_ap_staff'),
    avg_hours_per_invoice: reqNum('avg_hours_per_invoice'),
    hourly_wage: reqNum('hourly_wage'),
    error_rate_manual: clamp(asNumber(body.error_rate_manual, NaN), 0, 100),
    error_cost: reqNum('error_cost'),
    time_horizon_months: asNumber(body.time_horizon_months, 36),
    one_time_implementation_cost: asNumber(body.one_time_implementation_cost, 0)
  };

  if (!Number.isFinite(inputs.error_rate_manual)) errors.push('error_rate_manual must be a number between 0 and 100');
  if (!Number.isFinite(inputs.time_horizon_months) || inputs.time_horizon_months <= 0) errors.push('time_horizon_months must be > 0');

  return { inputs, errors };
}

function simulate(inputs) {
  const labor_cost_manual = inputs.num_ap_staff * inputs.hourly_wage * inputs.avg_hours_per_invoice * inputs.monthly_invoice_volume;
  const auto_cost = inputs.monthly_invoice_volume * INTERNAL.automated_cost_per_invoice;
  const error_savings = (inputs.error_rate_manual - INTERNAL.error_rate_auto) * inputs.monthly_invoice_volume * inputs.error_cost / 100; // percent to fraction
  let monthly_savings = (labor_cost_manual + error_savings) - auto_cost;
  monthly_savings = monthly_savings * INTERNAL.min_roi_boost_factor;

  const cumulative_savings = monthly_savings * inputs.time_horizon_months;
  const net_savings = cumulative_savings - inputs.one_time_implementation_cost;
  const payback_months = monthly_savings > 0 ? (inputs.one_time_implementation_cost / monthly_savings) : null;
  const roi_percentage = inputs.one_time_implementation_cost > 0 ? ((net_savings / inputs.one_time_implementation_cost) * 100) : (cumulative_savings > 0 ? 999 : 0);

  return {
    monthly_savings: Number(monthly_savings.toFixed(2)),
    cumulative_savings: Number(cumulative_savings.toFixed(2)),
    net_savings: Number(net_savings.toFixed(2)),
    payback_months: payback_months === null ? null : Number(payback_months.toFixed(2)),
    roi_percentage: Number(roi_percentage.toFixed(2))
  };
}

// Routes
app.post('/simulate', (req, res) => {
  const { inputs, errors } = validateInputs(req.body || {});
  if (errors.length) return res.status(400).json({ errors });
  const results = simulate(inputs);
  return res.json(results);
});

app.post('/scenarios', async (req, res) => {
  const { inputs, errors } = validateInputs(req.body?.inputs || req.body || {});
  if (errors.length) return res.status(400).json({ errors });
  const results = simulate(inputs);

  try {
    let scenarioName = (inputs.scenario_name || '').trim();
    if (!scenarioName) {
      const countRes = await pool.query('SELECT COUNT(1) AS c FROM scenarios');
      const c = Number(countRes.rows?.[0]?.c || 0);
      scenarioName = `Scenario ${c + 1}`;
    }
    const id = uuidv4();
    const now = new Date();
    const inputsWithName = { ...inputs, scenario_name: scenarioName };
    await pool.query(
      'INSERT INTO scenarios (id, scenario_name, inputs, results, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, scenarioName, inputsWithName, results, now, now]
    );
    return res.json({ id, scenario_name: scenarioName });
  } catch (e) {
    return res.status(500).json({ error: 'failed to save scenario' });
  }
});

app.get('/scenarios', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, scenario_name, created_at FROM scenarios ORDER BY created_at DESC');
    return res.json(rows.map(r => ({ id: r.id, scenario_name: r.scenario_name || '', created_at: r.created_at })));
  } catch (e) {
    return res.status(500).json({ error: 'failed to list scenarios' });
  }
});

app.get('/scenarios/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, scenario_name, inputs, results, created_at, updated_at FROM scenarios WHERE id = $1', [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Not found' });
    return res.json({ id: r.id, scenario_name: r.scenario_name || '', inputs: r.inputs, results: r.results, created_at: r.created_at, updated_at: r.updated_at });
  } catch (e) {
    return res.status(404).json({ error: 'Not found' });
  }
});

app.delete('/scenarios/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM scenarios WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ deleted: true });
  } catch (e) {
    return res.status(404).json({ error: 'Not found' });
  }
});

app.post('/report/generate', async (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim() : '';
  if (!email) return res.status(400).json({ error: 'email is required' });

  let inputs;
  let results;
  if (req.body && req.body.scenario_id) {
    try {
      const { rows } = await pool.query('SELECT inputs, results FROM scenarios WHERE id = $1', [req.body.scenario_id]);
      const r = rows[0];
      if (!r) return res.status(404).json({ error: 'scenario not found' });
      inputs = r.inputs;
      results = r.results;
    } catch (e) {
      return res.status(404).json({ error: 'scenario not found' });
    }
  } else if (req.body && req.body.inputs) {
    const v = validateInputs(req.body.inputs);
    if (v.errors.length) return res.status(400).json({ errors: v.errors });
    inputs = v.inputs;
    results = simulate(inputs);
  } else {
    return res.status(400).json({ error: 'provide scenario_id or inputs' });
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>ROI Report</title>
    <style>body{font-family:Arial, sans-serif; padding:24px; color:#222} h1{color:#0b3a5b}
    table{border-collapse:collapse} td,th{border:1px solid #ddd; padding:8px}</style></head>
    <body><h1>Invoicing ROI Report</h1>
    <p><strong>Email:</strong> ${email}</p>
    <h2>Inputs</h2>
    <table>
      <tr><th>Scenario</th><td>${inputs.scenario_name || ''}</td></tr>
      <tr><th>Monthly Volume</th><td>${inputs.monthly_invoice_volume}</td></tr>
      <tr><th>AP Staff</th><td>${inputs.num_ap_staff}</td></tr>
      <tr><th>Hours/Invoice</th><td>${inputs.avg_hours_per_invoice}</td></tr>
      <tr><th>Hourly Wage</th><td>${inputs.hourly_wage}</td></tr>
      <tr><th>Error Rate (manual %)</th><td>${inputs.error_rate_manual}</td></tr>
      <tr><th>Error Cost</th><td>${inputs.error_cost}</td></tr>
      <tr><th>Horizon (months)</th><td>${inputs.time_horizon_months}</td></tr>
      <tr><th>One-time Cost</th><td>${inputs.one_time_implementation_cost}</td></tr>
    </table>
    <h2>Results</h2>
    <table>
      <tr><th>Monthly Savings</th><td>$${results.monthly_savings}</td></tr>
      <tr><th>Payback (months)</th><td>${results.payback_months ?? 'N/A'}</td></tr>
      <tr><th>ROI %</th><td>${results.roi_percentage}%</td></tr>
      <tr><th>Cumulative Savings</th><td>$${results.cumulative_savings}</td></tr>
    </table>
    <p style="margin-top:16px;color:#666">This report includes a conservative pro-automation bias factor.</p>
    </body></html>`;

  return res.json({ filename: `roi-report-${Date.now()}.html`, content: html });
});

// Serve React build in production
const clientBuildPath = path.join(__dirname, '..', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

async function start() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id UUID PRIMARY KEY,
        scenario_name TEXT,
        inputs JSONB NOT NULL,
        results JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS scenarios_created_at_idx ON scenarios (created_at DESC);
    `);
    app.listen(PORT, () => {
      console.log(`PostgreSQL API server listening on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('Failed to initialize PostgreSQL', e);
    process.exit(1);
  }
}

start();
