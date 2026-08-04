-- Allow one user to head multiple departments
DROP INDEX IF EXISTS "departments_headId_key";

-- Non-unique index for head lookups
CREATE INDEX IF NOT EXISTS "departments_headId_idx" ON "departments"("headId");
