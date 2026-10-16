-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PAYROLL';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGING_DIRECTOR';

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roles" "Role"[] DEFAULT ARRAY['EMPLOYEE']::"Role"[];

-- Backfill roles from primary role
UPDATE "users" SET "roles" = ARRAY["role"]::"Role"[] WHERE "roles" IS NULL OR cardinality("roles") = 0;
