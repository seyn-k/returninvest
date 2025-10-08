import './App.css';
import { useEffect, useMemo, useState } from 'react';

const initialInputs = {
  scenario_name: '',
  monthly_invoice_volume: 2000,
  num_ap_staff: 3,
  avg_hours_per_invoice: 0.17,
  hourly_wage: 30,
  error_rate_manual: 0.5,
  error_cost: 100,
  time_horizon_months: 36,
  one_time_implementation_cost: 50000
};

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function App() {
  const [inputs, setInputs] = useState(initialInputs);
  const [results, setResults] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [email, setEmail] = useState('');
  const [reportContent, setReportContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const disabled = useMemo(() => loading, [loading]);

  useEffect(() => {
    fetch('/scenarios')
      .then(r => r.json())
      .then(data => setScenarios(Array.isArray(data) ? data : []))
      .catch(() => setScenarios([]));
  }, []);

  useEffect(() => {
    // live simulate when inputs change
    const controller = new AbortController();
    const run = async () => {
      try {
        const r = await fetch('/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(inputs),
          signal: controller.signal
        });
        if (!r.ok) return;
        const data = await r.json();
        setResults(data);
      } catch {}
    };
    run();
    return () => controller.abort();
  }, [inputs]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({
      ...prev,
      [name]: name === 'scenario_name' ? value : number(value)
    }));
  };

  const saveScenario = async () => {
    setLoading(true);
    try {
      const r = await fetch('/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs })
      });
      if (!r.ok) return;
      await fetch('/scenarios').then(r => r.json()).then(setScenarios);
    } finally {
      setLoading(false);
    }
  };

  const loadScenario = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`/scenarios/${id}`);
      if (!r.ok) return;
      const s = await r.json();
      setInputs(s.inputs);
      setResults(s.results);
    } finally {
      setLoading(false);
    }
  };

  const deleteScenario = async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      await fetch(`/scenarios/${id}`, { method: 'DELETE' });
      await fetch('/scenarios').then(r => r.json()).then(setScenarios);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!email) return alert('Please enter your email to download the report.');
    setLoading(true);
    try {
      const r = await fetch('/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, inputs })
      });
      if (!r.ok) return;
      const data = await r.json();
      setReportContent(data.content);
      // trigger download
      const blob = new Blob([data.content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || 'roi-report.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <h1 className="app-title">Invoicing ROI Simulator</h1>
      <div className="layout">
        <div className="panel">
          <h2>Inputs</h2>
          <div className="form-grid">
            <div className="field">
              <label>scenario_name</label>
              <input className="input" name="scenario_name" value={inputs.scenario_name} onChange={onChange} placeholder="Q4_Pilot" />
            </div>
            <div className="field">
              <label>monthly_invoice_volume</label>
              <input className="input" name="monthly_invoice_volume" type="number" value={inputs.monthly_invoice_volume} onChange={onChange} />
            </div>
            <div className="field">
              <label>num_ap_staff</label>
              <input className="input" name="num_ap_staff" type="number" value={inputs.num_ap_staff} onChange={onChange} />
            </div>
            <div className="field">
              <label>avg_hours_per_invoice</label>
              <input className="input" name="avg_hours_per_invoice" type="number" step="0.01" value={inputs.avg_hours_per_invoice} onChange={onChange} />
            </div>
            <div className="field">
              <label>hourly_wage</label>
              <input className="input" name="hourly_wage" type="number" value={inputs.hourly_wage} onChange={onChange} />
            </div>
            <div className="field">
              <label>error_rate_manual</label>
              <input className="input" name="error_rate_manual" type="number" step="0.01" value={inputs.error_rate_manual} onChange={onChange} />
            </div>
            <div className="field">
              <label>error_cost</label>
              <input className="input" name="error_cost" type="number" value={inputs.error_cost} onChange={onChange} />
            </div>
            <div className="field">
              <label>time_horizon_months</label>
              <input className="input" name="time_horizon_months" type="number" value={inputs.time_horizon_months} onChange={onChange} />
            </div>
            <div className="field">
              <label>one_time_implementation_cost</label>
              <input className="input" name="one_time_implementation_cost" type="number" value={inputs.one_time_implementation_cost} onChange={onChange} />
            </div>
          </div>

          <div className="actions">
            <button className="button" onClick={saveScenario} disabled={disabled}>Save Scenario</button>
          </div>

          <h3 style={{ marginTop: 16 }}>Scenarios</h3>
          <ul className="scenarios-list">
            {scenarios.map(s => (
              <li key={s.id} className="scenarios-item">
                <span>{s.scenario_name}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="button secondary" onClick={() => loadScenario(s.id)} disabled={disabled}>Load</button>
                  <button className="button danger" onClick={() => deleteScenario(s.id)} disabled={disabled}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Results</h2>
          {results ? (
            <div className="results-card">
              <div className="metrics">
                <div className="metric-label">Monthly Savings</div><div className="metric-value">${results.monthly_savings}</div>
                <div className="metric-label">Payback (months)</div><div className="metric-value">{results.payback_months ?? 'N/A'}</div>
                <div className="metric-label">ROI %</div><div className="metric-value">{results.roi_percentage}%</div>
                <div className="metric-label">Cumulative Savings</div><div className="metric-value">${results.cumulative_savings}</div>
              </div>
            </div>
          ) : (
            <p>Enter inputs to see results.</p>
          )}

          <div className="report">
            <input className="email-input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            <button className="button" onClick={generateReport} disabled={disabled}>Download Report</button>
          </div>
          {reportContent ? <p style={{ color: '#16a34a', marginTop: 8 }}>Report generated. Check your downloads.</p> : null}
        </div>
      </div>
    </div>
  );
}

export default App;
