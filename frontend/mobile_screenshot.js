const { chromium, devices } = require('playwright');
const path = require('path');

(async () => {
    try {
        const browser = await chromium.launch();
        const iPhone13 = devices['iPhone 13'];
        const context = await browser.newContext({
            ...iPhone13
        });
        const page = await context.newPage();

        await page.goto('http://localhost:5173/analytics', { waitUntil: 'networkidle' });

        // Wait for charts to render
        await page.waitForTimeout(3000);

        // Ensure scrolling is possible
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

        const screenshotPath = path.resolve(__dirname, 'mobile_screenshot.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });

        console.log(`Success: Screenshot saved to ${screenshotPath}`);

        await browser.close();
    } catch (e) {
        console.error("Error:", e);
    }
})();
