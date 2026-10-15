-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('PREVIEWED', 'GENERATED', 'FAILED');

-- CreateTable
CREATE TABLE "payroll_workbooks" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_workbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "workbookId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "payPeriodStart" DATE NOT NULL,
    "payPeriodEnd" DATE NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'PREVIEWED',
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "generatedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedRows" JSONB,
    "generatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "year" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "payPeriodStart" DATE NOT NULL,
    "payPeriodEnd" DATE NOT NULL,
    "netPay" DECIMAL(14,2),
    "storagePath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_workbooks_year_key" ON "payroll_workbooks"("year");

-- CreateIndex
CREATE INDEX "payroll_runs_year_createdAt_idx" ON "payroll_runs"("year", "createdAt");

-- CreateIndex
CREATE INDEX "payslips_employeeId_payPeriodEnd_idx" ON "payslips"("employeeId", "payPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_employeeId_payPeriodStart_payPeriodEnd_key" ON "payslips"("employeeId", "payPeriodStart", "payPeriodEnd");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_workbookId_fkey" FOREIGN KEY ("workbookId") REFERENCES "payroll_workbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
