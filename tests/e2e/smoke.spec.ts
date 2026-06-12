import { test, expect } from '@playwright/test';

test('smoke — Playwright can find tests', async () => {
  expect(1 + 1).toBe(2);
});
