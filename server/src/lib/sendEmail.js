import dns from 'node:dns';
import nodemailer from 'nodemailer';

// Force IPv4 DNS resolution — Render free tier blocks outbound IPv6
dns.setDefaultResultOrder('ipv4first');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function smtpAuth() {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  return { user, pass };
}

export function isSmtpConfigured() {
  const { user, pass } = smtpAuth();
  return Boolean(user && pass);
}

function createTransporter() {
  const { user, pass } = smtpAuth();
  if (!user || !pass) {
    throw new Error('SMTP is not configured: set SMTP_USER and SMTP_PASS (or GMAIL_USER and GMAIL_APP_PASSWORD)');
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: port === 587,
    // Force IPv4 — Render free tier blocks outbound IPv6
    family: 4,
    auth: { user, pass },
  });
}

/**
 * Send an invoice PDF via SMTP (e.g. Gmail with an app password).
 * See server/.env.example for variables.
 */
export async function sendInvoiceEmail({ to, invoiceNo, pdfBuffer, customerName }) {
  const transporter = createTransporter();
  const { user } = smtpAuth();
  const fromRaw = process.env.SMTP_FROM || process.env.MAIL_FROM || user;
  const from = fromRaw.includes('<') ? fromRaw : `Accounting <${fromRaw}>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject: `Invoice #${invoiceNo}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1d4ed8">Invoice #${escapeHtml(invoiceNo)}</h2>
        <p>Dear ${escapeHtml(customerName)},</p>
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
        contentType: 'application/pdf',
      },
    ],
  });

  return { messageId: info.messageId, previewUrl: null };
}

/**
 * Send a workspace invite email via SMTP.
 */
export async function sendInviteEmail({ to, inviterName, workspaceName, inviteUrl }) {
  const transporter = createTransporter();
  const { user } = smtpAuth();
  const fromRaw = process.env.SMTP_FROM || process.env.MAIL_FROM || user;
  const from = fromRaw.includes('<') ? fromRaw : `Accounting <${fromRaw}>`;

  const info = await transporter.sendMail({
    from,
    to,
    subject: `You've been invited to join ${escapeHtml(workspaceName)}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1d4ed8">Workspace Invitation</h2>
        <p>Hi,</p>
        <p><strong>${escapeHtml(inviterName)}</strong> has invited you to join the workspace <strong>${escapeHtml(workspaceName)}</strong> on Accounting.</p>
        <p style="margin:24px 0">
          <a href="${inviteUrl}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
            Accept Invitation
          </a>
        </p>
        <p style="color:#71717a;font-size:13px">Or copy this link: <a href="${inviteUrl}">${inviteUrl}</a></p>
        <p style="color:#71717a;font-size:13px">This invite expires in 7 days.</p>
        <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0"/>
        <p style="font-size:12px;color:#71717a">If you did not expect this invitation, you can ignore this email.</p>
      </div>
    `,
  });

  return { messageId: info.messageId };
}
