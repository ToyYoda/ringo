import nodemailer from 'nodemailer';
import { config } from './config.js';

let transport = null;

export const mailEnabled = () => Boolean(config.smtp.host && config.smtp.from);

export async function sendMail({ to, subject, text }) {
  if (!mailEnabled()) throw new Error('E-Mail-Versand ist nicht konfiguriert (SMTP_HOST/SMTP_FROM).');
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
}

/**
 * EPC QR code payload ("GiroCode") – scanned by German/EU banking apps to prefill a SEPA transfer.
 * Spec: EPC069-12, version 002, UTF-8.
 */
export function epcPayload({ name, iban, amountCents, text }) {
  const amount = amountCents ? `EUR${(amountCents / 100).toFixed(2)}` : '';
  return ['BCD', '002', '1', 'SCT', '', name.slice(0, 70), iban.replace(/\s+/g, '').toUpperCase(), amount, '', '', (text || '').slice(0, 140)].join('\n');
}
