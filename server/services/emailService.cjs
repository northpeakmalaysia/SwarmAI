/**
 * Email Service
 * Handles sending emails via SMTP (AWS SES or other)
 */

const nodemailer = require('nodemailer');
const { logger } = require('./logger.cjs');

// SMTP Configuration
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@swarm.ai';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3202';

let transporter = null;

/**
 * Initialize email transporter
 */
function initEmailService() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logger.warn('Email service not configured - SMTP settings missing');
    return false;
  }

  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    logger.info(`Email service initialized: ${SMTP_HOST}:${SMTP_PORT}`);
    return true;
  } catch (error) {
    logger.error(`Failed to initialize email service: ${error.message}`);
    return false;
  }
}

/**
 * Send magic link email
 */
async function sendMagicLink(email, token) {
  if (!transporter) {
    // Try to initialize if not already
    if (!initEmailService()) {
      throw new Error('Email service not configured');
    }
  }

  const magicLink = `${FRONTEND_URL}/auth/magic-link?token=${token}`;
  const year = new Date().getFullYear();

  const mailOptions = {
    from: EMAIL_FROM,
    to: email,
    subject: 'Sign in to SwarmAI',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to SwarmAI</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #12121a; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1));">
              <img src="https://agents.northpeak.app/swarm-icon.png" alt="SwarmAI" width="80" height="80" style="display: block; margin: 0 auto 16px; width: 80px; height: 80px;" />
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">SwarmAI</h1>
              <p style="margin: 8px 0 0; color: #9ca3af; font-size: 14px;">Multi-Agent Intelligence Platform</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">
              <h2 style="margin: 0 0 16px; color: #ffffff; font-size: 20px; font-weight: 600;">Sign in to your account</h2>
              <p style="margin: 0 0 24px; color: #9ca3af; font-size: 16px; line-height: 1.6;">
                Click the button below to sign in to SwarmAI. This link will expire in 15 minutes.
              </p>

              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${magicLink}"
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6, #9333ea); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);">
                      Sign in to SwarmAI
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0; padding: 12px; background-color: #1a1a24; border-radius: 8px; word-break: break-all;">
                <a href="${magicLink}" style="color: #60a5fa; text-decoration: none; font-size: 13px;">${magicLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #1f2937;">
              <p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6;">
                If you didn't request this email, you can safely ignore it. This link will expire in 15 minutes.
              </p>
              <p style="margin: 16px 0 0; color: #4b5563; font-size: 12px;">
                &copy; ${year} SwarmAI. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`,
    text: `Sign in to SwarmAI

Click the link below to sign in to your account. This link will expire in 15 minutes.

${magicLink}

If you didn't request this email, you can safely ignore it.

SwarmAI - Multi-Agent Intelligence Platform`
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info(`Magic link sent to ${email}: ${result.messageId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send magic link to ${email}: ${error.message}`);
    throw error;
  }
}

/**
 * Send generic email
 */
async function sendEmail(to, subject, html, text) {
  if (!transporter) {
    if (!initEmailService()) {
      throw new Error('Email service not configured');
    }
  }

  const mailOptions = {
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${to}: ${result.messageId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error.message}`);
    throw error;
  }
}

/**
 * Send email with file attachments
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body (optional)
 * @param {string} text - Plain text body (optional)
 * @param {Array<{filename: string, path: string}>} attachments - Nodemailer attachments array
 */
async function sendEmailWithAttachments(to, subject, html, text, attachments = []) {
  if (!transporter) {
    if (!initEmailService()) {
      throw new Error('Email service not configured');
    }
  }

  const mailOptions = {
    from: EMAIL_FROM,
    to,
    subject,
    html,
    text,
    attachments,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info(`Email with ${attachments.length} attachment(s) sent to ${to}: ${result.messageId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send email with attachments to ${to}: ${error.message}`);
    throw error;
  }
}

/**
 * Verify email service connection
 */
async function verifyConnection() {
  if (!transporter) {
    if (!initEmailService()) {
      return false;
    }
  }

  try {
    await transporter.verify();
    logger.info('Email service connection verified');
    return true;
  } catch (error) {
    logger.error(`Email service verification failed: ${error.message}`);
    return false;
  }
}

module.exports = {
  initEmailService,
  sendMagicLink,
  sendEmail,
  sendEmailWithAttachments,
  verifyConnection
};
