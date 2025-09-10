// ===== assets/js/quiz.js (full engine) =====
(function () {
  // --- Fallbacks if utils.js isn't present ---
  const DATA_BASE = (window.DATA_BASE || 'assets/data/quiz');

  const fetchJSON = window.fetchJSON || (async function fetchJSONFallback(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return res.json();
  });

  const saveState = window.saveState || function saveStateFallback(key, obj) {
    localStorage.setItem(key, JSON.stringify(obj));
  };

  const loadState = window.loadState || function loadStateFallback(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };

  const scaleValue = window.scaleValue || function scaleValueLocal(expr, val, min = 1, max = 7) {
    const m = String(expr).match(/scale\(\s*([-+0-9.]+)\s*,\s*([-+0-9.]+)\s*\)/i);
    if (!m) return 0;
    const a = parseFloat(m[1]), b = parseFloat(m[2]);
    const pct = (val - min) / (max - min);
    return a + (b - a) * pct;
  };

  // --- DOM handles ---
  const promptEl = document.getElementById('prompt');
  const answersEl = document.getElementById('answers');
  const progressEl = document.getElementById('progressbar');
  const backBtn = document.getElementById('backBtn');
  const skipBtn = document.getElementById('skipBtn');
  const nextBtn = document.getElementById('nextBtn');

  // Guard: required elements exist
  if (!promptEl || !answersEl || !progressEl || !backBtn || !skipBtn || !nextBtn) {
    console.error('[quiz] Missing required DOM elements (prompt/answers/progressbar/back/skip/next).');
    const card = document.getElementById('qcard');
    if (card) card.insertAdjacentHTML('beforeend', `<p class="small" style="color:#b00">Quiz UI elements not found. Check IDs in take.html.</p>`);
    return;
  }

  // App state
  let QUESTIONS = [];
  let DIM_KEYS = [];
  let RULES = [];
  let idx = 0;
  let answers = loadState('quiz_answers', {}); // { [qid]: { value | indices[] | text } }

  // Init
  (async function init() {
    try {
      const [questions, dimensions, rules] = await Promise.all([
        fetchJSON(`${DATA_BASE}/questions.json`),
        fetchJSON(`${DATA_BASE}/dimensions.json`),
        fetchJSON(`${DATA_BASE}/rules.json`)
      ]);

      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('questions.json empty or not an array');
      }
      if (!Array.isArray(dimensions) || dimensions.length === 0) {
        throw new Error('dimensions.json empty or not an array');
      }
      if (!Array.isArray(rules)) {
        throw new Error('rules.json not an array');
      }

      QUESTIONS = questions;
      DIM_KEYS = dimensions.map(d => d.key);
      RULES = rules;

      // If we have prior answers, keep them (resume)
      const resumed = loadState('quiz_answers', null);
      if (resumed) answers = resumed;

      bindNav();
      render();
    } catch (e) {
      console.error('[quiz] init error:', e);
      const card = document.getElementById('qcard');
      if (card) {
        card.insertAdjacentHTML('beforeend',
          `<p class="small" style="color:#b00">Could not load quiz data: ${e.message}. Check <code>${DATA_BASE}/</code> files.</p>`);
      }
    }
  })();

  // Navigation buttons
  function bindNav() {
    backBtn.onclick = () => { if (idx > 0) { idx--; render(); } };
    skipBtn.onclick = () => { idx = Math.min(idx + 1, QUESTIONS.length); render(); };
    nextBtn.onclick = () => {
      const q = QUESTIONS[idx];
      if (q) {
        if (q.type === 'scale') {
          const el = document.getElementById('slider');
          if (el) {
            answers[q.id] = { value: parseInt(el.value, 10) };
          }
        }
        // single/multi/open are captured on click/input already
        saveState('quiz_answers', answers);
      }
      idx++;
      render();
    };
  }

  // Rendering per question
  function render() {
    const q = QUESTIONS[idx];
    setProgress();

    if (!q) { finish(); return; }

    promptEl.innerHTML = '';
    answersEl.innerHTML = '';

    // Prompt
    const h2 = document.createElement('h2');
    h2.textContent = q.prompt;
    promptEl.appendChild(h2);

    // Type handlers
    if (q.type === 'scale') {
      const val = (answers[q.id]?.value ?? Math.ceil((q.scale.min + q.scale.max) / 2));
      const left = document.createElement('div');
      left.className = 'small';
      left.textContent = q.scale.left;

      const right = document.createElement('div');
      right.className = 'small';
      right.style.textAlign = 'right';
      right.textContent = q.scale.right;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = 'slider';
      slider.min = q.scale.min;
      slider.max = q.scale.max;
      slider.step = 1;
      slider.value = val;
      slider.style.width = '100%';

      answersEl.appendChild(left);
      answersEl.appendChild(slider);
      answersEl.appendChild(right);
    }
    else if (q.type === 'single' || q.type === 'multi') {
      const selected = answers[q.id]?.indices || [];
      (q.options || []).forEach((opt, i) => {
        const div = document.createElement('div');
        div.className = 'option';
        div.textContent = opt.label;
        if (selected.includes(i)) div.classList.add('selected');
        div.onclick = () => {
          if (q.type === 'single') {
            answers[q.id] = { indices: [i] };
            [...answersEl.querySelectorAll('.option')].forEach(n => n.classList.remove('selected'));
            div.classList.add('selected');
          } else {
            let arr = answers[q.id]?.indices || [];
            if (arr.includes(i)) {
              arr = arr.filter(x => x !== i);
            } else {
              if (q.max_select && arr.length >= q.max_select) return;
              arr.push(i);
            }
            answers[q.id] = { indices: arr };
            div.classList.toggle('selected');
          }
          saveState('quiz_answers', answers);
        };
        answersEl.appendChild(div);
      });
    }
    else if (q.type === 'open') {
      const ta = document.createElement('textarea');
      ta.style.width = '100%';
      ta.style.minHeight = '120px';
      ta.placeholder = 'Type here (optional)…';
      ta.value = answers[q.id]?.text || '';
      ta.oninput = () => { answers[q.id] = { text: ta.value }; saveState('quiz_answers', answers); };
      answersEl.appendChild(ta);
    }
  }

  function setProgress() {
    const total = Math.max(1, QUESTIONS.length);
    const pct = Math.round(idx / total * 100);
    progressEl.style.width = `${pct}%`;
  }

  // Compute dimensions + flags based on answers + rules
  function applyWeightsAndRules() {
    const dims = Object.fromEntries(DIM_KEYS.map(k => [k, 0]));
    const flags = new Set();

    // 1) Per-question contributions
    for (const q of QUESTIONS) {
      const a = answers[q.id];
      if (!a) continue;

      if (q.type === 'scale' && q.weights && typeof a.value === 'number') {
        for (const [k, expr] of Object.entries(q.weights)) {
          if (!DIM_KEYS.includes(k)) continue;
          const v = scaleValue(expr, a.value, q.scale.min, q.scale.max);
          if (Number.isFinite(v)) dims[k] += v;
        }
      }

      if ((q.type === 'single' || q.type === 'multi') && a.indices) {
        for (const i of a.indices) {
          const opt = (q.options || [])[i];
          if (!opt) continue;
          if (opt.boosts) {
            for (const [k, v] of Object.entries(opt.boosts)) {
              if (DIM_KEYS.includes(k) && Number.isFinite(v)) dims[k] += v;
            }
          }
          if (opt.kink_flags) (opt.kink_flags || []).forEach(f => flags.add(f));
        }
      }

      if (q.type === 'open' && q.nlp && a.text) {
        const txt = String(a.text).toLowerCase();
        const keysets = q.nlp.keysets || {};
        for (const rule of (q.nlp.map || [])) {
          if (!rule.if_any) continue;
          const arr = keysets[rule.if_any] || [];
          const hit = arr.some(kw => txt.includes(String(kw).toLowerCase()));
          if (hit) {
            if (rule.boosts) {
              for (const [k, v] of Object.entries(rule.boosts)) {
                if (DIM_KEYS.includes(k) && Number.isFinite(v)) dims[k] += v;
              }
            }
            if (rule.kink_flags_add) (rule.kink_flags_add || []).forEach(f => flags.add(f));
          }
        }
      }
    }

    // 2) Global rules
    const qById = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
    function anySelected(ref) {
      // "id.option[Label]"
      const m = String(ref).match(/^([^.]+)\.option\[(.+)\]$/);
      if (!m) return false;
      const qid = m[1], label = m[2];
      const q = qById[qid];
      if (!q || !Array.isArray(q.options)) return false;
      const optIdx = q.options.findIndex(o => o.label === label);
      const a = answers[qid];
      return !!(a && a.indices && a.indices.includes(optIdx));
    }
    function dimVal(k) { return dims[k] ?? 0; }

    for (const rule of RULES) {
      let conditionMet = false;
      if (rule.when) {
        if (!conditionMet && Array.isArray(rule.when.any_selected)) {
          conditionMet = rule.when.any_selected.some(ref => anySelected(ref));
        }
        if (!conditionMet && rule.when.dimensions_high) {
          const entries = Object.entries(rule.when.dimensions_high);
          if (entries.length === 1) {
            const [k, thr] = entries[0];
            if (typeof thr === 'number') conditionMet = dimVal(k) >= thr;
          }
        }
        if (!conditionMet && Array.isArray(rule.when.dimensions_high_all)) {
          conditionMet = rule.when.dimensions_high_all.every(obj => {
            const entries = Object.entries(obj);
            if (entries.length !== 1) return false;
            const [k, thr] = entries[0];
            return typeof thr === 'number' && dimVal(k) >= thr;
          });
        }
      }

      if (conditionMet) {
        if (rule.then?.weights) {
          for (const [k, v] of Object.entries(rule.then.weights)) {
            if (DIM_KEYS.includes(k) && Number.isFinite(v)) dims[k] += v;
          }
        }
        if (rule.then?.flags_add) (rule.then.flags_add || []).forEach(f => flags.add(f));
        if (rule.then?.kink_flags_add) (rule.then.kink_flags_add || []).forEach(f => flags.add(f));
      }
    }

    // 3) Normalize to 0–100 (assuming effective range about -3..+3)
    const outDims = {};
    for (const k of DIM_KEYS) {
      const raw = dims[k];
      const clamped = Math.max(-3, Math.min(3, Number(raw) || 0));
      outDims[k] = Math.round((clamped + 3) / 6 * 100);
    }

    return { dimensions: outDims, flags: Array.from(flags) };
  }

  function finish() {
    if (!QUESTIONS || !QUESTIONS.length) {
      console.warn('[quiz] finish() with no questions; not redirecting.');
      const card = document.getElementById('qcard');
      if (card) {
        card.insertAdjacentHTML('beforeend',
          '<p class="small" style="color:#b00">No questions loaded — not redirecting.</p>');
      }
      return;
    }
    const computed = applyWeightsAndRules();
    saveState('quiz_result', computed);
    saveState('quiz_answers', answers);
    location.href = 'results.html';
  }
})();
