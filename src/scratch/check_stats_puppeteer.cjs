const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  await page.goto('http://localhost:3000/stats', { waitUntil: 'networkidle0' });
  await page.waitForTimeout(2000); // give it some time to re-render
  
  await browser.close();
})();
