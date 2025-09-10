(async function () {
  const promptEl = document.getElementById('prompt');
  const answersEl = document.getElementById('answers');
  const progressEl = document.getElementById('progressbar');

  // If you still don't have utils.js, set this here temporarily:
  const DATA_BASE = window.DATA_BASE || 'assets/data/quiz';
  async function fetchJSON(path){ const r=await fetch(path,{cache:'no-store'}); if(!r.ok) throw new Error(`HTTP ${r.status} for ${path}`); return r.json(); }
  function saveState(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
  function loadState(k,f=null){ try{ return JSON.parse(localStorage.getItem(k)) ?? f; }catch{ return f; } }

  try {
    const questions = await fetchJSON(`${DATA_BASE}/questions.json`);
    if (!Array.isArray(questions) || questions.length === 0) throw new Error('questions.json empty or not an array');

    let idx = 0;
    let answers = loadState('quiz_answers', {});

    function setProgress() {
      const pct = Math.round((idx) / questions.length * 100);
      progressEl.style.width = `${pct}%`;
    }

    function render() {
      const q = questions[idx];
      if (!q) { finish(); return; }
      setProgress();
      promptEl.innerHTML = `<h2>${q.prompt}</h2>`;
      answersEl.innerHTML = '';

      if (q.type === 'scale') {
        const val = (answers[q.id]?.value ?? Math.ceil((q.scale.min + q.scale.max) / 2));
        answersEl.insertAdjacentHTML('beforeend', `
          <div class="small">${q.scale.left}</div>
          <input id="slider" type="range" min="${q.scale.min}" max="${q.scale.max}" step="1" value="${val}" style="width:100%"/>
          <div class="small" style="text-align:right">${q.scale.right}</div>
        `);
      } else if (q.type === 'single' || q.type === 'multi') {
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
              if (arr.includes(i)) arr = arr.filter(x => x !== i);
              else { if (q.max_select && arr.length >= q.max_select) return; arr.push(i); }
              answers[q.id] = { indices: arr };
              div.classList.toggle('selected');
            }
            saveState('quiz_answers', answers);
          };
          answersEl.appendChild(div);
        });
      } else if (q.type === 'open') {
        const ta = document.createElement('textarea');
        ta.style.width = '100%'; ta.style.minHeight = '120px';
        ta.placeholder = 'Type here (optional)…';
        ta.value = answers[q.id]?.text || '';
        ta.oninput = () => { answers[q.id] = { text: ta.value }; saveState('quiz_answers', answers); };
        answersEl.appendChild(ta);
      }
    }

    function finish() {
      saveState('quiz_answers', answers);
      location.href = 'results.html';
    }

    document.getElementById('backBtn').onclick = () => { if (idx > 0) { idx--; render(); } };
    document.getElementById('skipBtn').onclick = () => { idx = Math.min(idx + 1, questions.length); render(); };
    document.getElementById('nextBtn').onclick = () => {
      const q = questions[idx];
      if (q?.type === 'scale') {
        const el = document.getElementById('slider');
        if (el) { answers[q.id] = { value: parseInt(el.value, 10) }; saveState('quiz_answers', answers); }
      }
      idx++; render();
    };

    render();
  } catch (e) {
    console.error('[quiz] failed:', e);
    document.getElementById('qcard').insertAdjacentHTML(
      'beforeend',
      `<p class="small" style="color:#b00">Could not load <code>questions.json</code>: ${e.message}</p>`
    );
  }
})();
