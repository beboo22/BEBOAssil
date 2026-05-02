
-- Add notification trigger for story comments
CREATE OR REPLACE FUNCTION public.notify_story_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  story_owner_id uuid;
  commenter_name text;
  story_title text;
BEGIN
  -- Get story owner and title
  SELECT ts.user_id, ts.title INTO story_owner_id, story_title
  FROM public.travel_stories ts
  WHERE ts.id = NEW.story_id;

  -- Don't notify if commenting on own story
  IF story_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Get commenter name
  SELECT COALESCE(p.full_name, p.email, 'مسافر') INTO commenter_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  -- Insert notification
  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  VALUES (
    story_owner_id,
    'story_comment',
    'تعليق جديد على قصتك',
    commenter_name || ' علّق على قصتك "' || LEFT(story_title, 50) || '"',
    jsonb_build_object('story_id', NEW.story_id, 'comment_id', NEW.id, 'commenter_id', NEW.user_id)
  );

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_story_comment_created
  AFTER INSERT ON public.story_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_story_comment();

-- Add notification trigger for story likes
CREATE OR REPLACE FUNCTION public.notify_story_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  story_owner_id uuid;
  liker_name text;
  story_title text;
BEGIN
  SELECT ts.user_id, ts.title INTO story_owner_id, story_title
  FROM public.travel_stories ts
  WHERE ts.id = NEW.story_id;

  IF story_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.full_name, p.email, 'مسافر') INTO liker_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  VALUES (
    story_owner_id,
    'story_like',
    'إعجاب جديد بقصتك',
    liker_name || ' أعجب بقصتك "' || LEFT(story_title, 50) || '"',
    jsonb_build_object('story_id', NEW.story_id, 'liker_id', NEW.user_id)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_story_like_created
  AFTER INSERT ON public.story_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_story_like();

-- Allow profiles to be publicly readable for story cards and user profiles
CREATE POLICY "Anyone can view public profile info"
ON public.profiles
FOR SELECT
USING (true);

-- Enable realtime for story_comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_comments;
