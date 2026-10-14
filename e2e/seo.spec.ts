import { expect, test } from '@playwright/test';

const SITE = 'https://printdroneids.netlify.app';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop', 'page metadata is the same on every device'));

test('every page in the sitemap is ready for search engines', async ({ page, request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const urls = [...sitemap.matchAll(/<loc>(.+?)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThanOrEqual(5);

  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const titles = new Set<string>();
  for (const url of urls) {
    await test.step(url, async () => {
      expect(url.startsWith(SITE)).toBe(true);
      const res = await page.goto(url.slice(SITE.length) || '/');
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      const title = await page.title();
      expect(title.length).toBeGreaterThan(10);
      titles.add(title);
      const description = await page.locator('meta[name=description]').getAttribute('content');
      expect(description?.length).toBeGreaterThan(50);
      expect(description?.length).toBeLessThanOrEqual(200);
      await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', url);
      await expect(page.locator('meta[name=robots]')).toHaveCount(0);
      for (const ld of await page.locator('script[type="application/ld+json"]').allTextContents()) {
        expect(() => JSON.parse(ld)).not.toThrow();
      }
      for (const img of await page.locator('main img').all()) {
        expect(await img.getAttribute('alt'), await img.getAttribute('src') ?? '').toBeTruthy();
      }
    });
  }
  expect(titles.size).toBe(urls.length);
  expect(errors).toEqual([]);
});

test('robots.txt, llms.txt and the share image point at the live site', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  expect(robots).not.toMatch(/Disallow: \/\s*$/m);

  const llms = await (await request.get('/llms.txt')).text();
  expect(llms.startsWith('# Print Drone IDs\n')).toBe(true);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const [, link] of llms.matchAll(/\((https:\/\/printdroneids\.netlify\.app[^)]*)\)/g)) {
    expect(sitemap, `${link} is in the sitemap`).toContain(`<loc>${link}</loc>`);
  }

  for (const path of ['/og.png', '/apple-touch-icon.png']) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }
});

test('the order confirmation and not-found pages stay out of search results', async ({ page }) => {
  for (const path of ['/order-success.html', '/404.html']) {
    await page.goto(path);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
  }
});

test('the home page structured data matches what visitors see', async ({ page, request }) => {
  await page.goto('/');
  const lds = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
  const nodes = lds.flatMap((ld) => ld['@graph'] ?? [ld]);
  const byType = (type: string) => nodes.find((n) => n['@type'] === type);

  const faq = byType('FAQPage');
  const shown = (await page.locator('.faq h3').allTextContents()).map((q) => q.trim());
  expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(shown);

  const product = byType('Product');
  expect(product.offers.price).toBe((await page.locator('[data-price-base]').textContent())?.replace('£', ''));
  for (const url of product.image) {
    expect((await request.get(new URL(url).pathname)).status(), url).toBe(200);
  }
});
