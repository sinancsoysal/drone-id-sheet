import { PDFDocument } from 'pdf-lib';

export interface PdfBox { left: number; bottom: number; right: number; top: number }

/** Copies one region of a PDF page into a new single-page PDF, keeping it as vector content. */
export async function cropToCard(src: Uint8Array, pageIndex: number, box: PdfBox): Promise<Uint8Array> {
  const source = await PDFDocument.load(src, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const [embedded] = await out.embedPages([source.getPage(pageIndex)], [box]);
  const page = out.addPage([box.right - box.left, box.top - box.bottom]);
  page.drawPage(embedded, { x: 0, y: 0 });
  return out.save();
}
