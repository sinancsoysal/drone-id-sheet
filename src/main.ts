import { checkOperatorId, splitOperatorInput } from './lib/ids';
import { formatGBP, PRICING, quote } from './lib/pricing';
import type { CardItem } from './lib/reader';

// pdf.js and pdf-lib are large, so load them only once someone starts adding files
const engine = () => import('./lib/engine');

interface OperatorItem { id: string; note?: string }

const state = { cards: [] as CardItem[], operators: [] as OperatorItem[] };
let sheet: Uint8Array | null = null;
let fontBytes: Promise<Uint8Array> | null = null;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fileInput = $<HTMLInputElement>('file');
const drop = $<HTMLLabelElement>('drop');
const opForm = $<HTMLFormElement>('op-form');
const opInput = $<HTMLInputElement>('op-input');
const messages = $<HTMLUListElement>('messages');
const busy = $('busy');

document.querySelectorAll('[data-price-base]').forEach((el) => (el.textContent = formatGBP(PRICING.basePence)));

function monoFont() {
  fontBytes ??= fetch(`${import.meta.env.BASE_URL}fonts/DejaVuSansMono-Bold.ttf`)
    .then((r) => r.arrayBuffer())
    .then((b) => new Uint8Array(b));
  return fontBytes;
}

function say(text: string, kind: 'warn' | 'error' = 'warn') {
  const li = document.createElement('li');
  li.textContent = text;
  li.className = kind;
  messages.append(li);
}

// files are read one batch at a time so duplicate checks see earlier uploads
let queue = Promise.resolve();
function addFiles(files: FileList | File[]) {
  const list = [...files];
  queue = queue.then(() => readFiles(list));
  return queue;
}

let reading = 0;
const downloadBtn = $<HTMLButtonElement>('download');

/** Download and order wait until every file is read and the sheet is rebuilt. */
function setWorking(on: boolean) {
  downloadBtn.disabled = on;
  $('preview').setAttribute('aria-busy', String(on));
}

async function readFiles(list: File[]) {
  if (!list.length) return;
  messages.replaceChildren();
  busy.hidden = false;
  reading++;
  setWorking(true);
  try {
    for (const file of list) {
      const res = await (await engine()).readFile(file);
      for (const card of res.cards) {
        const id = card.details.flyerId;
        if (id && state.cards.some((c) => c.details.flyerId === id)) {
          say(`${id} is already on the sheet.`);
          continue;
        }
        state.cards.push(card);
      }
      for (const op of res.operatorIds) addOperator(op, true);
      res.warnings.forEach((w) => say(w));
    }
  } catch (e) {
    console.error(e);
    say('Something went wrong reading that file. Try a PDF downloaded from the CAA site.', 'error');
  } finally {
    reading--;
    busy.hidden = reading > 0;
    fileInput.value = '';
  }
  update();
}

function addOperator(raw: string, quiet = false): boolean {
  const check = checkOperatorId(raw);
  if (!check.ok) {
    say(check.message!, 'error');
    return false;
  }
  if (state.operators.some((o) => o.id === check.id)) {
    if (!quiet) say(`${check.id} is already on the sheet.`);
    return true;
  }
  state.operators.push({ id: check.id, note: check.message });
  return true;
}

fileInput.addEventListener('change', () => fileInput.files && addFiles(fileInput.files));
for (const ev of ['dragenter', 'dragover'] as const) {
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
}
for (const ev of ['dragleave', 'drop'] as const) {
  drop.addEventListener(ev, () => drop.classList.remove('over'));
}
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
});

opForm.addEventListener('submit', (e) => {
  e.preventDefault();
  messages.replaceChildren();
  const ids = splitOperatorInput(opInput.value);
  if (!ids.length) {
    say('Enter an operator ID, like GBR-OP-ABCD1234EFGH.', 'error');
    return;
  }
  const allOk = ids.map((id) => addOperator(id)).every(Boolean);
  if (allOk) opInput.value = '';
  update();
});

function update() {
  const has = state.cards.length + state.operators.length > 0;
  $('step-check').hidden = !has;
  $('step-get').hidden = !has;
  renderLists();
  renderQuote();
  refreshSheet();
}

function renderLists() {
  const cardList = $('card-list');
  cardList.replaceChildren(...state.cards.map((c) => {
    const li = el('li', 'item');
    li.dataset.testid = 'card-item';
    const img = document.createElement('img');
    img.src = c.thumb;
    img.alt = `Flyer ID card from ${c.source}`;
    const meta = el('div', 'meta');
    meta.append(el('div', 'id', c.details.flyerId ?? 'Flyer ID card'));
    const who = [c.details.firstName, c.details.lastName].filter(Boolean).join(' ');
    meta.append(el('div', 'who', [who, c.details.expiry && `expires ${c.details.expiry}`].filter(Boolean).join(' · ') || c.source));
    if (c.warning) meta.append(el('div', 'note', c.warning));
    li.append(img, meta, removeButton(() => { state.cards = state.cards.filter((x) => x !== c); }, c.details.flyerId ?? 'card'));
    return li;
  }));
  const opList = $('op-list');
  opList.replaceChildren(...state.operators.map((o) => {
    const li = el('li', 'item');
    li.dataset.testid = 'operator-item';
    const meta = el('div', 'meta');
    meta.append(el('div', 'id', o.id), el('div', 'who', '9 labels in 3 sizes'));
    if (o.note) meta.append(el('div', 'note', o.note));
    li.append(meta, removeButton(() => { state.operators = state.operators.filter((x) => x !== o); }, o.id));
    return li;
  }));
}

function removeButton(onClick: () => void, what: string) {
  const b = el('button', '', 'Remove') as HTMLButtonElement;
  b.type = 'button';
  b.setAttribute('aria-label', `Remove ${what}`);
  b.addEventListener('click', () => { onClick(); update(); });
  return b;
}

function el(tag: string, cls: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const orderBtn = $<HTMLButtonElement>('order');
const orderError = $('order-error');

function renderQuote() {
  const table = $('quote');
  orderError.hidden = true;
  try {
    const q = quote(state.cards.length, state.operators.length);
    table.replaceChildren(...q.lines.map((l) => {
      const tr = document.createElement('tr');
      tr.append(el('td', '', l.quantity > 1 ? `${l.description} × ${l.quantity}` : l.description), el('td', '', formatGBP(l.unitPence * l.quantity)));
      return tr;
    }));
    const total = document.createElement('tr');
    total.className = 'total';
    total.append(el('td', '', 'Total, including UK delivery'), el('td', '', formatGBP(q.totalPence)));
    table.append(total);
    $('order-total').textContent = formatGBP(q.totalPence);
    orderBtn.textContent = `Order and pay ${formatGBP(q.totalPence)}`;
    orderBtn.disabled = false;
  } catch (e) {
    table.replaceChildren();
    orderBtn.disabled = true;
    if (state.cards.length + state.operators.length) {
      orderError.textContent = (e as Error).message;
      orderError.hidden = false;
    }
  }
}

let generation = 0;
async function refreshSheet() {
  const mine = ++generation;
  sheet = null;
  const preview = $('preview');
  if (!state.cards.length && !state.operators.length) {
    preview.replaceChildren();
    return;
  }
  setWorking(true);
  const { buildSheet, renderPreview } = await engine();
  const bytes = await buildSheet({
    cards: state.cards.map((c) => c.pdf),
    operatorIds: state.operators.map((o) => o.id),
    monoFont: await monoFont(),
  });
  if (mine !== generation) return;
  sheet = bytes;
  const width = Math.min(preview.clientWidth - 32, 520);
  const canvases = await renderPreview(bytes, Math.max(width, 240));
  if (mine !== generation) return;
  canvases.forEach((c, i) => c.setAttribute('aria-label', `Preview of page ${i + 1}`));
  preview.replaceChildren(...canvases);
  if (!reading) setWorking(false);
}

downloadBtn.addEventListener('click', async () => {
  const bytes = sheet ?? (await (await engine()).buildSheet({
    cards: state.cards.map((c) => c.pdf),
    operatorIds: state.operators.map((o) => o.id),
    monoFont: await monoFont(),
  }));
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'drone-id-sheet.pdf';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});

orderBtn.addEventListener('click', async () => {
  if (reading) return;
  orderError.hidden = true;
  orderBtn.disabled = true;
  const label = orderBtn.textContent;
  orderBtn.textContent = 'Preparing your order…';
  try {
    const { cardForUpload } = await engine();
    const cards = await Promise.all(state.cards.map(async (c) => toBase64(await cardForUpload(c))));
    const body = JSON.stringify({ cards, operatorIds: state.operators.map((o) => o.id) });
    if (body.length > 5_500_000) throw new Error('These files are too large to upload together. Try ordering fewer cards at a time.');
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || 'Ordering is not available right now. Please try again later.');
    window.location.assign(data.url);
  } catch (e) {
    orderError.textContent = (e as Error).message;
    orderError.hidden = false;
    orderBtn.disabled = false;
    orderBtn.textContent = label;
  }
});

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
