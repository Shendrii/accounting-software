import { prismaUnscoped as db } from '../db/prisma.js';
import { embeddingModelVersion, embedTexts } from './aiEmbeddings.js';

const batchSize = 8;
const lineSelection = { orderBy: { id: 'asc' }, take: 24, select: { description: true } };
const partySelection = { select: { name: true, workspaceId: true } };

function snippet(value, length) {
  return typeof value === 'string' ? value.slice(0, length * 2).replace(/\s+/g, ' ').trim().slice(0, length) : '';
}

function passage({ sourceType, party, date, reference, alternate, lines, ocr, category }) {
  return [
    sourceType,
    party && `Party: ${snippet(party, 120)}`,
    date && `Document date: ${snippet(date, 32)}`,
    reference && `Reference: ${snippet(reference, 96)}`,
    alternate && `Vendor reference: ${snippet(alternate, 96)}`,
    category && `Category: ${snippet(category, 100)}`,
    lines.length && `Line descriptions: ${lines.map(line => snippet(line, 180)).filter(Boolean).join(' | ').slice(0, ocr ? 460 : 1250)}`,
    ocr && `Receipt OCR: ${snippet(ocr, 900)}`,
  ].filter(Boolean).join('\n');
}

async function readPassage({ workspaceId, sourceType, sourceId }) {
  const where = { id: sourceId, workspaceId };
  if (sourceType === 'receipt') {
    const receipt = await db.receipt.findUnique({
      where, select: { vendor: partySelection, category: true, extractedData: true },
    });
    if (!receipt) return null;
    const data = receipt.extractedData ?? {};
    return passage({
      sourceType, party: receipt.vendor?.workspaceId === workspaceId ? receipt.vendor.name : data.vendor,
      date: data.invoiceDate || data.date, reference: data.invoiceNumber,
      lines: Array.isArray(data.items) ? data.items.slice(0, 24).map(item => item?.description) : [],
      ocr: data.rawText, category: receipt.category || data.category,
    });
  }

  const invoice = sourceType === 'invoice';
  const doc = invoice
    ? await db.invoice.findUnique({ where, select: { invoiceNo: true, date: true, customer: partySelection, lines: lineSelection } })
    : await db.bill.findUnique({ where, select: { billNo: true, vendorInvoiceNo: true, date: true, vendor: partySelection, lines: lineSelection } });
  const party = doc?.customer ?? doc?.vendor;
  if (party?.workspaceId !== workspaceId) return null;
  return passage({
    sourceType, party: party.name, date: doc.date.toISOString().slice(0, 10),
    reference: doc.invoiceNo ?? doc.billNo, alternate: doc.vendorInvoiceNo,
    lines: doc.lines.map(line => line.description),
  });
}

async function indexBatch() {
  // A crashed worker releases its claim after the lease expires.
  const pending = await db.$queryRaw`
    WITH due AS (
      SELECT "workspaceId", "sourceType", "sourceId" FROM "AiDocumentEmbedding"
      WHERE "nextAttemptAt" <= CURRENT_TIMESTAMP
      ORDER BY "nextAttemptAt", revision
      LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    )
    UPDATE "AiDocumentEmbedding" e SET "nextAttemptAt" = CURRENT_TIMESTAMP + interval '5 minutes'
    FROM due WHERE (e."workspaceId", e."sourceType", e."sourceId") = (due."workspaceId", due."sourceType", due."sourceId")
    RETURNING e."workspaceId", e."sourceType", e."sourceId", e.revision
  `;
  if (!pending.length) return false;

  const documents = await Promise.all(pending.map(async row => ({ ...row, passage: await readPassage(row) })));
  const ready = documents.filter(row => row.passage !== null);
  const vectors = ready.length ? await embedTexts(ready.map(row => row.passage)) : [];
  await Promise.all(ready.map((row, index) => db.$executeRaw`
    UPDATE "AiDocumentEmbedding"
    SET passage = ${row.passage}, embedding = ${JSON.stringify(vectors[index])}::vector,
      "embeddingModel" = ${embeddingModelVersion}, "nextAttemptAt" = NULL
    WHERE "workspaceId" = ${row.workspaceId} AND "sourceType" = ${row.sourceType}
      AND "sourceId" = ${row.sourceId} AND revision = ${row.revision}
  `));
  await Promise.all(documents.filter(row => row.passage === null).map(row => db.$executeRaw`
    DELETE FROM "AiDocumentEmbedding" WHERE "workspaceId" = ${row.workspaceId} AND "sourceType" = ${row.sourceType}
      AND "sourceId" = ${row.sourceId} AND revision = ${row.revision}
  `));
  return true;
}

let indexing;
let requested = false;

export function wakeDocumentIndexer() {
  requested = true;
  indexing ??= drainIndex();
  return indexing;
}

async function drainIndex() {
  try {
    do {
      requested = false;
      while (await indexBatch()) { /* Drain queued work without polling an idle database. */ }
    } while (requested);
  } catch (error) {
    console.warn('Ask AI document indexing paused', { code: error.code ?? null, status: error.status ?? null });
  } finally {
    indexing = undefined;
  }
}
