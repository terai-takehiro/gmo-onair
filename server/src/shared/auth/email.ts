// メール送信 — Nodemailer SMTP / 未設定時はコンソールログ (開発用)
import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });
  return transporter;
}

interface SendMailOpts {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(opts: SendMailOpts): Promise<boolean> {
  const tp = getTransporter();
  const from = process.env.SMTP_FROM || 'noreply@gmo-onair.local';

  if (!tp) {
    console.log(`\n========== [DEV] EMAIL to: ${opts.to} ==========`);
    console.log(`Subject: ${opts.subject}`);
    console.log(opts.html.replace(/<[^>]*>/g, ''));
    console.log('================================================\n');
    return true;
  }

  try {
    await tp.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return true;
  } catch (err) {
    console.error('[EMAIL] Send failed:', err);
    return false;
  }
}
