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

// ---------- OKUMA KONUMU (düz okuma takibi) ----------
// Yalnızca "düz okuma" sayılan gezinmelerde (sure listesinden ayet açma, ◁/▷ ile ilerleme)
// güncellenir; arama/ağ/soru-cevap gibi keşif linkleri (data-linear olmayan) dokunmaz.
const READ_KEY = 'kuranasor_lastread';
let pendingLinearNav = false;
// Ayet sayfasındayken sol/sağ ok tuşlarıyla ◁/▷ ile aynı hedeflere gidebilmek için
let verseNavPrev = null;
let verseNavNext = null;
function saveReadingPosition(s, a, surahName) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify({ s, a, surahName: (surahName || '').trim(), ts: Date.now() }));
  } catch {}
}
function getReadingPosition() {
  try { return JSON.parse(localStorage.getItem(READ_KEY) || 'null'); } catch { return null; }
}

// ---------- ORTAK YARDIMCILAR ----------
// Paylaşılan bağlantılar her zaman canlı siteye gider (masaüstünden paylaşılsa da)
const PUBLIC_ORIGIN = 'https://kuranasor.onrender.com';
const fmtTR = (n) => Number(n || 0).toLocaleString('tr-TR');
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => AR_DIGITS[d]);
const ayetSonu = (n) => `<span class="ayet-son">﴿${toArabicDigits(n)}﴾</span>`;
// Türkçe harfleri sadeleştir: "isra" yazınca "İsra", "yasin" yazınca "Yasin" bulunsun
const fold = (s) => String(s || '').toLocaleLowerCase('tr')
  .replace(/̇/g, '').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
  .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/[âà]/g, 'a').replace(/[^a-z0-9 ]/g, '').trim();
function sureSure(sn) {
  if (!sn) return '';
  if (sn < 60) return sn + ' sn';
  const m = Math.round(sn / 60);
  return m < 60 ? m + ' dk' : Math.floor(m / 60) + ' sa' + (m % 60 ? ' ' + (m % 60) + ' dk' : '');
}
const yildiz = (n) => `<svg class="yildiz" viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="9" width="22" height="22"/><rect x="9" y="9" width="22" height="22" transform="rotate(45 20 20)"/><text x="20" y="24.3" text-anchor="middle"${n >= 100 ? ' class="k3"' : ''}>${n}</text></svg>`;
const SURE_AR = ['الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
  'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
  'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
  'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
  'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
  'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
  'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
  'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
  'المسد', 'الإخلاص', 'الفلق', 'الناس'];

let toastTimer = null;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch {}
  const ta = document.createElement('textarea');
  ta.value = txt; ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

// ---------- GECE MODU ----------
const themeBtn = document.getElementById('themeBtn');
function syncThemeBtn() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  themeBtn.setAttribute('aria-pressed', String(dark));
  themeBtn.textContent = dark ? 'Gündüz' : 'Gece';
  themeBtn.title = dark ? 'Gündüz okuma moduna geç' : 'Gece okuma moduna geç';
}
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('kuranasor_tema', next); } catch {}
  syncThemeBtn();
});
syncThemeBtn();

// ---------- OKUMA İZİ (geri dönüş) ----------
// Ayet, soru ve ağ sayfalarında gezilen yol oturum boyunca tutulur. Düz okuma
// (◁/▷, sure listesi, "Okumaya dön") izi o ayetle yeniden başlatır.
const TRAIL_KEY = 'kuranasor_iz';
const trailEl = document.getElementById('trail');
function readTrail() {
  try { return JSON.parse(sessionStorage.getItem(TRAIL_KEY) || '[]'); } catch { return []; }
}
function writeTrail(t) {
  try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify(t.slice(-12))); } catch {}
}
function hideTrail() { trailEl.hidden = true; trailEl.innerHTML = ''; }
function trailVisit(path, label, reset) {
  let t = reset ? [] : readTrail();
  const i = t.findIndex((x) => x.path === path);
  if (i >= 0) { t = t.slice(0, i + 1); t[i].label = label; } // geri gelindi: sonrası kesilir
  else t.push({ path, label });
  writeTrail(t);
  renderTrail(path);
}
function trailBack() {
  const t = readTrail();
  const i = t.findIndex((x) => x.path === location.pathname);
  const prev = i > 0 ? t[i - 1] : null;
  if (!prev) return false;
  pendingLinearNav = false;
  go(prev.path);
  return true;
}
function renderTrail(current) {
  const t = readTrail();
  const pos = getReadingPosition();
  const posPath = pos ? `/ayet/${pos.s}/${pos.a}` : null;
  const showReturn = posPath && posPath !== current;
  const idx = t.findIndex((x) => x.path === current);
  if (t.length < 2 && !showReturn) return hideTrail();
  const shown = t.slice(-8);
  const chips = shown.map((x) => {
    const isStart = x === t[0] && x.path === posPath;
    if (x.path === current) return `<span class="iz now" title="${esc(x.label)}">${esc(x.label)}</span>`;
    return `<a class="iz${isStart ? ' start' : ''}" href="${esc(x.path)}" data-link title="${esc(x.label)}">${esc(x.label)}</a>`;
  }).join('<span class="iz-sep" aria-hidden="true">›</span>');
  trailEl.innerHTML = `
    <div class="trail-in">
      <span class="trail-lbl">Okuma izin</span>
      <div class="chips-iz">${t.length > shown.length ? '<span class="iz-sep">…</span>' : ''}${chips}</div>
      ${idx > 0 ? `<button type="button" class="tbtn" id="trailBackBtn" title="Bir önceki sayfa (Alt + ←)">← Geri</button>` : ''}
      ${showReturn ? `<a class="tbtn primary" href="${posPath}" data-link data-linear="1" title="Sırayla okuduğun son ayete dön">↩ Okumaya dön · ${pos.s}:${pos.a}</a>` : ''}
    </div>`;
  trailEl.hidden = false;
  const bb = document.getElementById('trailBackBtn');
  if (bb) bb.addEventListener('click', trailBack);
}

// ---------- PAYLAŞIM GÖRSELİ (1080×1350) ----------
function wrapLines(g, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
async function saveShareImage({ kicker, title, source, items, fileName }) {
  try {
    await Promise.all(['500 60px "Fraunces"', '400 28px "Literata"', '600 22px "Instrument Sans"', '30px "Amiri Quran"']
      .map((f) => document.fonts.load(f).catch(() => null)));
  } catch {}
  const W = 1080, H = 1350, M = 96, maxW = W - M * 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const COVER = '#163a2e', GOLD = '#d3b25c', CREAM = '#efe6cc', BODY = '#e3dcc6', MUTE = '#a9bcae';
  g.fillStyle = COVER; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(211,178,92,.45)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect ? g.roundRect(40, 40, W - 80, H - 80, 20) : g.rect(40, 40, W - 80, H - 80); g.stroke();
  const spaced = (txt, x, y, sp) => { // harf aralıklı küçük başlık
    let cx = x;
    for (const ch of txt) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + sp; }
  };
  // başlık bloğu
  g.fillStyle = GOLD; g.font = '600 22px "Instrument Sans", sans-serif'; g.textBaseline = 'alphabetic';
  spaced(kicker.toLocaleUpperCase('tr'), M, 150, 3);
  let tSize = 60;
  g.fillStyle = CREAM; g.font = `500 ${tSize}px "Fraunces", Georgia, serif`;
  let titleLines = wrapLines(g, title, maxW);
  if (titleLines.length > 3) {
    tSize = 46; g.font = `500 ${tSize}px "Fraunces", Georgia, serif`;
    titleLines = wrapLines(g, title, maxW).slice(0, 4);
  }
  const tLH = tSize * 1.14;
  let y = 150 + 30 + tLH;
  titleLines.forEach((l) => { g.fillText(l, M, y); y += tLH; });
  y += 6;
  g.fillStyle = GOLD; g.fillRect(M, y, 64, 2);
  y += 54;
  // sorulan ayet + cevap ayetleri: hepsinin sığdığı en büyük yazı boyutu seçilir
  const bottom = H - 170;
  const layout = (size) => {
    const lh = size * 1.5;
    const out = []; let yy = y; let src = null; let headY = null;
    if (source) {
      g.font = `italic 400 ${size}px "Literata", Georgia, serif`;
      let ls = wrapLines(g, source.text, maxW - 26);
      if (ls.length > 6) { ls = ls.slice(0, 6); ls[5] = ls[5].replace(/\s*\S*$/, '') + '…'; }
      const h = 30 + ls.length * lh;
      src = { ls, y: yy, h };
      yy += h + 40;
      headY = yy; yy += 46;
    }
    for (const it of items) {
      g.font = `400 ${size}px "Literata", Georgia, serif`;
      const ls = wrapLines(g, it.text, maxW);
      const h = 30 + ls.length * lh + 26;
      if (yy + h > bottom) break;
      out.push({ it, ls, y: yy }); yy += h;
    }
    return { out, lh, size, src, headY };
  };
  let L = null;
  // 24 pikselin altına inilmez; sığmayan ayetler "+N ayet daha" olarak bağlantıya bırakılır
  for (const size of [30, 27, 24]) {
    L = layout(size);
    if (L.out.length === items.length) break;
  }
  if (L.src) {
    g.fillStyle = GOLD; g.fillRect(M, L.src.y, 3, L.src.h);
    g.font = '600 20px "Instrument Sans", sans-serif';
    spaced(('Sorulan ayet · ' + source.ref).toLocaleUpperCase('tr'), M + 26, L.src.y + 20, 2.5);
    g.fillStyle = CREAM; g.font = `italic 400 ${L.size}px "Literata", Georgia, serif`;
    L.src.ls.forEach((l, k) => g.fillText(l, M + 26, L.src.y + 30 + L.lh * (k + 0.8)));
    g.fillStyle = GOLD; g.font = '600 20px "Instrument Sans", sans-serif';
    spaced("KURAN'IN CEVABI", M, L.headY + 20, 3);
  }
  for (const row of L.out) {
    g.fillStyle = GOLD; g.font = '600 20px "Instrument Sans", sans-serif';
    spaced(row.it.ref.toLocaleUpperCase('tr'), M, row.y + 20, 2.5);
    g.fillStyle = BODY; g.font = `400 ${L.size}px "Literata", Georgia, serif`;
    row.ls.forEach((l, k) => g.fillText(l, M, row.y + 30 + L.lh * (k + 0.8)));
  }
  const rest = items.length - L.out.length;
  // alt bilgi
  g.fillStyle = MUTE; g.font = '500 22px "Instrument Sans", sans-serif';
  g.fillText(rest > 0 ? `+${rest} ayet daha · tamamı bağlantıda` : 'Yorum yok, yalnızca ayet', M, H - 104);
  g.fillText(PUBLIC_ORIGIN.replace(/^https?:\/\//, ''), M, H - 72);
  const bx = W - M - 58, by = H - 136;
  g.strokeStyle = 'rgba(211,178,92,.6)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect ? g.roundRect(bx, by, 58, 58, 12) : g.rect(bx, by, 58, 58); g.stroke();
  g.fillStyle = GOLD; g.font = '600 24px "Fraunces", Georgia, serif'; g.textAlign = 'center';
  g.fillText('KS', bx + 29, by + 38); g.textAlign = 'left';
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- SAYFALAR ----------

async function pageHome() {
  const { stats, surahs } = await get('/api/surahs');
  const lastRead = getReadingPosition();
  const maxQ = Math.max(...surahs.map((s) => s.question_count || 0), 1);
  const suraHtml = (s) => {
    const reading = lastRead && Number(lastRead.s) === s.id;
    const besmele = s.id !== 1 && s.id !== 9;
    return `
      <a class="sura${reading ? ' reading' : ''}" href="/sure/${s.id}" data-link data-k="${esc(fold(s.name) + ' ' + s.id)}">
        ${reading ? `<span class="now">Okuyorsun · ${lastRead.s}:${lastRead.a}</span>` : ''}
        <div class="top">${yildiz(s.id)}<span class="arn" lang="ar">${SURE_AR[s.id - 1] || ''}</span></div>
        <h3>${esc(s.name.trim())}</h3>
        <div class="m">${s.verse_count} ayet${besmele ? ' · besmele' : ''}${s.audio_duration ? ' · dinleme ' + sureSure(s.audio_duration) : ''}</div>
        <div class="qd"><span>${fmtTR(s.question_count)} soru</span><i style="--w:${Math.max(2, Math.round((s.question_count || 0) / maxQ * 100))}%"></i></div>
      </a>`;
  };
  app.innerHTML = `
  <section class="hero">
    <div class="hero-in">
      <div class="besm" lang="ar">بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّح۪يمِ</div>
      <h1 class="h-title">Sorunun cevabı yine <em>Kuran'da</em></h1>
      <div class="h-tag">Kuran en güzel tefsirdir</div>
      <div class="h-verse">
        <div class="a" lang="ar">وَلَا يَأْتُونَكَ بِمَثَلٍ اِلَّا جِئْنَاكَ بِالْحَقِّ وَ<b>اَحْسَنَ تَفْس۪يراً</b> ${ayetSonu(33)}</div>
        <div class="t">Onların sana yönelttikleri her teze karşı, biz sana gerçeği ve <b>en güzel açıklamayı</b> getiririz.</div>
        <div class="tl">ve la ye'tuneke bi meselin illa ci'nake bil hakkı ve <b>ahsene tefsira</b>.</div>
        <div class="r">Furkan 25:33</div>
      </div>
      <p class="h-sub">Ayetlere sorulan her soru, yorum yazılmadan yalnızca başka ayetlerle cevaplanır.</p>
      <form class="search h-search" id="searchForm" role="search">
        <input id="q" aria-label="Arama" placeholder="Kelime, cümle ya da ayet: Allah, doğru yol, 2:255" autocomplete="off">
        <button class="btn" type="submit">Ara</button>
      </form>
      <div class="h-chips">
        ${['Allah', 'Kuran', 'Evrenlerin Rabbi', 'Doğru yol'].map((c) => `<button type="button" class="chip" data-q="${c}">${c}</button>`).join('')}
      </div>
    </div>
  </section>
  <div class="h-under">
    ${lastRead ? `
    <a class="resume" href="/ayet/${lastRead.s}/${lastRead.a}" data-link data-linear="1">
      <span class="ico">${lastRead.s}</span>
      <span class="rt"><small>Kaldığın yer</small><b>${esc(lastRead.surahName)} ${lastRead.s}:${lastRead.a}</b></span>
      <span class="go">Devam et →</span>
    </a>` : `<div class="resume empty-r">Aşağıdan bir sure seçerek okumaya başla; kaldığın yer burada görünür.</div>`}
    <div class="stats">
      <div class="stat"><b>${fmtTR(stats.verses + 112)}</b><span>Ayet · besmele dahil</span></div>
      <div class="stat"><b>${fmtTR(stats.questions)}</b><span>Soru</span></div>
      <div class="stat"><b>${fmtTR(stats.links)}</b><span>Bağlantı</span></div>
      <div class="stat"><b>${stats.authors}</b><span>Meal</span></div>
    </div>
  </div>
  <a class="netband" href="/kesfet" data-link>
    <svg width="58" height="40" viewBox="0 0 120 84" aria-hidden="true">
      <line x1="60" y1="42" x2="18" y2="16"/><line x1="60" y1="42" x2="102" y2="14"/>
      <line x1="60" y1="42" x2="14" y2="66"/><line x1="60" y1="42" x2="104" y2="68"/><line x1="60" y1="42" x2="60" y2="8"/>
      <circle class="c" cx="60" cy="42" r="10"/>
      <circle class="s" cx="18" cy="16" r="6"/><circle class="s" cx="102" cy="14" r="6"/>
      <circle class="s" cx="14" cy="66" r="6"/><circle class="s" cx="104" cy="68" r="6"/><circle class="s" cx="60" cy="8" r="5"/>
    </svg>
    <span><b>Ayet Ağı</b><span>${fmtTR(stats.links)} bağlantıda en çok soru sorulan ve en çok cevap olan ayetleri gez.</span></span>
    <span class="go">Ağı aç →</span>
  </a>
  <section>
    <div class="fihrist-head">
      <div><h2>Sureler</h2><small>114 sure · Mushaf sırası</small></div>
      <input class="fsearch" id="suraFilter" aria-label="Sure ara" placeholder="Sure ara: Yasin, 36…" autocomplete="off">
    </div>
    <div class="fihrist" id="fihrist">${surahs.map(suraHtml).join('')}</div>
  </section>`;
  document.getElementById('searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('q').value.trim();
    if (q) go('/ara?q=' + encodeURIComponent(q));
  });
  app.querySelectorAll('.h-chips .chip').forEach((c) =>
    c.addEventListener('click', () => go('/ara?q=' + encodeURIComponent(c.dataset.q))));
  const fh = document.getElementById('fihrist');
  document.getElementById('suraFilter').addEventListener('input', (e) => {
    const q = fold(e.target.value);
    let shown = 0;
    fh.querySelectorAll('.sura').forEach((el) => {
      const k = el.dataset.k;
      const hit = !q || k.includes(q) || k.split(' ').pop() === q;
      el.hidden = !hit;
      if (hit) shown++;
    });
    let none = fh.querySelector('.none-found');
    if (!shown && !none) { none = document.createElement('div'); none.className = 'none-found'; none.textContent = 'Bu adla bir sure bulunamadı.'; fh.appendChild(none); }
    if (shown && none) none.remove();
  });
}

async function pageSurah(no, hedefAyet) {
  const { surah, besmele, verses } = await get(`/api/surah/${no}`);
  app.innerHTML = `
  <div class="crumb"><a href="/" data-link>Sureler</a> / <b>${esc(surah.name.trim())}</b></div>
  <header class="sure-head">
    ${yildiz(surah.id)}
    <div class="sh-txt">
      <h1>${esc(surah.name.trim())}</h1>
      <div class="sh-meta">${surah.id}. sure · ${surah.verse_count} ayet${besmele ? ' + besmele' : ''}${surah.audio_duration ? ' · dinleme ' + sureSure(surah.audio_duration) : ''}</div>
    </div>
    <div class="sh-ar" lang="ar">${SURE_AR[surah.id - 1] || ''}</div>
    <div class="sh-tools">
      <button class="tool" id="arToggle" type="button">Arapçasını göster</button>
      ${surah.audio_mp3 ? `<button class="tool" id="audioBtn" type="button">Sureyi dinle</button>` : ''}
    </div>
  </header>
  <div id="audioBox"></div>
  <div class="vlist" id="verseList">
    ${besmele ? `
      <a class="verse-row besmele-row" href="/ayet/1/1" data-link>
        <span class="ref2">${surah.id}:0</span>
        <p>${esc(besmele.meal || '')}<span class="row-arabic" dir="rtl" hidden>${esc(besmele.arabic || '')}</span></p>
      </a>` : ''}
    ${verses.map((v) => `
      <a class="verse-row" href="/ayet/${surah.id}/${v.ayah_no}" data-link data-linear="1">
        <span class="ref2">${surah.id}:${v.ayah_no}</span>
        <p>
          ${esc(v.meal || '')}
          <span class="row-arabic" dir="rtl" hidden>${esc(v.arabic || '')}</span>
        </p>
        <span class="q ${v.qcount ? '' : 'none'}">${v.qcount ? v.qcount + ' soru' : '—'}</span>
      </a>`).join('')}
  </div>`;
  const btn = document.getElementById('audioBtn');
  if (btn) btn.addEventListener('click', () => {
    document.getElementById('audioBox').innerHTML =
      `<audio controls autoplay style="width:100%;margin-top:14px" src="${esc(surah.audio_mp3)}"></audio>`;
  });
  const arToggle = document.getElementById('arToggle');
  let arShown = false;
  arToggle.addEventListener('click', () => {
    arShown = !arShown;
    arToggle.textContent = arShown ? 'Arapçasını gizle' : 'Arapçasını göster';
    document.querySelectorAll('#verseList .row-arabic').forEach((el) => (el.hidden = !arShown));
  });
  // Ayet ayet sayfasından "s:a" kırıntısıyla gelindiyse, listenin başı yerine
  // kaldığı ayete kaydır ve kısa süre vurgula.
  if (hedefAyet) {
    const hedefRow = document.querySelector(`#verseList a[href="/ayet/${no}/${hedefAyet}"]`);
    if (hedefRow) {
      hedefRow.scrollIntoView({ block: 'center' });
      hedefRow.classList.add('jump-target');
      setTimeout(() => hedefRow.classList.remove('jump-target'), 1800);
    }
  }
}

async function pageVerse(s, a) {
  const d = await get(`/api/verse/${s}/${a}`);
  const { verse, surah, besmele, questions, translations, prev, next } = d;
  // Yalnızca düz okuma sayılan bir bağlantıyla (sure listesi ya da ◁/▷) buraya gelindiyse konumu kaydet
  const linear = pendingLinearNav;
  if (linear) saveReadingPosition(s, a, surah.name);
  pendingLinearNav = false;
  verseNavPrev = prev || null;
  verseNavNext = next || null;
  const sName = surah.name.trim();
  trailVisit(location.pathname, `${sName} ${s}:${a}`, linear);
  // İzde bir önceki adım bir soruysa, o soru listede "geldiğin soru" diye işaretlenir
  const izT = readTrail();
  const izI = izT.findIndex((x) => x.path === location.pathname);
  const fromQ = izI > 0 ? (izT[izI - 1].path.match(/^\/soru\/(\d+)\//) || [])[1] : null;
  const meta = [verse.juz ? `Cüz ${verse.juz}` : '', verse.page ? `Sayfa ${verse.page}` : ''].filter(Boolean).join(' · ');
  app.innerHTML = `
  <div class="crumb"><a href="/" data-link>Sureler</a> / <a href="/sure/${s}" data-link>${esc(sName)}</a> / <a href="/sure/${s}?ayet=${a}" data-link title="Sure listesinde bu ayete git">${s}:${a}</a></div>
  <div class="verse-wrap sheet">
    <div class="reading">
      <div class="vhead">
        <span class="vref">${esc(sName)} · ${s}:${a}</span>
        ${meta ? `<span class="vmeta">${meta}</span>` : ''}
      </div>
      ${besmele ? `<a class="besmele-line" href="/ayet/1/1" data-link lang="ar" title="${esc((besmele.meal || '').trim())} (numarasız besmele)">${esc(besmele.arabic || '')}</a>` : ''}
      <div class="arabic" lang="ar">${esc((verse.arabic || '').trim())} ${ayetSonu(a)}</div>
      <div class="orn" aria-hidden="true"></div>
      <div class="meal-text" id="mealText">${esc(verse.meal || '')}</div>
      ${verse.transcription ? `<div class="trans">${esc(verse.transcription)}</div>` : ''}
      <div class="verse-tools">
        ${prev ? `<a class="tool" href="/ayet/${prev.surah_no}/${prev.ayah_no}" data-link data-linear="1" title="Önceki ayet (←)">◁ ${prev.surah_no}:${prev.ayah_no}</a>` : ''}
        ${next ? `<a class="tool" href="/ayet/${next.surah_no}/${next.ayah_no}" data-link data-linear="1" title="Sonraki ayet (→)">${next.surah_no}:${next.ayah_no} ▷</a>` : ''}
        ${translations.length ? `<button class="tool" id="cmpBtn" type="button">${translations.length} meali karşılaştır</button>` : ''}
        <a class="tool" href="/ag/${s}/${a}" data-link>Ağı gör</a>
        <button class="tool gold" id="shareVerseBtn" type="button">Ayeti paylaş</button>
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
      ${questions.length ? `<div class="qlist">${questions.map((q, i) => {
        const here = fromQ && String(q.question_id) === fromQ;
        return `
        <a class="qitem${here ? ' here' : ''}" href="/soru/${q.question_id}/${s}/${a}" data-link data-qid="${q.question_id}">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <span class="t">${esc(q.text.trim())}</span>
          <span class="c">${here ? 'geldiğin soru' : (q.answer_count ? q.answer_count + ' ayet' : '→')}</span>
        </a>`;
      }).join('')}</div>` : `<div class="empty">Bu ayete henüz soru eklenmemiş.</div>`}
      <button type="button" class="suggest-toggle" id="suggestToggle">+ Bu ayete soru-cevap öner</button>
      <div class="suggest-box" id="suggestBox" hidden>
        <p class="hint">Sorunuz ve bunu cevapladığını düşündüğünüz ayet(ler) incelenip uygun görülürse eklenir.</p>
        <textarea id="sgQuestion" placeholder="Sormak istediğiniz soru…"></textarea>
        <input id="sgAnswers" placeholder="Cevap olduğunu düşündüğünüz ayet(ler), örn: 2:255, 3:2">
        <input id="sgName" placeholder="Adınız (isteğe bağlı)" maxlength="80">
        <button type="button" class="btn" id="sgSend">Gönder</button>
        <div class="admin-msg" id="sgMsg"></div>
      </div>
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
  document.getElementById('shareVerseBtn').addEventListener('click', async () => {
    const txt = `${sName} ${s}:${a}\n\n${(verse.arabic || '').trim()}\n\n"${(verse.meal || '').trim().replace(/\s+/g, ' ')}"\n\nKuran'a Sor · yorum yok, yalnızca ayet\n${PUBLIC_ORIGIN}/ayet/${s}/${a}`;
    showToast(await copyText(txt) ? 'Ayet kopyalandı. WhatsApp, Instagram veya X\'e yapıştırabilirsin.' : 'Kopyalanamadı, tekrar dene.');
  });
  document.getElementById('suggestToggle').addEventListener('click', () => {
    const box = document.getElementById('suggestBox');
    box.hidden = !box.hidden;
  });
  document.getElementById('sgSend').addEventListener('click', async () => {
    const msg = document.getElementById('sgMsg');
    const questionText = document.getElementById('sgQuestion').value.trim();
    if (questionText.length < 5) { msg.textContent = 'Lütfen sorunuzu yazın (en az 5 karakter).'; msg.className = 'admin-msg err'; return; }
    const r = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        s, a, questionText,
        answerRefs: document.getElementById('sgAnswers').value.trim(),
        name: document.getElementById('sgName').value.trim(),
      }),
    });
    if (r.ok) {
      msg.textContent = 'Teşekkürler, öneriniz iletildi!';
      msg.className = 'admin-msg ok';
      document.getElementById('sgQuestion').value = '';
      document.getElementById('sgAnswers').value = '';
    } else {
      const j = await r.json().catch(() => ({}));
      msg.textContent = j.error || 'Gönderilemedi, tekrar deneyin.';
      msg.className = 'admin-msg err';
    }
  });
}

async function pageQuestion(id, s, a) {
  const d = await get(`/api/question/${id}?s=${s}&a=${a}`);
  const hasSrc = !!Number(s);
  const srcName = d.source && d.source.surah_name ? d.source.surah_name.trim() : '';
  const srcRef = hasSrc ? `${srcName ? srcName + ' ' : ''}${s}:${a}` : '';
  const qText = d.text.trim();
  // "İlişkili:", "Kasıt ne?" gibi tek başına anlamsız başlıklar paylaşımda kaynak ayetle tamamlanır
  const low = qText.toLocaleLowerCase('tr').replace(/[:：]\s*$/, '').trim();
  const generic = !low || /^i?ilişkili( ayet)?$/.test(low) || /ile ilişkili ayet(ler)?$/.test(low);
  const shareTitle = generic ? (srcRef ? `${srcRef} ile ilişkili ayetler` : 'İlişkili ayetler') : qText.replace(/[:：]\s*$/, '').trim();
  const trailLabel = generic || low === 'kasıt ne?' || low === 'kasıt ne' ? (hasSrc ? `Soru · ${s}:${a}` : 'Soru') : shareTitle;
  trailVisit(location.pathname, trailLabel, false);

  const answers = d.answers.map((ans, i) => ({
    ...ans,
    ref: `${(ans.surah_name || '').trim()} ${ans.surah_no}:${ans.ayah_no}`.trim(),
    on: i < 5,
  }));
  const link = `${PUBLIC_ORIGIN}/soru/${id}/${hasSrc ? s : 0}/${hasSrc ? a : 0}`;

  app.innerHTML = `
  <div class="crumb"><a href="/" data-link>Sureler</a>${hasSrc ? ` / <a href="/sure/${s}" data-link>${esc(srcName || 'Sure')}</a> / <a href="/ayet/${s}/${a}" data-link>${s}:${a}</a>` : ''} / <b>Soru</b></div>
  <div class="q-wrap sheet" id="qWrap">
    <div class="q-main">
      <div class="q-label">Soru${hasSrc ? ` · <a href="/ayet/${s}/${a}" data-link>${esc(srcRef)}</a>` : ''}</div>
      <h1 class="q-title">${esc(qText)}</h1>
      <div class="q-sub">
        <span>Cevap: <b>${d.answers.length} ayet</b> — yorum yok, yalnızca Kuran</span>
        ${answers.length ? `<button type="button" class="share-toggle" id="shareToggle" aria-expanded="false" aria-controls="sharePanel">Paylaş</button>` : ''}
      </div>
      ${d.source && d.source.meal ? `
        <div class="source-verse">
          <div class="sv-ref">Sorulan ayet · ${esc(srcRef)}</div>
          <p>${markText(d.source.meal, d.source.highlight)}</p>
        </div>` : ''}
      <div class="cevaplar" id="cevaplar">
        ${answers.length ? answers.map((ans, i) => `
          <div class="cevap${ans.on ? '' : ' off'}" data-i="${i}">
            <label class="pick" title="Paylaşıma ekle"><input type="checkbox" id="pick${i}" data-i="${i}"${ans.on ? ' checked' : ''} aria-label="${esc(ans.ref)} paylaşıma eklensin"></label>
            <div class="c-body">
              <div class="c-ref">${esc(ans.ref)}</div>
              <p>${markText(ans.meal, ans.highlight)}</p>
              <a class="c-go" href="/ayet/${ans.surah_no}/${ans.ayah_no}" data-link>Ayete git →</a>
            </div>
          </div>`).join('') : `<div class="empty">Bu sorunun cevap bağlantısı bulunamadı.</div>`}
      </div>
      ${d.asked_on.length > 1 ? `
        <div class="asked-on">Bu soru şu ayetlere de soruldu:
          ${d.asked_on.filter((x) => !(x.surah_no == s && x.ayah_no == a))
            .map((x) => `<a href="/soru/${id}/${x.surah_no}/${x.ayah_no}" data-link>${x.surah_no}:${x.ayah_no}</a>`).join(' · ')}
        </div>` : ''}
      ${!hasSrc ? '' : `<a class="graph-teaser" href="/ag/${s}/${a}" data-link>
        <svg width="76" height="54" viewBox="0 0 120 84" aria-hidden="true">
          <line x1="60" y1="42" x2="18" y2="16"/><line x1="60" y1="42" x2="102" y2="14"/>
          <line x1="60" y1="42" x2="14" y2="66"/><line x1="60" y1="42" x2="104" y2="68"/><line x1="60" y1="42" x2="60" y2="8"/>
          <circle class="c" cx="60" cy="42" r="10"/>
          <circle class="s" cx="18" cy="16" r="6"/><circle class="s" cx="102" cy="14" r="6"/>
          <circle class="s" cx="14" cy="66" r="6"/><circle class="s" cx="104" cy="68" r="6"/><circle class="s" cx="60" cy="8" r="5"/>
        </svg>
        <span><b>Ayet ağını keşfet</b><small>Bu ${d.answers.length} ayet birbirine başka sorularla da bağlı. ${s}:${a} merkezli ağı gez.</small></span>
        <span class="btn2">Ağı aç →</span>
      </a>`}
    </div>
    <aside class="share-panel" id="sharePanel" hidden aria-label="Paylaş">
      <div class="sp-in">
        <h3>Paylaş</h3>
        <div class="sp-row">
          <div class="seg" role="group" aria-label="Biçim">
            <button type="button" id="fmtFull" aria-pressed="true">Tam metin</button>
            <button type="button" id="fmtShort" aria-pressed="false">Kısa · X</button>
          </div>
          <div class="sel-links"><button type="button" id="selAll">Tümünü seç</button><button type="button" id="selNone">Temizle</button></div>
        </div>
        <pre class="preview" id="sharePreview"></pre>
        <span class="count" id="shareCount"></span>
        <div class="sp-actions">
          <button type="button" class="copy-btn" id="copyShare">Metni kopyala</button>
          <button type="button" class="img-btn" id="imgShare">Görseli kaydet</button>
        </div>
        <p class="small-note">Soldaki ayetlerin kutucuklarıyla neyin paylaşılacağını seç. Görsel Instagram için 1080×1350 boyutundadır.</p>
      </div>
    </aside>
  </div>`;

  if (!answers.length) return;
  const wrap = document.getElementById('qWrap');
  const panel = document.getElementById('sharePanel');
  const toggle = document.getElementById('shareToggle');
  const pre = document.getElementById('sharePreview');
  const count = document.getElementById('shareCount');
  let mode = 'full';
  const selected = () => answers.filter((x) => x.on);
  const clean = (t) => String(t || '').trim().replace(/\s+/g, ' ');
  const srcMeal = d.source && d.source.meal ? clean(d.source.meal) : '';
  const buildText = () => {
    const sel = selected();
    if (mode === 'short') {
      return `${shareTitle}${srcRef && !generic ? ` (${srcRef})` : ''}\nKuran'ın cevabı: ${sel.map((x) => x.ref).join(' · ')}\n${link}`;
    }
    // Sorunun sorulduğu ayet, sure-ayet numarası ve mealiyle birlikte başta yer alır
    const srcBlock = srcMeal ? `\n\nSorulan ayet · ${srcRef}\n"${srcMeal}"` : '';
    const body = sel.map((x) => `${x.ref}\n"${clean(x.meal)}"`).join('\n\n');
    return `${shareTitle}${srcBlock}\n\nKuran'ın cevabı:\n\n${body}\n\nKuran'a Sor · yorum yok, yalnızca ayet\n${link}`;
  };
  const update = () => {
    const n = selected().length;
    const txt = n ? buildText() : '';
    pre.textContent = n ? txt : 'Paylaşmak için soldan en az bir ayet seç.';
    if (mode === 'short') {
      count.textContent = `${n} ayet · ${txt.length} / 280 karakter`;
      count.classList.toggle('over', txt.length > 280);
    } else {
      count.textContent = `${n} / ${answers.length} ayet seçili · ${txt.length} karakter`;
      count.classList.remove('over');
    }
  };
  const syncChecks = () => answers.forEach((x, i) => {
    const box = document.getElementById('pick' + i);
    if (box) box.checked = x.on;
    const row = box && box.closest('.cevap');
    if (row) row.classList.toggle('off', !x.on);
  });
  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    wrap.classList.toggle('sharing', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Paylaşımı kapat' : 'Paylaş';
    if (open) update();
  });
  document.getElementById('cevaplar').addEventListener('change', (e) => {
    const i = e.target.dataset.i;
    if (i === undefined) return;
    answers[i].on = e.target.checked;
    e.target.closest('.cevap').classList.toggle('off', !e.target.checked);
    update();
  });
  const setMode = (m) => {
    mode = m;
    document.getElementById('fmtFull').setAttribute('aria-pressed', String(m === 'full'));
    document.getElementById('fmtShort').setAttribute('aria-pressed', String(m === 'short'));
    update();
  };
  document.getElementById('fmtFull').addEventListener('click', () => setMode('full'));
  document.getElementById('fmtShort').addEventListener('click', () => setMode('short'));
  document.getElementById('selAll').addEventListener('click', () => { answers.forEach((x) => (x.on = true)); syncChecks(); update(); });
  document.getElementById('selNone').addEventListener('click', () => { answers.forEach((x) => (x.on = false)); syncChecks(); update(); });
  document.getElementById('copyShare').addEventListener('click', async () => {
    if (!selected().length) return showToast('Önce en az bir ayet seç.');
    showToast(await copyText(buildText()) ? 'Kopyalandı. WhatsApp, Instagram veya X\'e yapıştırabilirsin.' : 'Kopyalanamadı, tekrar dene.');
  });
  document.getElementById('imgShare').addEventListener('click', async (e) => {
    const sel = selected();
    if (!sel.length) return showToast('Önce en az bir ayet seç.');
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Hazırlanıyor…';
    try {
      await saveShareImage({
        kicker: "Kuran'a Sor",
        title: shareTitle,
        source: srcMeal ? { ref: srcRef, text: srcMeal } : null,
        items: sel.map((x) => ({ ref: x.ref, text: clean(x.meal) })),
        fileName: `kuranasor-soru-${id}.png`,
      });
      showToast('Görsel hazırlandı.');
    } catch (err) {
      showToast('Görsel oluşturulamadı: ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Görseli kaydet';
    }
  });
}

async function pageSearch(q) {
  const d = await get('/api/search?q=' + encodeURIComponent(q));
  if (d.goto) {
    // "2:255" -> ayete, "Bakara" ya da "2" -> sureye yönlendir
    if (d.goto.type === 'verse') return go(`/ayet/${d.goto.s}/${d.goto.a}`);
    return go(`/sure/${d.goto.s}`);
  }
  const snip = (t) => esc(t).replaceAll('[[', '<mark>').replaceAll(']]', '</mark>');
  const arVerses = d.arabicVerses || [];
  app.innerHTML = `
  <div class="answer-head">
    <div class="q-label">Arama</div>
    <form class="search" id="searchForm" role="search" style="margin:6px 0 8px">
      <input id="q" value="${esc(q)}" placeholder="Kelime, cümle ya da ayet arayın: &quot;Allah&quot;, &quot;Kuran&quot;, 2:255…" autocomplete="off">
      <button class="btn" type="submit">Ara</button>
    </form>
    <div class="src"><b>${d.questions.length}</b> soru · <b>${d.verses.length}</b> ayet${arVerses.length ? ` · <b>${arVerses.length}</b> Arapça ayet` : ''} bulundu${d.questions.length >= 50 || d.verses.length >= 50 ? ' (ilk 50 gösteriliyor)' : ''}</div>
  </div>
  <div class="results">
    ${arVerses.length ? `<h2>Arapça metinde</h2>` : ''}
    ${arVerses.map((r) => `
      <a class="ans" href="/ayet/${r.surah_no}/${r.ayah_no}" data-link style="margin-bottom:10px">
        <div class="ref2">${r.surah_no}:${r.ayah_no}<small>${esc((r.surah_name || '').trim())}</small></div>
        <p class="snip arabic-snip" dir="rtl">${snip(r.snip)}</p>
      </a>`).join('')}
    ${d.questions.length ? `<h2>Sorular</h2>` : ''}
    ${d.questions.map((r) => {
      // first_ref yoksa soru hiçbir ayete doğrudan sorulmamış (ortak cevap) — uydurma referans gösterme
      const [rs, ra] = (r.first_ref || '0:0').split(':');
      return `<a class="qitem" href="/soru/${r.question_id}/${rs}/${ra}" data-link>
        <span class="n">${esc(r.first_ref || '—')}</span><span class="t">${esc(r.text.trim())}</span><span class="c">→</span></a>`;
    }).join('')}
    ${d.verses.length ? `<h2>Ayetler (meal içinde)</h2>` : ''}
    ${d.verses.map((r) => `
      <a class="ans" href="/ayet/${r.surah_no}/${r.ayah_no}" data-link style="margin-bottom:10px">
        <div class="ref2">${r.surah_no}:${r.ayah_no}<small>${esc(r.surah_name || '')}</small></div>
        <p class="snip">${snip(r.snip)}</p>
      </a>`).join('')}
    ${!d.questions.length && !d.verses.length && !arVerses.length ? `<div class="empty" style="margin-top:24px">Sonuç bulunamadı. Farklı bir kelime deneyin.</div>` : ''}
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
  trailVisit(location.pathname, `Ağ · ${s}:${a}`, false);

  app.innerHTML = `
  <div class="crumb"><a href="/" data-link>Sureler</a> / <a href="/sure/${s}" data-link>Sure ${s}</a> / <a href="/ayet/${s}/${a}" data-link>${s}:${a}</a> / <b>Ayet Ağı</b></div>
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
        <span><i class="dot"></i>Ayet (tam alıntı)</span>
        <span><i class="dot ring"></i>Ayet (kısmi alıntı)</span>
        <span><i class="dot q"></i>Soru</span>
        <span><i class="dot center"></i>Merkez</span>
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
          class="${e.type === 'soru' ? 'e-soru' : 'e-cevap'}"/>`;
      }).join('') +
      nodes.map((n) => {
        const r = n.center ? 22 : n.type === 'question' ? 8 : 11;
        const partial = n.type === 'verse' && !n.center && !!n.highlight;
        // renkler stil dosyasında: gece modunda da okunaklı kalsın
        const cls = n.center ? 'n-center' : n.type === 'question' ? 'n-q' : partial ? 'n-vp' : 'n-v';
        const label = n.type === 'verse'
          ? `<text x="${n.x.toFixed(1)}" y="${(n.y + r + 13).toFixed(1)}" text-anchor="middle" class="ag-lbl">${n.label}</text>` : '';
        return `<g class="ag-node" data-id="${n.id}">
          <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r}" class="${cls}">
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
        <h2 class="q-h">${esc(n.label)}</h2>
        <p class="note">Bu soru tek bir ayete sorulmamış; birden çok ayetin ortak cevabı olarak kayıtlı, tek bir kaynak ayeti yok.</p>
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
      <h2 class="q-h">${esc(n.label)}</h2>
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
      Bir ayete tıklayıp ağı oradan gezmeye başlayın; ya da herhangi bir ayet sayfasındaki "Ağı gör" düğmesini kullanın.</div>
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

// ---------- YÖNETİCİ PANELİ ----------
const ADMIN_TOKEN_KEY = 'kuranasor_admin_token';
async function adminFetch(url, opts = {}) {
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  const headers = { ...(opts.headers || {}), Authorization: 'Bearer ' + (token || '') };
  const r = await fetch(url, { ...opts, headers });
  if (r.status === 401) { sessionStorage.removeItem(ADMIN_TOKEN_KEY); throw new Error('AUTH'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
function refRow(cls, placeholder, ref, highlight) {
  return `<div class="${cls}-row">
    <input class="ref-input" placeholder="${placeholder}" value="${esc(ref || '')}">
    <input class="hl-input" placeholder="Vurgulanacak cümle (opsiyonel)" value="${esc(highlight || '')}">
    <button type="button" class="row-del">×</button>
    <div class="ref-preview"></div>
  </div>`;
}
function parseRef(str) {
  const m = String(str || '').trim().match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
  return m ? { s: Number(m[1]), a: Number(m[2]) } : null;
}
function wireRefRow(row) {
  const input = row.querySelector('.ref-input');
  const preview = row.querySelector('.ref-preview');
  row.querySelector('.row-del').addEventListener('click', () => row.remove());
  input.addEventListener('blur', async () => {
    const ref = parseRef(input.value);
    if (!ref) { preview.textContent = input.value.trim() ? 'Geçersiz format (örn. 2:255)' : ''; preview.className = 'ref-preview err'; return; }
    try {
      const v = await adminFetch(`/api/admin/verse-lookup?s=${ref.s}&a=${ref.a}`);
      preview.textContent = `${(v.surah_name || '').trim()} ${ref.s}:${ref.a} — ${(v.meal || '').trim().slice(0, 70)}`;
      preview.className = 'ref-preview ok';
    } catch { preview.textContent = 'Ayet bulunamadı'; preview.className = 'ref-preview err'; }
  });
}

async function pageAdmin() {
  if (!sessionStorage.getItem(ADMIN_TOKEN_KEY)) return renderAdminLogin();
  try { await renderAdminPanel(); }
  catch (e) {
    if (e.message === 'AUTH') return renderAdminLogin();
    app.innerHTML = `<div class="empty" style="margin-top:40px">Hata: ${esc(e.message)}</div>`;
  }
}

function renderAdminLogin(errorMsg) {
  app.innerHTML = `
  <div class="admin-login">
    <h1>Yönetici Girişi</h1>
    <p class="hint">Bu sayfa yalnızca site sahibi içindir.</p>
    ${errorMsg ? `<div class="admin-err">${esc(errorMsg)}</div>` : ''}
    <input type="password" id="adminPass" placeholder="Şifre" autocomplete="current-password">
    <button class="btn" id="adminLoginBtn">Giriş</button>
  </div>`;
  const doLogin = async () => {
    const password = document.getElementById('adminPass').value;
    const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const j = await r.json();
    if (j.ok) { sessionStorage.setItem(ADMIN_TOKEN_KEY, j.token); pageAdmin(); }
    else renderAdminLogin(j.error || 'Giriş başarısız.');
  };
  document.getElementById('adminLoginBtn').addEventListener('click', doLogin);
  document.getElementById('adminPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
}

async function renderAdminPanel() {
  const [qData, sData] = await Promise.all([adminFetch('/api/admin/questions'), adminFetch('/api/admin/suggestions')]);
  app.innerHTML = `
  <div class="answer-head">
    <div class="q-label">Yönetici Paneli</div>
    <h1>Soru-Cevap Yönetimi</h1>
  </div>
  <div class="admin-card">
    <h2>Yeni Soru-Cevap Ekle</h2>
    <label class="admin-label">Kaynak ayet</label>
    <div id="sourceRows">${refRow('source', 'Ayet (örn. 2:255)')}</div>
    <button type="button" class="admin-add" id="addSource">+ Kaynak ayet ekle</button>
    <label class="admin-label" style="margin-top:16px">Soru metni</label>
    <textarea id="qText" placeholder="Soruyu yazın…"></textarea>
    <label class="admin-label" style="margin-top:16px">Cevap ayetleri</label>
    <div id="answerRows">${refRow('answer', 'Ayet (örn. 3:2)')}</div>
    <button type="button" class="admin-add" id="addAnswer">+ Cevap ayeti ekle</button>
    <div id="adminFormMsg" class="admin-msg"></div>
    <button class="btn" id="saveQuestion" style="margin-top:16px">Kaydet</button>
  </div>
  <div class="admin-card">
    <h2>Eklediğim Sorular <span class="admin-count">${qData.items.length}</span></h2>
    <div id="myQuestions">
      ${qData.items.length ? qData.items.map((q) => `
        <div class="admin-row" data-id="${q.id}">
          <div><b>${esc((q.sources || '').split(',')[0] || '')}</b> — ${esc(q.text.trim())}
            <small>(${q.answer_count} cevap ayeti)</small></div>
          <button type="button" class="admin-del" data-qid="${q.id}">Sil</button>
        </div>`).join('') : `<div class="empty">Henüz eklenmedi.</div>`}
    </div>
  </div>
  <div class="admin-card">
    <h2>Gelen Soru-Cevap Önerileri <span class="admin-count">${sData.items.length}</span></h2>
    <div id="suggestions">
      ${sData.items.length ? sData.items.map((s) => `
        <div class="admin-row admin-sugg" data-id="${s.id}">
          <div>
            <b>${s.surah_no}:${s.ayah_no}</b> — ${esc(s.question_text.trim())}
            ${s.answer_refs ? `<div class="sugg-answers">Önerilen cevaplar: ${esc(s.answer_refs)}</div>` : ''}
            <small>${esc(s.name || 'İsimsiz')} · ${esc(s.created_at || '')}</small>
          </div>
          <div class="admin-row-btns">
            <button type="button" class="admin-fill" data-sid="${s.id}">Forma Doldur</button>
            <button type="button" class="admin-del-sugg" data-sid="${s.id}">Sil</button>
          </div>
        </div>`).join('') : `<div class="empty">Henüz öneri yok.</div>`}
    </div>
  </div>`;

  document.querySelectorAll('.source-row, .answer-row').forEach(wireRefRow);
  document.getElementById('addSource').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = refRow('source', 'Ayet (örn. 2:255)');
    const row = div.firstElementChild;
    document.getElementById('sourceRows').appendChild(row);
    wireRefRow(row);
  });
  document.getElementById('addAnswer').addEventListener('click', () => {
    const div = document.createElement('div');
    div.innerHTML = refRow('answer', 'Ayet (örn. 3:2)');
    const row = div.firstElementChild;
    document.getElementById('answerRows').appendChild(row);
    wireRefRow(row);
  });

  document.getElementById('saveQuestion').addEventListener('click', async () => {
    const msg = document.getElementById('adminFormMsg');
    const readRows = (sel) => [...document.querySelectorAll(sel)].map((row) => {
      const ref = parseRef(row.querySelector('.ref-input').value);
      const highlight = row.querySelector('.hl-input').value.trim();
      return ref ? { ...ref, highlight: highlight || undefined } : null;
    }).filter(Boolean);
    const sourceRefs = readRows('.source-row');
    const answerRefs = readRows('.answer-row');
    const text = document.getElementById('qText').value.trim();
    if (!sourceRefs.length || !answerRefs.length || text.length < 5) {
      msg.textContent = 'Kaynak ayet, en az bir cevap ayeti ve soru metni (en az 5 karakter) gerekli.';
      msg.className = 'admin-msg err';
      return;
    }
    try {
      await adminFetch('/api/admin/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceRefs, answerRefs }),
      });
      msg.textContent = 'Kaydedildi!';
      msg.className = 'admin-msg ok';
      setTimeout(() => renderAdminPanel(), 500);
    } catch (e) {
      msg.textContent = e.message === 'AUTH' ? 'Oturum sona ermiş, tekrar giriş yapın.' : e.message;
      msg.className = 'admin-msg err';
      if (e.message === 'AUTH') pageAdmin();
    }
  });

  document.querySelectorAll('.admin-del').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Bu soru ve bağlantılı cevapları silinsin mi?')) return;
    await adminFetch(`/api/admin/question/${btn.dataset.qid}`, { method: 'DELETE' });
    renderAdminPanel();
  }));
  document.querySelectorAll('.admin-del-sugg').forEach((btn) => btn.addEventListener('click', async () => {
    await adminFetch(`/api/admin/suggestion/${btn.dataset.sid}`, { method: 'DELETE' });
    renderAdminPanel();
  }));
  document.querySelectorAll('.admin-fill').forEach((btn) => btn.addEventListener('click', () => {
    const s = sData.items.find((x) => String(x.id) === btn.dataset.sid);
    if (!s) return;
    document.querySelector('.source-row .ref-input').value = `${s.surah_no}:${s.ayah_no}`;
    document.querySelector('.source-row .ref-input').dispatchEvent(new Event('blur'));
    document.getElementById('qText').value = s.question_text;
    const foundRefs = (s.answer_refs || '').match(/\d{1,3}\s*:\s*\d{1,3}/g) || [];
    document.getElementById('answerRows').innerHTML = foundRefs.length
      ? foundRefs.map((r) => refRow('answer', 'Ayet (örn. 3:2)', r.replace(/\s+/g, ''))).join('')
      : refRow('answer', 'Ayet (örn. 3:2)');
    document.querySelectorAll('.answer-row').forEach(wireRefRow);
    document.querySelectorAll('.answer-row .ref-input').forEach((i) => i.dispatchEvent(new Event('blur')));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
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
    <button id="fbBtn" title="Öneri ve eleştirilerinizi yazın">Öneri</button>
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
  pendingLinearNav = link.dataset.linear === '1';
  go(link.getAttribute('href'));
});
window.addEventListener('popstate', () => { pendingLinearNav = false; render(); });

// Ayet sayfasında ←/→ ile önceki/sonraki ayete geç (◁/▷ düğmeleriyle aynı hedef, aynı okuma-konumu takibi)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  // Alt + ←: okuma izinde bir önceki sayfa (masaüstünde tarayıcı geri tuşu yok)
  if (e.altKey && e.key === 'ArrowLeft') { if (trailBack()) e.preventDefault(); return; }
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (!/^\/ayet\//.test(location.pathname)) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const hedef = e.key === 'ArrowLeft' ? verseNavPrev : verseNavNext;
  if (!hedef) return;
  e.preventDefault();
  pendingLinearNav = true;
  go(`/ayet/${hedef.surah_no}/${hedef.ayah_no}`);
});

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
  // Okuma izi yalnız ayet, soru ve ağ sayfalarında görünür; o sayfalar kendisi çizer
  if (!/^\/(ayet|soru|ag)\//.test(path)) hideTrail();
  app.innerHTML = '<div class="loading">Yükleniyor…</div>';
  window.scrollTo(0, 0);
  try {
    let m;
    if (path === '/' || path === '/anasayfa') await pageHome();
    else if ((m = path.match(/^\/sure\/(\d+)$/))) await pageSurah(m[1], params.get('ayet'));
    else if ((m = path.match(/^\/ayet\/(\d+)\/(\d+)$/))) await pageVerse(m[1], m[2]);
    else if ((m = path.match(/^\/soru\/(\d+)\/(\d+)\/(\d+)$/))) await pageQuestion(m[1], m[2], m[3]);
    else if ((m = path.match(/^\/ag\/(\d+)\/(\d+)$/))) await pageGraph(m[1], m[2]);
    else if (path === '/kesfet') await pageExplore();
    else if (path === '/ara') await pageSearch(params.get('q') || '');
    else if (path === '/oneriler') await pageFeedbackList();
    else if (path === '/yonet') await pageAdmin();
    else if (path === '/hakkinda') pageAbout();
    else await pageHome();
  } catch (err) {
    app.innerHTML = `<div class="empty" style="margin-top:40px">Bir hata oluştu: ${esc(err.message)}</div>`;
  }
}
render();
