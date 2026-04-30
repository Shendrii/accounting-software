import PDFDocument from 'pdfkit';

/**
 * Generates a PDF invoice and pipes it to a writable stream (or returns a buffer).
 * @param {object} invoice - Full invoice object with lines and customer
 * @returns {Buffer} PDF buffer
 */
export function generateInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const primary = '#1d4ed8';
    const lightGray = '#f4f4f5';
    const textGray = '#71717a';
    const dark = '#18181b';

    // ── Header ────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill(primary);
    doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text('INVOICE', 50, 28);
    doc.fillColor('#93c5fd').fontSize(10).font('Helvetica').text(`#${invoice.invoiceNo}`, 50, 58);

    // Company name (right side of header)
    doc
      .fillColor('#ffffff')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Your Company', doc.page.width - 200, 28, { width: 150, align: 'right' });

    doc.moveDown(2);
    doc.y = 100;

    // ── Bill To / Invoice Details ─────────────────────────────────────────
    doc.fillColor(textGray).fontSize(8).font('Helvetica-Bold').text('BILL TO', 50, 100);
    doc
      .fillColor(dark)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(invoice.customer?.name ?? 'Customer', 50, 114);
    if (invoice.customer?.email) {
      doc.fillColor(textGray).fontSize(9).font('Helvetica').text(invoice.customer.email, 50, 130);
    }
    if (invoice.customer?.address) {
      doc.fillColor(textGray).fontSize(9).text(invoice.customer.address, 50, 143);
    }

    // Right column — dates
    const rightX = 350;
    const col2 = 450;
    const dateRows = [
      ['Invoice Date:', new Date(invoice.date).toLocaleDateString()],
      ['Due Date:', new Date(invoice.dueDate).toLocaleDateString()],
      ['Status:', invoice.status],
    ];
    let rowY = 100;
    for (const [label, value] of dateRows) {
      doc.fillColor(textGray).fontSize(8).font('Helvetica-Bold').text(label, rightX, rowY);
      doc.fillColor(dark).fontSize(9).font('Helvetica').text(value, col2, rowY);
      rowY += 16;
    }

    // ── Line items table ───────────────────────────────────────────────────
    const tableTop = 200;
    const colX = { desc: 50, qty: 300, price: 370, amount: 460 };

    // Header row background
    doc.rect(50, tableTop, doc.page.width - 100, 22).fill(lightGray);
    doc
      .fillColor(textGray)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('DESCRIPTION', colX.desc + 5, tableTop + 7)
      .text('QTY', colX.qty, tableTop + 7)
      .text('UNIT PRICE', colX.price, tableTop + 7)
      .text('AMOUNT', colX.amount, tableTop + 7);

    let y = tableTop + 28;
    for (const line of invoice.lines ?? []) {
      const qty = parseFloat(line.quantity.toString());
      const price = parseFloat(line.unitPrice.toString());
      const amount = parseFloat(line.amount.toString());

      doc.fillColor(dark).fontSize(9).font('Helvetica');
      doc.text(line.description, colX.desc + 5, y, { width: 240 });
      doc.text(qty.toFixed(2), colX.qty, y);
      doc.text(fmt(price), colX.price, y);
      doc.text(fmt(amount), colX.amount, y);

      y += 20;
      // Separator line
      doc.moveTo(50, y - 5).lineTo(doc.page.width - 50, y - 5).strokeColor('#e4e4e7').lineWidth(0.5).stroke();
    }

    // ── Totals ────────────────────────────────────────────────────────────
    y += 10;
    const subtotal = parseFloat(invoice.subtotal.toString());
    const tax = parseFloat(invoice.tax.toString());
    const total = parseFloat(invoice.total.toString());

    const totals = [
      ['Subtotal', fmt(subtotal)],
      ...(tax > 0 ? [['Tax', fmt(tax)]] : []),
      ['Total', fmt(total)],
    ];

    for (const [label, value] of totals) {
      const isTotal = label === 'Total';
      if (isTotal) {
        doc.rect(350, y - 3, doc.page.width - 400, 22).fill(primary);
        doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      } else {
        doc.fillColor(textGray).fontSize(9).font('Helvetica');
      }
      doc.text(label, 350, y + (isTotal ? 1 : 0));
      doc.text(value, col2, y + (isTotal ? 1 : 0));
      y += isTotal ? 26 : 18;
    }

    // ── Notes ─────────────────────────────────────────────────────────────
    if (invoice.notes) {
      y += 20;
      doc.fillColor(textGray).fontSize(8).font('Helvetica-Bold').text('NOTES', 50, y);
      doc.fillColor(dark).fontSize(9).font('Helvetica').text(invoice.notes, 50, y + 14, { width: 400 });
    }

    // ── Footer ─────────────────────────────────────────────────────────────
    doc
      .fillColor(textGray)
      .fontSize(8)
      .font('Helvetica')
      .text('Thank you for your business.', 50, doc.page.height - 60, { align: 'center', width: doc.page.width - 100 });

    doc.end();
  });
}

function fmt(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
