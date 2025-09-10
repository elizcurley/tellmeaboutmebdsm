// --- Diagnostics ------------------------------------------------------------
const DEBUG_FLAG = (new URLSearchParams(location.search).get('debug') === '1') ||
                   (localStorage.getItem('debug') === '1');

function toggleDebugFlag(on) {
  if (on) localStorage.setItem('debug', '1'); else localStorage.removeItem('debug');
}

async function runSelfCheck() {
  const results = [];
  const push = (ok, msg) => results.push({ ok, msg });

  // Env checks
  push(true, `URL: ${location.href}`);
  push(navigator.onLine, `Online: ${navigator.onLine}`);
  if (location.protocol === 'file:') push(false, 'Running from file:// — fetch() may fail. Use a web server or GitHub Pages.');

  // localStorage
  try {
    const k = '__diag_test__';
    localStorage.setItem(k, '1'); localStorage.removeItem(k);
    push(true, 'localStorage: ok');
  } catch {
    push(false, 'localStorage: blocked');
  }

  // Load JSON bundle
  let questions, dimensions, rules, archetypes, kinkmap;
  try { questions = await fetchJSON(`${DATA_BASE}/questions.json`); push(Array.isArray(questions), 'questions.json loaded'); }
  catch (e) { push(false, `questions.json failed: ${e.message}`); }

  try { dimensions = await fetchJSON(`${DATA_BASE}/dimensions.json`); push(Array.isArray(dimensions), 'dimensions.json loaded'); }
  catch (e) { push(false, `dimensions.json failed: ${e.message}`); }

  try { rules = await fetchJSON(`${DATA_BASE}/rules.json`); push(Array.isArray(rules), 'rules.json loaded'); }
  catch (e) { push(false, `rules.json failed: ${e.message}`); }

  try { archetypes = await fetchJSON(`${DATA_BASE}/archetypes.json`); push(Array.isArray(archetypes), 'archetypes.json loaded'); }
  catch (e) { push(false, `archetypes.json failed: ${e.message}`); }

  try { kinkmap = await fetchJSON(`${DATA_BASE}/kink_translation.json`); push(Array.isArray(kinkmap), 'kink_translation.json loaded'); }
  catch (e) { push(false, `kink_translation.json failed: ${e.message}`); }

  // Schema checks
  if (Array.isArray(questions)) {
    const qIssues = validateQuestions(questions);
    if (qIssues.length === 0) push(true, 'questions schema: OK');
    else qIssues.forEach(m => push(false, `questions schema: ${m}`));
  }

  if (Array.isArray(rules) && Array.isArray(questions)) {
    const rIssues = validateRules(rules, questions);
    if (rIssues.length === 0) push(true, 'rules references: OK');
    else rIssues.forEach(m => push(false, `rules: ${m}`));
  }

  if (Array.isArray(archetypes)) {
    const aIssues = validateArchetypeImages(archetypes);
    if (aIssues.length === 0) push(true, 'archetype images: OK');
    else aIssues.forEach(m => push(false, `images: ${m}`));
  }

  return results;
}

function validateQuestions(questions) {
  const issues = [];
  const ids = new Set();
  questions.forEach((q, idx) => {
    if (!q.id) issues.push(`#${idx}: missing id`);
    if (q.id && ids.has(q.id)) issues.push(`#${idx} (${q.id}): duplicate id`);
    if (q.id) ids.add(q.id);
    if (!q.type) issues.push(`${q.id||'#'+idx}: missing type`);
    if (!q.prompt) issues.push(`${q.id||'#'+idx}: missing prompt`);

    if (q.type === 'scale') {
      if (!q.scale || typeof q.scale.min !== 'number' || typeof q.scale.max !== 'number')
        issues.push(`${q.id}: scale requires numeric min/max`);
      if (!q.weights || typeof q.weights !== 'object')
        issues.push(`${q.id}: scale requires weights object (e.g., {"dim": "scale(-0.6,+0.6)"})`);
    }
    if (q.type === 'single' || q.type === 'multi') {
      if (!Array.isArray(q.options) || q.options.length === 0)
        issues.push(`${q.id}: ${q.type} requires options[]`);
      (q.options||[]).forEach((opt, i) => {
        if (!opt || typeof opt.label !== 'string') issues.push(`${q.id}: option[${i}] missing label`);
        if (opt.boosts && typeof opt.boosts !== 'object') issues.push(`${q.id}: option[${i}] boosts must be object`);
      });
    }
    if (q.type === 'open') {
      if (q.nlp && (!q.nlp.keysets || !q.nlp.map)) issues.push(`${q.id}: open with nlp requires keysets + map`);
    }
  });
  return issues;
}

function validateRules(rules, questions) {
  const issues = [];
  const qById = Object.fromEntries(questions.map(q => [q.id, q]));
  function hasOption(qid, label) {
    const q = qById[qid];
    if (!q || !Array.isArray(q.options)) return false;
    return q.options.some(o => o.label === label);
  }
  rules.forEach((r, i) => {
    if (!r.when || !r.then) issues.push(`rule[${i}] missing when/then`);
    (r.when?.any_selected || []).forEach(ref => {
      const m = String(ref).match(/^([^.]+)\.option\[(.+)\]$/);
      if (!m) { issues.push(`rule[${i}] bad any_selected "${ref}"`); return; }
      const [, qid, label] = m;
      if (!qById[qid]) issues.push(`rule[${i}] references unknown question "${qid}"`);
      else if (!hasOption(qid, label)) issues.push(`rule[${i}] option label not found for ${qid}: "${label}"`);
    });
    // simple shape checks for thresholds
    if (r.when?.dimensions_high) {
      const entries = Object.entries(r.when.dimensions_high);
      if (entries.length !== 1 || typeof entries[0][1] !== 'number')
        issues.push(`rule[${i}] dimensions_high must be {"dim": number}`);
    }
    if (Array.isArray(r.when?.dimensions_high_all)) {
      r.when.dimensions_high_all.forEach(obj => {
        const entries = Object.entries(obj);
        if (entries.length !== 1 || typeof entries[0][1] !== 'number')
          issues.push(`rule[${i}] dimensions_high_all items must be {"dim": number}`);
      });
    }
  });
  return issues;
}

function validateArchetypeImages(archetypes) {
  const issues = [];
  // Use <img> to test existence (works on GitHub Pages)
  archetypes.forEach(a => {
    const key = (a.key || '').toLowerCase();
    if (!key) { issues.push('archetype without key'); return; }
    const url = `images/archetypes/${key}.png`;
    const img = new Image();
    img.onload = () => {}; // success
    img.onerror = () => { issues.push(`missing image for archetype "${key}" at ${url}`); };
    img.src = url + `?t=${Date.now()}`; // bust cache
  });
  return issues; // Note: async image errors push later; panel will refresh on rerun
}

function renderDiagnosticsPanel() {
  if (document.getElementById('__diag_panel')) return;

  const panel = document.createElement('div');
  panel.id = '__diag_panel';
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;max-width:420px;background:#111;color:#fff;padding:12px 12px 10px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.3);font:12px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial;z-index:99999;opacity:.95';
  panel.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <strong style="font-size:13px">Diagnostics</strong>
      <span style="opacity:.7">(${location.pathname.split('/').pop()||'index'})</span>
      <div style="margin-left:auto;display:flex;gap:6px">
        <button id="__diag_run" style="border:none;background:#2a2;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer">Run</button>
        <button id="__diag_clear" style="border:1px solid #666;background:transparent;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer">Clear State</button>
        <button id="__diag_close" style="border:none;background:#444;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer">×</button>
      </div>
    </div>
    <div id="__diag_body" style="max-height:260px;overflow:auto;border-top:1px solid #333;padding-top:8px"></div>
    <div style="margin-top:8px;opacity:.7">Tip: add <code>?debug=1</code> to the URL or press Alt/Option + D.</div>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector('#__diag_body');
  const btnRun = panel.querySelector('#__diag_run');
  const btnClear = panel.querySelector('#__diag_clear');
  const btnClose = panel.querySelector('#__diag_close');

  btnRun.onclick = async () => {
    body.innerHTML = '<div>Running checks…</div>';
    const rows = await runSelfCheck();
    body.innerHTML = rows.map(r => `<div style="margin:2px 0"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${r.ok?'#2a2':'#c33'};margin-right:6px"></span>${escapeHTML(r.msg)}</div>`).join('');
  };
  btnClear.onclick = () => {
    localStorage.removeItem('quiz_answers');
    localStorage.removeItem('quiz_result');
    alert('Cleared saved quiz state.');
  };
  btnClose.onclick = () => {
    panel.remove();
  };

  // Auto-run once if debug flag
  if (DEBUG_FLAG) btnRun.click();
}

function escapeHTML(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Keyboard toggle: Alt/Option + D
window.addEventListener('keydown', (e) => {
  if ((e.altKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
    if (document.getElementById('__diag_panel')) document.getElementById('__diag_panel').remove();
    else renderDiagnosticsPanel();
  }
});

// Auto-show if ?debug=1 or localStorage flag
if (DEBUG_FLAG) {
  // defer until DOM available
  document.addEventListener('DOMContentLoaded', () => renderDiagnosticsPanel());
}
