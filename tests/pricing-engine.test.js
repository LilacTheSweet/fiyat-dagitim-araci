// tests/pricing-engine.test.js
// Node built-in test runner — çalıştır: node --test tests/pricing-engine.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// pricing-engine.js bir IIFE — eval ile globalThis.PricingEngine'e yükle
const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'pricing-engine.js'), 'utf8');
eval(engineSrc);
const { distribute, floorTo, ceilTo, fp, roundTo } = globalThis.PricingEngine;

// --- Test verisi: kullanıcının gerçek verisine benzer 30 kalemlik set ---
const SAMPLE_ITEMS = [
  {id:1,name:'Kalem A',birim:'adet',qty:100,price:2.90},
  {id:2,name:'Kalem B',birim:'adet',qty:50,price:15},
  {id:3,name:'Kalem C',birim:'kutu',qty:200,price:8.50},
  {id:4,name:'Kalem D',birim:'adet',qty:30,price:45},
  {id:5,name:'Kalem E',birim:'litre',qty:500,price:3.20},
  {id:6,name:'Kalem F',birim:'adet',qty:10,price:120},
  {id:7,name:'Kalem G',birim:'adet',qty:75,price:22},
  {id:8,name:'Kalem H',birim:'kg',qty:40,price:55},
  {id:9,name:'Kalem I',birim:'adet',qty:150,price:6},
  {id:10,name:'Kalem J',birim:'paket',qty:25,price:88},
  {id:11,name:'Kalem K',birim:'adet',qty:60,price:33},
  {id:12,name:'Kalem L',birim:'adet',qty:300,price:4.50},
  {id:13,name:'Kalem M',birim:'kutu',qty:20,price:175},
  {id:14,name:'Kalem N',birim:'adet',qty:80,price:12},
  {id:15,name:'Kalem O',birim:'litre',qty:45,price:67},
];

// Çoklu iterasyonla invariant kontrolü yapan yardımcı
function runAndCheck(items, targetPct, minPct, maxPct, roundStep, runs=200) {
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(distribute(items, targetPct, minPct, maxPct, roundStep));
  }
  return results;
}

// ========================== INVARIANT TESTLERİ ==========================

describe('distribute() invariantları', () => {

  it('1. maxPct aşılmıyor (200 iterasyon)', () => {
    const results = runAndCheck(SAMPLE_ITEMS, 0.10, -0.13, 0.23, 1);
    for (const {rows} of results) {
      for (const r of rows) {
        const change = (r.newPrice - r.price) / r.price;
        assert.ok(change <= 0.23 + 0.001, `maxPct aşıldı: ${r.name} change=${(change*100).toFixed(2)}%`);
      }
    }
  });

  it('2. minPct altına düşmüyor (200 iterasyon)', () => {
    const results = runAndCheck(SAMPLE_ITEMS, 0.10, -0.13, 0.23, 1);
    for (const {rows} of results) {
      for (const r of rows) {
        const change = (r.newPrice - r.price) / r.price;
        assert.ok(change >= -0.13 - 0.001, `minPct altına düşüldü: ${r.name} change=${(change*100).toFixed(2)}%`);
      }
    }
  });

  it('3. çıktı fiyatı orijinal fiyata eşit kalmıyor (200 iterasyon)', () => {
    const results = runAndCheck(SAMPLE_ITEMS, 0.10, -0.13, 0.23, 1);
    for (const {rows} of results) {
      for (const r of rows) {
        assert.notEqual(r.newPrice, r.price, `Orijinal fiyata eşit kaldı: ${r.name} price=${r.price}`);
      }
    }
  });

  it('4. çıktı fiyatı 0 veya negatif olmuyor (200 iterasyon)', () => {
    const results = runAndCheck(SAMPLE_ITEMS, 0.10, -0.13, 0.23, 1);
    for (const {rows} of results) {
      for (const r of rows) {
        assert.ok(r.newPrice > 0, `Fiyat 0 veya negatif: ${r.name} newPrice=${r.newPrice}`);
      }
    }
  });

  it('5. warning yoksa hedef sapma < %0.5 (200 iterasyon)', () => {
    const results = runAndCheck(SAMPLE_ITEMS, 0.10, -0.13, 0.23, 1);
    for (const {rows, warning} of results) {
      if (warning) continue;
      const ot = rows.reduce((s, r) => s + r.price * r.qty, 0);
      const nt = rows.reduce((s, r) => s + r.newTutar, 0);
      const achieved = (nt - ot) / ot;
      assert.ok(Math.abs(achieved - 0.10) < 0.005, `Hedef sapma büyük: achieved=${(achieved*100).toFixed(2)}%`);
    }
  });
});

// ========================== BOUND BUG REGRESYONu ==========================

describe('Math.round bound bug regresyonu (Bug #6)', () => {

  it('6. floorTo absMax aşmaz, ceilTo absMin altına düşmez', () => {
    // Bug #6 senaryosu: price=2.90, maxPct=0.23, roundStep=1
    // Math.round(2.90*1.23/1)*1 = Math.round(3.567) = 4 → %37.9 artış!
    // floorTo(2.90*1.23,1) = floor(3.567) = 3 → %3.4 artış ✓
    const price = 2.90;
    const maxPct = 0.23;
    const minPct = -0.13;
    const roundStep = 1;

    const absMax = fp(floorTo(price * (1 + maxPct), roundStep));
    assert.ok(absMax <= price * (1 + maxPct) + 1e-9, `absMax sınırı aşıyor: absMax=${absMax}, limit=${price*(1+maxPct)}`);

    const absMin = Math.max(roundStep, fp(ceilTo(price * (1 + minPct), roundStep)));
    assert.ok(absMin >= price * (1 + minPct) - 1e-9, `absMin sınırın altında: absMin=${absMin}, limit=${price*(1+minPct)}`);

    // roundTo ile aynı hesap — bug'lı davranış
    const buggyMax = roundTo(price * (1 + maxPct), roundStep);
    // Bu 4 olabilir ki %37.9 artış demek — sınır aşımı
    if (buggyMax > price * (1 + maxPct) + 1e-9) {
      // Doğru: roundTo sınır aşıyor, floorTo aşmıyor
      assert.ok(absMax <= price * (1 + maxPct) + 1e-9, 'floorTo güvenli');
    }
  });

  it('6b. eski bug repro: 10%, -15%, +17%, 1TL (200 iterasyon)', () => {
    const results = runAndCheck(SAMPLE_ITEMS, 0.10, -0.15, 0.17, 1);
    for (const {rows} of results) {
      for (const r of rows) {
        const change = (r.newPrice - r.price) / r.price;
        assert.ok(change <= 0.17 + 0.001, `maxPct aşıldı (eski bug): ${r.name} change=${(change*100).toFixed(2)}%`);
        assert.ok(change >= -0.15 - 0.001, `minPct altı (eski bug): ${r.name} change=${(change*100).toFixed(2)}%`);
      }
    }
  });
});

// ========================== ÖZEL SENARYOLAR ==========================

describe('Özel senaryolar', () => {

  it('7. tek kalem', () => {
    const items = [{id:1,name:'Tek',birim:'adet',qty:100,price:50}];
    const results = runAndCheck(items, 0.10, -0.05, 0.25, 1, 50);
    for (const {rows} of results) {
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].newPrice, 50);
      assert.ok(rows[0].newPrice > 0);
    }
  });

  it('8. iki kalem', () => {
    const items = [
      {id:1,name:'A',birim:'adet',qty:100,price:10},
      {id:2,name:'B',birim:'adet',qty:50,price:20},
    ];
    const results = runAndCheck(items, 0.10, -0.05, 0.25, 1, 50);
    for (const {rows, warning} of results) {
      assert.equal(rows.length, 2);
      for (const r of rows) {
        assert.notEqual(r.newPrice, r.price);
        assert.ok(r.newPrice > 0);
      }
    }
  });

  it('9. dar aralık: 5%, -2%, +8%, 1TL (200 iterasyon)', () => {
    // Not: küçük fiyat + büyük roundStep durumunda fiziksel imkansızlık olabilir (HANDOFF.md)
    // Sadece fiyatı roundStep'e göre yeterince büyük olan kalemleri kontrol ediyoruz
    const results = runAndCheck(SAMPLE_ITEMS, 0.05, -0.02, 0.08, 1);
    for (const {rows} of results) {
      for (const r of rows) {
        assert.ok(r.newPrice > 0, `Fiyat pozitif olmalı: ${r.name}`);
        // Sınır kontrolü: fiziksel imkansızlık olmayan kalemler için
        // absMin ve absMax orijinal fiyattan farklı bir değer sunuyorsa kontrol et
        const absMin9 = Math.max(1, fp(ceilTo(r.price * 0.98, 1)));
        const absMax9 = fp(floorTo(r.price * 1.08, 1));
        const hasFeasible = absMin9 !== r.price || absMax9 !== r.price;
        if (hasFeasible && absMin9 <= absMax9) {
          assert.notEqual(r.newPrice, r.price, `Orijinale eşit kalmamalı: ${r.name}`);
          const change = (r.newPrice - r.price) / r.price;
          assert.ok(change <= 0.08 + 0.001, `maxPct aşıldı (dar): ${r.name} change=${(change*100).toFixed(2)}%`);
          assert.ok(change >= -0.02 - 0.001, `minPct altı (dar): ${r.name} change=${(change*100).toFixed(2)}%`);
        }
      }
    }
  });

  it('10. küçük fiyat + büyük step: warning veya imkansızlık', () => {
    // price=0.50, roundStep=1 → fiziksel imkansızlık
    const items = [{id:1,name:'Ucuz',birim:'adet',qty:100,price:0.50}];
    const {rows, warning} = distribute(items, 0.10, -0.13, 0.23, 1);
    // Bu durumda ya warning gelir ya da sınır aşılır — ikisi de kabul edilir
    // Önemli olan crash olmaması
    assert.equal(rows.length, 1);
    assert.ok(rows[0].newPrice > 0, 'Fiyat pozitif olmalı');
  });

  it('küçük step: 10%, -10%, +20%, 0.01TL (200 iterasyon)', () => {
    const results = runAndCheck(SAMPLE_ITEMS, 0.10, -0.10, 0.20, 0.01);
    for (const {rows, warning} of results) {
      if (warning) continue;
      const ot = rows.reduce((s, r) => s + r.price * r.qty, 0);
      const nt = rows.reduce((s, r) => s + r.newTutar, 0);
      const achieved = (nt - ot) / ot;
      assert.ok(Math.abs(achieved - 0.10) < 0.005, `Küçük step sapma: ${(achieved*100).toFixed(3)}%`);
    }
  });

  it('sadece artış: 10%, 0%, +20%, 1TL (200 iterasyon)', () => {
    // Not: price=3.20 + roundStep=1 + minPct=0 → absMin=ceil(3.20)=4, absMax=floor(3.84)=3
    // Fiziksel imkansızlık: swap sonrası zorunlu sınır aşımı olabilir (HANDOFF.md)
    const results = runAndCheck(SAMPLE_ITEMS, 0.10, 0, 0.20, 1);
    for (const {rows} of results) {
      for (const r of rows) {
        assert.ok(r.newPrice > 0, `Fiyat pozitif olmalı: ${r.name}`);
        assert.notEqual(r.newPrice, r.price, `Orijinale eşit: ${r.name}`);
        // Sadece fiyat/step oranı sağlıklı olanları kontrol et
        if (r.price >= 10) {
          assert.ok(r.newPrice >= r.price, `Azalma olmamalı: ${r.name} old=${r.price} new=${r.newPrice}`);
        }
      }
    }
  });

  it('geniş aralık: 15%, -20%, +40%, 1TL (200 iterasyon)', () => {
    const results = runAndCheck(SAMPLE_ITEMS, 0.15, -0.20, 0.40, 1);
    for (const {rows} of results) {
      for (const r of rows) {
        const change = (r.newPrice - r.price) / r.price;
        assert.ok(change <= 0.40 + 0.001, `maxPct aşıldı (geniş): change=${(change*100).toFixed(2)}%`);
        assert.ok(change >= -0.20 - 0.001, `minPct altı (geniş): change=${(change*100).toFixed(2)}%`);
      }
    }
  });
});

// ========================== HELPER FONKSİYONLARI ==========================

describe('Helper fonksiyonları', () => {

  it('fp() float precision temizliği', () => {
    assert.equal(fp(6.300000000000001), 6.3);
    assert.equal(fp(0.1 + 0.2), 0.3);
    assert.equal(fp(1.00000000001), 1); // 11 ondalık → 10'a yuvarlanır
  });

  it('floorTo doğru aşağı yuvarlar', () => {
    assert.equal(floorTo(3.567, 1), 3);
    assert.equal(floorTo(10.99, 5), 10);
    assert.equal(floorTo(2.55, 0.5), 2.5);
  });

  it('ceilTo doğru yukarı yuvarlar', () => {
    assert.equal(ceilTo(3.001, 1), 4);
    assert.equal(ceilTo(10.01, 5), 15);
    assert.equal(ceilTo(2.51, 0.5), 3);
  });

  it('roundTo (sadece np yuvarlama için — bound hesabında KULLANILMAZ)', () => {
    assert.equal(roundTo(3.4, 1), 3);
    assert.equal(roundTo(3.5, 1), 4);
    assert.equal(roundTo(3.6, 1), 4);
  });
});
