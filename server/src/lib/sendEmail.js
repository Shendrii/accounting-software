import { Resend } from 'resend';

/**
 * Send an invoice PDF via Resend.
 * Requires RESEND_API_KEY in server/.env
 * Optional: RESEND_FROM — defaults to onboarding@resend.dev (works without a custom domain)
 */
export async function sendInvoiceEmail({ to, invoiceNo, pdfBuffer, customerName }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM || 'Accounting <onboarding@resend.dev>';

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `Invoice #${invoiceNo}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1d4ed8">Invoice #${invoiceNo}</h2>
        <p>Dear ${customerName},</p>
        <p>Please find your invoice attached to this email.</p>
        <p>Thank you for your business.</p>
        <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0"/>
        <p style="font-size:12px;color:#71717a">This email was sent automatically by your accounting system.</p>
      </div>
    `,
    attachments: [
      {
        filename: `Invoice-${invoiceNo}.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  if (error) throw new Error(error.message);
  return { messageId: data.id, previewUrl: null };
}
