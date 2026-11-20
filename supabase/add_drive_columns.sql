-- ============================================================================
-- OAV MANTRA - SUPABASE MIGRATION: GOOGLE DRIVE & PAYMENT SCREENSHOTS
-- Project: bnlymzocydhmpuzmiwlz (https://supabase.com/dashboard/project/bnlymzocydhmpuzmiwlz)
-- Run this in Supabase Dashboard -> SQL Editor -> Click 'Run'
-- ============================================================================

-- 1. Add payment_screenshot column to payments table
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS payment_screenshot TEXT;

-- 2. Add drive_file_url column to payments table (stores direct Google Drive link)
ALTER TABLE public.payments 
ADD COLUMN IF NOT EXISTS drive_file_url TEXT;

-- 3. Add drive_photo_url column to students table (stores direct Google Drive link)
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS drive_photo_url TEXT;

-- 4. Update students table status constraint to support 'rejected' status
DO $$
BEGIN
    ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_status_check;
    ALTER TABLE public.students ADD CONSTRAINT students_status_check 
        CHECK (status IN ('pending_payment', 'payment_review', 'active', 'suspended', 'rejected'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 5. Confirm migration success
SELECT 
    column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('students', 'payments') 
  AND column_name IN ('payment_screenshot', 'drive_file_url', 'drive_photo_url');

