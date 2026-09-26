# Kuran'a Sor — Sistem Analiz Raporu

**Tarih:** 26 Eylül 2026
**Kapsam:** `atuna19/kuranasor` deposunun tamamı (`2a9fadf` commit'i): sunucu, ön yüz, veritabanı, içe aktarma script'leri, dağıtım dosyaları ve git geçmişi.
**Yöntem:** Kaynak kodun tamamı satır satır okundu. Veritabanı açılıp sorgulandı. Uygulama yerelde çalıştırıldı ve bütün API uç noktaları gerçek isteklerle ölçüldü. Güvenlik senaryoları elle denendi. Ön yüz, başsız (headless) Chromium ile 375 px (mobil) ve 1280 px (masaüstü) genişlikte açılıp kontrol edildi. Testlerin hepsi geçici bir kopya üzerinde yapıldı; depodaki veri dosyalarına dokunulmadı.

---

## 1. Yönetici Özeti

Kuran'a Sor; ayetlere sorulan sorulara başka ayetlerle cevap veren, ayetler arası bağlantıları etkileşimli bir ağ olarak gösteren bir web uygulaması. Mimarisi bilinçli olarak sade tutulmuş: tek bir Node.js/Express süreci, salt okunur bir SQLite veritabanı ve framework kullanmayan bir tek sayfa uygulama (SPA). Bu sadelik projenin en güçlü yanı. Uygulama hızlı (ölçülen API yanıtlarının hemen hepsi 50 ms'nin altında), az bellek kullanıyor (~83 MB RSS) ve tek komutla ayağa kalkıyor.

En önemli riskler kod karmaşıklığından değil, **erişim kontrolü** ve **veri kalıcılığı** tarafındaki eksiklerden geliyor:

| # | Konu | Önem |
|---|---|---|
| 1 | Ziyaretçi önerileri (ad + metin) **şifresiz**, herkese açık bir uç noktadan (`GET /api/feedback`) ve `/oneriler` sayfasından okunabiliyor | 🔴 Yüksek |
| 2 | Yönetici girişinde deneme sınırı (rate limit) yok; şifre kaba kuvvetle denenebilir | 🔴 Yüksek |
| 3 | Yöneticinin eklediği sorular tohum veritabanına yazılıyor: ücretsiz Render planında her yeniden başlatmada siliniyor, kalıcı diskte ise yeni veri sürümleri hiç uygulanmıyor | 🔴 Yüksek |
| 4 | ~~Soru sayfalarında aynı cevap ayeti iki kez listelenebiliyor (Türkçede 714 soru, 1.272 yinelenen bağlantı)~~ ✅ Düzeltildi | 🟠 Orta |
| 5 | Mobilde (375 px) üst menü taşıyor; "Hakkında" linki ve dil seçici ekranın dışında kalıyor | 🟠 Orta |
| 6 | Git geçmişi 166 MB'a ulaşmış; ayrıca geçmişte başka bir projeye ait, Supabase anahtarı içeren bir dosya duruyor | 🟠 Orta |
| 7 | Test, lint ve CI hiç yok | 🟠 Orta |

Bulguların çoğu birkaç satırlık değişiklikle giderilebilir. Önceliklendirilmiş yol haritası [Bölüm 10](#10-önceliklendirilmiş-yol-haritası)'da.

---

## 2. Sisteme Genel Bakış

### 2.1 Teknoloji yığını

| Katman | Teknoloji | Not |
|---|---|---|
| Çalışma ortamı | Node.js ≥ 18 (Docker'da `node:20-bookworm-slim`) | |
| Web sunucusu | Express 5.2 | Tek dosya: `server.js` (664 satır) |
| Veritabanı | SQLite (better-sqlite3 12.11, senkron API) | FTS5 tam metin arama |
| Ön yüz | Vanilla JS SPA | `public/app.js` (1.032 satır), `style.css` (281 satır) |
| Dağıtım | Dockerfile + `render.yaml` (Render ücretsiz plan) | Windows için `BASLAT.bat` / `PAYLAS.bat` |
| Bağımlılıklar | Yalnızca 2 doğrudan bağımlılık | Oldukça az, iyi |

### 2.2 Mimari

```
 Tarayıcı (SPA, History API router)
   │  fetch /api/*?lang=tr|az|en|de
   ▼
 Express (server.js)
   ├── Salt okunur bağlantı  (db)  ──┐
   ├── Yazılabilir bağlantı  (wdb) ──┼──► data/kuranasor.db   (168 MB, tohum veri + yönetici eklemeleri)
   └── Öneri bağlantısı      (fdb) ──┴──► data/feedback.db    (ziyaretçi önerileri)
                                         ▲
             ilk açılışta gunzip ────────┘  data/kuranasor.db.gz (57 MB, git'te)
```

- Sunucu açılışta `kuranasor.db` yoksa `.gz` dosyasını **senkron** olarak açıyor (`server.js:49-54`).
- Sorguların tamamı açılışta `prepare` ediliyor. Bu hem performans hem SQL enjeksiyonu açısından iyi bir uygulama; kullanıcı girdisi hiçbir yerde SQL metnine eklenmiyor.

### 2.3 Dizin yapısı ve boyutlar

| Yol | Satır / Boyut | Görev |
|---|---|---|
| `server.js` | 664 satır | API, yönetici paneli API'si, statik sunum |
| `public/app.js` | 1.032 satır | Router, 9 sayfa, ayet ağı (kuvvet yönelimli yerleşim), yönetici paneli |
| `public/style.css` | 281 satır | Tek tema, 3 medya sorgusu |
| `scripts/import-sql.js` | 295 satır | MySQL dump → SQLite |
| `scripts/import-json.js` | 122 satır | Ek meal/dipnot/ses verisi + FTS dizinleri |
| `scripts/add-arabic-fts.js` | 19 satır | Arapça FTS dizini |
| `mockups/` | 5 HTML | Tasarım taslakları (deploy edilmiyor) |
| `data/kuranasor.db.gz` | 57 MB | Tohum veritabanı |
| `.git` | **166 MB** | Bkz. §8.3 |

### 2.4 Özellikler (koddan çıkarılan)

- Sure listesi, sure okuma (Arapça aç/kapa, sesli meal), ayet sayfası (29 meal karşılaştırma, dipnotlar, okunuş)
- Ayete sorulan sorular ve yalnızca ayetlerle verilen cevaplar; kısmi alıntı vurgulama (`<mark>`)
- Arama: kelime ve tam ifade (FTS5, önek destekli), Arapça harekesiz arama, `2:255` / `Bakara` / `2` kısayolları
- Ayet ağı: derinlik 1/2, soruları gizleme, sürükleme, yakınlaştırma, tam ekran, "en bağlantılı ayetler" keşif sayfası
- Okuma konumunu hatırlama (`localStorage`), ←/→ ile ayet gezinme
- Ziyaretçi önerisi ve soru-cevap önerisi; şifreli yönetici paneli (`/yonet`)
- 4 içerik dili (tr/az/en/de); arayüz metinleri ise yalnızca Türkçe

---

## 3. Veri Modeli ve Veri Kalitesi

### 3.1 Tablolar

| Tablo | Satır | Açıklama |
|---|---:|---|
| `verses` | 6.236 | Arapça, harekesiz Arapça, okunuş, sayfa, cüz |
| `meals` | 24.944 | 4 dil × 6.236 |
| `surahs` / `surah_names` | 114 / 456 | |
| `questions` / `question_texts` | 7.741 / 30.964 | 4 dilde |
| `question_verses` | 131.948 | Sorunun sorulduğu ayet (4 dil × 32.987) |
| `answers` | 541.284 | Cevap ayetleri (4 dil × 135.321) |
| `authors` / `author_translations` / `footnotes` | 29 / 180.835 / 16.450 | Meal karşılaştırma |
| `fts_questions` / `fts_meals` / `fts_arabic` | 30.964 / 24.944 / 6.236 | FTS5 dizinleri |
| `submitted_questions` / `question_ratings` / `languages` | 139 / 42 / 40 | **Uygulamada kullanılmıyor** |

Olumlu yanlar: JSON vurgu alanlarının hepsi geçerli JSON (`json_valid` ile 0 hata). Cevap ayetlerinde `surah_no`/`ayah_no` ile `verse_id` her kayıtta tutarlı. Her ayetin Türkçe meali ve okunuşu mevcut.

### 3.2 Veri kalitesi bulguları

| Bulgu | Ölçüm | Etkisi |
|---|---|---|
| **Yinelenen cevap bağlantıları** | Türkçede 714 soruda 1.272 (soru, ayet) çifti birden fazla kez kayıtlı; tüm dillerde 5.088 | `qAnswers` sorgusu (`server.js:211-220`) tekilleştirme yapmadığından soru sayfasında aynı ayet iki kez görünüyor. Örnek: 14 numaralı soruda 20 cevap var, bunların yalnızca 19'u farklı ayet. `question_verses` için tekilleştirme daha önce yapılmış (`6a47bc0`), `answers` için yapılmamış. ✅ **Düzeltildi:** `dedupeAnswers()` ile sunucu tarafında teke indiriliyor. |
| **Ana sayfa ile Keşfet sayfası farklı sayı gösteriyor** | Ana sayfa 135.323 bağlantı, Keşfet 133.897 | `qStats` yinelenenler dahil sayıyor, `/api/hubs` ise `DISTINCT` kullanıyor. ✅ **Düzeltildi:** iki sayfa da artık 133.897 gösteriyor. |
| Sahipsiz cevap kayıtları | Sorusu olmayan 224 `answers` satırı | Görünmüyor ama veri kirliliği. |
| Metni olmayan kaynak kayıtları | 116 `question_verses` satırı | Aynı durum. |
| Cevapsız sorular | 29 Türkçe soru | Sayfada "cevap bağlantısı bulunamadı" çıkıyor. |
| Kaynak ayeti olmayan sorular | 1.582 Türkçe soru | Yalnızca arama ve ağ üzerinden erişilebiliyor; kod bu durumu doğru ele alıyor (`noSource`). |
| **Değerlerin başında boşluk** | Örn. `' 59:22'`, `' tr'`, highlight `' ["…"]'` | Kök neden: `import-sql.js`'deki `TupleParser`, tırnaktan önceki boşluğu değere ekliyor (satır 159/164). Kodun her yerindeki `.trim()` çağrıları ve `TRIM(a.name)` bu yüzden var. Tek noktada düzeltilirse ön yüzdeki savunmacı kod sadeleşir. |
| Kullanılmayan tablolar | `submitted_questions` (139 ziyaretçi sorusu, tarihleriyle), `question_ratings`, `languages` | Tohum veritabanıyla birlikte depoda dağıtılıyor. Kişisel veri azaltma ilkesi açısından çıkarılmaları iyi olur. |

---

## 4. Sunucu ve API Analizi

### 4.1 Uç noktalar ve ölçülen yanıt süreleri

Yerel ölçüm, tek istek, sıcak önbellek:

| Uç nokta | Süre | Boyut | Yetki |
|---|---:|---:|---|
| `GET /api/surahs` | 40 ms | 7 KB | Herkes |
| `GET /api/surah/2` | 7 ms | **180 KB** (sıkıştırmasız) | Herkes |
| `GET /api/verse/2/255` | 3 ms | 19 KB | Herkes |
| `GET /api/question/:id` | 5 ms | 22 KB | Herkes |
| `GET /api/search?q=Allah` | 18 ms | 13 KB | Herkes |
| `GET /api/graph/verse/2/255?depth=2` | 4 ms | 78 KB | Herkes |
| `GET /api/hubs` (ilk / önbellekten) | 327 ms / 2 ms | 8 KB | Herkes |
| `GET /api/feedback` | 1 ms | — | **Herkes (sorun)** |
| `POST /api/feedback`, `POST /api/suggest` | — | — | Herkes, sınırsız |
| `POST /api/admin/login` | — | — | Herkes, sınırsız deneme |
| `/api/admin/*` | — | — | Bearer token |

### 4.2 İyi uygulamalar

- Tüm SQL sorguları parametreli ve önceden hazırlanmış. SQL enjeksiyonu riski yok.
- FTS sorgu girdisi temizleniyor (`'"()*^` karakterleri siliniyor, en fazla 8 kelime) ve `try/catch` içinde çalışıyor. `NEAR(...)`, tek `"` gibi kötü niyetli girdiler hataya yol açmadı.
- Tanımsız `/api/*` yolları SPA'ya düşmek yerine JSON 404 döndürüyor.
- Ağ uç noktasında düğüm sınırı var (CAP 150/260). Merkez ayetin soruları öncelikli ekleniyor.
- `express.json()` varsayılan 100 KB sınırı çalışıyor (200 KB gövde → 413). Çok uzun sorgu dizesi Node tarafından 431 ile reddediliyor.
- Öneri `page` alanı site içi yollarla sınırlanmış.

### 4.3 Sorunlar

1. **Yönetici eklemeleri tohum veritabanına yazılıyor** (`server.js:62`, `wdb`). Sonuçları:
   - Render ücretsiz planda disk kalıcı olmadığı için yönetici panelinden eklenen **her soru yeniden başlatmada kayboluyor**. README bunu yalnızca `feedback.db` için söylüyor.
   - Kalıcı disk kullanılırsa sunucu, `kuranasor.db` varsa `.gz`'yi bir daha açmıyor (`server.js:49`). Yeni veri sürümleri (örneğin `7449839`'daki 5:20 düzeltmesi) **canlıya hiç ulaşmıyor**. Veritabanını silip yenilemek ise yönetici eklemelerini siliyor.
   - Öneri: Yönetici içeriğini ayrı bir `admin.db` dosyasına (feedback.db gibi) koymak ve sorgularda iki kaynağı birleştirmek ya da SQLite `ATTACH` kullanmak. En azından tohum dosyasına sürüm numarası verip değiştiğinde yeniden açmak.
2. **Önbellek geçersiz kılınmıyor:** `hubCache` (`server.js:464`) yönetici soru eklediğinde/sildiğinde güncellenmiyor. Test: soru eklendikten sonra `totalLinks` değişmedi.
3. **Yönetici girdisi doğrulaması zayıf** (`server.js:607-620`): `highlight` alanına nesne verilebiliyor (`{"x":1}` kabul edilip `[{"x":1}]` olarak kaydedildi). Aynı cevap ayeti iki kez eklenebiliyor. Dizi uzunluğu sınırsız.
4. **Kullanılmayan alt sorgu:** `qVerseQuestions.answer_count` (`server.js:172`) hesaplanıyor ama ön yüzde kullanılmıyor. Ayrıca `is_active` filtresi içermiyor.
5. **Belirsiz sıralama:** `qIncomingQuestions` `LIMIT 30` kullanıyor ama `ORDER BY` yok (`server.js:350-356`). Ağda hangi 30 sorunun gösterileceği SQLite'ın iç sırasına kalmış.
6. **Kodda sabitlenmiş iş kuralı:** `TRIM(a.name) NOT LIKE 'Edip Yüksel%'` (`server.js:182`). Türkçe ve Azerice kayıtlar filtreleniyor, İngilizce `Edip-Layth` ise görünüyor. Bilinçli değilse tutarsız; bilinçliyse `authors` tablosunda bir `hidden` bayrağıyla yönetilmesi daha doğru olur.
7. **Hata sayfası:** Bozuk JSON gövdesi gönderildiğinde Express varsayılan HTML hata sayfasını döndürüyor. `NODE_ENV` production değilse (yerel/BASLAT.bat) bu sayfa yığın izini ve dosya yollarını da gösteriyor. Docker imajında `NODE_ENV=production` ayarlı olduğu için canlıda yığın izi görünmez. Yine de JSON dönen bir hata işleyicisi eklenmeli.
8. **`.env` yükleyici** satır sonundaki boşlukları değere dahil ediyor (`server.js:18`, açgözlü `(.*)`). `ADMIN_PASSWORD=abc ` gibi bir satır sessizce yanlış şifreye yol açar.
9. **Açılışta senkron gunzip:** İlk açılışta 168 MB bellekte açılıp yazılıyor. Docker'da build aşamasında yapıldığı için sorun değil; kalıcı disk senaryosunda ilk istek gecikir.
10. **Belgelenmemiş ortam değişkenleri:** `ADMIN_PASSWORD`, `DB_GZ_PATH`, `UPSTREAM_SYNC_URL` README'deki tabloda yok. Son ikisi depoda bulunmayan bir "masaüstü paketi"ne atıf yapıyor.

---

## 5. Ön Yüz Analizi

### 5.1 İyi uygulamalar

- Bütün dinamik metin `esc()` ile kaçışlanıyor. `markText` vurgu parçalarını önce kaçışlayıp sonra sarıyor, `replace`'e fonksiyon vererek `$` desen tuzağından kaçınıyor. İncelemede XSS açığı bulunmadı.
- Yarış durumlarına karşı `loadToken`/`panelToken` kullanılıyor; eski istek yenisinin üzerine çizilmiyor.
- Ctrl/orta tık ile "yeni sekmede aç" davranışı korunuyor. Klavye ile ayet gezinme, form alanlarında devre dışı kalıyor.
- Ağ yerleşimi harici kütüphane olmadan yazılmış (O(n²·260), n ≤ 260 için kabul edilebilir).

### 5.2 Sorunlar

| Sorun | Konum | Açıklama |
|---|---|---|
| **Mobilde menü taşması** | `style.css:16` | 375 px genişlikte sayfa 483 px'e çıkıyor (yatay kaydırma). "Hakkında" kesiliyor, dil seçici görünmüyor. `nav` için medya sorgusu yok (`padding:18px 44px`, `gap:28px`). *(Not: Test ortamında Google Fonts yüklenemedi, yedek font kullanıldı. Taşma gerçek fontla da büyük olasılıkla sürer.)* |
| `/oneriler` herkese açık | `app.js:1024`, `907` | Tüm ziyaretçi önerileri (ad dahil) listeleniyor. Yönetici paneline taşınmalı (bkz. §6). |
| Arayüz yalnızca Türkçe | tümü | Dil seçici içerik dilini değiştiriyor ama menü, butonlar ve başlıklar Türkçe kalıyor. EN/DE kullanıcısı için karışık bir deneyim. |
| Sabit sayı | `app.js:86` | `stats.verses + 112` besmele sayısı kodda sabit. |
| Keşfet'te her metne "…" | `app.js:695` | 140 karakterden kısa meallerde de üç nokta ekleniyor. |
| Öneri kutusundaki `f.page` | `app.js:922` | Sunucu `/\evil.com` biçimini kabul ediyor (`/` ile başlıyor, `//` ile değil). Tarayıcı bunu `//evil.com` olarak yorumlar ve orta tıkla dış siteye gidilir. Düşük risk; `/\` de reddedilmeli. |
| `?ayet=` parametresi seçiciye doğrudan giriyor | `app.js:159` | `?ayet="]` gibi bir değer `querySelector` hatasına yol açıyor ve sayfa "Bir hata oluştu" gösteriyor. XSS değil, ama sayısal doğrulama yapılmalı. |
| SEO | `index.html:6` | Tüm sayfaların başlığı "Kuran'a Sor". Meta açıklama, Open Graph, sitemap ve sunucu tarafı içerik yok. 6.236 ayet sayfası arama motorları için pratikte görünmez. |
| Erişilebilirlik | `app.js:83` vb. | Öneri çipleri `<span>` olduğu için klavyeyle seçilemiyor. Ağ görselleştirmesi klavye/ekran okuyucu ile kullanılamıyor. Sadece ikondan oluşan butonlarda (`+`, `−`, `⌂`) `aria-label` yok. |
| Harici font | `index.html:8` | Google Fonts'tan yükleniyor. KVKK/GDPR açısından ziyaretçi IP'si üçüncü tarafa gidiyor; fontlar kendi sunucunuzdan servis edilebilir. |

---

## 6. Güvenlik Analizi

| # | Bulgu | Önem | Kanıt | Öneri |
|---|---|---|---|---|
| G1 | **Öneriler herkese açık** | 🔴 Yüksek | `server.js:533-535` doğrulamasız. Test: `POST` ile gönderilen ad ve metin, anonim `GET /api/feedback` ile geri okundu. | `requireAdmin` ekleyin, `/oneriler` sayfasını yönetici paneline taşıyın. |
| G2 | **Giriş denemesi sınırsız** | 🔴 Yüksek | 20 ardışık hatalı deneme engellenmeden 401 döndü. | IP başına deneme sınırı (ör. 5/dk, `express-rate-limit`), artan bekleme süresi. Render arkasında `app.set('trust proxy', 1)`. |
| G3 | Şifre karşılaştırması sabit zamanlı değil | 🟡 Düşük | `server.js:92` (`!==`) | `crypto.timingSafeEqual` ile (hash üzerinden) karşılaştırın. |
| G4 | Token'ların süresi dolmuyor, çıkış yok | 🟡 Düşük | `server.js:88` (bellekte `Set`) | Token'a son kullanma süresi (ör. 12 saat) ve `/api/admin/logout` ekleyin. |
| G5 | Öneri/soru önerisi uç noktalarında spam koruması yok | 🟠 Orta | 30 ardışık `POST /api/suggest` hepsi 200 döndü. | Rate limit ve basit bir honeypot alanı. `feedback.db` sınırsız büyüyebilir. |
| G6 | `UPSTREAM_SYNC_URL` ayarlıysa açık aktarıcı | 🟡 Düşük | `server.js:39-46` | Masaüstü kopyasına gelen her istek canlıya aktarılıyor; G5 ile birleşince spam çoğaltıcı olur. Aktarımı da sınırlandırın. |
| G7 | Güvenlik başlıkları yok | 🟡 Düşük | Yanıtta `X-Powered-By: Express` var; CSP, `X-Content-Type-Options`, `Referrer-Policy` yok. | `app.disable('x-powered-by')` ve `helmet` (CSP'de Google Fonts'a izin vererek). |
| G8 | Git geçmişinde başka projeye ait dosya | 🟠 Orta | `95f398d` ve `8395225` commit'lerinde yüklenip silinen `dashboard.html` ("ELITE GPS", ~19 bin satır). İçinde Supabase proje adresi ve **anon** rolünde bir anahtar var. | Anon anahtarı herkese açık olacak şekilde tasarlanmıştır. Yine de ilgili Supabase projesinde tüm tablolarda **RLS'in açık olduğunu doğrulayın**. Depo herkese açıksa anahtarı yenilemeyi ve dosyayı geçmişten temizlemeyi (`git filter-repo`) değerlendirin. |
| G9 | Bağımlılık açığı | 🟡 Düşük | `npm audit`: `qs` (Express'in dolaylı bağımlılığı) orta seviye, 2 advisory | `npm audit fix`. |
| G10 | Docker imajı root kullanıcıyla çalışıyor | 🟡 Düşük | `Dockerfile` içinde `USER` yok | `USER node` ekleyin (`/data` izinleriyle birlikte). |

Olumlu: SQL enjeksiyonu yok, XSS bulunmadı, `.env` git'e dahil değil, yönetici silme işlemi yalnızca yönetici eklemelerine izin veriyor (`id >= 9000000`).

---

## 7. Performans

- **Sunucu:** Uç noktaların neredeyse hepsi 20 ms'nin altında. `/api/surahs` her istekte 40 ms'lik bir `COUNT(DISTINCT …)` alt sorgusu çalıştırıyor. Veri salt okunur olduğu için `hubs` gibi dil başına önbelleğe alınabilir.
- **Sıkıştırma yok:** `Accept-Encoding: gzip` gönderildiğinde bile `/api/surah/2` 180 KB düz metin olarak geliyor. `compression` ara katmanı eklenirse (ya da Render/CDN tarafında sıkıştırma açılırsa) bu boyut yaklaşık %80 düşer. Mobil kullanıcılar için önemli.
- **HTTP önbellek başlığı yok:** API yanıtlarında `Cache-Control` yok, statik dosyalarda `max-age=0`. İçerik nadiren değiştiği için API'ye `Cache-Control: public, max-age=3600`, statik dosyalara sürümlü isim ile uzun süreli önbellek verilebilir.
- **Bellek:** Çalışırken yaklaşık 83 MB RSS. Render ücretsiz planın 512 MB sınırının rahatça altında.
- **İstemci:** Derinlik 2 ağında (≤260 düğüm) yerleşim hesabı ana iş parçacığında ~9 milyon işlem yapıyor. Masaüstünde fark edilmez, düşük seviye telefonlarda kısa bir takılma olabilir. İleride Web Worker'a taşınabilir.

---

## 8. Dağıtım ve Altyapı

### 8.1 Dockerfile

- Yorumda "derleme araçları yalnızca build aşamasında kalır" yazıyor, ama imaj tek aşamalı olduğu için `python3 make g++` **son imajda kalıyor** (imaja yüzlerce MB ekler). Çok aşamalı (multi-stage) build ile düzeltilebilir.
- `npm install --omit=dev` yerine kilit dosyasına sadık kalan `npm ci --omit=dev` kullanılmalı.
- İmajda hem `.gz` (57 MB) hem açılmış `.db` (168 MB) bulunuyor. Build sonrası `.gz` silinebilir; `DATA_DIR` kullanılan senaryoda ise tersi geçerli.
- `HEALTHCHECK` yok. Render için `healthCheckPath` tanımlanabilir.

### 8.2 render.yaml ve README

- `ADMIN_PASSWORD` render.yaml'da tanımlı değil (`sync: false` ile eklenebilir). Aksi halde yönetici paneli canlıda "ADMIN_PASSWORD ayarlanmamış" hatası verir.
- README "Render `/data` kalıcı diski bağlar" diyor, ama ücretsiz planda disk kapalı. Madde 3 güncel değil.
- README'deki "veritabanını yeniden üretme" adımlarında `scripts/add-arabic-fts.js` yok. Bu adım atlanırsa `fts_arabic` tablosu oluşmaz ve sunucu açılışta `db.prepare` hatasıyla **çöker** (`server.js:272`). `package.json`'a `db:add-arabic-fts` script'i eklenip README'ye yazılmalı.
- `import-json.js` iki kez çalıştırılamıyor: `ALTER TABLE ADD COLUMN` komutları idempotent değil (`import-json.js:43-47`).

### 8.3 Git deposu

- `data/kuranasor.db.gz` şimdiye kadar 3 kez commit edilmiş ve her biri ~57 MB. `.git` klasörü **166 MB**. Tek bir soru bağlantısını düzeltmek için (`7449839`) bile tüm dosya yeniden commit ediliyor; her veri düzeltmesi depoyu ~57 MB büyütecek. GitHub 50 MB üstü dosyalarda uyarı, 100 MB üstünde red veriyor.
- Öneriler: (a) Veritabanını **Git LFS**'e ya da GitHub Release varlığına taşımak. (b) Küçük düzeltmeleri SQL "yama" dosyaları (`data/patches/001-5-20.sql`) olarak tutup açılışta uygulamak.
- `Add files via upload` / `Delete dashboard.html` commit'leri, GitHub web arayüzünden yanlış depoya dosya yüklendiğini gösteriyor (bkz. G8).

---

## 9. Kod Kalitesi ve Sürdürülebilirlik

| Alan | Durum |
|---|---|
| Okunabilirlik | İyi. Türkçe yorumlar bol ve niyeti açıklıyor. Fonksiyonlar kısa. |
| Modülerlik | `server.js` tek dosyada; şimdilik yönetilebilir, ama API, yönetici ve veri erişimi ayrı modüllere bölünebilir. `app.js`'de sayfa başına bir fonksiyon var, yapı temiz. |
| Otomatik test | **Yok.** Her değişiklik elle doğrulanıyor. Arama sorgu üretimi, ağ oluşturma ve yönetici işlemleri için `node:test` + `supertest` ile hızlı entegrasyon testleri yazılabilir. |
| Lint / format | **Yok.** ESLint + Prettier önerilir. |
| CI | **Yok** (`.github/` bulunmuyor). Push'ta test + lint + `npm audit` çalıştıran basit bir GitHub Actions iş akışı yeterli. |
| Bağımlılık güncelliği | Express 5.2 güncel. better-sqlite3'ün 13.x sürümü çıkmış (şu an 12.11.1). |
| Commit düzeni | İki kişi/kimlik (`ATUNA`, `atuna19`) ve web yüklemeleri karışık. Aynı mesajla art arda commit'ler var (`e0c721f`, `f6cc96b`). |

---

## 10. Önceliklendirilmiş Yol Haritası

### Hemen (1 gün içinde, küçük değişiklikler)

1. `GET /api/feedback` uç noktasına `requireAdmin` ekle; `/oneriler` sayfasını yönetici paneline taşı. **(G1)**
2. `/api/admin/login`, `/api/feedback` ve `/api/suggest` için rate limit ekle. **(G2, G5)**
3. ~~`qAnswers` sorgusunu tekilleştir; `qStats.links` için `DISTINCT` kullan.~~ ✅ Düzeltildi: cevaplar ayet başına teke indiriliyor, vurgu parçaları birleştiriliyor, bağlantı sayısı tekil sayılıyor, yönetici paneli yeni kopya oluşturmuyor. **(§3.2)**
4. `render.yaml`'a `ADMIN_PASSWORD` (`sync: false`) ekle; README'deki ortam değişkenleri tablosunu ve Render adımlarını güncelle. **(§8.2)**
5. Supabase projesinde RLS'in açık olduğunu doğrula. **(G8)**
6. `npm audit fix`. **(G9)**

### Kısa vade (1–2 hafta)

7. Yönetici içeriğini ayrı, kalıcı bir veritabanına taşı; tohum veritabanını sürümle. **(§4.3-1)**
8. Mobil menü için medya sorgusu (ör. 640 px altında menüyü daralt, dil seçiciyi taşı). **(§5.2)**
9. `compression` + `Cache-Control` başlıkları, `helmet`, `x-powered-by` kapatma, JSON hata işleyicisi. **(§7, G7)**
10. Yönetici girdi doğrulaması: `highlight` metin olmalı, ayetler tekil olmalı, dizi uzunluğu sınırlı olmalı; `hubCache` geçersiz kılma. **(§4.3-2, 3)**
11. Dockerfile: multi-stage build, `npm ci`, `USER node`, healthcheck. **(§8.1)**
12. README'ye `add-arabic-fts` adımını ekle, `package.json` script'i oluştur. **(§8.2)**

### Orta vade (1–3 ay)

13. Veritabanını Git LFS / Release'e taşı, veri düzeltmelerini SQL yamalarıyla yönet; gerekirse geçmişi temizle. **(§8.3)**
14. `import-sql.js`'deki boşluk hatasını düzelt, veritabanını yeniden üret. Sahipsiz kayıtları ve kullanılmayan tabloları temizle; ön yüzdeki gereksiz `.trim()` çağrılarını kaldır. **(§3.2)**
15. Test altyapısı (node:test + supertest), ESLint ve GitHub Actions CI. **(§9)**
16. SEO: sayfa başına dinamik `<title>`/meta, sitemap, tercihen ayet/soru sayfaları için sunucu tarafı HTML. **(§5.2)**
17. Arayüz metinlerini çok dilli yap (dil seçicinin tutarlı çalışması için). **(§5.2)**
18. Erişilebilirlik: çipleri `<button>` yap, `aria-label`'lar ekle, ağ için klavye ile gezilebilir bir liste alternatifi sun. **(§5.2)**

---

## 11. Sonuç

Kuran'a Sor; sade mimarisi, düşük kaynak kullanımı, güvenli sorgu yapısı ve özenli ön yüz ayrıntılarıyla sağlam bir temele sahip. Acil ele alınması gerekenler **ziyaretçi önerilerinin herkese açık olması**, **yönetici girişinin korumasız olması** ve **yönetici eklemelerinin kalıcı olmaması**. Bu üç sorunun ilk ikisi birkaç satırlık değişiklikle çözülebilir. Ardından veri kalitesi (yinelenen cevaplar), mobil uyum ve test/CI altyapısı ele alınırsa, proje hem kullanıcılar hem de ileride katkı verecek geliştiriciler için çok daha güvenilir hale gelir.
