-- Fix: previous migration had wrong casing (overtimeid vs overtimeId); drop the actual unique index
DROP INDEX IF EXISTS "overtime_conversions_overtimeId_key";
