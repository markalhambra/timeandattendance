-- Inclusive end date so a holiday can cover a break (for example Dec 20–Jan 3).
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "endDate" DATE;

UPDATE "holidays" SET "endDate" = "date" WHERE "endDate" IS NULL;

ALTER TABLE "holidays" ALTER COLUMN "endDate" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "holidays_date_endDate_idx" ON "holidays"("date", "endDate");
