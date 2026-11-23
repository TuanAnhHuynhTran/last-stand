import { expect, test, type APIRequestContext } from '@playwright/test';

const API = 'http://localhost:4000/api/v1';
const stamp = Date.now().toString(36);

async function player(api: APIRequestContext, name: string, visibility: 'public' | 'friends' | 'private') {
  const email = `${name}-${stamp}@lasthaven.io`;
  const reg = await api.post(`${API}/auth/register`, { data: { email, username: `${name}_${stamp}`.slice(0, 24), password: 'LastHaven2026' } });
  expect(reg.status()).toBe(201);
  const body = await reg.json();
  const headers = { Authorization: `Bearer ${body.data.tokens.accessToken}` };
  expect((await api.post(`${API}/characters`, { headers, data: { name: `Chỉ huy ${name}`, presetId: 'urban-architect' } })).status()).toBe(201);
  const city = await (await api.post(`${API}/cities`, { headers, data: { name: `Haven ${name}`, terrainType: 'plains', isPublic: true } })).json();
  await api.patch(`${API}/cities/${city.data.id}/visibility`, { headers, data: { visibility } });
  return { email, id: body.data.user.id as string, cityId: city.data.id as string, headers, username: body.data.user.username as string };
}

test('login → friends list → visit a friends-only world read-only → settings', async ({ page, request }) => {
  const alice = await player(request, 'alice', 'public');
  const bob = await player(request, 'bob', 'friends');
  // Friendship through the public API (the UI flow for requests is covered by component tests).
  expect((await request.post(`${API}/friends/requests`, { headers: alice.headers, data: { userId: bob.id } })).status()).toBe(201);
  const inc = await (await request.get(`${API}/friends`, { headers: bob.headers })).json();
  await request.post(`${API}/friends/requests/${inc.data.incoming[0].id}/respond`, { headers: bob.headers, data: { accept: true } });

  await page.goto('/login');
  await page.getByPlaceholder('mayor@cityverse.io').fill(alice.email);
  await page.getByPlaceholder('Nhap mat khau').fill('LastHaven2026');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/);

  await page.goto('/social?tab=friends');
  await expect(page.getByTestId('friend-row')).toHaveCount(1);
  await expect(page.getByTestId('friend-row')).toContainText(bob.username);
  await page.getByTestId('friend-row').getByRole('button', { name: /Ghé thăm/ }).click();
  await page.waitForURL(new RegExp(`/game/${bob.cityId}`));
  await expect(page.getByTestId('visitor-banner')).toBeVisible();

  // Settings tab: audio channels and visibility are there.
  await page.goto('/social?tab=settings');
  await expect(page.getByText('Lò rèn')).toBeVisible();
  await expect(page.getByTestId('visibility')).toBeVisible();

  // A stranger is refused (private world).
  const carol = await player(request, 'carol', 'private');
  await page.goto(`/game/${carol.cityId}`);
  await expect(page.getByText('Khong du quyen truy cap', { exact: true })).toBeVisible();
});

test('PvP arena page shows the season profile and leaderboard', async ({ page, request }) => {
  const dave = await player(request, 'dave', 'public');
  await page.goto('/login');
  await page.getByPlaceholder('mayor@cityverse.io').fill(dave.email);
  await page.getByPlaceholder('Nhap mat khau').fill('LastHaven2026');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard/);
  await page.goto('/social?tab=pvp');
  await expect(page.getByTestId('pvp-rating')).toHaveText('1000');
  await expect(page.getByText('Bảng xếp hạng')).toBeVisible();
  await expect(page.getByTestId('join-queue')).toBeDisabled(); // no soldiers yet
});
