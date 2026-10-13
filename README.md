# Drone ID Sheet

Turn UK CAA **flyer ID** and **operator ID** documents into one printable A4 sheet: wallet-sized flyer ID cards and operator ID labels to stick on your drones.

- **Free:** everything runs in the browser. Files are never uploaded.
- **Printed and posted, £4.99:** laminated flyer ID cards and waterproof vinyl operator ID stickers, cut and ready to peel, with free UK delivery. Payment is through Stripe Checkout.

![The sheet preview](public/guide/03-preview.png)

## How it works

1. Drop in flyer ID and operator ID PDFs from [register-drones.caa.co.uk](https://register-drones.caa.co.uk), or type an operator ID. You can add several people's IDs.
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

## Running it locally

```sh
npm install
npm run dev              # http://localhost:5173 (the order button needs the Netlify functions, see below)
npm test                 # unit tests (Vitest)
npx playwright install chromium
npm run test:e2e         # end-to-end tests (Playwright), records videos
```

To run the order flow end to end on your machine, use `npx netlify dev` with Stripe test keys in `.env.local`.

### Tests, videos and guide screenshots

The Playwright tests run on desktop and mobile viewports and record a video of every test. `e2e/guide.spec.ts` walks through the whole flow and saves named screenshots, which the [how-it-works page](guide.html) uses:

- every run writes them to `test-results/guide/<desktop|mobile>/`
- `npm run guide` also copies the desktop ones into `public/guide/`
- on GitHub, the **Update guide screenshots** workflow does the same and commits them

CI uploads these artifacts on every run: `guide-screenshots`, `e2e-videos`, `sample-sheets` (the PDFs the tests downloaded) and `playwright-report`.

The test PDFs in `e2e/fixtures` are made-up "SAMPLE" documents created by `npm run fixtures`. They contain no real IDs.

## Deploying (Netlify)

The site is static (`dist/`). Three Netlify Functions in `netlify/functions` handle orders, and Netlify Blobs holds uploaded cards until an order is paid.

1. Create a Netlify site from this repository. The build settings come from `netlify.toml`.
2. Set these environment variables:

   | Variable | Purpose |
   |---|---|
   | `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_…` or `sk_test_…`) |
   | `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook below |
   | `SMTP_URL` | SMTP connection for order emails, e.g. `smtps://user:password@smtp.example.com:465` |
   | `ORDER_EMAIL_TO` | Where order emails go |
   | `ORDER_EMAIL_FROM` | Sender address (optional, defaults to `ORDER_EMAIL_TO`) |
   | `VITE_CONTACT_EMAIL` | Contact address shown on the terms and privacy pages |
   | `VITE_BUSINESS_DETAILS` | Your business name and postal address for the terms page (UK law requires this) |

3. In Stripe, add a webhook endpoint `https://<your-site>/api/stripe-webhook` for these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`.
4. In Stripe, turn on email receipts and notifications for successful payments.

If Stripe or email isn't set up, the order button shows a "not set up yet" message and the free download still works.

### Fulfilling orders

When Stripe confirms a payment, the webhook emails `ORDER_EMAIL_TO`. The email contains:

- the order reference, items, total and the customer's delivery address
- `Reply-To` set to the customer, so you can reply to them directly
- the print file `DIS-XXXXXXX.pdf` attached: cards on the first page(s), for 250 gsm card, laminating and trimming; stickers on the following page(s), for white waterproof vinyl, cut along the label outlines

The uploaded card images and operator IDs are deleted from Netlify Blobs once the email is sent. If sending fails, the webhook returns an error and Stripe retries it later, so no order is lost. If a checkout isn't finished, its uploads are deleted when the Stripe session expires (after 1 hour).

## Privacy

- The free sheet never leaves the browser. There is no tracking or analytics, and no cookies.
- Print orders upload a 600 dpi image of each card plus the operator IDs. These are deleted from the server as soon as the order email is sent.

## Licence

MIT. The label font is DejaVu Sans Mono Bold ([licence](public/fonts/DejaVu-LICENSE.txt)). Not affiliated with the UK Civil Aviation Authority.
