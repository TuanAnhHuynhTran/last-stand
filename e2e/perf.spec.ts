/**
 * Runs the in-game benchmark (20 s camera tour, real requestAnimationFrame timings) for each
 * quality preset and writes the reports to e2e/.data/perf-*.json. Opt-in: PERF=1.
 * NOTE: headless Chromium renders with SwiftShader (CPU) — numbers are a floor, not what a
 * player's GPU gets. Run headed on target hardware for real player-facing figures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const API = 'http://localhost:4000/api/v1';
test.skip(!process.env.PERF, 'set PERF=1 to run the benchmark');

for (const quality of ['low', 'medium', 'high'] as const) {
  test(`benchmark ${quality}`, async ({ page, request }) => {
    test.setTimeout(180_000);
    const email = `perf-${quality}-${Date.now().toString(36)}@lasthaven.io`;
    const reg = await (await request.post(`${API}/auth/register`, { data: { email, username: `perf_${quality}_${Date.now().toString(36)}`.slice(0, 24), password: 'LastHaven2026' } })).json();
    const headers = { Authorization: `Bearer ${reg.data.tokens.accessToken}` };
    await request.post(`${API}/characters`, { headers, data: { name: 'Bench', presetId: 'urban-architect' } });
    const city = await (await request.post(`${API}/cities`, { headers, data: { name: 'Bench', terrainType: 'plains', isPublic: true } })).json();
    await page.addInitScript((q) => localStorage.setItem('lh.world.quality', q), quality);
    await page.goto('/login');
    await page.getByPlaceholder('mayor@cityverse.io').fill(email);
    await page.getByPlaceholder('Nhap mat khau').fill('LastHaven2026');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/dashboard/);
    await page.goto(`/game/${city.data.id}`);
    await page.waitForTimeout(4000);
    await page.keyboard.press('KeyP');
    await page.getByTestId('run-benchmark').click();
    await expect(page.getByTestId('benchmark-report')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Sao chép báo cáo JSON/ }).isVisible();
    const report = await page.evaluate(() => (document.querySelector('[data-testid="benchmark-report"]') as HTMLElement).innerText);
    const stats = await page.evaluate(() => (document.querySelector('[data-testid="perf-panel"]') as HTMLElement).innerText);
    const dir = path.resolve(__dirname, '.data');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `perf-${quality}.txt`), `${new Date().toISOString()}\n${stats}\n`);
    console.log(`\n=== ${quality} ===\n${report}`);
  });
}
