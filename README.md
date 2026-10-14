# Print Drone IDs

Turn UK CAA **flyer ID** and **operator ID** documents into one printable A4 sheet: wallet-sized flyer ID cards and operator ID labels to stick on your drones.

- **Free:** everything runs in the browser. Files are never uploaded.
- **Printed and posted, £4.99:** laminated flyer ID cards and waterproof vinyl operator ID stickers, cut and ready to peel, with free UK delivery. Payment is through Stripe Checkout.

![The sheet preview](public/guide/03-preview.png)

## How it works

1. Drop in flyer ID and operator ID PDFs from [register-drones.caa.co.uk](https://register-drones.caa.co.uk), or type an operator ID from any country (up to 24 characters, the longest that still prints at least 3.3 mm tall on the smallest label, in the alphabets the label font has: Latin, Greek, Cyrillic, Armenian and Georgian). You can add several people's IDs.
2. The page reads the IDs with [pdf.js](https://mozilla.github.io/pdf.js/), finds each card on the page and crops it, even when the browser printed headers and footers around it.
3. [pdf-lib](https://pdf-lib.js.org/) builds the sheet. Cards keep their original quality. Each operator ID gets 9 labels in 3 sizes, with characters at least 3.3 mm tall, above the CAA's 3 mm minimum. The layout flows onto more pages when needed.

The same layout code (`src/lib`) runs in the browser for the free PDF and in a Netlify Function that builds the print file for paid orders.

## Pricing

| | Price |
|---|---|
| First laminated card + first operator ID sticker set + UK delivery | **£4.99** |
| Each extra laminated card | £1.49 |
| Each extra sticker set (9 labels) | £0.99 |

Prices are set in [`src/lib/pricing.ts`](src/lib/pricing.ts).

## Development container

`.devcontainer/` has everything ready to go: Node 22, Playwright's Chromium, Netlify CLI, Stripe CLI, and Claude Code with the [Stripe plugin](https://github.com/stripe/ai), which includes Stripe's MCP server. A [Mailpit](https://mailpit.axllent.org) container catches order emails: without `RESEND_API_KEY`, the functions send over SMTP to Mailpit instead of using Resend. Git and `gh` stay on your host, so commit from there.

Open the folder in VS Code and choose **Reopen in Container**, or use the CLI:

```sh
npx @devcontainers/cli up --workspace-folder .
npx @devcontainers/cli exec --workspace-folder . bash    # shell inside the container
```

The first time, inside the container:

```sh
claude                      # log in, then run /mcp to connect the Stripe MCP server
stripe login                # link the Stripe CLI to your account
cp .env.example .env.local  # add your Stripe test secret key
```

Then:

```sh
npm run dev:netlify         # site and functions on http://localhost:8888
npm run stripe:listen       # forwards Stripe webhooks; put the whsec_… it prints in .env.local
```

Paid test orders show up in Mailpit at http://localhost:18025.

Logins, plugins, the browser and `node_modules` live in Docker volumes, so they survive rebuilds. If a host port is taken, change it with `NETLIFY_DEV_PORT`, `VITE_DEV_PORT`, `VITE_PREVIEW_PORT` or `MAILPIT_PORT`.

## Running it without the container

```sh
npm install
npm run dev              # http://localhost:5173 (ordering needs `npm run dev:netlify`)
npm test                 # unit tests (Vitest)
npx playwright install chromium
npm run test:e2e         # end-to-end tests (Playwright), records videos
```

### Tests, videos and guide screenshots

The Playwright tests run on desktop and mobile viewports and record a video of every test. `e2e/guide.spec.ts` walks through the whole flow and saves named screenshots, which the [how-it-works page](guide.html) uses:

- every run writes them to `test-results/guide/<desktop|mobile>/`
- `npm run guide` also copies the desktop ones into `public/guide/`
- `npm run social` then redraws the link preview image (`public/og.png`) from the sample sheet
- `npm run page-images` redraws the sample sheet and label pictures in `public/images/` from the sample PDF the guide test downloads (needs `pdftoppm`)
- the `.jpg` photos in `public/images/` are real photos of a DJI Air 3S with the labels redrawn from the label design using sample IDs, the card's details and every QR code replaced, the camera metadata (including GPS) removed, and the background swapped for a CC0 wood texture ([Poly Haven cherry veneer](https://polyhaven.com/a/cherry_veneer)); keep it that way for any new photo
- on GitHub, the **Update guide screenshots** workflow does the same and commits them

CI uploads these artifacts on every run: `guide-screenshots`, `e2e-videos`, `sample-sheets` (the PDFs the tests downloaded) and `playwright-report`.

### Search engines and AI assistants

Every indexable page has its own title, description and canonical URL on `https://printdroneids.netlify.app`. `public/robots.txt`, `public/sitemap.xml` and `public/llms.txt` (a plain-text summary for AI assistants) use the same address, and `e2e/seo.spec.ts` checks them. Add new pages to all three and to `vite.config.ts`. The home page's FAQPage structured data must match its visible questions, and every image needs alt text; the test checks both.

The test PDFs in `e2e/fixtures` are made-up "SAMPLE" documents created by `npm run fixtures`. They contain no real IDs.

## Deploying (Netlify)

The site is static (`dist/`). Three Netlify Functions in `netlify/functions` handle orders, and Netlify Blobs holds uploaded cards until an order is paid.

1. Create a Netlify site from this repository. The build settings come from `netlify.toml`.
2. Set these environment variables:

   | Variable | Purpose |
   |---|---|
   | `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_…` or `sk_test_…`) |
   | `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook below |
   | `RESEND_API_KEY` | [Resend](https://resend.com) API key for the order emails (`re_…`) |
   | `ORDER_EMAIL_TO` | Where order emails go |
   | `ORDER_EMAIL_FROM` | Sender, e.g. `Print Drone IDs <orders@yourdomain>` once the domain is verified in Resend. Until then it defaults to `onboarding@resend.dev`, which only delivers to your own Resend account address. |
   | `VITE_CONTACT_EMAIL` | Contact address shown on the terms and privacy pages |
   | `VITE_BUSINESS_DETAILS` | Your business name and postal address for the terms page (UK law requires this) |

3. In Stripe, add a webhook endpoint `https://<your-site>/api/stripe-webhook` for these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`.
4. In Stripe, turn on email receipts and notifications for successful payments.

If Stripe or Resend isn't set up, the order button shows a "not set up yet" message and the free download still works.

### Fulfilling orders

When Stripe confirms a payment, the webhook emails `ORDER_EMAIL_TO` through Resend. The email contains:

- the order reference, items, total and the customer's delivery address
- `Reply-To` set to the customer, so you can reply to them directly
- the print file `DIS-XXXXXXX.pdf` attached: cards on the first page(s), for 250 gsm card, laminating and trimming; stickers on the following page(s), for white waterproof vinyl, cut along the label outlines

The uploaded card images and operator IDs are deleted from Netlify Blobs once the email is sent. If sending fails, the webhook returns an error and Stripe retries it later, so no order is lost. Each order uses a Resend idempotency key, so a retry can't send the same email twice. If a checkout isn't finished, its uploads are deleted when the Stripe session expires (after 1 hour); if it fails before reaching Stripe, they're deleted straight away.

The checkout and order status functions are rate limited per IP address (10 checkouts an hour, 30 status checks per 10 minutes, see `netlify/lib/rate-limit.ts`). The counts are kept in the `rate-limits` Blobs store under a hash of the address.

## Privacy

- The free sheet never leaves the browser. There is no tracking or analytics, and no cookies.
- Print orders upload a 600 dpi image of each card plus the operator IDs. These are deleted from the server as soon as the order email is sent.

## Licence

MIT. The label font is DejaVu Sans Mono Bold ([licence](public/fonts/DejaVu-LICENSE.txt)). Not affiliated with the UK Civil Aviation Authority.
