const nodemailer = require('nodemailer');
const config = require('../config');

function adminNotifyRecipients() {
  if (config.adminNotifyEmails && config.adminNotifyEmails.length) return config.adminNotifyEmails;
  return [];
}

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
    family: Number.isFinite(config.smtp.family) ? config.smtp.family : 4,
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

/**
 * Notify admins when a creator starts a new campaign (requires SMTP + ADMIN_NOTIFY_EMAILS).
 */
async function sendAdminNewCampaignEmail({
  campaignId,
  campaignTitle,
  ownerName,
  ownerEmail,
  contentLink,
  platforms,
  numAccounts,
  allowWatermark,
  watermarkCouponPercent,
  acceptSponsorOffers,
}) {
  const recipients = adminNotifyRecipients();
  const tx = getTransporter();
  if (!tx) return { ok: false, skipped: true, reason: 'SMTP not configured' };
  if (!recipients.length) return { ok: false, skipped: true, reason: 'ADMIN_NOTIFY_EMAILS not set' };

  const title = campaignTitle || 'Untitled';
  const subj = `[LitoClips] New campaign: ${title}`;
  const wm = allowWatermark
    ? `Yes — ${watermarkCouponPercent != null ? watermarkCouponPercent : 10}% pricing coupon`
    : 'No';
  const sponsor = acceptSponsorOffers ? 'Yes' : 'No';
  const plain = [
    'A creator started a new campaign.',
    '',
    `Campaign: ${title}`,
    `ID: ${campaignId}`,
    `Owner: ${ownerName || '—'} <${ownerEmail || '—'}>`,
    `Content link(s): ${contentLink || '—'}`,
    `Platforms: ${platforms || '—'}`,
    `Accounts requested: ${numAccounts != null ? numAccounts : '—'}`,
    `Watermark opt-in: ${wm}`,
    `Sponsor offers opt-in: ${sponsor}`,
    '',
    'Open the admin dashboard to link accounts and post URLs.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;">
      <p><strong>New campaign started</strong></p>
      <table style="border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Campaign</td><td><strong>${String(title).replace(/</g, '&lt;')}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">ID</td><td><code>${String(campaignId || '').replace(/</g, '&lt;')}</code></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Owner</td><td>${String(ownerName || '—').replace(/</g, '&lt;')} &lt;${String(ownerEmail || '—').replace(/</g, '&lt;')}&gt;</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top;">Content</td><td>${String(contentLink || '—').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Platforms</td><td>${String(platforms || '—').replace(/</g, '&lt;')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Accounts</td><td>${numAccounts != null ? numAccounts : '—'}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Watermark</td><td>${wm.replace(/</g, '&lt;')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Sponsor offers</td><td>${sponsor}</td></tr>
      </table>
      <p style="margin-top:16px;color:#475569;">Use the admin dashboard to add running accounts and post links for the calendar.</p>
    </div>
  `;

  const info = await tx.sendMail({
    from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
    to: recipients.join(', '),
    subject: subj,
    text: plain,
    html,
  });
  return { ok: true, messageId: info && info.messageId ? info.messageId : null };
}

module.exports = { sendSupportReplyEmail, sendAdminNewCampaignEmail };

