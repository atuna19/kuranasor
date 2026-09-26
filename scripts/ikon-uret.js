/* Onaylanan "KS Nişanı" maketini gerçek .ico dosyasına çevirir.
 * Tasarım kaynağı: logo maketi sayfasındaki KS Nişanı SVG'si (200x200 viewBox,
 * yeşil zemin #1a4433, Fraunces 600 "KS" #d9b769, font-size 86, y 128).
 * Aynı oranlar burada 1024px'e ölçeklenip build/icon.ico üretiliyor.
 *
 * Kullanım: node scripts/ikon-uret.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const pngToIco = require("png-to-ico").default;

const KOK = path.join(__dirname, "..");
const BUILD = path.join(KOK, "build");
const OLCEK = 1024;
const OLCEK_ORANI = OLCEK / 200; // orijinal maket 200x200 viewBox'a göre tasarlandı

GlobalFonts.registerFromPath(path.join(BUILD, "Fraunces-600.woff2"), "Fraunces KS");

function tileCiz(boyut) {
  const c = createCanvas(boyut, boyut);
  const ctx = c.getContext("2d");
  const olcek = boyut / 200;

  // yuvarlatılmış kare zemin (maketteki %23 köşe oranı)
  const r = boyut * 0.23;
  ctx.fillStyle = "#1a4433";
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(boyut - r, 0);
  ctx.quadraticCurveTo(boyut, 0, boyut, r);
  ctx.lineTo(boyut, boyut - r);
  ctx.quadraticCurveTo(boyut, boyut, boyut - r, boyut);
  ctx.lineTo(r, boyut);
  ctx.quadraticCurveTo(0, boyut, 0, boyut - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#d9b769";
  ctx.font = Math.round(86 * olcek) + "px 'Fraunces KS'";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = (-2 * olcek).toFixed(1) + "px";
  ctx.fillText("KS", 100 * olcek, 128 * olcek);

  return c.toBuffer("image/png");
}

fs.mkdirSync(BUILD, { recursive: true });

// Windows .ico için katmanlar
const boyutlar = [16, 24, 32, 48, 64, 128, 256];
const pngler = boyutlar.map(tileCiz);

// en büyük boyutu ayrıca ayrı PNG olarak da bırak (ileride başka kullanım için)
fs.writeFileSync(path.join(BUILD, "icon.png"), tileCiz(OLCEK));

pngToIco(pngler).then(function (buf) {
  fs.writeFileSync(path.join(BUILD, "icon.ico"), buf);
  console.log("build/icon.ico yazıldı (" + boyutlar.join(", ") + "px katmanlı)");
  console.log("build/icon.png yazıldı (1024px, referans)");
}).catch(function (err) {
  console.error("Hata:", err);
  process.exit(1);
});
