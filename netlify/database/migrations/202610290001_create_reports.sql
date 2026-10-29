CREATE TABLE shchos_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  guild_id text NOT NULL CHECK (guild_id ~ '^[0-9]{17,20}$'),
  author_id text NOT NULL CHECK (author_id ~ '^[0-9]{17,20}$'),
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 100),
  request_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('discord', 'minecraft', 'other')),
  subject text NOT NULL CHECK (char_length(subject) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 5000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (guild_id, author_id, request_id)
);

CREATE INDEX shchos_reports_guild_page ON shchos_reports (guild_id, id DESC);
CREATE INDEX shchos_reports_author_recent ON shchos_reports (guild_id, author_id, created_at DESC);

-- Serializing submissions per guild/user makes the cooldown and retries atomic,
-- including when separate Netlify Function instances run concurrently.
CREATE FUNCTION shchos_submit_report(
  p_guild text, p_author text, p_name text, p_request uuid,
  p_category text, p_subject text, p_description text
) RETURNS TABLE (report_id text, outcome text)
LANGUAGE plpgsql AS $$
DECLARE
  existing shchos_reports%ROWTYPE;
  new_id bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_guild || ':' || p_author, 0));
  SELECT * INTO existing FROM shchos_reports
    WHERE guild_id = p_guild AND author_id = p_author AND request_id = p_request;
  IF FOUND THEN
    IF existing.category <> p_category OR existing.subject <> p_subject OR existing.description <> p_description THEN
      RETURN QUERY SELECT NULL::text, 'conflict'::text;
    ELSE
      RETURN QUERY SELECT existing.id::text, 'existing'::text;
    END IF;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM shchos_reports WHERE guild_id = p_guild AND author_id = p_author
      AND created_at > clock_timestamp() - interval '60 seconds') THEN
    RETURN QUERY SELECT NULL::text, 'rate_limited'::text;
    RETURN;
  END IF;
  INSERT INTO shchos_reports (guild_id, author_id, author_name, request_id, category, subject, description)
    VALUES (p_guild, p_author, p_name, p_request, p_category, p_subject, p_description)
    RETURNING id INTO new_id;
  RETURN QUERY SELECT new_id::text, 'created'::text;
END;
$$;
