(function () {
  document.addEventListener('DOMContentLoaded', () => {
    loadAndRender();
  });

  function archetypeSlug(key) {
  // Normalize keys like "The Alchemist" → "alchemist"
  return String(key).trim().toLowerCase().replace(/^the\s+/, '').replace(/\s+/g, '-');
}
function archetypeImagePath(key) {
  return `images/archetypes/${archetypeSlug(key)}.png`;
}


  async function loadAndRender() {
    try {
      const answers = JSON.parse(localStorage.getItem('quiz_answers_v2') || '[]');

      const [archetypes, quizData] = await Promise.all([
        fetchJSON('data/archetypes.json'),
        fetchJSON('data/quiz_data.json')
      ]);

      const scores = computeScores(answers, archetypes);
      const ranked = Object.entries(scores)
        .sort((a,b) => b[1] - a[1])
        .map(([key, val]) => ({ key, score: val }));

      const primary = ranked[0];
      const secondary = ranked[1];

      renderSummary(primary, secondary, archetypes, quizData, ranked);
      renderDetails(ranked, archetypes);
    } catch (err) {
      console.error(err);
      document.getElementById('summary').innerHTML = `<p>Could not load results. Check your JSON files/paths.</p>`;
    }
  }

  async function fetchJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  }

  // --- Scoring Engine with Rules ---
  function computeScores(answers, archetypes) {
    // 1) Base tag weights (can be tuned)
    const tagWeights = {
      creativity: 1.0, experimentation: 1.0, introspection: 1.0,
      stability: 1.0, care: 1.0, boundary: 1.0,
      leadership: 1.0, initiative: 1.0, planning: 1.0,
      curiosity: 1.0, novelty: 1.0, play: 1.0,
      power_exchange: 1.0, service: 1.0, ritual: 1.0
    };

    // 2) Tag→Archetype mapping (vectors)
    // Keep these slim; you’ll expand later
    const A = archetypes; // shorthand
    const vectors = {
      Alchemist:      { creativity:1, experimentation:1, introspection:0.6, ritual:0.6 },
      Keystone:       { stability:1, care:1, boundary:0.7, service:0.5 },
      Catalyst:       { leadership:1, initiative:1, planning:0.8, power_exchange:0.4 },
      Explorer:       { curiosity:1, novelty:1, play:0.8, experimentation:0.7 },
      Vanguard:       { planning:1, boundary:0.8, leadership:0.7, ritual:0.5 }
    };

    // 3) Aggregate raw tag tallies from answers
    const tagTallies = {};
    answers.forEach(a => {
      if (!a || !Array.isArray(a.tags)) return;
      const localWeight = Math.max(0, a.weight ?? 1);
      a.tags.forEach(t => {
        tagTallies[t] = (tagTallies[t] ?? 0) + localWeight * (tagWeights[t] ?? 1);
      });
    });

    // 4) Apply RULES
    // 4a) Synergy: if both creativity & experimentation present → +10% to both
    if (tagTallies.creativity && tagTallies.experimentation) {
      tagTallies.creativity *= 1.10;
      tagTallies.experimentation *= 1.10;
    }
    // 4b) Conflict: stability vs novelty dampen each other 8%
    if (tagTallies.stability && tagTallies.novelty) {
      tagTallies.stability *= 0.92;
      tagTallies.novelty *= 0.92;
    }
    // 4c) Boundary as governor: if boundary high, small boost to planning
    if (tagTallies.boundary && tagTallies.boundary > 2) {
      tagTallies.planning = (tagTallies.planning ?? 0) + 0.2 * Math.log(1 + tagTallies.boundary);
    }
    // 4d) Diminishing returns on any single tag > 4
    for (const t in tagTallies) {
      if (tagTallies[t] > 4) {
        tagTallies[t] = 4 + Math.log(1 + (tagTallies[t] - 4));
      }
    }

    // 5) Project tagTallies into archetype space
    const rawScores = {};
    Object.keys(vectors).forEach(arch => {
      let s = 0;
      const vec = vectors[arch];
      for (const t in vec) {
        const v = vec[t];
        const tt = tagTallies[t] ?? 0;
        s += v * tt;
      }
      rawScores[arch] = s;
    });

    // 6) Normalize to 0..100
    const max = Math.max(0.0001, ...Object.values(rawScores));
    const norm = {};
    for (const k in rawScores) {
      norm[k] = Math.round((rawScores[k] / max) * 100);
    }
    return norm;
  }

 function renderSummary(primary, secondary, archetypes, quizData, ranked) {
  const arch1 = archetypes.find(a => a.key === primary.key);
  const arch2 = secondary ? archetypes.find(a => a.key === secondary.key) : null;

  const data = quizData[primary.key] || {};
  const affirm = data.affirmation ?? 'You bring a unique balance of strengths.';
  const desc = arch1?.description ?? 'No description available.';
  const insights = data.insights ?? [];
  const reflections = data.reflection_questions ?? [];

  const primaryImg = archetypeImagePath(arch1?.key || primary.key);
  const secondaryImg = arch2 ? archetypeImagePath(arch2.key) : null;

  const summary = document.getElementById('summary');
  summary.innerHTML = `
    <div class="arch-hero">
      <img class="arch-hero__img" src="${primaryImg}" alt="${arch1?.name ?? primary.key}"
           onerror="this.onerror=null; this.src='images/archetypes/_fallback.png';">
      <div>
        <h2>Your Primary Archetype: ${arch1?.name ?? primary.key}</h2>
        <p class="small"><span class="badge">${primary.score}</span> score</p>
      </div>
    </div>

    <p>${desc}</p>

    ${arch2 ? `
      <div class="arch-secondary">
        <img class="arch-secondary__img" src="${secondaryImg}" alt="${arch2?.name ?? arch2?.key}"
             onerror="this.onerror=null; this.src='images/archetypes/_fallback.png';">
        <div>
          <h3>Secondary Influence: ${arch2?.name ?? arch2?.key}</h3>
          <p class="small"><span class="badge">${secondary.score}</span> score</p>
        </div>
      </div>
    ` : ''}

    <h3>Affirming Message</h3>
    <p>${affirm}</p>

    ${insights.length ? `
    <h3>Personalized Insights</h3>
    <ul>${insights.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}

    ${reflections.length ? `
    <h3>Self-Reflection Questions</h3>
    <ul>${reflections.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}

    <h3>All Scores</h3>
    <p class="small">${ranked.map(r => `<span class="badge">${r.key}: ${r.score}</span>`).join(' ')}</p>
  `;
}


  function renderDetails(ranked, archetypes) {
    const details = document.getElementById('details');
    const items = ranked.map(r => {
      const a = archetypes.find(x => x.key === r.key);
      return `<div class="kv">
        <div><strong>${a?.name ?? r.key}</strong></div>
        <div>${r.score}</div>
      </div>`;
    }).join('');
    details.innerHTML = `<h2>Breakdown</h2>${items}`;
  }
})();
