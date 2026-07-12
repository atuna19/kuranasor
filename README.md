# Kuran'a Sor

Ayetlere sorulan sorulara, yorum yazılmadan yalnızca başka ayetlerle cevap veren bir Kuran meali/soru-cevap uygulaması. İnteraktif "ayet ağı" görselleştirmesiyle ayetler arası bağlantıları keşfedebilirsiniz.

- 6.348 ayet (112 numarasız besmele dahil), 29 meal, 7.741 soru, 135.000+ ayet bağlantısı
- Tam metin arama (kelime + tam ifade), ayet kısayolu (`2:255` yaz, git)
- İnteraktif ayet ağı: derinlik 1/2, sürükle-yakınlaştır, "en bağlantılı ayetler" keşif sayfası
- Kullanıcı öneri/geri bildirim toplama

## Yerelde çalıştırma

```bash
npm install
npm start
```

Tarayıcıda `http://localhost:4600` açılır. Veritabanı ilk açılışta `data/kuranasor.db.gz` dosyasından otomatik olarak açılır (`data/kuranasor.db`), tekrar indirmeye gerek yoktur.

Windows'ta çift tıklayarak başlatmak için: [`BASLAT.bat`](BASLAT.bat)

## Ortam değişkenleri

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `PORT` | Sunucunun dinleyeceği port | `4600` |
| `DATA_DIR` | Veritabanı dosyalarının bulunduğu/yazılacağı klasör (kalıcı disk için) | `./data` |

## Deploy

Uygulama tek bir Node.js süreci + salt-okunur SQLite veritabanından oluşur. Kullanıcı önerileri (`feedback.db`) sunucuda yazılabilir bir dosyaya kaydedilir — bu yüzden **kalıcı disk (persistent volume) destekleyen bir platform** tercih edin; aksi halde her yeniden başlatmada öneriler sıfırlanır.

### Seçenek 1 — Render.com (önerilen, en kolay)

Repoda hazır [`render.yaml`](render.yaml) dosyası var; 1 GB'lık kalıcı disk otomatik tanımlanır.

1. Bu repoyu GitHub'a pushlayın.
2. Render Dashboard → **New** → **Blueprint** → repoyu seçin.
3. Render `render.yaml`'ı okuyup Docker imajını build eder, `/data` kalıcı diski bağlar. Başka ayar gerekmez.

### Seçenek 2 — Railway / Fly.io / herhangi bir Docker platformu

Repodaki `Dockerfile` ile doğrudan çalışır:

```bash
docker build -t kuranasor .
docker run -p 4600:4600 -v kuranasor_data:/data -e DATA_DIR=/data kuranasor
```

Railway'de: repoyu bağlayın, Railway Dockerfile'ı otomatik algılar. Kalıcı depolama için bir **Volume** ekleyip `DATA_DIR` değişkenini o volume'ün mount path'ine ayarlayın.

### Seçenek 3 — Kendi sunucunuz / VPS

```bash
git clone <repo-url> && cd kuranasor
npm install
npm start   # ya da: pm2 start server.js --name kuranasor
```

Bir ters proxy (nginx/Caddy) ile 4600 portunu 80/443'e yönlendirin.

> **Not:** Vercel/Netlify gibi sunucusuz (serverless) platformlar dosya sistemi kalıcı olmadığı ve SQLite dosya tabanlı çalıştığı için **önerilmez**.

## Proje yapısı

```
server.js            Express API + statik sunucu
public/               Tek sayfa uygulama (vanilla JS, framework yok)
data/kuranasor.db.gz  Sıkıştırılmış tohum veritabanı (repoda), ilk açılışta otomatik açılır
scripts/import-*.js   Ham MySQL dump + JSON kaynaklarından veritabanını yeniden üretme script'leri
mockups/              Tasarım önizlemeleri (deploy edilmez)
```

## Veritabanını yeniden üretmek (opsiyonel)

Yalnızca kaynak veriler (SQL dump / JSON) değiştiğinde gerekir:

```bash
npm run db:import-sql -- /yol/kuranasor_kuranasor.sql
npm run db:import-json -- /yol/kuran_json
gzip -k -9 -f data/kuranasor.db   # data/kuranasor.db.gz'yi güncelle, sonra commit et
```
