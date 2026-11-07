/**
 * Parse OCR text from a receipt/invoice into structured JSON.
 * Uses GPT-3.5 when OPENAI_API_KEY is set; otherwise uses regex fallback.
 * Extracts: Due Date, Invoice Date, Invoice Number, Total, Amount Paid, Balance Due, Items.
 */
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

const SYSTEM_PROMPT = `You are an invoice and receipt parser. Given raw OCR text from a receipt or invoice image, extract structured data.
Return ONLY a valid JSON object with these exact keys (no markdown, no code block):
- vendor (string): merchant/store/supplier name
- invoiceDate (string): invoice date in YYYY-MM-DD if found, else empty string
- dueDate (string): due date in YYYY-MM-DD if found, else empty string
- invoiceNumber (string): invoice or receipt number
- total (number): total amount as a number (e.g. 99.99)
- amountPaid (number): amount paid if shown, else 0
- balanceDue (number): balance due if shown, else 0
- tax (number): tax shown separately from line items, else 0. Do not count tax twice if included in the item amounts.
- tip (number): tip shown separately from line items, else 0
- items (array): list of line items, each with "description" (string) and "amount" (number). If none found use []
- category (string): expense category e.g. "Office Supplies", "Meals", "Travel" (optional)
- confidence (number): 0 to 1, how confident you are in the extraction

If a field cannot be determined: use empty string for strings, 0 for numbers, [] for items, 0.5 for confidence.
For dates use YYYY-MM-DD only. For amounts use numbers without currency symbols.`;

/** Parse MM/DD/YYYY or similar to YYYY-MM-DD */
function normalizeDate(str) {
  if (!str || typeof str !== 'string') return '';
  const mdy = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (mdy) {
    const [, month, day, year] = mdy;
    const y = year.length === 2 ? `20${year}` : year;
    return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const iso = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  return '';
}

/** Extract a number after a label (e.g. "Total" -> 800.00); allows newline between label and number */
function numberAfterLabel(text, label) {
  const re = new RegExp(`${label}[\\s:]*[\\s\\S]*?([\\d,]+\\.?\\d*)`, 'i');
  const m = text.match(re);
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/**
 * Fallback parser when GPT is not available. Uses regex on OCR text.
 */
export function parseReceiptFallback(ocrText) {
  if (!ocrText || typeof ocrText !== 'string') return null;
  const text = ocrText.replace(/\r\n/g, '\n');
  const result = {
    vendor: '',
    invoiceDate: '',
    dueDate: '',
    invoiceNumber: '',
    total: 0,
    amountPaid: 0,
    balanceDue: 0,
    items: [],
    category: '',
    confidence: 0.4,
  };

  // Invoice # (e.g. "Invoice # 123456" or "Invoice #: 123456")
  const invNum = text.match(/(?:Invoice\s*#?\s*:?\s*)(\d+)/i);
  if (invNum) result.invoiceNumber = invNum[1].trim();

  // Invoice Date (e.g. "Invoice Date 09/18/2020" or "Invoice Date: 09/18/2020")
  const invDate = text.match(/(?:Invoice\s+Date\s*:?\s*)([\d\/\-\.]+)/i);
  if (invDate) result.invoiceDate = normalizeDate(invDate[1].trim());

  // Due Date
  const dueDate = text.match(/(?:Due\s+Date\s*:?\s*)([\d\/\-\.]+)/i);
  if (dueDate) result.dueDate = normalizeDate(dueDate[1].trim());

  // Totals (case-insensitive)
  const total = numberAfterLabel(text, 'Total');
  const amountPaid = numberAfterLabel(text, 'Amount Paid');
  const balanceDue = numberAfterLabel(text, 'Balance Due');
  if (total > 0) result.total = total;
  if (amountPaid > 0) result.amountPaid = amountPaid;
  if (balanceDue > 0) result.balanceDue = balanceDue;
  if (result.total === 0 && result.balanceDue > 0) result.total = result.balanceDue;
  if (result.total === 0 && total === 0 && balanceDue === 0) {
    const subtotal = numberAfterLabel(text, 'Subtotal');
    if (subtotal > 0) result.total = subtotal;
  }

  // Vendor: first line that looks like a business name (before "INVOICE" or "Invoice #")
  const beforeInvoice = text.split(/\bINVOICE\b/i)[0] || '';
  const lines = beforeInvoice.split(/\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length > 0 && lines[0].length > 2 && !/^\d+$/.test(lines[0])) {
    result.vendor = lines[0].slice(0, 120);
  }

  return result;
}

export async function parseReceiptWithGPT(ocrText) {
  if (process.env.OPENAI_API_KEY) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `OCR text:\n${ocrText}` },
        ],
        temperature: 0.2,
      });
      const content = completion.choices?.[0]?.message?.content?.trim();
      if (content) {
        const cleaned = content.replace(/^```json?\s*|\s*```$/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (parsed.items != null && !Array.isArray(parsed.items)) parsed.items = [];
        if (parsed.items) {
          parsed.items = parsed.items.map((it) => ({
            description: typeof it?.description === 'string' ? it.description : String(it?.description ?? ''),
            amount: typeof it?.amount === 'number' ? it.amount : parseFloat(it?.amount) || 0,
          }));
        }
        return parsed;
      }
    } catch (e) {
      console.error('GPT parse error:', e.message);
    }
  }
  return parseReceiptFallback(ocrText);
}
