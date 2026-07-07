/**
 * Quick Resend SMTP test — run from backend/ directory:
 *
 *   SMTP_HOST=smtp.resend.com \
 *   SMTP_PORT=465 \
 *   SMTP_USER=resend \
 *   SMTP_PASS=re_xxxxxxxxxxxx \
 *   EMAIL_FROM="ALPAS TAMS <onboarding@resend.dev>" \
 *   TEST_TO=your@email.com \
 *   npx ts-node test-email.ts
 */

import nodemailer from 'nodemailer';

const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'TEST_TO'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('❌ Missing env vars:', missing.join(', '));
  process.exit(1);
}

const port = parseInt(process.env.SMTP_PORT!);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function main() {
  console.log(`\nTesting SMTP: ${process.env.SMTP_HOST}:${port}`);
  console.log(`From: ${process.env.EMAIL_FROM}`);
  console.log(`To:   ${process.env.TEST_TO}\n`);

  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified.\nSending test email...');

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.TEST_TO,
      subject: 'ALPAS TAMS — Resend Test ✓',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#fff;border-radius:12px;border:1px solid #e5e5e5;">
          <h2 style="color:#111;margin:0 0 12px;">✅ Resend is working!</h2>
          <p style="color:#555;">Your ALPAS TAMS email integration with Resend is configured correctly.</p>
          <p style="color:#888;font-size:12px;margin-top:24px;">Sent at: ${new Date().toISOString()}</p>
        </div>
      `,
    });

    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('\nCheck your Resend dashboard → Emails tab for delivery status.');
  } catch (err: any) {
    console.error('❌ Failed:', err.message);
    if (err.code === 'EAUTH') {
      console.error('   → API key is wrong or not active.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('   → Cannot connect to SMTP host. Check SMTP_HOST/SMTP_PORT.');
    }
    process.exit(1);
  }
}

main();
