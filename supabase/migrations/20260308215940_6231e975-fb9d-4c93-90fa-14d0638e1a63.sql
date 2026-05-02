
-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- System can insert notifications
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add shared_with_email to shared_trips for targeted sharing
ALTER TABLE public.shared_trips ADD COLUMN IF NOT EXISTS shared_with_email text;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Function to create notification when trip is shared
CREATE OR REPLACE FUNCTION public.notify_shared_trip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_user_id uuid;
  sharer_name text;
BEGIN
  IF NEW.shared_with_email IS NOT NULL THEN
    SELECT p.id INTO target_user_id
    FROM public.profiles p
    WHERE p.email = NEW.shared_with_email;

    IF target_user_id IS NOT NULL THEN
      SELECT COALESCE(p.full_name, p.email, 'Someone') INTO sharer_name
      FROM public.profiles p
      WHERE p.id = NEW.shared_by;

      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      VALUES (
        target_user_id,
        'trip_shared',
        'رحلة جديدة مشاركة معك',
        sharer_name || ' شارك معك رحلة إلى ' || NEW.destination,
        jsonb_build_object('share_code', NEW.share_code, 'destination', NEW.destination, 'shared_by', NEW.shared_by)
      );
    END IF;
  END IF;

  IF NEW.shared_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    VALUES (
      NEW.shared_by,
      'trip_share_created',
      'تمت مشاركة رحلتك بنجاح',
      'تمت مشاركة رحلتك إلى ' || NEW.destination || 
        CASE WHEN NEW.shared_with_email IS NOT NULL THEN ' مع ' || NEW.shared_with_email ELSE '' END,
      jsonb_build_object('share_code', NEW.share_code, 'destination', NEW.destination)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_trip_shared
  AFTER INSERT ON public.shared_trips
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_shared_trip();
