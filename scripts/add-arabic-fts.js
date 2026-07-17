/**
 * Mevcut data/kuranasor.db'ye Arapça (harekesiz) tam metin arama dizini ekler.
 * Kaynak dump'lara ihtiyaç duymaz, doğrudan verses.arabic_plain üzerinden çalışır.
 * Kullanım: node scripts/add-arabic-fts.js
 */
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'data', 'kuranasor.db'));

db.exec(`
DROP TABLE IF EXISTS fts_arabic;
CREATE VIRTUAL TABLE fts_arabic USING fts5(text, verse_id UNINDEXED, tokenize='unicode61 remove_diacritics 2');
INSERT INTO fts_arabic (text, verse_id) SELECT arabic_plain, id FROM verses WHERE arabic_plain IS NOT NULL;
`);

const n = db.prepare('SELECT COUNT(*) n FROM fts_arabic').get().n;
console.log('Arapça arama dizini oluşturuldu:', n, 'ayet');
db.close();
