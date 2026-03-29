// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'test-data.xlsx');

test('yuvarlama değişikliği aktif preseti temizler', async ({ page }) => {
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#controlCard')).toBeVisible();

  // 1) Preset seç: Dar Aralık
  const presetSelect = page.locator('#presetSelect');
  await presetSelect.selectOption('builtin_narrow');
  await expect(presetSelect).toHaveValue('builtin_narrow');
  await expect(page.locator('#targetPct')).toHaveValue('5');

  // 2) Yuvarlama 1 TL → 5 TL
  const roundStep = page.locator('#roundStep');
  await expect(roundStep).toHaveValue('1');
  await roundStep.selectOption('5');
  await expect(roundStep).toHaveValue('5');

  // 3) Preset temizlendi mi?
  await expect(presetSelect).toHaveValue('');

  // 4) localStorage'da fda_active_preset temizlendi mi?
  const activePreset = await page.evaluate(() => localStorage.getItem('fda_active_preset'));
  expect(activePreset).toBeNull();

  // 5) Sil butonu gizli mi?
  await expect(page.locator('#btnDeletePreset')).toBeHidden();
});
