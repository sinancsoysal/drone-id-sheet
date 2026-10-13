/** Browser-only: reads uploaded PDFs and images and turns them into cards and operator IDs. */
// The legacy build carries fallbacks for very new JavaScript features, which
// Firefox ESR and older Safari versions don't have yet.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { findCardBox } from './bbox';
import { cropToCard, type PdfBox } from './crop';
import { findOperatorIds, parseFlyerLines, type FlyerDetails } from './ids';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;
const open = (data: Uint8Array) =>
  pdfjs.getDocument({
    // pdf.js takes ownership of the buffer it is given, so pass a copy
    data: data.slice(),
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    cMapUrl: `${ASSETS}cmaps/`,
    iccUrl: `${ASSETS}iccs/`,
  });

const MAX_PAGES = 6;
const DETECT_SCALE = 2;

export interface CardItem {
  key: string;
  source: string;
  /** Single-page PDF holding just the card. */
  pdf: Uint8Array;
  /** height / width */
  aspect: number;
  thumb: string;
  details: FlyerDetails;
  warning?: string;
}

export interface ReadResult {
  cards: CardItem[];
  operatorIds: string[];
  warnings: string[];
}

export async function readFile(file: File): Promise<ReadResult> {
  const result: ReadResult = { cards: [], operatorIds: [], warnings: [] };
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  let bytes: Uint8Array;
  try {
    bytes = isImage ? await imageToPdf(file) : new Uint8Array(await file.arrayBuffer());
  } catch {
    result.warnings.push(`${file.name}: this image type can't be read. Try a PDF, PNG or JPG.`);
    return result;
  }

  const task = open(bytes);
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    const locked = (e as Error)?.name === 'PasswordException';
    result.warnings.push(`${file.name}: ${locked ? 'this PDF is password protected.' : "this file isn't a readable PDF."}`);
    return result;
  }

  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: TextItem[] = content.items.flatMap((i) => ('str' in i ? [{ str: i.str, transform: i.transform }] : []));
    const lines = toLines(items);
    const text = lines.join('\n');
    const details = parseFlyerLines(lines);
    const operatorIds = findOperatorIds(text);
    const where = doc.numPages > 1 ? `${file.name} (page ${n})` : file.name;

    if (details.flyerId || !text.trim()) {
      const seedItem = items.find((i) => /GBR-RP-/i.test(i.str));
      const card = await extractCard(page, bytes, n - 1, seedItem);
      result.cards.push({
        ...card,
        key: `${file.name}#${n}#${Math.random().toString(36).slice(2)}`,
        source: where,
        details,
        warning: details.flyerId ? undefined : "We couldn't read a flyer ID here. Check the preview looks right.",
      });
    }
    result.operatorIds.push(...operatorIds);
    if (!details.flyerId && !operatorIds.length && text.trim()) {
      result.warnings.push(`${where}: no flyer ID or operator ID found.`);
    }
  }
  if (doc.numPages > MAX_PAGES) result.warnings.push(`${file.name}: only the first ${MAX_PAGES} pages were read.`);
  await task.destroy();
  return result;
}

interface TextItem { str: string; transform: number[] }

/** Groups pdf.js text items into lines, top to bottom. */
export function toLines(items: TextItem[]): string[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const lines: { y: number; parts: TextItem[] }[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.transform[5]) < 3) last.parts.push(it);
    else lines.push({ y: it.transform[5], parts: [it] });
  }
  return lines.map((l) => l.parts.sort((a, b) => a.transform[4] - b.transform[4]).map((p) => p.str.trim()).join(' '));
}

async function extractCard(page: pdfjs.PDFPageProxy, bytes: Uint8Array, pageIndex: number, seedItem?: TextItem) {
  const viewport = page.getViewport({ scale: DETECT_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let seed: { x: number; y: number } | undefined;
  if (seedItem) {
    const [x, y] = viewport.convertToViewportPoint(seedItem.transform[4], seedItem.transform[5]);
    seed = { x: x + 4, y: y - 4 };
  }
  let px = findCardBox(data, canvas.width, canvas.height, { seed });
  const pageArea = canvas.width * canvas.height;
  if (!px || (px.x1 - px.x0) * (px.y1 - px.y0) > 0.9 * pageArea) {
    px = { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height };
  }

  const [ax, ay] = viewport.convertToPdfPoint(px.x0, px.y0);
  const [bx, by] = viewport.convertToPdfPoint(px.x1, px.y1);
  const box: PdfBox = { left: Math.min(ax, bx), right: Math.max(ax, bx), bottom: Math.min(ay, by), top: Math.max(ay, by) };

  let pdf: Uint8Array;
  try {
    pdf = await cropToCard(bytes, pageIndex, box);
  } catch {
    // pdf-lib can't open some PDFs; fall back to a high resolution image of the card
    pdf = await rasterCard(page, box);
  }

  const w = px.x1 - px.x0, h = px.y1 - px.y0;
  const thumb = document.createElement('canvas');
  thumb.width = 360;
  thumb.height = Math.round((360 * h) / w);
  thumb.getContext('2d')!.drawImage(canvas, px.x0, px.y0, w, h, 0, 0, thumb.width, thumb.height);
  return { pdf, aspect: h / w, thumb: thumb.toDataURL('image/jpeg', 0.85) };
}

/** Renders a region of a page to a JPEG and wraps it in a PDF of the same physical size. */
async function rasterCard(page: pdfjs.PDFPageProxy, box: PdfBox, dpi = 600): Promise<Uint8Array> {
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  const [vx0, vy0] = viewport.convertToViewportPoint(box.left, box.top);
  const [vx1, vy1] = viewport.convertToViewportPoint(box.right, box.bottom);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(Math.abs(vx1 - vx0));
  canvas.height = Math.round(Math.abs(vy1 - vy0));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvas: null, canvasContext: ctx, viewport,
    transform: [1, 0, 0, 1, -Math.min(vx0, vx1), -Math.min(vy0, vy1)],
  }).promise;
  return jpegPdf(canvas, box.right - box.left, box.top - box.bottom);
}

async function jpegPdf(canvas: HTMLCanvasElement, widthPt: number, heightPt: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('encode'))), 'image/jpeg', 0.9));
  const out = await PDFDocument.create();
  const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
  out.addPage([widthPt, heightPt]).drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt });
  return out.save();
}

/** Lighter copy of a card for print orders: a 600 dpi JPEG in a PDF. */
export async function cardForUpload(card: CardItem): Promise<Uint8Array> {
  const task = open(card.pdf);
  const page = await (await task.promise).getPage(1);
  const [x0, y0, x1, y1] = page.view;
  const pdf = await rasterCard(page, { left: x0, bottom: y0, right: x1, top: y1 });
  await task.destroy();
  return pdf;
}

async function imageToPdf(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('encode'))), 'image/png'));
  const out = await PDFDocument.create();
  const img = await out.embedPng(new Uint8Array(await blob.arrayBuffer()));
  // treat the image as 150 dpi; the sheet scales cards to a fixed width anyway
  const w = (bitmap.width * 72) / 150, h = (bitmap.height * 72) / 150;
  out.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  return out.save();
}

/** Renders every page of a PDF into canvases for the on-screen preview. */
export async function renderPreview(bytes: Uint8Array, cssWidth: number): Promise<HTMLCanvasElement[]> {
  const task = open(bytes);
  const doc = await task.promise;
  const out: HTMLCanvasElement[] = [];
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * ratio });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    await page.render({ canvas, viewport }).promise;
    out.push(canvas);
  }
  await task.destroy();
  return out;
}
