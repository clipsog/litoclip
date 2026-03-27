const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
let initialized = false;

function hasSmtpConfig() {
  const s = config.smtp || {};
  return !!(s.host && s.port && s.user && s.pass && s.fromEmail);
}

function getTransporter() {
  if (initialized) return transporter;
  initialized = true;
  if (!hasSmtpConfig()) return null;

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: !!config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

async function sendSupportReplyEmail({ toEmail, toName, subject, replyText }) {
  const tx = getTransporter();
  if (!tx) return { ok: false, skipped: true, reason: 'SMTP not configured' };
  if (!toEmail) return { ok: false, skipped: true, reason: 'No recipient email' };

  const safeName = toName || 'there';
  const s = subject || 'Reply from LitoClips Support';
  const plain = [
    `Hi ${safeName},`,
    '',
    'LitoClips Support replied to your request:',
    '',
    String(replyText || ''),
    '',
    'You can also view this reply in your dashboard inbox.',
    '',
    '— LitoClips Support'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;">
      <p>Hi ${safeName},</p>
      <p><strong>LitoClips Support</strong> replied to your request:</p>
      <blockquote style="margin:12px 0;padding:12px 14px;border-left:4px solid #2563eb;background:#f8fafc;color:#1e293b;white-space:pre-wrap;">${String(replyText || '').replace(/</g, '&lt;')}</blockquote>
      <p>You can also view this reply in your dashboard inbox.</p>
      <p style="margin-top:20px;color:#475569;">— LitoClips Support</p>
    </div>
  `;

  const info = await tx.sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
    to: toEmail,
    subject: s,
    text: plain,
    html,
  });
  return { ok: true, messageId: info && info.messageId ? info.messageId : null };
}

module.exports = { sendSupportReplyEmail };

