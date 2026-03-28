// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'test-data.xlsx');

test.describe('Smoke Test — Fiyat Dağıtım Aracı', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('sayfa açılıyor, başlık ve drop zone görünür', async ({ page }) => {
    await expect(page).toHaveTitle('Fiyat Dağıtım Aracı');
    await expect(page.locator('h1')).toHaveText('Fiyat Dağıtım Aracı');
    await expect(page.locator('#dropZone')).toBeVisible();
    // Console error kontrolü
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('Excel yükleme + sekme seçimi + kalem sayısı', async ({ page }) => {
    // Upload fixture
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles(FIXTURE);

    // Drop zone gizlenmeli, sheet card görünmeli
    await expect(page.locator('#dropZone')).toBeHidden();
    await expect(page.locator('#sheetCard')).toBeVisible();

    // Sekme seçici görünmeli ve "İhale Kalemleri" sekmesi seçili olmalı
    const sheetSelect = page.locator('#sheetSelect');
    await expect(sheetSelect).toBeVisible();
    await expect(sheetSelect).toHaveValue('İhale Kalemleri');

    // Status: "10 kalem" yazmalı
    await expect(page.locator('#statusRow')).toContainText('10 kalem');

    // Kontrol kartı ve aksiyon satırı görünmeli
    await expect(page.locator('#controlCard')).toBeVisible();
    await expect(page.locator('#actionRow')).toBeVisible();
  });

  test('preset dropdown görünür ve built-in presetler var', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#controlCard')).toBeVisible();

    const presetSelect = page.locator('#presetSelect');
    await expect(presetSelect).toBeVisible();

    // Built-in presetler mevcut
    const options = presetSelect.locator('option');
    const texts = await options.allTextContents();
    expect(texts).toContain('Varsayılan');
    expect(texts).toContain('Dar Aralık');
    expect(texts).toContain('Geniş Aralık');
  });

  test('preset seçimi parametreleri günceller', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#controlCard')).toBeVisible();

    // "Dar Aralık" preset seç
    await page.locator('#presetSelect').selectOption('builtin_narrow');

    // Parametreler güncellenmeli
    await expect(page.locator('#targetPct')).toHaveValue('5');
    await expect(page.locator('#minDelta')).toHaveValue('-2');
    await expect(page.locator('#maxDelta')).toHaveValue('8');
    await expect(page.locator('#lblTarget')).toHaveText('5%');
  });

  test('yuvarlama seçimi çalışıyor', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#controlCard')).toBeVisible();

    const roundStep = page.locator('#roundStep');
    await expect(roundStep).toBeVisible();

    // 0.01 TL seç
    await roundStep.selectOption('0.01');
    await expect(roundStep).toHaveValue('0.01');

    // 5 TL seç
    await roundStep.selectOption('5');
    await expect(roundStep).toHaveValue('5');
  });

  test('dağıt butonu çalışıyor, sonuçlar görünüyor', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#controlCard')).toBeVisible();

    // Dağıt
    await page.locator('#btnDist').click();

    // Sonuçlar görünmeli
    await expect(page.locator('#summaryCard')).toBeVisible();
    await expect(page.locator('#tableWrap')).toBeVisible();
    await expect(page.locator('#bottomActions')).toBeVisible();

    // Summary değerler dolu olmalı
    await expect(page.locator('#sOrig')).not.toBeEmpty();
    await expect(page.locator('#sNew')).not.toBeEmpty();
    await expect(page.locator('#sAch')).not.toBeEmpty();
    await expect(page.locator('#sDiff')).not.toBeEmpty();

    // Tabloda satırlar var
    const rows = page.locator('#tableBody tr');
    await expect(rows).toHaveCount(10);

    // "Yeniden" butonu görünür
    await expect(page.locator('#btnReDist')).toBeVisible();
  });

  test('CSV export butonu mevcut ve tıklanabilir', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await page.locator('#btnDist').click();
    await expect(page.locator('#bottomActions')).toBeVisible();

    const csvBtn = page.locator('#btnExport');
    await expect(csvBtn).toBeVisible();
    await expect(csvBtn).toBeEnabled();
    await expect(csvBtn).toContainText('CSV');
  });

  test('XLSX export butonu mevcut ve tıklanabilir', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await page.locator('#btnDist').click();
    await expect(page.locator('#bottomActions')).toBeVisible();

    const xlsxBtn = page.locator('#btnExportXlsx');
    await expect(xlsxBtn).toBeVisible();
    await expect(xlsxBtn).toBeEnabled();
    await expect(xlsxBtn).toContainText('Excel');
  });

  test('console error yok (tam akış)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await expect(page.locator('#controlCard')).toBeVisible();

    // Preset değiştir
    await page.locator('#presetSelect').selectOption('builtin_wide');

    // Dağıt
    await page.locator('#btnDist').click();
    await expect(page.locator('#summaryCard')).toBeVisible();

    // Yeniden dağıt
    await page.locator('#btnReDist').click();
    await expect(page.locator('#summaryCard')).toBeVisible();

    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });

  test('layout kırılması yok — temel element boyutları', async ({ page }) => {
    await page.locator('#fileInput').setInputFiles(FIXTURE);
    await page.locator('#btnDist').click();
    await expect(page.locator('#summaryCard')).toBeVisible();

    // Tablo taşma kontrolü: tablo genişliği viewport'u aşmamalı
    const viewport = page.viewportSize();
    const tableBox = await page.locator('.tbl-wrap').boundingBox();
    expect(tableBox).toBeTruthy();
    expect(tableBox.width).toBeLessThanOrEqual(viewport.width);

    // Bottom actions görünür ve ekranın altında
    const actionsBox = await page.locator('#bottomActions').boundingBox();
    expect(actionsBox).toBeTruthy();
    expect(actionsBox.width).toBeGreaterThan(100);
  });

});
