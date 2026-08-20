-- Allow multiple OvertimeConversion rows per OvertimeRecord (partial conversions)
DROP INDEX IF EXISTS "overtime_conversions_overtimeid_key";
