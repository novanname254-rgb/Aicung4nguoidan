/**
 * Gửi email (SMTP) – dùng cho "Quên mật khẩu".
 *
 * Biến môi trường:
 *   SMTP_USER  – tài khoản gửi, VD: lifecare.app@gmail.com
 *   SMTP_PASS  – mật khẩu ứng dụng (App Password 16 ký tự của Google), KHÔNG phải mật khẩu Gmail
 *   SMTP_HOST  – mặc định smtp.gmail.com
 *   SMTP_PORT  – mặc định 465 (SSL)
 *   MAIL_FROM  – tên hiển thị người gửi, mặc định "LifeCare <SMTP_USER>"
 */
const nodemailer = require('nodemailer');

let transporter = null;

const isMailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  if (!isMailConfigured()) throw new Error('Chưa cấu hình gửi email (SMTP_USER / SMTP_PASS).');
  const from = process.env.MAIL_FROM || `LifeCare <${process.env.SMTP_USER}>`;
  return getTransporter().sendMail({ from, to, subject, text, html });
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Nội dung email mật khẩu tạm thời (tiếng Việt / tiếng Anh). */
function tempPasswordEmail({ name, tempPassword, minutes, lang = 'vi', appUrl }) {
  const vi = lang !== 'en';
  const hello = vi ? `Chào ${name || 'bạn'},` : `Hi ${name || 'there'},`;
  const lines = vi
    ? [
        'Bạn (hoặc ai đó) vừa yêu cầu khôi phục mật khẩu LifeCare cho email này.',
        `Mật khẩu tạm thời của bạn: ${tempPassword}`,
        `Mật khẩu này dùng được trong ${minutes} phút. Sau khi đăng nhập, hãy vào Cài đặt → Đổi mật khẩu để đặt mật khẩu mới.`,
        'Nếu bạn không yêu cầu, cứ bỏ qua email này: mật khẩu cũ của bạn vẫn dùng bình thường.'
      ]
    : [
        'You (or someone else) asked to recover the LifeCare password for this email.',
        `Your temporary password: ${tempPassword}`,
        `It works for ${minutes} minutes. After signing in, go to Settings → Change password to set a new one.`,
        'If you did not ask for this, just ignore this email: your current password still works.'
      ];
  const subject = vi ? 'LifeCare – Mật khẩu tạm thời' : 'LifeCare – Temporary password';
  const text = [hello, '', ...lines, '', appUrl || ''].join('\n');
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#334155;line-height:1.55">
    <h2 style="color:#6C9CE8;margin:0 0 12px">LifeCare</h2>
    <p>${escapeHtml(hello)}</p>
    <p>${escapeHtml(lines[0])}</p>
    <p style="margin:18px 0">${vi ? 'Mật khẩu tạm thời:' : 'Temporary password:'}<br>
      <span style="display:inline-block;margin-top:6px;padding:10px 16px;border-radius:10px;background:#EEF4FD;font-size:20px;font-weight:bold;letter-spacing:2px;color:#1E293B;font-family:monospace">${escapeHtml(tempPassword)}</span></p>
    <p>${escapeHtml(lines[2])}</p>
    <p style="color:#64748B;font-size:13px">${escapeHtml(lines[3])}</p>
    ${appUrl ? `<p><a href="${escapeHtml(appUrl)}" style="color:#6C9CE8">${escapeHtml(appUrl)}</a></p>` : ''}
  </div>`;
  return { subject, text, html };
}

module.exports = { isMailConfigured, sendMail, tempPasswordEmail };
