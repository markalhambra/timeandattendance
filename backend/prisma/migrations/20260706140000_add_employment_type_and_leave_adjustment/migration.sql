-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'INTERN');

-- AlterTable: add employmentType to employees
ALTER TABLE "employees" ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'REGULAR';

-- CreateTable: leave_adjustments
CREATE TABLE "leave_adjustments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "year" INTEGER NOT NULL,
    "adjustmentAmount" DOUBLE PRECISION NOT NULL,
    "previousBalance" DOUBLE PRECISION NOT NULL,
    "newBalance" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustedBy" TEXT,
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_adjustments_employeeId_idx" ON "leave_adjustments"("employeeId");
CREATE INDEX "leave_adjustments_createdAt_idx" ON "leave_adjustments"("createdAt");

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
