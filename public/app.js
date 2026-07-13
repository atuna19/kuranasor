/* Kuran'a Sor — yerel SPA */
const app = document.getElementById('app');
const langSel = document.getElementById('lang');
langSel.value = localStorage.getItem('lang') || 'tr';
langSel.addEventListener('change', () => {
  localStorage.setItem('lang', langSel.value);
  render();
});
const L = () => langSel.value;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// highlight: JSON dizi içindeki parçaları meal metninde <mark> ile sar
function markText(text, highlightJson) {
  let html = esc(text || '');
  if (!highlightJson) return html;
  try {
    const parts = JSON.parse(highlightJson);
    for (const raw of Array.isArray(parts) ? parts : []) {
      const p = esc(String(raw).trim());
      // replace'e fonksiyon veriyoruz ki metindeki $ karakterleri özel desen sayılmasın
      if (p && html.includes(p)) html = html.replace(p, () => `<mark>${p}</mark>`);
    }
  } catch {}
  return html;
}

const get = async (url) => {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'lang=' + L());
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};

// ---------- SAYFALAR ----------

async function pageHome() {
  const { stats, surahs } = await get('/api/surahs');
  const fmt = (n) => n.toLocaleString('tr-TR');
  app.innerHTML = `
  <div class="hero">
    <div class="bismillah">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّح۪يمِ</div>
    <h1>Sorunun cevabı yine <em>Kuran'da</em></h1>
    <p class="sub">Ayetlere sorulan her soru, yorum yazılmadan yalnızca başka ayetlerle cevaplanır.
      ${fmt(stats.questions)} soru, ${fmt(stats.links)} ayet bağlantısıyla Kuran'ı Kuran'a sorun.</p>
    <form class="search" id="searchForm">
      <input id="q" placeholder="Kelime, cümle ya da ayet arayın: &quot;Allah&quot;, &quot;Kuran&quot;, 2:255…" autocomplete="off">
      <button class="btn" type="submit">Ara</button>
    </form>
    <div class="chips">
      ${['Allah', 'Kuran', 'Evrenlerin Rabbi', 'Doğru yol'].map((c) => `<span class="chip" data-q="${c}">${c}</span>`).join('')}
    </div>
    <div class="stats">
      <div class="stat"><b>${fmt(stats.verses + 112)}</b><span>Ayet · besmele dahil</span></div>
      <div class="stat"><b>${fmt(stats.questions)}</b><span>Soru</span></div>
      <div class="stat"><b>${fmt(stats.links)}</b><span>Ayet Bağlantısı</span></div>
      <div class="stat"><b>${stats.authors}</b><span>Meal</span></div>
    </div>
  </div>
  <a class="explore-strip" href="/kesfet" data-link>
    <span class="es-ico">🕸</span>
    <span><b>Ayet Ağını Keşfet</b> — ${fmt(stats.links)} bağlantılık ağda en bağlantılı ayetleri görün</span>
    <span class="es-go">→</span>
  </a>
  <div class="section">
    <div class="section-head"><h2>Sureler</h2></div>
    <div class="grid">
      ${surahs.map((s) => `
        <a class="sure" href="/sure/${s.id}" data-link>
          <span class="no"><i>${s.id}</i></span>
          <span><b>${esc(s.name.trim())}</b><small>${s.verse_count} ayet${s.id !== 1 && s.id !== 9 ? ' + besmele' : ''}</small></span>
          <span class="q">${fmt(s.question_count)} soru</span>
        </a>`).join('')}
    </div>
  </div>`;
  document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('q').value.trim();
    if (q) go('/ara?q=' + encodeURIComponent(q));
  });
  app.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => go('/ara?q=' + encodeURIComponent(c.dataset.q))));
}

async function pageSurah(no) {
  const { surah, besmele, verses } = await get(`/api/surah/${no}`);
  app.innerHTML = `
  <div class="crumb"><a href="/" data-link>Sureler</a> / <b>${esc(surah.name.trim())}</b></div>
  <div class="sure-head">
    <h1>${surah.id}. ${esc(surah.name.trim())}</h1>
    <span>${surah.verse_count} ayet${besmele ? ' + besmele' : ''}</span>
    ${surah.audio_mp3 ? `<button class="audio-btn" id="audioBtn">🔊 Sureyi dinle</button>` : ''}
  </div>
  <div id="audioBox"></div>
  <div>
    ${besmele ? `
      <a class="verse-row besmele-row" href="/ayet/1/1" data-link>
        <span class="ref2">${surah.id}:0</span>
        <p><span class="besmele-ar">${esc(besmele.arabic || '')}</span>${esc(besmele.meal || '')}</p>
      </a>` : ''}
    ${verses.map((v) => `
      <a class="verse-row" href="/ayet/${surah.id}/${v.ayah_no}" data-link>
        <span class="ref2">${surah.id}:${v.ayah_no}</span>
        <p>${esc(v.meal || '')}</p>
        <span class="q ${v.qcount ? '' : 'none'}">${v.qcount ? v.qcount + ' soru' : '—'}</span>
      </a>`).join('')}
  </div>`;
  const btn = document.getElementById('audioBtn');
  if (btn) btn.addEventListener('click', () => {
    document.getElementById('audioBox').innerHTML =
      `<audio controls autoplay style="width:100%;margin-top:14px" src="${esc(surah.audio_mp3)}"></audio>`;
  });
}

async function pageVerse(s, a) {
  const d = await get(`/api/verse/${s}/${a}`);
  const { verse, surah, besmele, questions, translations, prev, next } = d;
  app.innerHTML = `
  <div class="crumb"><a href="/" data-link>Sureler</a> / <a href="/sure/${s}" data-link>${esc(surah.name.trim())}</a> / <b>${s}:${a}</b></div>
  <div class="verse-wrap">
    <div>
      <div class="verse-card">
        <div class="ref">${esc(surah.name.trim().toUpperCase())} ${s}:${a}</div>
        ${besmele ? `<a class="besmele-line" href="/ayet/1/1" data-link title="${esc((besmele.meal || '').trim())} (numarasız besmele)">${esc(besmele.arabic || '')}</a>` : ''}
        <div class="arabic">${esc(verse.arabic || '')}</div>
        <div class="meal-text" id="mealText">${esc(verse.meal || '')}</div>
        ${verse.transcription ? `<div class="trans">${esc(verse.transcription)}</div>` : ''}
      </div>
      <div class="verse-tools">
        ${prev ? `<a class="tool" href="/ayet/${prev.surah_no}/${prev.ayah_no}" data-link>◁ ${prev.surah_no}:${prev.ayah_no}</a>` : ''}
        ${next ? `<a class="tool" href="/ayet/${next.surah_no}/${next.ayah_no}" data-link>${next.surah_no}:${next.ayah_no} ▷</a>` : ''}
        ${translations.length ? `<button class="tool" id="cmpBtn">☰ ${translations.length} meali karşılaştır</button>` : ''}
        <a class="tool" href="/ag/${s}/${a}" data-link>🕸 Ağı gör</a>
        ${verse.juz ? `<span class="tool">Cüz ${verse.juz}</span>` : ''}
      </div>
      <div class="compare" id="cmp" style="display:none">
        <h3>Meal karşılaştırma</h3>
        ${translations.map((t) => `
          <div class="tr-item">
            <b>${esc(t.name)}</b>${t.description ? `<small>${esc(t.description)}</small>` : ''}
            <p>${esc(t.text)}</p>
            ${t.footnotes && t.footnotes.length ? `
              <details><summary>DİPNOTLAR (${t.footnotes.length})</summary>
                ${t.footnotes.map((f) => `<div class="fn">${f.number ? '[' + f.number + '] ' : ''}${esc(f.text)}</div>`).join('')}
              </details>` : ''}
          </div>`).join('')}
      </div>
    </div>
    <div class="qpanel">
      <h3>Bu ayete sorulan sorular</h3>
      <p class="hint">Her sorunun cevabı yalnızca başka ayetlerdir.</p>
      ${questions.length ? questions.map((q, i) => `
        <a class="qitem" href="/soru/${q.question_id}/${s}/${a}" data-link data-qid="${q.question_id}">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span>${esc(q.text.trim())}</span>
          <span class="go">→</span>
        </a>`).join('') : `<div class="empty">Bu ayete henüz soru eklenmemiş.</div>`}
    </div>
  </div>`;
  // Soru listesine gelince ayetin ilgili bölümü vurgulansın
  const mealTextEl = document.getElementById('mealText');
  const mealOriginal = verse.meal || '';
  document.querySelectorAll('.qitem').forEach((item) => {
    const q = questions.find((x) => String(x.question_id) === item.dataset.qid);
    item.addEventListener('mouseenter', () => {
      mealTextEl.innerHTML = q && q.highlight ? markText(mealOriginal, q.highlight) : esc(mealOriginal);
    });
    item.addEventListener('mouseleave', () => {
      mealTextEl.textContent = mealOriginal;
    });
  });
  const cmpBtn = document.getElementById('cmpBtn');
  if (cmpBtn) cmpBtn.addEventListener('click', () => {
    const el = document.getElementById('cmp');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
    if (el.style.display === 'block') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function pageQuestion(id, s, a) {
  const d = await get(`/api/question/${id}?s=${s}&a=${a}`);
  app.innerHTML = `
  <div class="answer-head">
    <div class="q-label">Soru${Number(s) ? ` · <a href="/ayet/${s}/${a}" data-link>${d.source ? esc(d.source.surah_name) + ' ' : ''}${s}:${a}</a>` : ''}</div>
    <h1>${esc(d.text.trim())}</h1>
    <div class="src">Cevap: <b>${d.answers.length} ayet</b> — yorum yok, yalnızca Kuran</div>
    ${d.source && d.source.meal ? `
      <div class="source-verse">
        <div class="sv-ref">SORULAN AYET — ${s}:${a}</div>
        <p>${markText(d.source.meal, d.source.highlight)}</p>
      </div>` : ''}
  </div>
  <div class="answers">
    ${d.answers.length ? d.answers.map((ans) => `
      <div class="ans">
        <div class="ref2">${ans.surah_no}:${ans.ayah_no}<small>${esc(ans.surah_name || '')}</small></div>
        <p>${markText(ans.meal, ans.highlight)}</p>
        <div class="meta">
          <a href="/ayet/${ans.surah_no}/${ans.ayah_no}" data-link>AYETE GİT →</a>
        </div>
      </div>`).join('') : `<div class="empty">Bu sorunun cevap bağlantısı bulunamadı.</div>`}
  </div>
  ${d.asked_on.length > 1 ? `
    <div class="crumb">Bu soru şu ayetlere de soruldu:
      ${d.asked_on.filter((x) => !(x.surah_no == s && x.ayah_no == a))
        .map((x) => `<a href="/soru/${id}/${x.surah_no}/${x.ayah_no}" data-link><b>${x.surah_no}:${x.ayah_no}</b></a>`).join(' · ')}
    </div>` : ''}
  ${!Number(s) ? '' : `<a class="graph-teaser" href="/ag/${s}/${a}" data-link>
    <svg width="90" height="64" viewBox="0 0 120 84" fill="none">
      <circle cx="60" cy="42" r="10" fill="#b08d2f"/>
      <circle cx="18" cy="16" r="6" fill="#e7efe9" opacity=".8"/><circle cx="102" cy="14" r="6" fill="#e7efe9" opacity=".8"/>
      <circle cx="14" cy="66" r="6" fill="#e7efe9" opacity=".8"/><circle cx="104" cy="68" r="6" fill="#e7efe9" opacity=".8"/>
      <circle cx="60" cy="8" r="5" fill="#e7efe9" opacity=".6"/>
      <line x1="60" y1="42" x2="18" y2="16" stroke="#5b8871"/><line x1="60" y1="42" x2="102" y2="14" stroke="#5b8871"/>
      <line x1="60" y1="42" x2="14" y2="66" stroke="#5b8871"/><line x1="60" y1="42" x2="104" y2="68" stroke="#5b8871"/>
      <line x1="60" y1="42" x2="60" y2="8" stroke="#5b8871"/>
    </svg>
    <span>
      <b>Ayet ağını keşfet</b>
      <small>Bu ${d.answers.length} ayet birbirine başka sorularla da bağlı. ${s}:${a} merkezli ağı interaktif gezin.</small>
    </span>
    <span class="btn2">Ağı Aç →</span>
  </a>`}`;
}

async function pageSearch(q) {
  const d = await get('/api/search?q=' + encodeURIComponent(q));
  if (d.goto) {
    // "2:255" -> ayete, "Bakara" ya da "2" -> sureye yönlendir
    if (d.goto.type === 'verse') return go(`/ayet/${d.goto.s}/${d.goto.a}`);
    return go(`/sure/${d.goto.s}`);
  }
  const snip = (t) => esc(t).replaceAll('[[', '<mark>').replaceAll(']]', '</mark>');
  app.innerHTML = `
  <div class="answer-head">
    <div class="q-label">Arama</div>
    <form class="search" id="searchForm" style="margin:14px 0 18px;max-width:640px">
      <input id="q" value="${esc(q)}" placeholder="Kelime, cümle ya da ayet arayın: &quot;Allah&quot;, &quot;Kuran&quot;, 2:255…" autocomplete="off">
      <button class="btn" type="submit">Ara</button>
    </form>
    <div class="src"><b>${d.questions.length}</b> soru · <b>${d.verses.length}</b> ayet bulundu${d.questions.length >= 50 || d.verses.length >= 50 ? ' (ilk 50 gösteriliyor)' : ''}</div>
  </div>
  <div class="results">
    ${d.questions.length ? `<h2>Sorular</h2>` : ''}
    ${d.questions.map((r) => {
      // first_ref yoksa soru hiçbir ayete doğrudan sorulmamış (ortak cevap) — uydurma referans gösterme
      const [rs, ra] = (r.first_ref || '0:0').split(':');
      return `<a class="qitem" href="/soru/${r.question_id}/${rs}/${ra}" data-link>
        <span class="n">${esc(r.first_ref || '—')}</span><span>${esc(r.text.trim())}</span><span class="go">→</span></a>`;
    }).join('')}
    ${d.verses.length ? `<h2>Ayetler (meal içinde)</h2>` : ''}
    ${d.verses.map((r) => `
      <a class="ans" href="/ayet/${r.surah_no}/${r.ayah_no}" data-link style="margin-bottom:10px">
        <div class="ref2">${r.surah_no}:${r.ayah_no}<small>${esc(r.surah_name || '')}</small></div>
        <p class="snip">${snip(r.snip)}</p>
      </a>`).join('')}
    ${!d.questions.length && !d.verses.length ? `<div class="empty" style="margin-top:24px">Sonuç bulunamadı. Farklı bir kelime deneyin.</div>` : ''}
  </div>`;
  document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nq = document.getElementById('q').value.trim();
    if (nq) go('/ara?q=' + encodeURIComponent(nq));
  });
}

function pageAbout() {
  app.innerHTML = `
  <div class="about">
    <h1>Hakkımızda</h1>
    <p>Kuran'ı anlamanın sistematiği yine Kuran tarafından verilir. Sıkça ve önyargılarımızdan arınmış olarak okuduğumuzda,
    bir ayeti anlama adına kafamızda beliren soruların başka ayet ya da ayetlerde cevap bulup, açıklanıp, detaylandırıldığını görürüz.
    Dolayısıyla mesajı idrak etmenin birincil kuralı kitabı bir organizma gibi kabul edip, Kuran'ı yine Kuran'a sormaktır.</p>
    <p>Çünkü yüce Allah Kuran'ı açıklamayı kimseye bırakmamış, kendisi üstlenmiştir:</p>
    <blockquote>75:16 Onu aceleye getirip dilini oynatma.<br>
    75:17 Onu toplamak da okutmak da bize düşer.<br>
    75:18 Biz onu okuduğumuz zaman, onun okunuşunu izle.<br>
    75:19 Sonra, onu açıklamak da bizim görevimizdir.</blockquote>
    <p>Ayetlerin her biri birer element ve tüm elementler birbiriyle adeta bir ağ gibi bağlıdır.
    Ayetlere değişik bakış açılarıyla sorular türetip, hiçbir yorum yapmadan yine Kuran ayetlerini referans vererek
    açıklayıp detaylandırmaya çalıştık. Amacımız parçaları birleştirip, okuyucunun resmin bütününü görmesini sağlamak
    ve kendi anlayışıyla baş başa bırakmaktır.</p>
  </div>`;
}

// ---------- AYET AĞI ----------
function forceLayout(nodes, edges) {
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  nodes.forEach((n, i) => {
    if (n.center) { n.x = 0; n.y = 0; }
    else {
      const ang = (i / nodes.length) * Math.PI * 2 + Math.random() * 0.5;
      const r = n.type === 'question' ? 140 : 260;
      n.x = Math.cos(ang) * r + Math.random() * 20;
      n.y = Math.sin(ang) * r + Math.random() * 20;
    }
  });
  const springs = edges
    .map((e) => ({ a: idx.get(e.from), b: idx.get(e.to), len: e.type === 'soru' ? 130 : 100 }))
    .filter((s) => s.a !== undefined && s.b !== undefined);
  const ITER = 260;
  for (let it = 0; it < ITER; it++) {
    const cool = 1 - it / ITER;
    // itme (tüm çiftler)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i], B = nodes[j];
        let dx = B.x - A.x, dy = B.y - A.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        const f = (2600 / d2) * cool;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        if (!A.center) { A.x -= fx; A.y -= fy; }
        if (!B.center) { B.x += fx; B.y += fy; }
      }
    }
    // yaylar (kenarlar)
    for (const sp of springs) {
      const A = nodes[sp.a], B = nodes[sp.b];
      const dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.1);
      const f = ((d - sp.len) / d) * 0.05;
      const fx = dx * f, fy = dy * f;
      if (!A.center) { A.x += fx; A.y += fy; }
      if (!B.center) { B.x -= fx; B.y -= fy; }
    }
    // hafif merkeze çekim
    for (const n of nodes) {
      if (!n.center) { n.x *= 0.996; n.y *= 0.996; }
    }
  }
}

async function pageGraph(s, a) {
  const state = { depth: 1, hideQ: false, data: null };

  app.innerHTML = `
  <div class="crumb"><a href="/" data-link>Sureler</a> / <a href="/ayet/${s}/${a}" data-link>${s}:${a}</a> / <b>Ayet Ağı</b></div>
  <div class="ag-head">
    <h1>Ayet Ağı</h1>
    <span class="ctx">Merkez: ${s}:${a}</span>
    <div class="ag-controls">
      <button class="ctl on" id="d1">Derinlik 1</button>
      <button class="ctl" id="d2">Derinlik 2</button>
      <button class="ctl" id="hq">Soruları gizle</button>
      <button class="ctl" id="fs">⛶ Tam ekran</button>
    </div>
    <span class="ag-meta" id="agMeta"></span>
  </div>
  <div class="ag-wrap" id="agWrap">
    <div class="ag-canvas">
      <svg id="agSvg"></svg>
      <div class="ag-legend" id="agLegend">
        <span><i class="dot" style="background:#2d6b50"></i>Ayet (tam alıntı)</span>
        <span><i class="dot ring"></i>Ayet (kısmi alıntı)</span>
        <span><i class="dot" style="background:#b08d2f"></i>Soru</span>
        <span><i class="dot" style="background:#1f4d3a;outline:2px solid #b08d2f;outline-offset:1px"></i>Merkez</span>
      </div>
      <div class="ag-zoom">
        <button id="zIn">+</button><button id="zOut">−</button><button id="zFit">⌂</button>
      </div>
    </div>
    <div class="ag-panel" id="agPanel"><div class="loading">Yükleniyor…</div></div>
  </div>`;

  const svg = document.getElementById('agSvg');
  const panel = document.getElementById('agPanel');
  let vb, vb0, byId;

  const setVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const zoom = (f) => {
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
    vb.w *= f; vb.h *= f; vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2; setVB();
  };

  // Soruları gizle: soru düğümlerini çökert, soran ↔ cevap ayetlerini doğrudan bağla
  function currentGraph() {
    const d = state.data;
    if (!state.hideQ) return { nodes: d.nodes.map((n) => ({ ...n })), edges: d.edges };
    const nodes = d.nodes.filter((n) => n.type === 'verse').map((n) => ({ ...n }));
    const edges = [];
    const seen = new Set();
    for (const q of d.nodes.filter((n) => n.type === 'question')) {
      const askers = d.edges.filter((e) => e.to === q.id).map((e) => e.from);
      const answers = d.edges.filter((e) => e.from === q.id).map((e) => e.to);
      for (const A of askers) for (const B of answers) {
        const k = A + '|' + B;
        if (A !== B && !seen.has(k)) { seen.add(k); edges.push({ from: A, to: B, type: 'cevap' }); }
      }
    }
    return { nodes, edges };
  }

  function draw() {
    const g = currentGraph();
    const nodes = g.nodes, edges = g.edges;
    forceLayout(nodes, edges);
    byId = new Map(nodes.map((n) => [n.id, n]));

    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    const pad = 70;
    vb = {
      x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + pad * 2,
      h: Math.max(...ys) - Math.min(...ys) + pad * 2,
    };
    vb0 = { ...vb };
    setVB();

    svg.innerHTML =
      edges.map((e) => {
        const A = byId.get(e.from), B = byId.get(e.to);
        if (!A || !B) return '';
        return `<line data-f="${e.from}" data-t="${e.to}" x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}"
          stroke="${e.type === 'soru' ? '#c9bd9c' : '#ddd3ba'}" stroke-width="${e.type === 'soru' ? 1.7 : 1.1}"/>`;
      }).join('') +
      nodes.map((n) => {
        const r = n.center ? 22 : n.type === 'question' ? 8 : 11;
        const partial = n.type === 'verse' && !n.center && !!n.highlight;
        let fill, stroke;
        if (n.center) { fill = '#1f4d3a'; stroke = ' stroke="#b08d2f" stroke-width="4"'; }
        else if (n.type === 'question') { fill = '#b08d2f'; stroke = ''; }
        else if (partial) { fill = 'none'; stroke = ' stroke="#2d6b50" stroke-width="3"'; }
        else { fill = '#2d6b50'; stroke = ''; }
        const label = n.type === 'verse'
          ? `<text x="${n.x.toFixed(1)}" y="${(n.y + r + 13).toFixed(1)}" text-anchor="middle" class="ag-lbl">${n.label}</text>` : '';
        return `<g class="ag-node" data-id="${n.id}">
          <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" fill="${fill}"${stroke}>
            <title>${esc(n.label)}</title>
          </circle>${label}</g>`;
      }).join('');

    const vCount = nodes.filter((n) => n.type === 'verse').length - 1;
    const qAll = nodes.filter((n) => n.type === 'question');
    // Bu ayete doğrudan sorulanlar ile ağ üzerinden bağlanan diğer sorular ayrı sayılır,
    // ayet sayfasındaki soru sayısıyla karşılaştırma kafa karıştırmasın diye.
    const centerQ = qAll.filter((n) => !n.noSource && n.s == s && n.a == a).length;
    const otherQ = qAll.length - centerQ;
    const qText = state.hideQ ? '' : ` · bu ayete ${centerQ} soru${otherQ ? ` · bağlantılı ${otherQ} soru` : ''}`;
    document.getElementById('agMeta').textContent =
      `${vCount} ayet${qText}${state.data.capped ? ' · en bağlantılılar' : ''}`;
    document.getElementById('agLegend').style.display = state.hideQ ? 'none' : '';
  }

  let loadToken = 0;
  async function load() {
    const myToken = ++loadToken;
    svg.innerHTML = '';
    document.getElementById('agMeta').textContent = 'yükleniyor…';
    const data = await get(`/api/graph/verse/${s}/${a}?depth=${state.depth}`);
    if (myToken !== loadToken) return; // bu arada yeni bir istek başladı, eskisini çizme
    state.data = data;
    draw();
  }

  // --- kontroller ---
  const d1 = document.getElementById('d1'), d2 = document.getElementById('d2'), hq = document.getElementById('hq');
  d1.addEventListener('click', () => { if (state.depth !== 1) { state.depth = 1; d1.classList.add('on'); d2.classList.remove('on'); load(); } });
  d2.addEventListener('click', () => { if (state.depth !== 2) { state.depth = 2; d2.classList.add('on'); d1.classList.remove('on'); load(); } });
  hq.addEventListener('click', () => { state.hideQ = !state.hideQ; hq.classList.toggle('on', state.hideQ); draw(); });
  document.getElementById('fs').addEventListener('click', () => {
    const w = document.getElementById('agWrap');
    if (document.fullscreenElement) document.exitFullscreen();
    else w.requestFullscreen().catch(() => w.classList.toggle('ag-full'));
  });
  document.getElementById('zIn').addEventListener('click', () => zoom(0.75));
  document.getElementById('zOut').addEventListener('click', () => zoom(1.33));
  document.getElementById('zFit').addEventListener('click', () => { vb = { ...vb0 }; setVB(); });
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.12 : 0.9); }, { passive: false });

  // --- kaydırma + düğüm sürükleme ---
  let pan = null, dragN = null, moved = 0;
  const toWorld = (e) => {
    const rc = svg.getBoundingClientRect();
    return { x: vb.x + ((e.clientX - rc.left) / rc.width) * vb.w, y: vb.y + ((e.clientY - rc.top) / rc.height) * vb.h };
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // yalnızca sol tuşla sürükle/kaydır
    moved = 0;
    const gEl = e.target.closest('.ag-node');
    if (gEl) dragN = { node: byId.get(gEl.dataset.id), el: gEl };
    else pan = { px: e.clientX, py: e.clientY, x: vb.x, y: vb.y };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (dragN) {
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      const p = toWorld(e);
      const n = dragN.node;
      n.x = p.x; n.y = p.y;
      const c = dragN.el.querySelector('circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
      const t = dragN.el.querySelector('text');
      if (t) { t.setAttribute('x', p.x); t.setAttribute('y', p.y + Number(c.getAttribute('r')) + 13); }
      svg.querySelectorAll(`line[data-f="${n.id}"]`).forEach((L) => { L.setAttribute('x1', p.x); L.setAttribute('y1', p.y); });
      svg.querySelectorAll(`line[data-t="${n.id}"]`).forEach((L) => { L.setAttribute('x2', p.x); L.setAttribute('y2', p.y); });
    } else if (pan) {
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      const k = vb.w / svg.clientWidth;
      vb.x = pan.x - (e.clientX - pan.px) * k;
      vb.y = pan.y - (e.clientY - pan.py) * k;
      setVB();
    }
  });
  svg.addEventListener('pointerup', () => { dragN = null; pan = null; });

  // --- düğüm seçimi / önizleme (hover + tıklama, ikisi de aynı fonksiyonu tetikler) ---
  let panelToken = 0;
  async function showVerse(ns, na, highlightJson) {
    const myToken = ++panelToken;
    panel.innerHTML = '<div class="loading">Yükleniyor…</div>';
    const info = await get(`/api/graph/info/${ns}/${na}`);
    if (myToken !== panelToken) return; // daha yeni bir seçim yapıldı, eski sonucu yok say
    const isCenter = ns == s && na == a;
    const partial = !isCenter && !!highlightJson;
    const tag = isCenter ? '' : `<span class="ag-tag ${partial ? 'partial' : 'full'}">${partial ? 'KISMİ ALINTI' : 'TAM ALINTI'}</span>`;
    panel.innerHTML = `
      <div class="pref">SEÇİLİ DÜĞÜM · AYET${tag}</div>
      <h2>${esc(info.surah_name)} ${info.ref}</h2>
      <div class="ar">${esc(info.arabic || '')}</div>
      <p>${partial ? markText(info.meal, highlightJson) : esc(info.meal || '')}</p>
      <div class="pmeta">Bu ayet <b>${info.answers}</b> soruya cevap, <b>${info.asks}</b> sorunun kaynağı</div>
      <div class="pbtns">
        ${!isCenter ? `<a class="pbtn g" href="/ag/${ns}/${na}" data-link>Ağı buraya merkezle</a>` : ''}
        <a class="pbtn o" href="/ayet/${ns}/${na}" data-link>Ayete git →</a>
      </div>`;
  }
  async function showQuestion(n) {
    const myToken = ++panelToken;
    panel.innerHTML = '<div class="loading">Yükleniyor…</div>';
    if (n.s == null || n.noSource) {
      if (myToken !== panelToken) return;
      panel.innerHTML = `
        <div class="pref">SEÇİLİ DÜĞÜM · SORU</div>
        <h2 style="font-size:19px">${esc(n.label)}</h2>
        <p style="color:#8a8168;font-size:13.5px;font-style:italic">Bu soru tek bir ayete sorulmamış; birden çok ayetin ortak cevabı olarak kayıtlı, tek bir kaynak ayeti yok.</p>
        <div class="pbtns">
          <a class="pbtn g" href="/soru/${n.qid}/${s}/${a}" data-link>Soruya git →</a>
        </div>`;
      return;
    }
    const info = await get(`/api/graph/info/${n.s}/${n.a}`);
    if (myToken !== panelToken) return;
    const partial = !!n.highlight;
    const tag = `<span class="ag-tag ${partial ? 'partial' : 'full'}">${partial ? 'KISMİ ALINTI' : 'TAM ALINTI'}</span>`;
    panel.innerHTML = `
      <div class="pref">SEÇİLİ DÜĞÜM · SORU${tag}</div>
      <h2 style="font-size:19px">${esc(n.label)}</h2>
      <div class="ar">${esc(info.arabic || '')}</div>
      <p>${partial ? markText(info.meal, n.highlight) : esc(info.meal || '')}</p>
      <div class="pmeta">Kaynak ayet: ${esc(info.surah_name)} ${n.s}:${n.a}</div>
      <div class="pbtns">
        <a class="pbtn g" href="/soru/${n.qid}/${n.s}/${n.a}" data-link>Soruya git →</a>
        <a class="pbtn o" href="/ayet/${n.s}/${n.a}" data-link>Kaynak ayete git</a>
      </div>`;
  }
  function selectNode(n) {
    if (!n) return;
    if (n.type === 'verse') showVerse(n.s, n.a, n.highlight);
    else showQuestion(n);
  }
  let lastHoverId = null;
  svg.addEventListener('mouseover', (e) => {
    const gEl = e.target.closest('.ag-node');
    if (!gEl || gEl.dataset.id === lastHoverId) return;
    lastHoverId = gEl.dataset.id;
    selectNode(byId.get(gEl.dataset.id));
  });
  svg.addEventListener('mouseout', (e) => {
    const gEl = e.target.closest('.ag-node');
    if (!gEl) return;
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('.ag-node') : null;
    if (to !== gEl) lastHoverId = null;
  });
  svg.addEventListener('click', (e) => {
    if (moved > 6) return; // sürükleme sonrası tıklama sayılmasın
    const gEl = e.target.closest('.ag-node');
    if (!gEl) return;
    selectNode(byId.get(gEl.dataset.id));
  });

  await load();
  showVerse(s, a);
}


async function pageExplore() {
  const d = await get('/api/hubs');
  const fmt = (n) => n.toLocaleString('tr-TR');
  const item = (r, tag) => `
    <a class="hub-item" href="/ag/${r.s}/${r.a}" data-link>
      <span class="ref2">${r.s}:${r.a}<small>${esc((r.surah_name || '').trim())}</small></span>
      <span class="hub-text">${esc((r.meal || '').trim())}…</span>
      <span class="hub-n">${r.n} ${tag}</span>
    </a>`;
  app.innerHTML = `
  <div class="answer-head">
    <div class="q-label">Keşfet</div>
    <h1>Ayet Ağı</h1>
    <div class="src">Ayetler, sorular üzerinden birbirine <b>${fmt(d.totalLinks)}</b> bağla bağlı.
      Bir ayete tıklayıp ağı oradan gezmeye başlayın; ya da herhangi bir ayet sayfasındaki "🕸 Ağı gör" butonunu kullanın.</div>
  </div>
  <div class="hub-cols">
    <div>
      <h2>En çok cevap olan ayetler</h2>
      <p class="hint">Başka ayetlere sorulan soruların cevabında en sık geçenler</p>
      ${d.answered.map((r) => item(r, 'soruya cevap')).join('')}
    </div>
    <div>
      <h2>En çok soru sorulan ayetler</h2>
      <p class="hint">Üzerine en çok soru türetilmiş ayetler</p>
      ${d.asked.map((r) => item(r, 'soru')).join('')}
    </div>
  </div>`;
}

async function pageFeedbackList() {
  const d = await get('/api/feedback');
  app.innerHTML = `
  <div class="answer-head">
    <div class="q-label">Geri Bildirim</div>
    <h1>Gelen öneriler</h1>
    <div class="src"><b>${d.items.length}</b> kayıt</div>
  </div>
  <div class="answers">
    ${d.items.length ? d.items.map((f) => `
      <div class="ans" style="grid-template-columns:1fr">
        <p>${esc(f.text)}</p>
        <div class="meta" style="grid-column:1">
          <span>${esc(f.name || 'İsimsiz')}</span>
          <span>${esc(f.created_at || '')}</span>
          ${f.page ? `<a href="${esc(f.page)}" data-link>SAYFA: ${esc(f.page)}</a>` : ''}
        </div>
      </div>`).join('') : `<div class="empty">Henüz öneri gelmemiş.</div>`}
  </div>`;
}

// ---------- ÖNERİ BUTONU (her sayfada) ----------
function setupFeedback() {
  const box = document.createElement('div');
  box.id = 'fbRoot';
  box.innerHTML = `
    <button id="fbBtn" title="Öneri ve eleştirilerinizi yazın">💬 Öneri</button>
    <div id="fbPanel" style="display:none">
      <b>Öneri / Eleştiri</b>
      <p>Görüşünüz bu sayfayla birlikte kaydedilir.</p>
      <input id="fbName" placeholder="Adınız (isteğe bağlı)" maxlength="80">
      <textarea id="fbText" placeholder="Önerinizi buraya yazın…" maxlength="3000"></textarea>
      <div class="fb-actions">
        <button id="fbSend">Gönder</button>
        <button id="fbClose">Kapat</button>
      </div>
      <div id="fbMsg"></div>
    </div>`;
  document.body.appendChild(box);
  const panel = box.querySelector('#fbPanel');
  box.querySelector('#fbBtn').addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  box.querySelector('#fbClose').addEventListener('click', () => (panel.style.display = 'none'));
  box.querySelector('#fbSend').addEventListener('click', async () => {
    const text = box.querySelector('#fbText').value.trim();
    const msg = box.querySelector('#fbMsg');
    if (text.length < 3) { msg.textContent = 'Lütfen birkaç kelime yazın.'; return; }
    const r = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, name: box.querySelector('#fbName').value, page: location.pathname + location.search }),
    });
    if (r.ok) {
      msg.textContent = 'Teşekkürler, öneriniz kaydedildi!';
      box.querySelector('#fbText').value = '';
      setTimeout(() => { panel.style.display = 'none'; msg.textContent = ''; }, 1600);
    } else msg.textContent = 'Kaydedilemedi, tekrar deneyin.';
  });
}
setupFeedback();

// ---------- ROUTER ----------
function go(path) {
  history.pushState(null, '', path);
  render();
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[data-link]');
  if (!link) return;
  // Ctrl/Cmd/Shift + tık ya da orta tuş: tarayıcının "yeni sekmede aç" davranışına karışma
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  go(link.getAttribute('href'));
});
window.addEventListener('popstate', render);

function setActiveNav(path) {
  const active = path === '/hakkinda' ? '/hakkinda'
    : path === '/kesfet' || /^\/ag\//.test(path) ? '/kesfet'
    : /^\/(sure|ayet|soru)(\/|$)|^\/$|^\/anasayfa$/.test(path) ? '/'
    : null;
  document.querySelectorAll('nav .links a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === active);
  });
}

async function render() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  setActiveNav(path);
  app.innerHTML = '<div class="loading">Yükleniyor…</div>';
  window.scrollTo(0, 0);
  try {
    let m;
    if (path === '/' || path === '/anasayfa') await pageHome();
    else if ((m = path.match(/^\/sure\/(\d+)$/))) await pageSurah(m[1]);
    else if ((m = path.match(/^\/ayet\/(\d+)\/(\d+)$/))) await pageVerse(m[1], m[2]);
    else if ((m = path.match(/^\/soru\/(\d+)\/(\d+)\/(\d+)$/))) await pageQuestion(m[1], m[2], m[3]);
    else if ((m = path.match(/^\/ag\/(\d+)\/(\d+)$/))) await pageGraph(m[1], m[2]);
    else if (path === '/kesfet') await pageExplore();
    else if (path === '/ara') await pageSearch(params.get('q') || '');
    else if (path === '/oneriler') await pageFeedbackList();
    else if (path === '/hakkinda') pageAbout();
    else await pageHome();
  } catch (err) {
    app.innerHTML = `<div class="empty" style="margin-top:40px">Bir hata oluştu: ${esc(err.message)}</div>`;
  }
}
render();
