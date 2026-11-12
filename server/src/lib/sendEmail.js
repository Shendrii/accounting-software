import { lookup as dnsLookup } from 'node:dns';
import nodemailer from 'nodemailer';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Brevo HTTP API ────────────────────────────────────────────────────────────

function isBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY);
}

function parseEmail(raw) {
  // Handles both "Name <email>" and plain "email" formats
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].trim() : raw.trim();
}

function parseName(raw) {
  const match = raw.match(/^(.+?)\s*</);
  return match ? match[1].trim() : 'Accounting';
}

async function brevoSend({ from, fromName, to, subject, html, attachments = [], signal }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = parseEmail(from);
  const senderName = fromName || parseName(from);
  const body = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  if (attachments.length > 0) {
    body.attachment = attachments.map(({ filename, content }) => ({
      name: filename,
      content: Buffer.isBuffer(content) ? content.toString('base64') : content,
    }));
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return { messageId: data.messageId };
}

// ─── SMTP (Nodemailer) ─────────────────────────────────────────────────────────

function smtpAuth() {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  return { user, pass };
}

function isSmtpConfigured() {
  const { user, pass } = smtpAuth();
  return Boolean(user && pass);
}

function createTransporter(options = {}) {
  const { user, pass } = smtpAuth();
  if (!user || !pass) {
    throw new Error('SMTP is not configured: set SMTP_USER and SMTP_PASS');
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: port === 587,
    auth: { user, pass },
    lookup: (hostname, options, callback) => {
      dnsLookup(hostname, { ...options, family: 4 }, callback);
    },
    ...options,
  });
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function isEmailConfigured() {
  return isBrevoConfigured() || isSmtpConfigured();
}

export async function sendInvoiceReminderEmail({ to, subject, message }) {
  const html = '<div style="font-family:sans-serif;white-space:pre-wrap">' + escapeHtml(message) + '</div>';
  if (isBrevoConfigured()) return brevoSend({ from: process.env.SMTP_FROM || process.env.BREVO_FROM || process.env.SMTP_USER || '', to, subject, html, signal: AbortSignal.timeout(20000) });
  return createTransporter({ connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 }).sendMail({ from: process.env.SMTP_FROM || process.env.MAIL_FROM || smtpAuth().user, to, subject, text: message, html });
}

export async function sendAccountEmail({ to, purpose, url }) {
  const subject = purpose === 'VERIFY_EMAIL' ? 'Verify your Accountrix email' : 'Reset your Accountrix password';
  const html = `<h2>${subject}</h2><p><a href="${escapeHtml(url)}">${subject}</a></p><p>This link expires in one hour. If you did not request it, ignore this message.</p>`;
  if (isBrevoConfigured()) return brevoSend({ from: process.env.SMTP_FROM || process.env.BREVO_FROM || process.env.SMTP_USER || '', to, subject, html });
  return createTransporter().sendMail({ from: process.env.SMTP_FROM || process.env.MAIL_FROM || smtpAuth().user, to, subject, html });
}

// Keep backward-compat alias used in invoices/workspaces routes
export { isEmailConfigured as isSmtpConfigured };

/**
 * Send an invoice PDF by email (Brevo preferred, SMTP fallback).
 */
export async function sendInvoiceEmail({ to, invoiceNo, pdfBuffer, customerName }) {
  const subject = `Invoice #${invoiceNo}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1d4ed8">Invoice #${escapeHtml(invoiceNo)}</h2>
      <p>Dear ${escapeHtml(customerName)},</p>
      <p>Please find your invoice attached to this email.</p>
      <p>Thank you for your business.</p>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0"/>
      <p style="font-size:12px;color:#71717a">This email was sent automatically by your accounting system.</p>
    </div>
  `;

  if (isBrevoConfigured()) {
    console.log('📧 Sending invoice via Brevo HTTP API');
    const from = process.env.SMTP_FROM || process.env.BREVO_FROM || process.env.SMTP_USER || '';
    return brevoSend({
      from,
      to,
      subject,
      html,
      attachments: [{ filename: `Invoice-${invoiceNo}.pdf`, content: pdfBuffer }],
    });
  }

  const transporter = createTransporter();
  const { user } = smtpAuth();
  const fromRaw = process.env.SMTP_FROM || process.env.MAIL_FROM || user;
  const from = fromRaw.includes('<') ? fromRaw : `Accounting <${fromRaw}>`;

  console.log('📧 Sending invoice via SMTP');
  const info = await transporter.sendMail({
    from, to, subject, html,
    attachments: [{ filename: `Invoice-${invoiceNo}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
  });
  return { messageId: info.messageId };
}

/**
 * Send a workspace invite email (Brevo preferred, SMTP fallback).
 */
export async function sendInviteEmail({ to, inviterName, workspaceName, inviteUrl }) {
  const subject = `You've been invited to join ${workspaceName}`;
  const html = `
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
  `;

  if (isBrevoConfigured()) {
    console.log('📧 Sending invite via Brevo HTTP API');
    const from = process.env.SMTP_FROM || process.env.BREVO_FROM || process.env.SMTP_USER || '';
    return brevoSend({ from, to, subject, html });
  }

  const transporter = createTransporter();
  const { user } = smtpAuth();
  const fromRaw = process.env.SMTP_FROM || process.env.MAIL_FROM || user;
  const from = fromRaw.includes('<') ? fromRaw : `Accounting <${fromRaw}>`;

  console.log('📧 Sending invite via SMTP');
  const info = await transporter.sendMail({ from, to, subject, html });
  return { messageId: info.messageId };
}
