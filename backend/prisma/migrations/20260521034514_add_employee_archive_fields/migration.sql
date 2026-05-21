-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resignedAt" TIMESTAMP(3);
