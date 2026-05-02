-- Expand bookings table for detailed tracking and sync
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS subid text,
ADD COLUMN IF NOT EXISTS action_id text,
ADD COLUMN IF NOT EXISTS reward numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS reward_currency text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- Update status constraint to include more states
ALTER TABLE public.bookings 
DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings 
ADD CONSTRAINT bookings_status_check 
CHECK (status IN ('clicked', 'pending', 'paid', 'cancelled'));

-- Index for SubID search (crucial for syncing)
CREATE INDEX IF NOT EXISTS idx_bookings_subid ON public.bookings(subid);
CREATE INDEX IF NOT EXISTS idx_bookings_action_id ON public.bookings(action_id);

-- Update RLS to allow system-level updates or ensure users can't faked confirmed status easily
-- (In a real app, 'paid' status should only be set by the sync process)
