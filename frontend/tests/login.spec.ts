import { test, expect } from '@playwright/test'

test.describe('Helpdesk AI Login and Dashboard', () => {
  test('admin user can login and reach admin dashboard', async ({ page }) => {
    await page.goto('http://localhost:3002')

    await page.pause()

    await page.fill('#username', 'admin')
    await page.fill('#password', 'ChangeMe@123')
    await page.click('button[type="submit"]')

    await page.waitForURL('**/dashboard/admin')

    await expect(page).toHaveURL(/.*dashboard\/admin/)
    await expect(page.locator('h1').filter({ hasText: 'IT HelpDesk' }).first()).toBeVisible()
  })
})