/* better-sqlite3'ün native (derlenmiş) dosyası ya normal Node'a ya da Electron'a
 * göre olabilir, ikisi aynı anda geçerli olamaz. Bu iki sürüm aynı node_modules'u
 * paylaştığı için (yerel web sunucu Node ile, masaüstü uygulaması Electron ile
 * çalışıyor), hangisi kullanılacaksa o an İHTİYAÇ olan dosya buraya kopyalanır.
 *
 * İlk çalıştırmada ilgili sürüm indirilip .native-cache/ içine saklanır; sonraki
 * çalıştırmalar sadece dosya kopyalar (hızlı, internet gerekmez).
 *
 * Kullanım: node scripts/native-hedef.js node       (yerel sunucu / BASLAT.bat için)
 *           node scripts/native-hedef.js electron   (masaüstü uygulaması için)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const HEDEF = process.argv[2];
if (HEDEF !== "node" && HEDEF !== "electron") {
  console.error("Kullanım: node scripts/native-hedef.js <node|electron>");
  process.exit(1);
}

const KOK = path.join(__dirname, "..");
const ONBELLEK = path.join(KOK, ".native-cache", HEDEF + ".node");
const RELEASE = path.join(KOK, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");

fs.mkdirSync(path.dirname(ONBELLEK), { recursive: true });

if (fs.existsSync(ONBELLEK)) {
  fs.copyFileSync(ONBELLEK, RELEASE);
} else {
  console.log("better-sqlite3 (" + HEDEF + " için) ilk kez hazırlanıyor, birkaç saniye sürebilir…");
  const hedefSurum = HEDEF === "node"
    ? process.versions.node
    : require(path.join(KOK, "node_modules", "electron", "package.json")).version;
  execFileSync(
    "npx",
    ["prebuild-install", "--runtime=" + HEDEF, "--target=" + hedefSurum, "--arch=x64", "--platform=win32"],
    { cwd: path.join(KOK, "node_modules", "better-sqlite3"), stdio: "inherit", shell: true }
  );
  fs.copyFileSync(RELEASE, ONBELLEK);
}
