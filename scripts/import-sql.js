/**
 * kuranasor_kuranasor.sql (MySQL dump) -> data/kuranasor.db (SQLite, normalize şema)
 * Kullanım: node scripts/import-sql.js <dump.sql yolu>
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const Database = require('better-sqlite3');

const DUMP = process.argv[2];
if (!DUMP || !fs.existsSync(DUMP)) {
  console.error('Kullanım: node scripts/import-sql.js <kuranasor_kuranasor.sql>');
  process.exit(1);
}

const DB_PATH = path.join(__dirname, '..', 'data', 'kuranasor.db');
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');

db.exec(`
CREATE TABLE surahs (
  id INTEGER PRIMARY KEY,          -- sure no (1-114)
  nuzul_sira INTEGER,
  verse_count INTEGER
);
CREATE TABLE surah_names (
  surah_id INTEGER NOT NULL,
  lang TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (surah_id, lang)
);
CREATE TABLE verses (
  id INTEGER PRIMARY KEY,          -- kuran_ayet_no (1-6236)
  surah_no INTEGER NOT NULL,
  ayah_no INTEGER NOT NULL,
  arabic TEXT,
  arabic_plain TEXT                -- harekesiz
);
CREATE UNIQUE INDEX idx_verses_sa ON verses (surah_no, ayah_no);
-- Sitenin kendi meali (dil başına tek metin)
CREATE TABLE meals (
  verse_id INTEGER NOT NULL,
  lang TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'primary',  -- primary: meal_xx tablosu, wide: meal geniş tablosu
  PRIMARY KEY (verse_id, lang)
);
CREATE TABLE questions (
  id INTEGER PRIMARY KEY,
  answer_count INTEGER
);
CREATE TABLE question_texts (
  question_id INTEGER NOT NULL,
  lang TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (question_id, lang)
);
-- Soru hangi ayete soruldu (ayetin vurgulanan parçasıyla)
CREATE TABLE question_verses (
  id INTEGER NOT NULL,
  lang TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  verse_id INTEGER,
  surah_no INTEGER,
  ayah_no INTEGER,
  sira INTEGER,
  highlight TEXT,                  -- ayet_parca_obj (JSON dizi)
  is_active INTEGER DEFAULT 1,
  PRIMARY KEY (id, lang)
);
CREATE INDEX idx_qv_verse ON question_verses (verse_id, lang);
CREATE INDEX idx_qv_question ON question_verses (question_id, lang);
-- Cevap = soruya referans verilen ayet
CREATE TABLE answers (
  id INTEGER NOT NULL,
  lang TEXT NOT NULL,
  question_id INTEGER NOT NULL,
  verse_id INTEGER,
  surah_no INTEGER,
  ayah_no INTEGER,
  sira INTEGER,
  highlight TEXT,
  isaretlendi INTEGER,
  is_active INTEGER DEFAULT 1,
  PRIMARY KEY (id, lang)
);
CREATE INDEX idx_ans_question ON answers (question_id, lang);
CREATE INDEX idx_ans_verse ON answers (verse_id, lang);
CREATE TABLE submitted_questions (
  id INTEGER PRIMARY KEY,
  sure_ve_ayet TEXT,
  lang TEXT,
  text TEXT,
  created_at TEXT,
  is_active INTEGER
);
CREATE TABLE question_ratings (
  id TEXT PRIMARY KEY,
  puan INTEGER,
  kac_kere INTEGER
);
CREATE TABLE languages (
  id INTEGER PRIMARY KEY,
  code TEXT,
  name TEXT,
  direction TEXT,
  is_active INTEGER,
  turkce TEXT
);
`);

// ---- MySQL INSERT tuple parser (satır bazlı beslenir, string içi her şeyi doğru işler) ----
class TupleParser {
  constructor(onRow) {
    this.onRow = onRow;
    this.reset();
  }
  reset() {
    this.depth = 0;        // 0: tuple dışı, 1: tuple içi
    this.inString = false;
    this.escaped = false;
    this.cur = '';
    this.curIsString = false;
    this.values = [];
    this.done = false;     // ';' görüldü
  }
  pushValue() {
    let v;
    if (this.curIsString) v = this.cur;
    else {
      const t = this.cur.trim();
      v = t === '' || t.toUpperCase() === 'NULL' ? null : t;
    }
    this.values.push(v);
    this.cur = '';
    this.curIsString = false;
  }
  feed(line) {
    const s = line;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (this.inString) {
        if (this.escaped) {
          const map = { n: '\n', r: '\r', t: '\t', '0': '\0', Z: '\x1a' };
          this.cur += map[c] !== undefined ? map[c] : c;
          this.escaped = false;
        } else if (c === '\\') {
          this.escaped = true;
        } else if (c === "'") {
          if (s[i + 1] === "'") { this.cur += "'"; i++; }
          else this.inString = false;
        } else {
          this.cur += c;
        }
        continue;
      }
      if (c === "'") { this.inString = true; this.curIsString = true; continue; }
      if (c === '(') { if (this.depth === 0) { this.depth = 1; this.values = []; this.cur = ''; this.curIsString = false; } else this.cur += c; continue; }
      if (c === ')' && this.depth === 1) { this.pushValue(); this.depth = 0; this.onRow(this.values); continue; }
      if (c === ',' && this.depth === 1) { this.pushValue(); continue; }
      if (c === ';' && this.depth === 0) { this.done = true; return; }
      if (this.depth === 1) this.cur += c;
    }
    // satır sonu: string içindeysek gerçek newline vardı demektir
    if (this.inString) this.cur += '\n';
  }
}

// ---- Hedef tablolar ve satır işleyicileri ----
const ins = {
  surah: db.prepare('INSERT OR IGNORE INTO surahs (id, nuzul_sira, verse_count) VALUES (?,?,?)'),
  surahName: db.prepare('INSERT OR REPLACE INTO surah_names (surah_id, lang, name) VALUES (?,?,?)'),
  verse: db.prepare('INSERT OR REPLACE INTO verses (id, surah_no, ayah_no, arabic, arabic_plain) VALUES (?,?,?,?,?)'),
  meal: db.prepare('INSERT OR IGNORE INTO meals (verse_id, lang, text, source) VALUES (?,?,?,?)'),
  question: db.prepare('INSERT OR IGNORE INTO questions (id, answer_count) VALUES (?,?)'),
  qtext: db.prepare('INSERT OR REPLACE INTO question_texts (question_id, lang, text) VALUES (?,?,?)'),
  qverse: db.prepare('INSERT OR REPLACE INTO question_verses (id, lang, question_id, verse_id, surah_no, ayah_no, sira, highlight, is_active) VALUES (?,?,?,?,?,?,?,?,?)'),
  answer: db.prepare('INSERT OR REPLACE INTO answers (id, lang, question_id, verse_id, surah_no, ayah_no, sira, highlight, isaretlendi, is_active) VALUES (?,?,?,?,?,?,?,?,?,?)'),
  submitted: db.prepare('INSERT OR REPLACE INTO submitted_questions (id, sure_ve_ayet, lang, text, created_at, is_active) VALUES (?,?,?,?,?,?)'),
  rating: db.prepare('INSERT OR REPLACE INTO question_ratings (id, puan, kac_kere) VALUES (?,?,?)'),
  language: db.prepare('INSERT OR REPLACE INTO languages (id, code, name, direction, is_active, turkce) VALUES (?,?,?,?,?,?)'),
};

const counts = {};
function bump(k) { counts[k] = (counts[k] || 0) + 1; }

function rowObj(cols, values) {
  const o = {};
  cols.forEach((c, i) => (o[c] = values[i]));
  return o;
}

function makeHandler(table, cols) {
  const langMatch = table.match(/_(tr|az|de|en)$/);
  const lang = langMatch ? langMatch[1] : null;
  const base = lang ? table.slice(0, -3) : table;

  return (values) => {
    const r = rowObj(cols, values);
    switch (base) {
      case 'kuran':
        ins.verse.run(r.kuran_ayet_no, r.sure_no, r.sure_ayet_no, r.arapca_metin, r.harf_disi_silindi);
        bump('verses');
        break;
      case 'sure':
        ins.surah.run(r.id, r.nuzul_sira, r.verse_count);
        ins.surahName.run(r.id, lang, r.name);
        bump('surah_names');
        break;
      case 'meal': {
        if (lang) {
          // meal_tr / meal_az / meal_de / meal_en -> birincil meal
          if (r.meal) { ins.meal.run(r.kuran_ayet_no, lang, r.meal, 'primary'); bump('meals'); }
        } else {
          // geniş meal tablosu: diğer tüm diller
          for (const c of cols) {
            const m = c.match(/^meal_(\w+)$/);
            if (!m) continue;
            const l = m[1];
            if (['tr', 'az', 'de', 'en'].includes(l)) continue;
            const t = r[c];
            if (t && String(t).trim()) { ins.meal.run(r.kuran_ayet_no, l, t, 'wide'); bump('meals'); }
          }
        }
        break;
      }
      case 'soru_text':
        if (lang === 'tr') ins.question.run(r.id, r.cevap_sayisi);
        else ins.question.run(r.id, null);
        if (r.soru) { ins.qtext.run(r.id, lang, r.soru); bump('question_texts'); }
        break;
      case 'soru':
        ins.qverse.run(r.id, lang, r.soru_id, r.kuran_ayet_no, r.sure_no, r.sure_ayet_no, r.sira, r.ayet_parca_obj, r.is_active);
        bump('question_verses');
        break;
      case 'cevap':
        ins.answer.run(r.id, lang, r.soru_id, r.kuran_ayet_no, r.sure_no, r.sure_ayet_no, r.sira, r.ayet_parca_obj, r.isaretlendi, r.is_active);
        bump('answers');
        break;
      case 'gelen_soru':
        ins.submitted.run(r.id, r.sure_ve_ayet, r.lang, r.soru, r.kayit_tarihi, r.is_active);
        bump('submitted_questions');
        break;
      case 'soru_puanla':
        ins.rating.run(r.id, r.puan, r.kac_kere);
        bump('question_ratings');
        break;
      case 'languages':
        ins.language.run(r.id, r.code, r.name, r.direction, r.is_active, r.turkce);
        bump('languages');
        break;
    }
  };
}

const TARGET = /^INSERT INTO `(kuran|meal|meal_tr|meal_az|meal_de|meal_en|sure_tr|sure_az|sure_de|sure_en|soru_text_tr|soru_text_az|soru_text_de|soru_text_en|soru_tr|soru_az|soru_de|soru_en|cevap_tr|cevap_az|cevap_de|cevap_en|gelen_soru|soru_puanla|languages)` \(([^)]+)\) VALUES/;

(async () => {
  const rl = readline.createInterface({
    input: fs.createReadStream(DUMP, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let parser = null;
  db.exec('BEGIN');
  let sinceCommit = 0;

  for await (const line of rl) {
    if (!parser) {
      const m = line.match(TARGET);
      if (!m) continue;
      const table = m[1];
      const cols = m[2].split(',').map((c) => c.trim().replace(/`/g, ''));
      const handler = makeHandler(table, cols);
      parser = new TupleParser((vals) => {
        handler(vals);
        if (++sinceCommit >= 20000) { db.exec('COMMIT'); db.exec('BEGIN'); sinceCommit = 0; }
      });
      // VALUES sonrası aynı satırda veri olabilir
      const rest = line.slice(line.indexOf('VALUES') + 6);
      parser.feed(rest);
      if (parser.done) parser = null;
    } else {
      parser.feed(line);
      if (parser.done) parser = null;
    }
  }
  db.exec('COMMIT');

  console.log('İçe aktarım tamamlandı:');
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(22)} ${v}`);
  db.close();
})();
