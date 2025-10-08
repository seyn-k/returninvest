const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// MongoDB setup (replaces JSON file storage)
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://senthiltr2004:12345@cluster1.y2nguv9.mongodb.net/roi_simulator?retryWrites=true&w=majority';

const scenarioSchema = new mongoose.Schema({
  scenario_name: { type: String, index: true },
  inputs: {
    scenario_name: String,
    monthly_invoice_volume: Number,
    num_ap_staff: Number,
    avg_hours_per_invoice: Number,
    hourly_wage: Number,
    error_rate_manual: Number,
    error_cost: Number,
    time_horizon_months: Number,
    one_time_implementation_cost: Number
  },
  results: {
    monthly_savings: Number,
    cumulative_savings: Number,
    net_savings: Number,
    payback_months: Number,
    roi_percentage: Number
  }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

const Scenario = mongoose.model('Scenario', scenarioSchema);

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
  console.log('📝 POST /scenarios - Received request');
  const { inputs, errors } = validateInputs(req.body?.inputs || req.body || {});
  if (errors.length) {
    console.log('❌ Validation errors:', errors);
    return res.status(400).json({ errors });
  }
  const results = simulate(inputs);
  console.log('📊 Simulation results:', results);

  try {
    // Ensure a visible scenario name
    let scenarioName = (inputs.scenario_name || '').trim();
    if (!scenarioName) {
      const count = await Scenario.countDocuments();
      scenarioName = `Scenario ${count + 1}`;
    }
    console.log('💾 Saving scenario:', scenarioName);
    
    // Persist the name both at root and inside inputs for consistency
    const doc = await Scenario.create({ scenario_name: scenarioName, inputs: { ...inputs, scenario_name: scenarioName }, results });
    console.log('✅ Scenario saved successfully:', doc._id);
    return res.json({ id: String(doc._id), scenario_name: doc.scenario_name || '' });
  } catch (e) {
    console.error('❌ Failed to save scenario:', e.message);
    return res.status(500).json({ error: 'failed to save scenario' });
  }
});

app.get('/scenarios', async (req, res) => {
  try {
    console.log('📋 GET /scenarios - Fetching scenarios');
    const docs = await Scenario.find({}, { scenario_name: 1, created_at: 1 }).sort({ created_at: -1 }).lean();
    console.log('📋 Found scenarios:', docs.length);
    const result = docs.map(d => ({ id: String(d._id), scenario_name: d.scenario_name || '', created_at: d.created_at }));
    console.log('📋 Returning scenarios:', result);
    return res.json(result);
  } catch (e) {
    console.error('❌ Failed to fetch scenarios:', e.message);
    return res.status(500).json({ error: 'failed to list scenarios' });
  }
});

app.get('/scenarios/:id', async (req, res) => {
  try {
    const doc = await Scenario.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    return res.json({ id: String(doc._id), scenario_name: doc.scenario_name || '', inputs: doc.inputs, results: doc.results, created_at: doc.created_at, updated_at: doc.updated_at });
  } catch (e) {
    return res.status(404).json({ error: 'Not found' });
  }
});

app.delete('/scenarios/:id', async (req, res) => {
  try {
    const result = await Scenario.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ deleted: true });
  } catch (e) {
    return res.status(404).json({ error: 'Not found' });
  }
});

app.post('/report/generate', (req, res) => {
  const email = (req.body && req.body.email) ? String(req.body.email).trim() : '';
  if (!email) return res.status(400).json({ error: 'email is required' });

  let inputs;
  let results;
  if (req.body && req.body.scenario_id) {
    // Load scenario from MongoDB
    return Scenario.findById(req.body.scenario_id).lean().then(doc => {
      if (!doc) return res.status(404).json({ error: 'scenario not found' });
      inputs = doc.inputs;
      results = doc.results;

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
    }).catch(() => res.status(404).json({ error: 'scenario not found' }));
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

// Serve React build in production (single-service deploy)
const clientBuildPath = path.join(__dirname, '..', 'build');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

async function start() {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('Connection string:', mongoUri.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in logs
    await mongoose.connect(mongoUri, { dbName: 'roi_simulator' });
    console.log('✅ Connected to MongoDB successfully');
    app.listen(PORT, () => {
      console.log(`🚀 API server listening on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('❌ Failed to connect to MongoDB:', e.message);
    process.exit(1);
  }
}

// For Vercel deployment
if (process.env.NODE_ENV === 'production') {
  start();
} else {
  start();
}

// Export for Vercel
module.exports = app;
