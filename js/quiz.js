(function () {
  const state = {
    questions: [],
    index: 0,
    answers: [] // {qid, choiceId, tags:[], weight:number}
  };

  document.addEventListener('DOMContentLoaded', () => {
    loadQuestions();
    hookButtons();
  });

  function hookButtons() {
    document.getElementById('backBtn').addEventListener('click', onBack);
    document.getElementById('skipBtn').addEventListener('click', onSkip);
    document.getElementById('nextBtn').addEventListener('click', onNext);
  }

  async function loadQuestions() {
    try {
      const res = await fetch('data/questions.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Basic sanity
      if (!Array.isArray(data) || data.length === 0) throw new Error('No questions found.');
      state.questions = data;
      document.getElementById('qTotal').textContent = String(data.length);
      renderQuestion();
    } catch (err) {
      alert('Failed to load questions.json. Check JSON syntax and path.');
      console.error(err);
    }
  }

  function renderQuestion() {
    const q = state.questions[state.index];
    document.getElementById('qNum').textContent = String(state.index + 1);
    document.getElementById('questionText').textContent = q.text;

    const optionsDiv = document.getElementById('options');
    optionsDiv.innerHTML = '';

    const type = q.type || 'single'; // 'single' | 'multi' | 'scale'
    if (type === 'scale') {
      // Likert 1-5 as radio
      const groupName = `q_${q.id}`;
      for (let val = 1; val <= 5; val++) {
        const opt = document.createElement('label');
        opt.className = 'option';
        opt.innerHTML = `<input type="radio" name="${groupName}" value="${val}"> ${q.scaleLabels?.[val-1] ?? `Option ${val}`}`;
        optionsDiv.appendChild(opt);
      }
    } else {
      q.options.forEach(optData => {
        const opt = document.createElement('label');
        opt.className = 'option';
        const inputType = (type === 'multi') ? 'checkbox' : 'radio';
        const groupName = `q_${q.id}`;
        opt.innerHTML = `<input type="${inputType}" name="${groupName}" value="${optData.id}"> ${optData.text}`;
        optionsDiv.appendChild(opt);
      });
    }

    // Restore previous answer (if navigating back)
    const prev = state.answers.find(a => a.qid === q.id);
    if (prev) {
      const inputs = optionsDiv.querySelectorAll('input');
      if (q.type === 'multi') {
        const chosenSet = new Set(prev.choiceId); // array
        inputs.forEach(i => { if (chosenSet.has(i.value)) i.checked = true; });
      } else if (q.type === 'scale') {
        inputs.forEach(i => { if (String(prev.choiceId) === i.value) i.checked = true; });
      } else {
        inputs.forEach(i => { if (prev.choiceId === i.value) i.checked = true; });
      }
    }
  }

  function collectCurrentAnswer() {
    const q = state.questions[state.index];
    const optionsDiv = document.getElementById('options');
    const inputs = optionsDiv.querySelectorAll('input');

    if (q.type === 'multi') {
      const selected = Array.from(inputs).filter(i => i.checked).map(i => i.value);
      if (selected.length === 0) return null;
      // aggregate tags/weights across selected options
      const agg = { qid: q.id, choiceId: selected, tags: [], weight: 1 };
      selected.forEach(id => {
        const opt = q.options.find(o => o.id === id);
        if (opt?.tags) agg.tags.push(...opt.tags);
        if (typeof opt?.weight === 'number') agg.weight += (opt.weight - 1); // combine deviations
      });
      return agg;
    }

    if (q.type === 'scale') {
      const picked = Array.from(inputs).find(i => i.checked);
      if (!picked) return null;
      const score = Number(picked.value); // 1..5
      // Map 1..5 into tag-weighted entry
      const tags = q.scaleTags || []; // e.g., ["care","stability"] applied by degree
      const weight = (score - 3) * 0.5 + 1; // center 3→1.0, 5→2.0, 1→0.0
      return { qid: q.id, choiceId: score, tags, weight };
    }

    // single
    const picked = Array.from(inputs).find(i => i.checked);
    if (!picked) return null;
    const opt = q.options.find(o => o.id === picked.value);
    return {
      qid: q.id,
      choiceId: opt.id,
      tags: opt.tags || [],
      weight: typeof opt.weight === 'number' ? opt.weight : 1
    };
  }

  function upsertAnswer(ans) {
    const i = state.answers.findIndex(a => a.qid === ans.qid);
    if (i >= 0) state.answers[i] = ans;
    else state.answers.push(ans);
  }

  function onBack() {
    if (state.index === 0) return;
    state.index -= 1;
    renderQuestion();
  }

  function onSkip() {
    // Save empty skip marker (helps completeness checks without adding tags)
    const q = state.questions[state.index];
    upsertAnswer({ qid: q.id, choiceId: null, tags: [], weight: 0 });
    goNext();
  }

  function onNext() {
    const ans = collectCurrentAnswer();
    if (!ans) {
      alert('Please select an option or press Skip.');
      return;
    }
    upsertAnswer(ans);
    goNext();
  }

  function goNext() {
    if (state.index < state.questions.length - 1) {
      state.index += 1;
      renderQuestion();
    } else {
      // Persist and go to results
      localStorage.setItem('quiz_answers_v2', JSON.stringify(state.answers));
      location.href = 'results.html';
    }
  }
})();
