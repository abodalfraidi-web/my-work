---
name: browser
description: Browse websites from a Claude Code cloud session with the pre-installed headless Chromium + Playwright — open pages, read their text, take screenshots, click, fill forms, and test local web apps. Use when the user asks to open a URL, check or screenshot a site, scrape page content, or interact with a web page.
---

# Browser (Playwright, headless Chromium)

The cloud container already has Chromium and a matching Playwright installed.

- `require('playwright')` works from any directory; `chromium.launch()` needs no options.
- **Never** run `npx playwright install` or install another Playwright version — it will not find the browser.
- If a project pins a different `@playwright/test`, launch with `executablePath: '/opt/pw-browsers/chromium'`.
- Network goes through the environment's proxy; a site blocked by the network policy fails to load — report that rather than retrying in a loop.

## Quick commands

The helper `scripts/browse.js` covers the common cases (run from the repo root):

```bash
# Page title + visible text (first 5000 chars by default)
node .claude/skills/browser/scripts/browse.js text https://example.com

# Full-page screenshot (then open it with the Read tool to look at it)
node .claude/skills/browser/scripts/browse.js shot https://example.com /tmp/shot.png

# All links on the page
node .claude/skills/browser/scripts/browse.js links https://example.com

# Raw HTML
node .claude/skills/browser/scripts/browse.js html https://example.com
```

Screenshots should go in the session scratchpad directory, not the repo. To show one to the user, send it with `SendUserFile`.

## Multi-step interaction

For clicking, typing, logging in to a test app, or waiting on dynamic content, write a short one-off script in the scratchpad and run it with `node`:

```js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'More information' }).click();
    await page.waitForLoadState('networkidle');
    console.log(await page.title());
    await page.screenshot({ path: '/tmp/after-click.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
```

Tips:
- Prefer role/text locators (`getByRole`, `getByText`, `getByLabel`) over brittle CSS selectors.
- Use `page.fill(selector, value)` for inputs and `page.keyboard.press('Enter')` to submit.
- For local apps, start the dev server in the background first, then browse `http://localhost:<port>`.
- Always close the browser in `finally` so the process exits.

## Limits

This is a headless browser inside the cloud container — it is **not** the user's own Chrome, so it has none of their logins or cookies. Never ask for or type the user's real passwords. If the task needs their signed-in browser, tell them to use Claude in Chrome or the desktop app's built-in browser instead.
