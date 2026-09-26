/* Masaüstü paketine girecek veritabanını hazırlar.
 *
 * Neden ayrı bir adım: WAL modunda değişiklikler bazen ana .db dosyasına değil
 * -wal dosyasına yazılı kalıyor; checkpoint yapılmadan sıkıştırılırsa güncel
 * olmayan veri pakete girer (Render deploy'unda bir kez yaşandı). Bu betik önce
 * checkpoint'i zorluyor, sonra güncel veriyi sıkıştırıp veri-dagitim/ klasörüne yazıyor.
 *
 * Kullanım: node veri-hazirla.js   (build script'i bunu otomatik çalıştırır)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const Database = require("better-sqlite3");

const KAYNAK = path.join(__dirname, "data", "kuranasor.db");
const HEDEF_DIZIN = path.join(__dirname, "veri-dagitim");
const HEDEF = path.join(HEDEF_DIZIN, "kuranasor.db.gz");

if (!fs.existsSync(KAYNAK)) {
  console.error("data/kuranasor.db bulunamadı. Önce yerel sunucuyu bir kez çalıştırıp veritabanını oluştur.");
  process.exit(1);
}

const db = new Database(KAYNAK);
db.pragma("wal_checkpoint(TRUNCATE)");
db.pragma("journal_mode = DELETE");
db.close();

fs.mkdirSync(HEDEF_DIZIN, { recursive: true });
const sikistirilmis = zlib.gzipSync(fs.readFileSync(KAYNAK));
fs.writeFileSync(HEDEF, sikistirilmis);

const kaynakBoyut = fs.statSync(KAYNAK).size;
console.log("veri-dagitim/kuranasor.db.gz yazıldı");
console.log("  kaynak     : " + (kaynakBoyut / 1024 / 1024).toFixed(1) + " MB");
console.log("  sıkıştırılmış : " + (sikistirilmis.length / 1024 / 1024).toFixed(1) + " MB");
