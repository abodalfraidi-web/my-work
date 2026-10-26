#!/usr/bin/env node
// Usage: browse.js <text|shot|links|html> <url> [outPath|maxChars]
const { chromium } = require('playwright');

const [mode, url, extra] = process.argv.slice(2);
if (!['text', 'shot', 'links', 'html'].includes(mode) || !url) {
  console.error('Usage: browse.js <text|shot|links|html> <url> [outPath|maxChars]');
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    console.log(`# ${await page.title()} (${res ? res.status() : 'no response'}) ${page.url()}`);

    if (mode === 'text') {
      const max = Number(extra) || 5000;
      const text = (await page.innerText('body')).replace(/\n{3,}/g, '\n\n').trim();
      console.log(text.slice(0, max) + (text.length > max ? `\n… [truncated, ${text.length} chars]` : ''));
    } else if (mode === 'shot') {
      const out = extra || 'screenshot.png';
      await page.screenshot({ path: out, fullPage: true });
      console.log(`Saved screenshot to ${out}`);
    } else if (mode === 'links') {
      const links = await page.$$eval('a[href]', as => as.map(a => `${a.innerText.trim() || '(no text)'} -> ${a.href}`));
      console.log(links.join('\n'));
    } else {
      console.log(await page.content());
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
