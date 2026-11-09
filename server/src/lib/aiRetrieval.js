import { Prisma } from '@prisma/client';
import { Decimal, ledgerDate, nextDay } from './ledger.js';
import { embeddingModelVersion } from './aiEmbeddings.js';

const ignoredWords = new Set(`a about an and are as at be between by can could did do does find for from get give had has have how i in is it look lookup me my of on or our please record records search see show tell that the their them these this those to up us was were what when where which who will with would you your invoice invoices bill bills receipt receipts customer customers vendor vendors supplier suppliers document documents reference number no balance due amount total paid cost dated date status related recent latest list old older details detail`.split(/\s+/));
const months = 'january february march april may june july august september october november december'.split(' ');
const monthPattern = months.map(month => month.length > 3 ? `${month.slice(0, 3)}(?:${month.slice(3)})?` : month).join('|');
const calendarToken = /^(?:19|20)\d{2}(?:-\d{2}){0,2}$/;

export function parseRecordQuestion(question) {
  const text = question.normalize('NFKC').toLowerCase();
  const kinds = [];
  const invoiceText = text.replace(/\b(?:vendor|supplier) invoices?\b/g, 'bill');
  if (/\binvoices?\b/.test(invoiceText)) kinds.push('invoice');
  if (/\bbills?\b/.test(invoiceText)) kinds.push('bill');
  if (/\breceipts?\b/.test(text)) kinds.push('receipt');

  const tokens = text.match(/[\p{L}\p{N}]+(?:[-/_.][\p{L}\p{N}]+)*/gu) ?? [];
  const tagged = [...text.matchAll(/#([\p{L}\p{N}]+(?:[-/_.][\p{L}\p{N}]+)*)/gu)].map(match => match[1]);
  const numbered = [...text.matchAll(/\b(?:invoice|bill|receipt|reference)\s+(?:(?:no\.?|number)\s+)?(\d{1,18})(?![\p{L}\p{N}./-])/gu)]
    .map(match => match[1]).filter(value => !calendarToken.test(value));
  const formatted = tokens.filter(token => /\p{N}/u.test(token) && /\p{L}/u.test(token) && (/[\-/_\.]/.test(token) || /^(?:inv|bill|rcpt)\d/.test(token)));
  const references = [...new Set([...tagged, ...numbered, ...formatted])].slice(0, 6);
  let keywords = text;
  for (const ref of references) keywords = keywords.replaceAll(ref, ' ');

  let range;
  const iso = keywords.match(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/)?.[0];
  const month = keywords.match(new RegExp(`\\b(${monthPattern})\\s+((?:19|20)\\d{2})\\b`));
  const year = keywords.match(/\b(?:19|20)\d{2}\b/)?.[0];
  if (iso) {
    range = { start: ledgerDate(iso, 'Document date'), end: nextDay(iso) };
    keywords = keywords.replace(iso, ' ');
  } else if (month) {
    const index = months.findIndex(value => value.startsWith(month[1]));
    range = { start: new Date(Date.UTC(Number(month[2]), index, 1)), end: new Date(Date.UTC(Number(month[2]), index + 1, 1)) };
    keywords = keywords.replace(month[0], ' ');
  } else if (year) {
    range = { start: new Date(Date.UTC(Number(year), 0, 1)), end: new Date(Date.UTC(Number(year) + 1, 0, 1)) };
    keywords = keywords.replace(year, ' ');
  }

  const terms = [...new Set((keywords.match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(term => term.length > 1 && term.length <= 48 && !ignoredWords.has(term)))].slice(0, 12);
  const listRequested = kinds.length > 0 && /\b(show|list|recent|latest)\b/.test(text);
  return { kinds, references, range, terms, listRequested };
}

const isoDay = date => date.toISOString().slice(0, 10);
const receiptDate = Prisma.sql`COALESCE(NULLIF(d."extractedData"->>'invoiceDate', ''), NULLIF(d."extractedData"->>'date', ''))`;

function recordQuery(kind, workspaceId, range) {
  if (kind === 'receipt') {
    return Prisma.sql`
      SELECT 'receipt' AS kind, d.id, d."extractedData"->>'invoiceNumber' AS reference,
        b."billNo" AS alternate, COALESCE(v.name, d."extractedData"->>'vendor') AS party,
        ${receiptDate} AS "documentDate", NULL::text AS "dueDate", d.status::text AS status,
        COALESCE(d."extractedData"->>'total', d."extractedData"->>'amount') AS total,
        d."journalEntryId" IS NOT NULL AS posted, false AS "openingBalance", d.category,
        d."createdAt"::date::text AS "uploadedOn"
      FROM "Receipt" d
      LEFT JOIN "Vendor" v ON v.id = d."vendorId" AND v."workspaceId" = d."workspaceId"
      LEFT JOIN "Bill" b ON b.id = d."billId" AND b."workspaceId" = d."workspaceId"
      WHERE d."workspaceId" = ${workspaceId}
        ${range ? Prisma.sql`AND ${receiptDate} >= ${isoDay(range.start)} AND ${receiptDate} < ${isoDay(range.end)}` : Prisma.empty}
    `;
  }
  const invoice = kind === 'invoice';
  const table = Prisma.raw(invoice ? '"Invoice"' : '"Bill"');
  const partyTable = Prisma.raw(invoice ? '"Customer"' : '"Vendor"');
  const partyId = Prisma.raw(invoice ? '"customerId"' : '"vendorId"');
  const reference = Prisma.raw(invoice ? '"invoiceNo"' : '"billNo"');
  return Prisma.sql`
    SELECT ${kind}::text AS kind, d.id, d.${reference} AS reference,
      ${invoice ? Prisma.sql`NULL::text` : Prisma.sql`d."vendorInvoiceNo"`} AS alternate, p.name AS party,
      d.date::date::text AS "documentDate", d."dueDate"::date::text AS "dueDate", d.status::text AS status,
      d.total::text AS total, d."postingEntryId" IS NOT NULL AS posted,
      d."isOpeningBalance" AS "openingBalance", NULL::text AS category, NULL::text AS "uploadedOn"
    FROM ${table} d
    JOIN ${partyTable} p ON p.id = d.${partyId} AND p."workspaceId" = d."workspaceId"
    WHERE d."workspaceId" = ${workspaceId}
      ${range ? Prisma.sql`AND d.date >= ${isoDay(range.start)}::timestamp AND d.date < ${isoDay(range.end)}::timestamp` : Prisma.empty}
  `;
}

function confirmedDate(value) {
  try { return isoDay(ledgerDate(value)); } catch { return null; }
}

function sourceLink(kind, id) {
  const encodedId = encodeURIComponent(id);
  if (kind === 'invoice') return `/sales/invoices/${encodedId}`;
  if (kind === 'bill') return `/purchases/bills/${encodedId}`;
  return `/purchases/documents?receipt=${encodedId}`;
}

const shortText = value => value?.slice(0, 160) || null;
const documentKinds = ['invoice', 'bill', 'receipt'];

export async function retrieveRecords(client, workspaceId, query) {
  const { references, terms, kinds, listRequested } = query;
  const range = references.length ? undefined : query.range;
  if (!references.length && !terms.length && !range && !listRequested) return [];
  const searches = (kinds.length ? kinds : documentKinds).map(kind => recordQuery(kind, workspaceId, range));
  const exact = references.length
    ? Prisma.sql`lower(trim(reference)) = ANY(${references}::text[]) OR lower(trim(alternate)) = ANY(${references}::text[])`
    : Prisma.sql`false`;
  const text = Prisma.sql`to_tsvector('simple', concat_ws(' ', reference, alternate, party, category))`;
  const keywords = Prisma.sql`to_tsquery('simple', ${terms.join(' | ')})`;
  // Exact references take precedence over names and partial keyword matches.
  const match = references.length ? exact : terms.length ? Prisma.sql`${text} @@ ${keywords}` : Prisma.sql`true`;
  const rank = !references.length && terms.length ? Prisma.sql`ts_rank(${text}, ${keywords})` : Prisma.sql`0`;
  return readMatches(client, Prisma.sql`
    WITH records AS (${Prisma.join(searches, ' UNION ALL ')})
    SELECT *, ${rank} AS rank FROM records WHERE ${match}
    ORDER BY rank DESC, COALESCE("documentDate", "uploadedOn") DESC NULLS LAST, kind, id LIMIT 6
  `, range);
}

export async function retrieveNearestRecords(client, workspaceId, { kinds, range }, embedding) {
  const searches = (kinds.length ? kinds : documentKinds).map(kind => recordQuery(kind, workspaceId, range));
  const vector = Prisma.sql`${JSON.stringify(embedding)}::vector`;
  return readMatches(client, Prisma.sql`
    WITH records AS (${Prisma.join(searches, ' UNION ALL ')})
    SELECT r.*, e.passage, 1 - (e.embedding <=> ${vector}) AS rank
    FROM "AiDocumentEmbedding" e
    JOIN records r ON r.id = e."sourceId" AND r.kind = e."sourceType"
    WHERE e."workspaceId" = ${workspaceId} AND e.embedding IS NOT NULL
      AND e."embeddingModel" = ${embeddingModelVersion}
      AND (e.embedding <=> ${vector}) <= 0.50
    ORDER BY e.embedding <=> ${vector}, r.kind, r.id LIMIT 6
  `, range);
}

async function readMatches(client, matches, range) {
  const rows = await client.$queryRaw`
    WITH matches AS (${matches})
    SELECT m.*, COALESCE(p.settled, 0)::text AS settled, detail.items
    FROM matches m
    LEFT JOIN LATERAL (
      SELECT SUM(s.amount) AS settled FROM "SettlementApplication" s
      WHERE s."reversedDate" IS NULL AND ((m.kind = 'invoice' AND s."invoiceId" = m.id) OR (m.kind = 'bill' AND s."billId" = m.id))
    ) p ON m.posted AND m.kind <> 'receipt'
    LEFT JOIN LATERAL (
      SELECT array_agg(item.description ORDER BY item.id) AS items FROM (
        SELECT l.id, left(l.description, 160) AS description FROM "InvoiceLine" l
        WHERE m.kind = 'invoice' AND l."invoiceId" = m.id
        UNION ALL
        SELECT l.id, left(l.description, 160) AS description FROM "BillLine" l
        WHERE m.kind = 'bill' AND l."billId" = m.id
        ORDER BY id LIMIT 3
      ) item
    ) detail ON m.kind <> 'receipt'
    ORDER BY m.rank DESC, COALESCE(m."documentDate", m."uploadedOn") DESC NULLS LAST, m.kind, m.id
  `;
  return rows.flatMap(row => {
    const date = confirmedDate(row.documentDate);
    if (range && !date) return [];
    const total = /^\d{1,13}(?:\.\d{1,2})?$/.test(row.total ?? '') ? new Decimal(row.total).toFixed(2) : null;
    const reference = shortText(row.reference) ?? (row.kind === 'receipt' ? 'Receipt' : 'Document');
    const party = shortText(row.party);
    const label = row.kind === 'receipt' ? [reference, party, date].filter(Boolean).join(' · ') : reference;
    return [{
      source: { label, href: sourceLink(row.kind, row.id) },
      ...(row.passage && { passage: row.passage }),
      facts: {
        kind: row.kind, reference, relatedReference: shortText(row.alternate), party, date, total,
        status: row.status, category: shortText(row.category), uploadedOn: row.uploadedOn,
        dueDate: row.dueDate, openingBalance: row.openingBalance,
        ledgerPosted: row.posted,
        sampleLineDescriptions: row.items ?? [],
        amountSettled: row.kind !== 'receipt' && row.posted ? new Decimal(row.settled).toFixed(2) : null,
        balanceDue: row.kind !== 'receipt' && row.posted && total !== null
          ? (row.status === 'VOID' ? '0.00' : new Decimal(total).minus(row.settled).toFixed(2)) : null,
      },
    }];
  });
}
