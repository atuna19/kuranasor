/**
 * kuran_json_tr + kuran_json_az klasörleri -> mevcut data/kuranasor.db üzerine:
 *   - verses: transcription, page, juz
 *   - surahs: audio_mp3, audio_duration
 *   - authors + author_translations + footnotes (çok mealci veri)
 * Kullanım: node scripts/import-json.js <kuran_json klasörü>
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = process.argv[2];
if (!ROOT || !fs.existsSync(ROOT)) {
  console.error('Kullanım: node scripts/import-json.js <kuran_json klasörü>');
  process.exit(1);
}

const DB_PATH = path.join(__dirname, '..', 'data', 'kuranasor.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');

db.exec(`
ALTER TABLE verses ADD COLUMN transcription TEXT;
ALTER TABLE verses ADD COLUMN page INTEGER;
ALTER TABLE verses ADD COLUMN juz INTEGER;
ALTER TABLE surahs ADD COLUMN audio_mp3 TEXT;
ALTER TABLE surahs ADD COLUMN audio_duration INTEGER;
CREATE TABLE IF NOT EXISTS authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  lang TEXT
);
CREATE TABLE IF NOT EXISTS author_translations (
  verse_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (verse_id, author_id)
);
CREATE INDEX IF NOT EXISTS idx_at_author ON author_translations (author_id);
CREATE TABLE IF NOT EXISTS footnotes (
  id INTEGER,
  verse_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  number INTEGER,
  text TEXT NOT NULL,
  PRIMARY KEY (verse_id, author_id, number)
);
`);

const upVerse = db.prepare('UPDATE verses SET transcription=?, page=?, juz=? WHERE surah_no=? AND ayah_no=?');
const upSurah = db.prepare('UPDATE surahs SET audio_mp3=?, audio_duration=? WHERE id=?');
const insAuthor = db.prepare('INSERT OR IGNORE INTO authors (id, name, description, lang) VALUES (?,?,?,?)');
const insTr = db.prepare('INSERT OR REPLACE INTO author_translations (verse_id, author_id, text) VALUES (?,?,?)');
const insFn = db.prepare('INSERT OR REPLACE INTO footnotes (id, verse_id, author_id, number, text) VALUES (?,?,?,?,?)');
const verseId = db.prepare('SELECT id FROM verses WHERE surah_no=? AND ayah_no=?').pluck();

const counts = { files: 0, translations: 0, footnotes: 0 };
const seenSurahAudio = new Set();

function handleTranslation(vid, t) {
  if (!t || !t.author || !t.text) return;
  insAuthor.run(t.author.id, t.author.name, t.author.description, t.author.language);
  insTr.run(vid, t.author.id, t.text);
  counts.translations++;
  if (Array.isArray(t.footnotes)) {
    for (const f of t.footnotes) {
      if (!f || !f.text) continue;
      insFn.run(f.id, vid, t.author.id, f.number, f.text);
      counts.footnotes++;
    }
  }
}

const importDir = db.transaction((dir) => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const m = file.match(/^(\d+)_(\d+)\.json$/);
    if (!m) continue;
    const [s, a] = [Number(m[1]), Number(m[2])];
    let pp;
    try {
      pp = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).pageProps;
    } catch { continue; }
    if (!pp) continue;
    const vid = verseId.get(s, a);
    if (!vid) continue;
    counts.files++;

    const v = pp.verse || {};
    upVerse.run(v.transcription || null, v.page ?? null, v.juzNumber ?? null, s, a);

    if (pp.surah && pp.surah.audio && !seenSurahAudio.has(s)) {
      upSurah.run(pp.surah.audio.mp3 || null, pp.surah.audio.duration ?? null, s);
      seenSurahAudio.add(s);
    }
    handleTranslation(vid, pp.translation);
    if (Array.isArray(pp.translations)) for (const t of pp.translations) handleTranslation(vid, t);
  }
});

for (const sub of fs.readdirSync(ROOT)) {
  const dir = path.join(ROOT, sub);
  if (!fs.statSync(dir).isDirectory()) continue;
  console.log('Klasör işleniyor:', sub);
  importDir(dir);
}

// Arama için FTS5 dizinleri
db.exec(`
DROP TABLE IF EXISTS fts_questions;
CREATE VIRTUAL TABLE fts_questions USING fts5(text, question_id UNINDEXED, lang UNINDEXED, tokenize='unicode61 remove_diacritics 2');
INSERT INTO fts_questions (text, question_id, lang) SELECT text, question_id, lang FROM question_texts;
DROP TABLE IF EXISTS fts_meals;
CREATE VIRTUAL TABLE fts_meals USING fts5(text, verse_id UNINDEXED, lang UNINDEXED, tokenize='unicode61 remove_diacritics 2');
INSERT INTO fts_meals (text, verse_id, lang) SELECT text, verse_id, lang FROM meals;
`);

console.log('JSON aktarımı tamamlandı:', counts);
console.log('Yazar sayısı:', db.prepare('SELECT COUNT(*) n FROM authors').get().n);
db.close();
