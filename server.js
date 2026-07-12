/**
 * Kuran'a Sor — sunucu
 * Yerel: node server.js  ->  http://localhost:4600
 * Deploy: PORT ve DATA_DIR ortam değişkenleriyle yapılandırılabilir.
 */
const fs = require('fs');
const zlib = require('zlib');
const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'kuranasor.db');
const DB_GZ_PATH = path.join(__dirname, 'data', 'kuranasor.db.gz');

// Veritabanı yoksa ama sıkıştırılmış hali repo içindeyse otomatik aç (ilk deploy/kurulum)
if (!fs.existsSync(DB_PATH) && fs.existsSync(DB_GZ_PATH)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('kuranasor.db bulunamadı, kuranasor.db.gz açılıyor…');
  fs.writeFileSync(DB_PATH, zlib.gunzipSync(fs.readFileSync(DB_GZ_PATH)));
  console.log('Veritabanı hazırlandı:', DB_PATH);
}
if (!fs.existsSync(DB_PATH)) {
  console.error('HATA: data/kuranasor.db bulunamadı ve data/kuranasor.db.gz da yok. README.md içindeki kurulum adımlarını izleyin.');
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
// Öneriler ayrı, yazılabilir bir dosyada tutulur (kalıcı disk kullanılıyorsa DATA_DIR'a taşınabilir)
fs.mkdirSync(DATA_DIR, { recursive: true });
const fdb = new Database(path.join(DATA_DIR, 'feedback.db'));
fdb.exec(`CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT,
  name TEXT,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 4600;

const LANGS = new Set(['tr', 'az', 'en', 'de']);
const lang = (req) => (LANGS.has(req.query.lang) ? req.query.lang : 'tr');

// ---------- API ----------

const qStats = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM verses) AS verses,
    (SELECT COUNT(*) FROM questions) AS questions,
    (SELECT COUNT(*) FROM answers WHERE lang='tr') AS links,
    (SELECT COUNT(*) FROM authors) AS authors
`);

const qSurahs = db.prepare(`
  SELECT s.id, s.verse_count, sn.name,
    (SELECT COUNT(*) FROM question_verses qv
      JOIN verses v ON v.id = qv.verse_id
      WHERE v.surah_no = s.id AND qv.lang = ?) AS question_count
  FROM surahs s
  JOIN surah_names sn ON sn.surah_id = s.id AND sn.lang = ?
  ORDER BY s.id
`);

app.get('/api/surahs', (req, res) => {
  const l = lang(req);
  res.json({ stats: qStats.get(), surahs: qSurahs.all(l, l) });
});

const qSurah = db.prepare(`
  SELECT s.id, s.verse_count, s.audio_mp3, s.audio_duration, sn.name
  FROM surahs s JOIN surah_names sn ON sn.surah_id = s.id AND sn.lang = ?
  WHERE s.id = ?
`);
// Numarasız besmele: Fatiha'da 1:1 olarak numaralı, Tevbe'de yok; kalan 112 surenin başında
const qBesmele = db.prepare(`
  SELECT v.arabic, v.transcription, m.text AS meal
  FROM verses v LEFT JOIN meals m ON m.verse_id = v.id AND m.lang = ?
  WHERE v.id = 1
`);
const hasBesmele = (surahNo) => surahNo !== 1 && surahNo !== 9;
const qSurahVerses = db.prepare(`
  SELECT v.ayah_no, m.text AS meal,
    (SELECT COUNT(*) FROM question_verses qv WHERE qv.verse_id = v.id AND qv.lang = ?) AS qcount
  FROM verses v
  LEFT JOIN meals m ON m.verse_id = v.id AND m.lang = ?
  WHERE v.surah_no = ?
  ORDER BY v.ayah_no
`);

app.get('/api/surah/:no', (req, res) => {
  const l = lang(req);
  const no = Number(req.params.no);
  const surah = qSurah.get(l, no);
  if (!surah) return res.status(404).json({ error: 'sure bulunamadı' });
  const besmele = hasBesmele(no) ? qBesmele.get(l) : null;
  res.json({ surah, besmele, verses: qSurahVerses.all(l, l, no) });
});

const qVerse = db.prepare(`
  SELECT v.id, v.surah_no, v.ayah_no, v.arabic, v.transcription, v.page, v.juz, m.text AS meal
  FROM verses v LEFT JOIN meals m ON m.verse_id = v.id AND m.lang = ?
  WHERE v.surah_no = ? AND v.ayah_no = ?
`);
const qVerseById = db.prepare('SELECT surah_no, ayah_no FROM verses WHERE id = ?');
const qVerseQuestions = db.prepare(`
  SELECT qv.question_id, qv.sira, qv.highlight, qt.text,
    (SELECT COUNT(*) FROM answers a WHERE a.question_id = qv.question_id AND a.lang = ?) AS answer_count
  FROM question_verses qv
  JOIN question_texts qt ON qt.question_id = qv.question_id AND qt.lang = qv.lang
  WHERE qv.verse_id = ? AND qv.lang = ? AND qv.is_active = 1
  ORDER BY qv.sira, qv.id
`);
const qTranslations = db.prepare(`
  SELECT a.id AS author_id, a.name, a.description, t.text
  FROM author_translations t JOIN authors a ON a.id = t.author_id
  WHERE t.verse_id = ? AND a.lang = ?
  ORDER BY a.name
`);
const qFootnotes = db.prepare(`
  SELECT author_id, number, text FROM footnotes WHERE verse_id = ? ORDER BY author_id, number
`);

app.get('/api/verse/:s/:a', (req, res) => {
  const l = lang(req);
  const s = Number(req.params.s), a = Number(req.params.a);
  const verse = qVerse.get(l, s, a);
  if (!verse) return res.status(404).json({ error: 'ayet bulunamadı' });
  const surah = qSurah.get(l, s);
  const questions = qVerseQuestions.all(l, verse.id, l);
  // meal karşılaştırma yalnızca o dilde yazar varsa
  const translations = qTranslations.all(verse.id, l);
  const fns = qFootnotes.all(verse.id);
  for (const t of translations) t.footnotes = fns.filter((f) => f.author_id === t.author_id);
  const prev = qVerseById.get(verse.id - 1) || null;
  const next = qVerseById.get(verse.id + 1) || null;
  const besmele = a === 1 && hasBesmele(s) ? qBesmele.get(l) : null;
  res.json({ verse, surah, besmele, questions, translations, prev, next });
});

const qQuestionText = db.prepare('SELECT text FROM question_texts WHERE question_id = ? AND lang = ?');
const qQuestionSource = db.prepare(`
  SELECT qv.highlight, qv.verse_id FROM question_verses qv
  WHERE qv.question_id = ? AND qv.verse_id = ? AND qv.lang = ? LIMIT 1
`);
const qAnswers = db.prepare(`
  SELECT ans.verse_id, ans.highlight, v.surah_no, v.ayah_no, v.arabic,
         m.text AS meal, sn.name AS surah_name
  FROM answers ans
  JOIN verses v ON v.id = ans.verse_id
  LEFT JOIN meals m ON m.verse_id = ans.verse_id AND m.lang = ans.lang
  LEFT JOIN surah_names sn ON sn.surah_id = v.surah_no AND sn.lang = ans.lang
  WHERE ans.question_id = ? AND ans.lang = ? AND ans.is_active = 1
  ORDER BY ans.verse_id
`);
const qAskedOn = db.prepare(`
  SELECT DISTINCT v.surah_no, v.ayah_no FROM question_verses qv
  JOIN verses v ON v.id = qv.verse_id
  WHERE qv.question_id = ? AND qv.lang = ? ORDER BY v.id
`);

app.get('/api/question/:id', (req, res) => {
  const l = lang(req);
  const id = Number(req.params.id);
  const text = qQuestionText.get(id, l);
  if (!text) return res.status(404).json({ error: 'soru bulunamadı' });
  const s = Number(req.query.s), a = Number(req.query.a);
  let source = null;
  if (s && a) {
    const verse = qVerse.get(l, s, a);
    if (verse) {
      const src = qQuestionSource.get(id, verse.id, l);
      source = { ...verse, surah_name: qSurah.get(l, s)?.name, highlight: src?.highlight || null };
    }
  }
  res.json({
    id,
    text: text.text,
    source,
    asked_on: qAskedOn.all(id, l),
    answers: qAnswers.all(id, l),
  });
});

const qSearchQuestions = db.prepare(`
  SELECT q.question_id, q.text,
    (SELECT v.surah_no || ':' || v.ayah_no FROM question_verses qv JOIN verses v ON v.id = qv.verse_id
      WHERE qv.question_id = q.question_id AND qv.lang = q.lang ORDER BY v.id LIMIT 1) AS first_ref
  FROM fts_questions q
  WHERE fts_questions MATCH ? AND q.lang = ?
  ORDER BY rank
  LIMIT 50
`);
const qSearchMeals = db.prepare(`
  SELECT m.verse_id, snippet(fts_meals, 0, '[[', ']]', '…', 24) AS snip,
         v.surah_no, v.ayah_no, sn.name AS surah_name
  FROM fts_meals m
  JOIN verses v ON v.id = m.verse_id
  LEFT JOIN surah_names sn ON sn.surah_id = v.surah_no AND sn.lang = m.lang
  WHERE fts_meals MATCH ? AND m.lang = ?
  ORDER BY rank
  LIMIT 50
`);
const qVerseExists = db.prepare('SELECT 1 FROM verses WHERE surah_no = ? AND ayah_no = ?');
const qSurahNames = db.prepare('SELECT surah_id, name FROM surah_names WHERE lang = ?');

app.get('/api/search', (req, res) => {
  const l = lang(req);
  const raw = String(req.query.q || '').trim();
  if (!raw) return res.json({ questions: [], verses: [] });

  // "2:255", "2/255", "2 255" gibi girişte doğrudan ayete git; "2:0" = numarasız besmele (1:1)
  const ref = raw.match(/^(\d{1,3})\s*[:\/.,\s]\s*(\d{1,3})$/);
  if (ref) {
    const rs = Number(ref[1]), ra = Number(ref[2]);
    if (ra === 0 && hasBesmele(rs)) return res.json({ goto: { type: 'verse', s: 1, a: 1 } });
    if (qVerseExists.get(rs, ra)) return res.json({ goto: { type: 'verse', s: rs, a: ra } });
  }
  // Tek sayı (1-114) ya da sure adı yazıldıysa sureye git
  if (/^\d{1,3}$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 114) {
    return res.json({ goto: { type: 'surah', s: Number(raw) } });
  }
  const lowRaw = raw.toLocaleLowerCase('tr');
  const surahHit = qSurahNames.all(l).find((r) => r.name.trim().toLocaleLowerCase('tr') === lowRaw);
  if (surahHit) return res.json({ goto: { type: 'surah', s: surahHit.surah_id } });

  // Kelime + tam ifade araması: çok kelimeli girişte önce cümle (phrase) eşleşmesi,
  // yoksa tüm kelimeleri içerenler (önek destekli)
  const tokens = raw.replace(/['"()*^]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 8);
  if (!tokens.length) return res.json({ questions: [], verses: [] });
  const phrase = tokens.map((t) => `"${t}"`).join(' ');
  const prefix = tokens.map((t) => `"${t}"*`).join(' ');
  const match = tokens.length > 1 ? `(${phrase}) OR (${prefix})` : `"${tokens[0]}"*`;
  try {
    res.json({
      questions: qSearchQuestions.all(match, l),
      verses: qSearchMeals.all(match, l),
    });
  } catch (e) {
    res.json({ questions: [], verses: [] });
  }
});

// ---------- ayet ağı (graf) ----------
const qQuestionsOn = db.prepare(`
  SELECT DISTINCT qv.question_id AS id, qt.text
  FROM question_verses qv
  JOIN question_texts qt ON qt.question_id = qv.question_id AND qt.lang = qv.lang
  WHERE qv.verse_id = ? AND qv.lang = ? AND qv.is_active = 1
  ORDER BY qv.sira, qv.id
`);
const qAnswerVersesOf = db.prepare(`
  SELECT DISTINCT ans.verse_id AS vid, v.surah_no AS sn, v.ayah_no AS an, ans.highlight AS highlight
  FROM answers ans JOIN verses v ON v.id = ans.verse_id
  WHERE ans.question_id = ? AND ans.lang = ? AND ans.is_active = 1
`);
const qIncomingQuestions = db.prepare(`
  SELECT DISTINCT ans.question_id AS id, qt.text
  FROM answers ans
  JOIN question_texts qt ON qt.question_id = ans.question_id AND qt.lang = ans.lang
  WHERE ans.verse_id = ? AND ans.lang = ? AND ans.is_active = 1
  LIMIT 30
`);
const qSourceVersesOf = db.prepare(`
  SELECT DISTINCT qv.verse_id AS vid, v.surah_no AS sn, v.ayah_no AS an, qv.highlight AS highlight
  FROM question_verses qv JOIN verses v ON v.id = qv.verse_id
  WHERE qv.question_id = ? AND qv.lang = ? AND qv.is_active = 1
  LIMIT 5
`);
app.get('/api/graph/verse/:s/:a', (req, res) => {
  const l = lang(req);
  const s = Number(req.params.s), a = Number(req.params.a);
  const depth = req.query.depth === '2' ? 2 : 1;
  const CAP = depth === 2 ? 260 : 150;
  const verse = qVerse.get(l, s, a);
  if (!verse) return res.status(404).json({ error: 'ayet bulunamadı' });

  const nodes = new Map(); // id -> node
  const edges = [];
  const edgeSeen = new Set();
  const addEdge = (from, to, type) => {
    const k = from + '>' + to;
    if (edgeSeen.has(k)) return;
    edgeSeen.add(k);
    edges.push({ from, to, type });
  };
  const vid = (x) => 'v' + x;
  const qid = (x) => 'q' + x;
  const addVerse = (id, sn, an, highlight) => {
    if (!nodes.has(vid(id)) && nodes.size < CAP) {
      nodes.set(vid(id), { id: vid(id), type: 'verse', s: sn, a: an, label: sn + ':' + an, highlight: highlight || null });
    } else if (nodes.has(vid(id)) && highlight && !nodes.get(vid(id)).highlight) {
      // aynı ayete başka bir bağlantı üzerinden ulaşılmışsa, ilk bulunan kısmi alıntı bilgisi korunur
      nodes.get(vid(id)).highlight = highlight;
    }
    return nodes.has(vid(id));
  };
  const addQuestion = (id, text, srcS, srcA) => {
    if (!nodes.has(qid(id)) && nodes.size < CAP) {
      nodes.set(qid(id), { id: qid(id), type: 'question', qid: id, label: text.trim(), s: srcS, a: srcA });
    }
    return nodes.has(qid(id));
  };
  // Bir ayetin dışa giden bağları: ona sorulan sorular + cevap ayetleri
  const expandVerse = (vRow) => {
    const added = []; // eklenen yeni ayet düğümleri (derinlik genişletme için)
    for (const q of qQuestionsOn.all(vRow.id, l)) {
      if (!addQuestion(q.id, q.text, vRow.s, vRow.a)) break;
      addEdge(vid(vRow.id), qid(q.id), 'soru');
      for (const av of qAnswerVersesOf.all(q.id, l)) {
        if (av.vid === vRow.id) continue;
        const isNew = !nodes.has(vid(av.vid));
        if (!addVerse(av.vid, av.sn, av.an, av.highlight)) break;
        addEdge(qid(q.id), vid(av.vid), 'cevap');
        if (isNew) added.push({ id: av.vid, s: av.sn, a: av.an });
      }
    }
    return added;
  };

  addVerse(verse.id, s, a);
  nodes.get(vid(verse.id)).center = true;

  // Derinlik 1: merkezin dışa giden bağları
  const level1 = expandVerse({ id: verse.id, s, a });
  // İçe gelen: merkezin cevap olduğu sorular ve kaynak ayetleri
  for (const q of qIncomingQuestions.all(verse.id, l)) {
    if (nodes.has(qid(q.id))) continue;
    const srcs = qSourceVersesOf.all(q.id, l);
    const first = srcs[0];
    if (!addQuestion(q.id, q.text, first ? first.sn : s, first ? first.an : a)) break;
    addEdge(qid(q.id), vid(verse.id), 'cevap');
    for (const sv of srcs) {
      if (sv.vid === verse.id) continue;
      const isNew = !nodes.has(vid(sv.vid));
      if (!addVerse(sv.vid, sv.sn, sv.an, sv.highlight)) break;
      addEdge(vid(sv.vid), qid(q.id), 'soru');
      if (isNew) level1.push({ id: sv.vid, s: sv.sn, a: sv.an });
    }
  }
  // Derinlik 2: birinci halkadaki ayetlerin dışa giden bağları
  if (depth === 2) {
    for (const vRow of level1) {
      if (nodes.size >= CAP) break;
      expandVerse(vRow);
    }
  }

  res.json({
    center: { s, a, ref: s + ':' + a },
    depth,
    nodes: [...nodes.values()],
    edges,
    capped: nodes.size >= CAP,
  });
});

// En bağlantılı ayetler (keşif sayfası) — dil başına bir kez hesaplanır
const hubCache = {};
app.get('/api/hubs', (req, res) => {
  const l = lang(req);
  if (!hubCache[l]) {
    const answered = db.prepare(`
      SELECT v.surah_no s, v.ayah_no a, sn.name surah_name,
             substr(m.text, 1, 140) meal, COUNT(DISTINCT ans.question_id) n
      FROM answers ans
      JOIN verses v ON v.id = ans.verse_id
      LEFT JOIN surah_names sn ON sn.surah_id = v.surah_no AND sn.lang = ans.lang
      LEFT JOIN meals m ON m.verse_id = v.id AND m.lang = ans.lang
      WHERE ans.lang = ? AND ans.is_active = 1
      GROUP BY ans.verse_id ORDER BY n DESC LIMIT 20
    `).all(l);
    const asked = db.prepare(`
      SELECT v.surah_no s, v.ayah_no a, sn.name surah_name,
             substr(m.text, 1, 140) meal, COUNT(DISTINCT qv.question_id) n
      FROM question_verses qv
      JOIN verses v ON v.id = qv.verse_id
      LEFT JOIN surah_names sn ON sn.surah_id = v.surah_no AND sn.lang = qv.lang
      LEFT JOIN meals m ON m.verse_id = v.id AND m.lang = qv.lang
      WHERE qv.lang = ? AND qv.is_active = 1
      GROUP BY qv.verse_id ORDER BY n DESC LIMIT 20
    `).all(l);
    const totalLinks = db.prepare(
      "SELECT COUNT(DISTINCT question_id || '-' || verse_id) n FROM answers WHERE lang = ? AND is_active = 1"
    ).get(l).n;
    hubCache[l] = { answered, asked, totalLinks };
  }
  res.json(hubCache[l]);
});

const qStatAsks = db.prepare('SELECT COUNT(DISTINCT question_id) n FROM question_verses WHERE verse_id = ? AND lang = ? AND is_active = 1');
const qStatAnswers = db.prepare('SELECT COUNT(DISTINCT question_id) n FROM answers WHERE verse_id = ? AND lang = ? AND is_active = 1');

app.get('/api/graph/info/:s/:a', (req, res) => {
  const l = lang(req);
  const s = Number(req.params.s), a = Number(req.params.a);
  const verse = qVerse.get(l, s, a);
  if (!verse) return res.status(404).json({ error: 'ayet bulunamadı' });
  const surah = qSurah.get(l, s);
  res.json({
    ref: s + ':' + a,
    surah_name: surah ? surah.name.trim() : '',
    arabic: verse.arabic,
    meal: verse.meal,
    asks: qStatAsks.get(verse.id, l).n,
    answers: qStatAnswers.get(verse.id, l).n,
  });
});

// ---------- öneri / geri bildirim ----------
const insFeedback = fdb.prepare('INSERT INTO feedback (page, name, text) VALUES (?,?,?)');
const listFeedback = fdb.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 300');

app.post('/api/feedback', (req, res) => {
  const text = String(req.body?.text || '').trim();
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const page = String(req.body?.page || '').trim().slice(0, 200);
  if (text.length < 3 || text.length > 3000) {
    return res.status(400).json({ ok: false, error: 'Öneri metni 3-3000 karakter olmalı' });
  }
  insFeedback.run(page, name || null, text);
  res.json({ ok: true });
});

app.get('/api/feedback', (req, res) => {
  res.json({ items: listFeedback.all() });
});

// ---------- statik + SPA fallback ----------
app.use(express.static(path.join(__dirname, 'public')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Kuran'a Sor sunucu çalışıyor: http://localhost:${PORT}`));
