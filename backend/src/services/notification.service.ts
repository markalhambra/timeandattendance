import nodemailer from 'nodemailer';
import { prisma } from '../config/database';
import { NotificationType } from '@prisma/client';
import { logger } from '../config/logger';

const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for SSL (465), false for STARTTLS (587)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Log SMTP config at startup — visible in Vercel function cold-start logs
if (process.env.SMTP_HOST) {
  logger.info(`SMTP configured: ${process.env.SMTP_HOST}:${SMTP_PORT} user=${process.env.SMTP_USER} from=${process.env.EMAIL_FROM}`);
} else {
  logger.warn('SMTP_HOST is not set — all outbound emails will be skipped.');
}

const APP_URL = process.env.FRONTEND_URL || 'https://tams.alpas.ph';

// ─── Email Templates ─────────────────────────────────────────────────────────

function emailBase(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#000;padding:28px 36px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:bold;letter-spacing:-0.5px;">ALPAS TAMS</p>
          <p style="margin:4px 0 0;color:#888;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Time &amp; Attendance System</p>
        </td></tr>
        <tr><td style="padding:36px;">
          <h2 style="margin:0 0 20px;font-size:22px;color:#111;font-weight:bold;">${title}</h2>
          ${bodyContent}
        </td></tr>
        <tr><td style="background:#fafafa;padding:18px 36px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;color:#999;font-size:12px;">This is an automated message from ALPAS TAMS. Do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function requestEmail(requesterName: string, typeName: string, date: string): string {
  return emailBase(
    `New ${typeName}`,
    `<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
      <strong>${requesterName}</strong> has submitted a <strong>${typeName}</strong> that requires your approval.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="color:#888;font-size:13px;padding-right:12px;">Submitted:</td><td style="color:#333;font-size:13px;font-weight:bold;">${date}</td></tr>
    </table>
    <a href="${APP_URL}" style="display:inline-block;background:#000;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">Review Request →</a>`,
  );
}

function approvalEmail(typeName: string, status: string, reviewer: string, date: string): string {
  const approved = status.toUpperCase() === 'APPROVED';
  const statusColor = approved ? '#059669' : '#dc2626';
  const statusBg   = approved ? '#ecfdf5'  : '#fef2f2';
  const statusLabel = approved ? 'APPROVED ✓' : 'REJECTED ✗';
  return emailBase(
    `Your ${typeName} has been ${approved ? 'Approved' : 'Rejected'}`,
    `<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 20px;">Your <strong>${typeName}</strong> has been reviewed and a decision has been made.</p>
    <div style="background:${statusBg};border-radius:10px;padding:20px;margin:0 0 20px;text-align:center;">
      <span style="color:${statusColor};font-size:20px;font-weight:bold;">${statusLabel}</span>
    </div>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr><td style="color:#888;font-size:13px;padding:4px 16px 4px 0;">Reviewed by:</td><td style="color:#333;font-size:13px;font-weight:bold;">${reviewer}</td></tr>
      <tr><td style="color:#888;font-size:13px;padding:4px 16px 4px 0;">Date:</td><td style="color:#333;font-size:13px;font-weight:bold;">${date}</td></tr>
    </table>
    <a href="${APP_URL}" style="display:inline-block;background:#000;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">View in TAMS →</a>`,
  );
}

function expirationAlertEmail(hours: string, expiresAt: string): string {
  return emailBase(
    'Overtime Credit Expiring Soon',
    `<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Your overtime credit of <strong>${hours} hours</strong> will expire on <strong>${expiresAt}</strong>.
    </p>
    <p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 24px;">
      Please convert your remaining credits to leave (CTO/CDO) before they expire.
    </p>
    <a href="${APP_URL}" style="display:inline-block;background:#000;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">Convert Now →</a>`,
  );
}

// ─── Email notification types that trigger emails to approvers ───────────────
const APPROVER_EMAIL_TYPES: Partial<Record<string, string>> = {
  LEAVE_REQUEST:         'Leave Request',
  OVERTIME_REQUEST:      'Overtime Request',
  CTO_REQUEST:           'CTO Conversion Request',
  CDO_REQUEST:           'CDO Conversion Request',
  ATTENDANCE_CORRECTION: 'Attendance Correction',
};

// ─── Service ─────────────────────────────────────────────────────────────────

export const notificationService = {
  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!process.env.SMTP_HOST) {
      logger.warn(`sendEmail skipped (SMTP_HOST not set) — to: ${to}, subject: "${subject}"`);
      return;
    }
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"ALPAS TAMS" <noreply@tams.alpas.ph>',
        to,
        subject,
        html,
      });
      logger.info(`Email sent — to: ${to}, subject: "${subject}"`);
    } catch (err) {
      logger.error(`Email send failed — to: ${to}, subject: "${subject}"`, err);
      throw err; // propagate so callers can handle per-flow
    }
  },

  async sendExpirationAlertEmail(email: string, minutes: number, expiresAt: Date): Promise<void> {
    const hours = (minutes / 60).toFixed(1);
    const formattedDate = expiresAt.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' });
    await this.sendEmail(
      email,
      'Overtime Credit Expiring Soon — ALPAS TAMS',
      expirationAlertEmail(hours, formattedDate),
    );
  },

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    await this.sendEmail(
      email,
      'Password Reset Request — ALPAS TAMS',
      emailBase(
        'Password Reset Request',
        `<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 24px;">
          Click the button below to reset your password. This link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}" style="display:inline-block;background:#000;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;">Reset Password →</a>
        <p style="margin:20px 0 0;color:#999;font-size:12px;">If you did not request this, you can safely ignore this email.</p>`,
      ),
    );
  },

  async createNotification(
    recipientId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: object,
    senderId?: string,
  ): Promise<void> {
    try {
      await prisma.notification.create({
        data: { recipientId, senderId, type, title, message, data: data as any },
      });
    } catch (err) {
      logger.error('Notification creation failed:', err);
    }
  },

  async notifyDeptHead(employeeId: string, type: NotificationType, data?: object): Promise<void> {
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { department: { include: { head: true } } },
      });

      const titles: Record<string, string> = {
        LEAVE_REQUEST:        'New Leave Request',
        OVERTIME_REQUEST:     'New Overtime Request',
        ATTENDANCE_CORRECTION:'New Attendance Correction',
        CTO_REQUEST:          'New CTO Conversion Request',
        CDO_REQUEST:          'New CDO Conversion Request',
      };

      const typeName  = APPROVER_EMAIL_TYPES[type];   // truthy only for the 4 email types
      const date      = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' });
      const fullName  = employee ? `${employee.firstName} ${employee.lastName}` : 'An employee';

      if (employee?.department?.head) {
        // If the filer IS the department head, route to HR instead
        if (employee.userId === employee.department.head.id) {
          await this.notifyHR(
            type,
            titles[type] || 'New Request',
            `${fullName} (Department Head) has submitted a new request.`,
            data,
          );

          // Email all active HR users for approval-required types
          if (typeName) {
            const hrUsers = await prisma.user.findMany({
              where: { role: 'HR', isActive: true },
              select: { email: true },
            });
            for (const hr of hrUsers) {
              await this.sendEmail(
                hr.email,
                `${titles[type]} — ${fullName} — ALPAS TAMS`,
                requestEmail(fullName, typeName, date),
              );
            }
          }
          return;
        }

        // Notify the department head
        await this.createNotification(
          employee.department.head.id,
          type,
          titles[type] || 'New Request',
          `${fullName} has submitted a new request.`,
          data,
        );

        // Send email for approval-required types
        if (typeName && employee.department.head.email) {
          await this.sendEmail(
            employee.department.head.email,
            `${titles[type]} — ${fullName} — ALPAS TAMS`,
            requestEmail(fullName, typeName, date),
          );
        }
      }
    } catch (err) {
      logger.error('Notify dept head failed:', err);
    }
  },

  async notifyEmployee(employeeId: string, type: NotificationType, data?: any): Promise<void> {
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: true },
      });

      if (employee) {
        const status = data?.status || '';
        await this.createNotification(
          employee.userId,
          type,
          `${data?.type || 'Request'} ${status}`,
          `Your ${data?.type || 'request'} has been ${status.toLowerCase()} by ${data?.reviewer || 'reviewer'}.`,
          data,
        );

        // Send email for approval results on the 4 tracked types
        if (type === 'APPROVAL_RESULT' && data?.type && data?.status) {
          const date     = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' });
          const reviewer = data?.reviewer || 'Reviewer';
          await this.sendEmail(
            employee.user.email,
            `Your ${data.type} has been ${data.status.toLowerCase()} — ALPAS TAMS`,
            approvalEmail(data.type, data.status, reviewer, date),
          );
        }
      }
    } catch (err) {
      logger.error('Notify employee failed:', err);
    }
  },

  async notifyHR(type: NotificationType, title: string, message: string, data?: object): Promise<void> {
    try {
      const hrUsers = await prisma.user.findMany({ where: { role: 'HR', isActive: true } });
      for (const hr of hrUsers) {
        await this.createNotification(hr.id, type, title, message, data);
      }
    } catch (err) {
      logger.error('Notify HR failed:', err);
    }
  },
};
