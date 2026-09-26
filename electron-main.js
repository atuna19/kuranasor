"use strict";

/* Beklenmeyen bir çökme sessizce "uygulama hiç açılmadı" gibi görünmesin diye
   konsola yazılır — arkadaşın bir sorun bildirdiğinde teşhis için işe yarar. */
process.on("uncaughtException", function (err) { console.error("Beklenmeyen hata:", err); });
process.on("unhandledRejection", function (err) { console.error("Beklenmeyen hata (promise):", err); });

const { app, BrowserWindow, ipcMain, Menu } = require("electron");
app.on("render-process-gone", function (e, wc, details) { console.error("Pencere çöktü:", JSON.stringify(details)); });
app.on("child-process-gone", function (e, details) { console.error("Alt süreç çöktü:", JSON.stringify(details)); });
const path = require("path");
const fs = require("fs");
const http = require("http");
const lisans = require("./lisans.js");

/* Kullanıcı verisi klasörünü sabitle. Geliştirme sürümünde proje klasörünün
   yanında tutulur (hepsi bir arada, kolay bulunur). Paketlenmiş sürümde AYNI
   şeyi kurulum klasöründe DENEME — kurulum "Program Files" altına giderse
   (NSIS varsayılanı budur) normal, yönetici olmayan bir açılışta oraya yazma
   izni olmaz ve uygulama pencere bile açmadan sessizce kapanır. Bu yüzden
   paketlenmiş sürüm her zaman standart, her zaman yazılabilir AppData'yı kullanır. */
function veriKokDizini() {
  return app.isPackaged ? app.getPath("appData") : __dirname;
}
app.setPath("userData", path.join(veriKokDizini(), "kuranasor-veri"));

/* Öneri/geri bildirim kutusunu canlı siteye de iletmek istersen buraya kuranasor.com
   adresini yaz (örn. "https://kuranasor.onrender.com"). Boş bırakılırsa öneriler
   yalnız arkadaşın kendi bilgisayarında kalır, sana ulaşmaz. */
const UPSTREAM_SYNC_URL = "";

const PORT = 47601;
let win = null;
let kapi = null;
let sunucuBaslatildi = false;

/* ---------- lisans ---------- */
function lisansYolu() { return path.join(app.getPath("userData"), "lisans.json"); }

function lisansOku() {
  try {
    const k = JSON.parse(fs.readFileSync(lisansYolu(), "utf8"));
    return lisans.anahtarDogrula(k.anahtar);
  } catch (e) {
    return { gecerli: false, sebep: null };        /* hiç etkinleştirilmemiş */
  }
}

ipcMain.handle("lisans:durum", function () {
  const d = lisansOku();
  return {
    kimlik: lisans.makineKimligi(), surum: app.getVersion(),
    gecerli: d.gecerli, sebep: d.sebep || null
  };
});

ipcMain.handle("lisans:etkinlestir", function (e, anahtar) {
  const d = lisans.anahtarDogrula(anahtar);
  if (!d.gecerli) return { ok: false, sebep: d.sebep };
  try {
    fs.mkdirSync(path.dirname(lisansYolu()), { recursive: true });
    fs.writeFileSync(lisansYolu(), JSON.stringify(
      { anahtar: String(anahtar).toUpperCase().trim(), tarih: new Date().toISOString() }, null, 2), "utf8");
  } catch (err) {
    return { ok: false, sebep: "Lisans kaydedilemedi: " + String(err.message || err) };
  }
  setTimeout(function () {
    if (kapi && !kapi.isDestroyed()) kapi.destroy();
    kapi = null;
    baslatVeAc();
  }, 900);
  return { ok: true, sonTarih: d.sonTarih || null };
});

ipcMain.handle("lisans:cik", function () { app.quit(); });

function lisansKapisiAc() {
  kapi = new BrowserWindow({
    width: 620, height: 720, resizable: false, backgroundColor: "#faf7f0",
    title: "Kuran'a Sor · Etkinleştirme",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "lisans-preload.js"),
      contextIsolation: true, nodeIntegration: false
    }
  });
  Menu.setApplicationMenu(null);
  kapi.loadFile(path.join(__dirname, "lisans.html"));
  kapi.on("closed", function () { kapi = null; if (!win) app.quit(); });
}

/* ---------- yerel sunucu + ana pencere ---------- */

/* server.js kendi içinde app.listen çağırıyor ama bize hazır olduğuna dair bir sinyal
   vermiyor (tek dosyalık, export'suz script) — bu yüzden yerelde port yanıt verene kadar
   kısa aralıklarla yokluyoruz. İlk kurulumda büyük veritabanı açılırken (168 MB) bu birkaç
   saniye sürebilir; pencere "show:false" ile açılıp içerik hazır olunca gösterilir. */
function sunucuBekleVeAc(deneme) {
  deneme = deneme || 0;
  const istek = http.get({ host: "127.0.0.1", port: PORT, path: "/", timeout: 1500 }, function (res) {
    res.resume();
    anaPencereAc();
  });
  istek.on("error", function () {
    if (deneme > 200) { anaPencereAc(); return; }   /* ~30sn sonra yine de açmayı dene */
    setTimeout(function () { sunucuBekleVeAc(deneme + 1); }, 150);
  });
  istek.on("timeout", function () { istek.destroy(); });
}

function anaPencereAc() {
  win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1080, minHeight: 700,
    show: false,
    backgroundColor: "#faf7f0",
    title: "Kuran'a Sor",
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", function () { win.show(); });
  win.loadURL("http://127.0.0.1:" + PORT + "/");
  win.on("closed", function () { win = null; });
}

function baslatVeAc() {
  if (!sunucuBaslatildi) {
    sunucuBaslatildi = true;
    process.env.PORT = String(PORT);
    process.env.DATA_DIR = path.join(app.getPath("userData"), "data");
    /* Paketlenmemiş (geliştirme) sürümde server.js'in kendi varsayılanı
       (proje kökündeki data/kuranasor.db.gz) kullanılsın — yol override edilmez. */
    if (app.isPackaged) {
      process.env.DB_GZ_PATH = path.join(process.resourcesPath, "veri", "kuranasor.db.gz");
    }
    /* Arkadaşlara giden sürümde şifre ayarlanmaz → /yonet otomatik kapalı kalır. */
    process.env.ADMIN_PASSWORD = "";
    process.env.UPSTREAM_SYNC_URL = UPSTREAM_SYNC_URL;
    require("./server.js");
  }
  sunucuBekleVeAc();
}

/* Tek örnek kilidi — iki pencere aynı yerel sunucuyu paylaşmasın. */
const kilit = app.requestSingleInstanceLock();
if (!kilit) {
  app.quit();
} else {
  app.on("second-instance", function () {
    const p = win || kapi;
    if (p && !p.isDestroyed()) { if (p.isMinimized()) p.restore(); p.focus(); }
  });
}

app.whenReady().then(function () {
  if (!kilit) return;
  if (lisansOku().gecerli) baslatVeAc(); else lisansKapisiAc();
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (lisansOku().gecerli) baslatVeAc(); else lisansKapisiAc();
    }
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
