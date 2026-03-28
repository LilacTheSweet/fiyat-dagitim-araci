// One-time script to generate test-data.xlsx fixture
// Run: node tests/fixtures/generate-fixture.js
// Requires: npm install xlsx (temporary)
const XLSX = require('xlsx');
const path = require('path');

const header = ['Sıra No', 'Ürün Adı', 'Birim', 'Miktar', 'Birim Fiyat'];
const data = [
  [1, 'Çimento (CEM I 42.5R)', 'ton', 150, 420],
  [2, 'Nervürlü Çelik (S420)', 'ton', 80, 18500],
  [3, 'Hazır Beton (C30/37)', 'm3', 500, 1250],
  [4, 'Kalıp Tahtası', 'm2', 2000, 85],
  [5, 'İnce Agrega (0-5mm)', 'ton', 300, 190],
  [6, 'PVC Boru Ø110', 'mt', 1200, 42],
  [7, 'Asfalt (Sıcak Karışım)', 'ton', 250, 780],
  [8, 'Bordür Taşı (50x20x25)', 'adet', 5000, 28],
  [9, 'Parke Taşı (6cm)', 'm2', 3000, 95],
  [10, 'Mıcır (5-12mm)', 'ton', 200, 165],
];

const aoa = [header, ...data];
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws['!cols'] = [{wch:8},{wch:30},{wch:8},{wch:10},{wch:12}];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'İhale Kalemleri');

const outPath = path.join(__dirname, 'test-data.xlsx');
XLSX.writeFile(wb, outPath);
console.log('Fixture written to', outPath);
