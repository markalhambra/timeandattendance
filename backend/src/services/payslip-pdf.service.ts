import PDFDocument from 'pdfkit';
import { PayrollRowAmounts } from './payroll-parse.service';

export interface PayslipPdfInput {
  companyName?: string;
  employeeName: string;
  employeeNumber?: string;
  department?: string;
  designation?: string;
  periodLabel: string;
  row: PayrollRowAmounts;
}

function money(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pushLine(
  lines: { label: string; amount: number }[],
  label: string,
  amount?: number | null,
) {
  if (amount == null || !Number.isFinite(amount) || amount === 0) return;
  lines.push({ label, amount });
}

export async function buildPayslipPdf(input: PayslipPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    compress: true,
    info: {
      Title: `Payslip — ${input.employeeName} — ${input.periodLabel}`,
      Author: 'ALPAS TAMS',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const company = input.companyName || 'ALPAS';
  const { row } = input;

  // Header
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#000').text(company, { align: 'left' });
  doc.font('Helvetica').fontSize(9).fillColor('#555').text('Time & Attendance · Payslip', { align: 'left' });
  doc.moveDown(0.3);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#000').lineWidth(1).stroke();
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text('PAYSLIP', { align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor('#333').text(input.periodLabel, { align: 'center' });
  doc.moveDown(0.8);

  // Employee block
  const labelX = 40;
  const valueX = 150;
  const rowH = 14;
  let y = doc.y;

  const info: [string, string][] = [
    ['Employee', input.employeeName],
    ['Employee No.', input.employeeNumber || '—'],
    ['Department', input.department || '—'],
    ['Designation', input.designation || '—'],
  ];
  doc.fontSize(9);
  for (const [k, v] of info) {
    doc.font('Helvetica').fillColor('#666').text(k, labelX, y, { width: 100, continued: false });
    doc.font('Helvetica-Bold').fillColor('#111').text(v, valueX, y, { width: 360 });
    y += rowH;
  }
  doc.y = y + 8;
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke();
  doc.moveDown(0.8);

  // Two columns: Earnings | Deductions
  const earnings: { label: string; amount: number }[] = [];
  pushLine(earnings, 'Semi-Monthly Rate', row.semiMonthlyRate);
  pushLine(earnings, 'Monthly Rate', row.monthlyRate && !row.semiMonthlyRate ? row.monthlyRate : undefined);
  pushLine(earnings, 'Less Absent', row.lessAbsent != null ? -Math.abs(row.lessAbsent) : undefined);
  pushLine(earnings, 'Adjustment', row.adjustment);
  pushLine(earnings, 'Taxable Gross', row.taxableGross);

  const deductions: { label: string; amount: number }[] = [];
  pushLine(deductions, 'Withholding Tax', row.withholdingTax);
  pushLine(deductions, 'SSS (Regular)', row.sssReg);
  pushLine(deductions, 'SSS (MPF)', row.sssMpf);
  pushLine(deductions, 'PhilHealth (PHIC)', row.phic);
  pushLine(deductions, 'Pag-IBIG (HDMF)', row.hdmf);
  pushLine(deductions, 'Salary Loan', row.salaryLoan);
  pushLine(deductions, 'Laptop Deduction', row.laptopDeduction);
  pushLine(deductions, 'SSS Loan', row.sssLoan);
  pushLine(deductions, 'HDMF Loan', row.hdmfLoan);
  pushLine(deductions, 'MP2 Savings', row.mp2Savings);
  for (const o of row.otherDeductions) {
    // Skip if already mapped by label similarity
    if (/semi-monthly|monthly rate|taxable gross|net pay|total deduction|daily rate|full name/i.test(o.label)) continue;
    if (/withholding|sss-reg|sss-mpf|phic|hdmf|salary loan|laptop/i.test(o.label)) continue;
    pushLine(deductions, o.label, o.amount);
  }

  const colLeft = 40;
  const colRight = 300;
  const colW = 240;
  const startY = doc.y;

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('EARNINGS', colLeft, startY);
  doc.font('Helvetica-Bold').fontSize(10).text('DEDUCTIONS', colRight, startY);

  let yL = startY + 18;
  let yR = startY + 18;
  doc.font('Helvetica').fontSize(9);

  const drawItem = (x: number, yPos: number, label: string, amount: number) => {
    doc.fillColor('#333').text(label, x, yPos, { width: colW - 70, ellipsis: true });
    doc.fillColor('#111').text(money(amount), x + colW - 70, yPos, { width: 70, align: 'right' });
    return yPos + 13;
  };

  for (const e of earnings) yL = drawItem(colLeft, yL, e.label, e.amount);
  for (const d of deductions) yR = drawItem(colRight, yR, d.label, d.amount);

  const afterCols = Math.max(yL, yR) + 10;
  doc.y = afterCols;
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#000').lineWidth(1).stroke();
  doc.moveDown(0.6);

  const gross = row.taxableGross ?? row.semiMonthlyRate ?? 0;
  const totalDed = row.totalDeductions
    ?? deductions.reduce((s, d) => s + (d.amount > 0 ? d.amount : 0), 0);
  const net = row.netPay ?? gross - totalDed;

  const summaryY = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor('#555');
  doc.text('Taxable / Gross', 40, summaryY);
  doc.font('Helvetica-Bold').fillColor('#111').text(money(gross), 200, summaryY, { width: 100, align: 'right' });

  doc.font('Helvetica').fillColor('#555').text('Total Deductions', 40, summaryY + 16);
  doc.font('Helvetica-Bold').fillColor('#111').text(money(totalDed), 200, summaryY + 16, { width: 100, align: 'right' });

  doc.roundedRect(340, summaryY - 4, 215, 40, 6).fillAndStroke('#f4f4f5', '#e5e5e5');
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11).text('NET PAY', 350, summaryY + 4, { width: 90 });
  doc.fontSize(14).text(`PHP ${money(net)}`, 350, summaryY + 18, { width: 195, align: 'right' });

  doc.moveDown(3);
  doc.font('Helvetica').fontSize(8).fillColor('#999')
    .text(
      'This payslip was generated by ALPAS TAMS from the company payroll register. For questions, contact HR.',
      40,
      doc.page.height - 60,
      { width: 515, align: 'center' },
    );

  doc.end();
  return done;
}
