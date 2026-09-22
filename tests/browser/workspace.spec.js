import { test, expect } from '@playwright/test';
import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
const email = `readyroom-e2e-${randomUUID()}@example.test`;
test.afterAll(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const db = client.db();
    const user = await db.collection('users').findOne({ email });
    if (user) {
      await db.collection('kits').deleteMany({ userId: user._id });
      await db.collection('jobs').deleteMany({ userId: user._id });
      await db.collection('sessions').deleteMany({ session: { $regex: user._id } });
      await db.collection('users').deleteOne({ _id: user._id, email });
    }
  } finally {
    await client.close();
  }
});
test('register, generate, edit, practise, reopen, mobile and logout', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Your name').fill('Alex Morgan');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: false }).fill('ReadyroomTest2026!');
  await page.getByRole('button', { name: 'Create your account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Walk in prepared.' })).toBeVisible();
  await page.screenshot({ path: 'output/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create your first prep kit' }).click();
  await page
    .getByLabel('Job description', { exact: true })
    .fill(
      'Senior Frontend Engineer\nRequired: React and TypeScript experience.\nMentor junior engineers.\nBonus: accessibility testing experience.',
    );
  await page.getByLabel('Company website').fill('https://example.invalid');
  await page.getByLabel('Days until your interview').fill('5');
  await page.getByRole('button', { name: 'Build my prep kit' }).click();
  await expect(page.getByRole('tab', { name: 'Company brief' })).toBeVisible({ timeout: 80000 });
  await page
    .getByLabel('Company summary', { exact: true })
    .fill('My carefully edited company brief.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Questions/ }).click();
  await page.getByRole('button', { name: 'Add question', exact: true }).click();
  await page
    .getByLabel('Question', { exact: true })
    .last()
    .fill('How would I discuss my portfolio?');
  await page
    .getByLabel('Answer outline', { exact: true })
    .last()
    .fill('Use my dashboard project and explain the trade-offs.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/questions-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Practise', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make it second nature.' })).toBeVisible();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: '1 · Needs work' }).click();
  await expect(page.getByText(/1 \/ \d+ covered/)).toBeVisible();
  await page.screenshot({ path: 'output/practice-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Build & explore', exact: true }).click();
  await page.getByRole('tab', { name: 'Company brief' }).click();
  await expect(page.getByLabel('Company summary', { exact: true })).toHaveValue(
    'My carefully edited company brief.',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/kit-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'All opportunities', exact: true }).click();
  await page.getByRole('button', { name: 'Open kit', exact: true }).click();
  await expect(page.getByLabel('Company summary', { exact: true })).toHaveValue(
    'My carefully edited company brief.',
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
