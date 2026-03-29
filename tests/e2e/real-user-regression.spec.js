// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// --- Local config resolution ---
const CONFIG_PATH = path.join(__dirname, '..', 'local', 'user-file.local.json');
const EXAMPLE_PATH = path.join(__dirname, '..', 'local', 'user-file.local.example.json');

let excelPath = null;
let skipReason = null;

if (!fs.existsSync(CONFIG_PATH)) {
  skipReason = `Local config bulunamadı: ${CONFIG_PATH}\n` +
    `  → ${EXAMPLE_PATH} dosyasını user-file.local.json olarak kopyalayıp Excel path'inizi yazın.`;
} else {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const resolved = path.isAbsolute(config.excelPath)
      ? config.excelPath
      : path.resolve(path.join(__dirname, '..', '..'), config.excelPath);
    if (!fs.existsSync(resolved)) {
      skipReason = `Excel dosyası bulunamadı: ${resolved}\n  → user-file.local.json içindeki excelPath değerini kontrol edin.`;
    } else {
      excelPath = resolved;
    }
  } catch (e) {
    skipReason = `Config okunamadı: ${e.message}`;
  }
}

// --- Tests (skip gracefully if no local file) ---
test.describe('Gerçek Kullanıcı Regresyon Testi', () => {

  if (skipReason) {
    test.skip(true, skipReason);
    test('placeholder — local config gerekli', () => {});
    return;
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('dosya yükleme + sekme algılama', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(excelPath);
    await expect(page.locator('#dropZone')).toBeHidden();
    await expect(page.locator('#sheetCard')).toBeVisible();

    const options = page.locator('#sheetSelect option');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);
    const names = await options.allTextContents();
    console.log(`  Sekmeler (${count}): ${names.join(', ')}`);
  });

  test('kalem algılama — sayı ve toplam tutar', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(excelPath);
    await expect(page.locator('#sheetCard')).toBeVisible();

    const statusText = await page.locator('#statusRow').textContent();
    const match = statusText.match(/(\d+)\s*kalem/);
    expect(match).toBeTruthy();
    const itemCount = parseInt(match[1]);
    expect(itemCount).toBeGreaterThan(0);
    expect(statusText).toContain('TL');
    console.log(`  Algılanan: ${itemCount} kalem`);

    await expect(page.locator('#controlCard')).toBeVisible();
    await expect(page.locator('#debugBox')).toBeHidden();
  });

  test('preset seçimi + yuvarlama değişikliği', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(excelPath);
    await expect(page.locator('#controlCard')).toBeVisible();

    // Preset seç
    await page.locator('#presetSelect').selectOption('builtin_narrow');
    await expect(page.locator('#targetPct')).toHaveValue('5');
    await expect(page.locator('#minDelta')).toHaveValue('-2');

    // Yuvarlama değiştir → preset temizlenmeli
    await page.locator('#roundStep').selectOption('0.1');
    await expect(page.locator('#presetSelect')).toHaveValue('');
  });

  test('dağıt — sonuç tablosu, satır sayısı, summary', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(excelPath);
    await expect(page.locator('#controlCard')).toBeVisible();

    await page.locator('#btnDist').click();
    await expect(page.locator('#summaryCard')).toBeVisible();
    await expect(page.locator('#tableWrap')).toBeVisible();

    // Satır sayısı = kalem sayısı
    const statusText = await page.locator('#statusRow').textContent();
    const itemCount = parseInt(statusText.match(/(\d+)\s*kalem/)[1]);
    await expect(page.locator('#tableBody tr')).toHaveCount(itemCount);

    // Summary dolu
    await expect(page.locator('#sOrig')).toContainText('TL');
    await expect(page.locator('#sNew')).toContainText('TL');
    await expect(page.locator('#ftOrig')).not.toBeEmpty();
  });

  test('NaN / undefined / boş hücre kontrolü', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(excelPath);
    await page.locator('#btnDist').click();
    await expect(page.locator('#tableWrap')).toBeVisible();

    // Yeni Fiyat kolonu (6. td)
    const cells = page.locator('#tableBody td:nth-child(6)');
    const count = await cells.count();
    for (let i = 0; i < count; i++) {
      const text = await cells.nth(i).textContent();
      expect(text.trim()).not.toBe('');
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('undefined');
    }

    // Değişim kolonu (7. td)
    const changeCells = page.locator('#tableBody td:nth-child(7)');
    for (let i = 0; i < count; i++) {
      const text = await changeCells.nth(i).textContent();
      expect(text).not.toContain('NaN');
    }
    console.log(`  ${count} satır — NaN/undefined/boş yok`);
  });

  test('CSV + XLSX export butonları + XLSX indirme', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(excelPath);
    await page.locator('#btnDist').click();
    await expect(page.locator('#bottomActions')).toBeVisible();

    await expect(page.locator('#btnExport')).toBeEnabled();
    await expect(page.locator('#btnExportXlsx')).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#btnExportXlsx').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    console.log(`  Export: ${download.suggestedFilename()}`);
  });

  test('büyük yuvarlama edge case (50 TL)', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(excelPath);
    await page.locator('#presetSelect').selectOption('builtin_wide');
    await page.locator('#roundStep').selectOption('50');
    await page.locator('#btnDist').click();
    await expect(page.locator('#summaryCard')).toBeVisible();

    const rowCount = await page.locator('#tableBody tr').count();
    expect(rowCount).toBeGreaterThan(0);

    const warnVisible = await page.locator('#distWarn').isVisible();
    console.log(`  50 TL yuvarlama: ${rowCount} satır, warning: ${warnVisible ? 'evet' : 'hayır'}`);
  });

  test('console error yok — tam akış', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.locator('#fileInput').setInputFiles(excelPath);
    await page.locator('#presetSelect').selectOption('builtin_wide');
    await page.locator('#roundStep').selectOption('0.01');
    await page.locator('#btnDist').click();
    await expect(page.locator('#summaryCard')).toBeVisible();
    await page.locator('#presetSelect').selectOption('builtin_narrow');
    await page.locator('#btnReDist').click();
    await expect(page.locator('#summaryCard')).toBeVisible();

    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('layout kırılması yok', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(excelPath);
    await page.locator('#btnDist').click();
    await expect(page.locator('#tableWrap')).toBeVisible();

    const viewport = page.viewportSize();
    const tableBox = await page.locator('.tbl-wrap').boundingBox();
    expect(tableBox.width).toBeLessThanOrEqual(viewport.width);

    const actionsBox = await page.locator('#bottomActions').boundingBox();
    expect(actionsBox.width).toBeGreaterThan(50);
  });

});
