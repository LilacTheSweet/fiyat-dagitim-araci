# HANDOFF — Fiyat Dağıtım Aracı

> Son güncelleme: 26 Mart 2026 — Claude.ai (Opus 4.6) sohbetinden çıktı

---

## Proje Özeti

İhale birim fiyat çalışmalarında, toplam KDV hariç tutarı belirli bir yüzde artırmak için her satırdaki birim fiyatı farklı oranlarda değiştiren bir araç. Excel dosyası yükleyip "Dağıt" butonuyla çalışıyor. Modüler yapı: HTML iskelet + CSS + UI katmanı + saf pricing engine. Responsive: masaüstünde tablo + kart, mobilde kart görünümü.

**Kullanıcı:** Gökhan — veteriner ilaç/malzeme sektöründe belediyelere ihale teklifi hazırlıyor. Büyükçekmece Belediyesi Veteriner İşleri Müdürlüğü başta olmak üzere.

**Kullanım senaryosu:** Elimde 30 kalemlık birim fiyat listesi var, toplam 832.250 TL. %10 artırılmış yeni teklif lazım ama her satır aynı yüzdeyle artarsa "kopya teklif" gibi görünür. Kalemler farklı oranlarda artıp azalmalı, ama ağırlıklı ortalama hedef yüzdeye ulaşmalı.

---

## Dosyalar

| Dosya | Açıklama |
|---|---|
| `index.html` | HTML iskelet — inline script/style yok, klasik `<script src>` tag'leri, `file://` uyumlu |
| `styles.css` | Tüm stiller — responsive media query dahil |
| `app.js` | DOM/UI katmanı — dosya yükleme, parseSheet, render, event binding |
| `pricing-engine.js` | Saf numerik motor — `distribute()`, `floorTo/ceilTo/fp`, DOM bağımsız |
| `tests/pricing-engine.test.js` | Otomatik testler — `node --test` ile çalışır, 18 test, sıfır dependency |
| `_archive/fiyat-dagitim-araci.html` | Arşiv — eski birleşik tek dosya versiyon |
| `_archive/fiyat-dagitim-araci-mobil.html` | Arşiv — eski ayrı mobil versiyon |
| `js-numeric-guardrails.skill` | Custom skill — bound hesabında Math.round tehlikesi |
| `numeric-tool-testing.skill` | Custom skill — sayısal araçlarda test protokolü |

---

## Mimari

Modüler yapı: `index.html` → `<script src="pricing-engine.js">` → `<script src="app.js">`. Klasik script tag'leri, `file://` ile çift tıkla çalışır. Build tool yok, framework yok, saf HTML/CSS/JS. `pricing-engine.js` bir IIFE olup `window.PricingEngine` global'ine yazar. Harici bağımlılık sadece:
- `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js` (Excel parse)
- Google Fonts: IBM Plex Mono + IBM Plex Sans

### Fonksiyon haritası

```
Veri akışı:
  Excel dosya → loadFile() → XLSX.read → parseSheet() → parsedItems[]
  Kullanıcı parametreleri (target/min/max/step) → runDistribute() → distribute() → lastResult[]
  lastResult[] → renderResults() → tablo + kartlar + özet istatistikler
  lastResult[] → copyPrices() → clipboard (yeni birim fiyatlar)
```

### Temel fonksiyonlar

| Fonksiyon | Dosya | Görev |
|---|---|---|
| `distribute()` | `pricing-engine.js` | Çekirdek algoritma — `{rows, warning}` döner |
| `floorTo/ceilTo/fp/roundTo` | `pricing-engine.js` | Güvenli yuvarlama yardımcıları |
| `norm(s)` | `app.js` | Türkçe karakter normalizasyonu |
| `parseSheet(wb, name)` | `app.js` | Excel sekmesinden kalem listesi çıkar |
| `runDistribute()` | `app.js` | UI'dan parametreleri alıp distribute() çağırır |
| `renderResults()` | `app.js` | Sonuçları tablo (desktop) ve kart (mobil) olarak render eder |
| `copyPrices()` | `app.js` | Yeni birim fiyatları clipboard'a kopyalar |

### distribute() algoritması

```
1. Her kaleme [minPct, maxPct] aralığında uniform rastgele yüzde ata
2. Ağırlıklı ortalamayı targetPct'ye shift et
3. Klipleme + yeniden dağıtım (iteratif, max 30 pass)
4. 0'a çok yakın değerleri kaydır (yuvarlama sonrası orijinale eşit kalmasın)
5. Yuvarlama — absMax için floorTo, absMin için ceilTo (Math.round KULLANMA)
6. Orijinal fiyata eşit kalma kontrolü + fallback
7. Correction pass (yön korunarak, max 15 iterasyon)
8. Hedefe ulaşılamadıysa warning döndür
```

---

## Sınır hesaplama kuralları (KRİTİK)

Bu projede en çok tekrarlanan bug `Math.round` ile bound hesabıydı. Kurallar:

```javascript
// ÜST SINIR: maxPct aşılmamalı → AŞAĞI yuvarla
const absMax = fp(floorTo(price * (1 + maxPct), roundStep));

// ALT SINIR: minPct altına düşmemeli → YUKARI yuvarla
const absMin = Math.max(roundStep, fp(ceilTo(price * (1 + minPct), roundStep)));

// Float precision temizliği
function fp(v) { return Math.round(v * 1e10) / 1e10 }
```

**Asla `roundTo()` ile absMin/absMax hesaplama.** `roundTo` = `Math.round`, sınırı her iki yöne aşabilir.

---

## Bilinen sınırlamalar

### Fiziksel imkansızlık durumları (düzeltilmeyecek)

Fiyat yuvarlama adımından küçükse veya çok yakınsa, sınırlar içinde geçerli bir yuvarlanmış fiyat mevcut olmayabilir:

| Durum | Sonuç |
|---|---|
| price=0.50, roundStep=1 | absMax=0 veya 1, sınır aşılır |
| price=0.80, roundStep=1 | absMax=0 veya 1, sınır aşılır |
| price=2.90, roundStep=10 | absMax=0 veya 10, sınır aşılır |

Bu durumlar kullanıcının gerçek verilerinde oluşmuyor (en düşük fiyat 2.90 TL, yuvarlama 1 TL). Warning mekanizması devrede.

### Yuvarlama sonrası hedef sapması

Büyük yuvarlama adımlarında veya çok dar min/max aralıklarında hedef yüzdeye tam ulaşılamayabilir. `distribute()` bu durumda `warning` string'i döndürür ve UI'da sarı uyarı kutusu gösterilir.

---

## Test

### Otomatik test

Kalıcı test dosyası: `tests/pricing-engine.test.js` — Node built-in test runner ile çalışır:
```
node --test tests/pricing-engine.test.js
```
18 test, 4 suite, sıfır dependency. Her test 200 iterasyon çalıştırır (randomize algoritma nedeniyle).

### Test senaryoları

| Senaryo | Sonuç |
|---|---|
| Kullanıcı verisi: 10%, -13%, +23%, 1TL | ✅ |
| Eski bug repro: 10%, -15%, +17%, 1TL | ✅ |
| Dar aralık: 10%, -5%, +15%, 1TL | ✅ |
| Çok dar: 5%, -2%, +8%, 1TL | ✅ |
| Geniş: 15%, -20%, +40%, 1TL | ✅ |
| Küçük step: 10%, -10%, +20%, 0.01TL | ✅ |
| Sadece artış: 10%, 0%, +20%, 1TL | ✅ |
| Tek kalem / iki kalem | ✅ |
| Küçük fiyat + büyük step | ❌ (fiziksel imkansızlık) |

### 5 zorunlu invariant

1. Hiçbir çıktı maxPct'yi aşmıyor
2. Hiçbir çıktı minPct'nin altına düşmüyor
3. Hiçbir çıktı orijinal fiyata eşit kalmıyor
4. Hiçbir çıktı 0 veya negatif değil
5. Warning yoksa hedef sapma < %0.5

---

## Sohbette çözülen bug kronolojisi

| # | Bug | Kök neden | Çözüm |
|---|---|---|---|
| 1 | setError'da HTML entity render edilmiyor | `textContent` → `innerHTML` olmalı | `innerHTML` + `esc()` |
| 2 | Yuvarlama sonrası hedef sapması | Correction pass yoktu | 15 iterasyonluk correction eklendi |
| 3 | %0 değişimli kalemler | 0'a yakın ch[i] yuvarlama sonrası eşit kalıyor | 0'a yakın değerleri ±0.005'e kaydır + eşitlik fallback |
| 4 | Number input min/max sınırı yok | HTML attribute eksik | `min`/`max` + `clampInput()` |
| 5 | Hedefe ulaşılamama sessiz | Warning mekanizması yok | Warning string + sarı kutu UI |
| 6 | %37.9 artış (2.90→4 TL) | `roundTo(price*1.23,1)` = `Math.round(3.567)` = 4 | absMax için `floorTo`, absMin için `ceilTo` |
| 7 | Tüm artışlar %16-17 (varyans yok) | Down/up grup mimarisi yapay | Algoritmayı sıfırdan yazdım: uniform+shift |
| 8 | Down kalem correction'da pozitife dönüyor | Correction tüm kalemlere dokunuyordu | Correction'da yön koruması |
| 9 | Floating point: 6.300000000000001 | JS float aritmetiği | `fp()` normalize fonksiyonu |

---

## Custom skill'ler

Her iki skill de Claude.ai Customize > Skills'e yüklenmiş durumda.

### js-numeric-guardrails
- **Tetiklenme:** JS'te yüzde/oran/para hesabı, Math.round ile bound kodu yazılırken
- **Kural özeti:** Bound'larda güvenli yuvarlama yönü seç, float karşılaştırmalarda strateji belirle, son katman olarak clamp ekle
- **Konum:** Claude.ai Skills + `/mnt/skills/user/js-numeric-guardrails/SKILL.md`

### numeric-tool-testing
- **Tetiklenme:** Sayısal doğruluğu kritik araç teslim edilmeden hemen önce
- **Kural özeti:** Fonksiyonu izole et, senaryo seti oluştur, çoklu iterasyon çalıştır, invariant'ları kontrol et, raporla
- **Konum:** Claude.ai Skills + `/mnt/skills/user/numeric-tool-testing/SKILL.md`

---

## Olası sonraki adımlar

Kullanıcı tarafından belirlenecek. Sohbette tartışılmış ama henüz yapılmamış konular:

- **Seed desteği:** distribute() şu an Math.random kullanıyor. Seedable PRNG eklenmesi test tekrar üretilebilirliğini artırır.
- **Excel'e geri yazma:** Şu an sadece birim fiyatları clipboard'a kopyalıyor. Doğrudan Excel çıktısı üretme özelliği eklenebilir.
- ~~**Kalıcı test dosyası:**~~ Tamamlandı → `tests/pricing-engine.test.js`
