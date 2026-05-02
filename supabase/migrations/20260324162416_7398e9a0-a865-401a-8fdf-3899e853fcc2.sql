-- Create a function to send notification on story like
CREATE OR REPLACE FUNCTION public.notify_on_story_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  story_record RECORD;
  liker_name TEXT;
BEGIN
  SELECT ts.user_id, ts.title INTO story_record
  FROM public.travel_stories ts
  WHERE ts.id = NEW.story_id;

  IF story_record.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO liker_name FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  VALUES (
    story_record.user_id,
    'story_liked',
    'إعجاب جديد ❤️',
    COALESCE(liker_name, 'مستخدم') || ' أعجب بقصتك: ' || COALESCE(story_record.title, ''),
    jsonb_build_object('story_id', NEW.story_id, 'liker_id', NEW.user_id)
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_story_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  story_record RECORD;
  commenter_name TEXT;
BEGIN
  SELECT ts.user_id, ts.title INTO story_record
  FROM public.travel_stories ts
  WHERE ts.id = NEW.story_id;

  IF story_record.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT full_name INTO commenter_name FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, message, metadata)
  VALUES (
    story_record.user_id,
    'story_comment',
    'تعليق جديد 💬',
    COALESCE(commenter_name, 'مستخدم') || ' علّق على قصتك: ' || COALESCE(story_record.title, ''),
    jsonb_build_object('story_id', NEW.story_id, 'commenter_id', NEW.user_id, 'comment', LEFT(NEW.content, 100))
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_story_like_notify ON public.story_likes;
CREATE TRIGGER on_story_like_notify
  AFTER INSERT ON public.story_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_story_like();

DROP TRIGGER IF EXISTS on_story_comment_notify ON public.story_comments;
CREATE TRIGGER on_story_comment_notify
  AFTER INSERT ON public.story_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_story_comment();