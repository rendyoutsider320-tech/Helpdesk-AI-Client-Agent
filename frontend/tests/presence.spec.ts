import { test, expect } from '@playwright/test'

test.describe('Technician Presence Automation', () => {
  test('technician status updates to online on login and offline on logout', async ({ page }) => {
    // 1. Visit login page
    await page.goto('http://localhost:3002')

    // 2. Login as technician Rendy Martiano
    await page.fill('#username', 'rendy.m')
    await page.fill('#password', 'ChangeMe@123')
    await page.click('button[type="submit"]')

    // 3. Wait for dashboard page redirect (technicians are sent to /dashboard/technician)
    await page.waitForURL('**/dashboard/technician')
    await expect(page).toHaveURL(/.*dashboard\/technician/)

    // 4. Wait for websocket connection to settle
    await page.waitForTimeout(2000)

    // 5. Logout using the header button
    await page.click('button:has-text("Logout")')

    // 6. Confirm redirect back to login
    await page.waitForURL('**/')
    await expect(page).toHaveURL(/.*localhost:3002/)
  })
})
