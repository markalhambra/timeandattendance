import nodemailer from 'nodemailer';
import { prisma } from '../config/database';
import { NotificationType } from '@prisma/client';
import { logger } from '../config/logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const notificationService = {
  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!process.env.SMTP_HOST) return;
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"TAMS" <noreply@tams.com>',
        to,
        subject,
        html,
      });
    } catch (err) {
      logger.error('Email send failed:', err);
    }
  },

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await this.sendEmail(
      email,
      'Password Reset Request - TAMS',
      `<p>Click the link below to reset your password:</p>
       <a href="${resetUrl}">${resetUrl}</a>
       <p>This link expires in 1 hour.</p>`,
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

      if (employee?.department?.head) {
        const titles: Record<string, string> = {
          LEAVE_REQUEST: 'New Leave Request',
          OVERTIME_REQUEST: 'New Overtime Request',
          ATTENDANCE_CORRECTION: 'New Attendance Correction',
          CTO_REQUEST: 'New CTO Conversion Request',
          CDO_REQUEST: 'New CDO Conversion Request',
        };

        await this.createNotification(
          employee.department.head.id,
          type,
          titles[type] || 'New Request',
          `${employee.firstName} ${employee.lastName} has submitted a new request.`,
          data,
        );
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
