-- CreateEnum
CREATE TYPE "LeaveDuration" AS ENUM ('FULL_DAY', 'HALF_DAY_MORNING', 'HALF_DAY_AFTERNOON');

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN "leaveDuration" "LeaveDuration" NOT NULL DEFAULT 'FULL_DAY';
