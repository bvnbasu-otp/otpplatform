-- 00085_attachment_metadata_protection.sql
-- Add metadata stripping tracking and auto-processing trigger

BEGIN;

-- Add columns to track metadata processing
ALTER TABLE attachments 
ADD COLUMN IF NOT EXISTS metadata_stripped boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- Create Edge Function caller (requires pg_net extension)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger Edge Function for metadata stripping
CREATE OR REPLACE FUNCTION trigger_process_attachment()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_request_id bigint;
BEGIN
  -- Get Supabase URL from environment
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Only process file types that need metadata stripping
  IF NEW.content_type IN (
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/pdf',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) THEN
    -- Call Edge Function asynchronously using pg_net
    -- Note: This requires pg_net extension and proper network configuration
    SELECT net.http_post(
      url := COALESCE(v_supabase_url, 'http://localhost:54321') || '/functions/v1/process-attachment',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || COALESCE(v_service_key, 'service_role_key_placeholder'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'storagePath', NEW.storage_path,
        'contentType', NEW.content_type,
        'attachmentId', NEW.id
      )
    ) INTO v_request_id;

    -- Log the request (optional)
    RAISE NOTICE 'Triggered metadata stripping for attachment % (request %)', NEW.id, v_request_id;
  ELSE
    -- Mark as not needing processing
    UPDATE attachments 
    SET metadata_stripped = true,
        processed_at = now()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS process_attachment_on_upload ON attachments;

-- Create trigger to process attachments on upload
CREATE TRIGGER process_attachment_on_upload
AFTER INSERT ON attachments
FOR EACH ROW
EXECUTE FUNCTION trigger_process_attachment();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION trigger_process_attachment() TO authenticated, service_role;

-- Add comment explaining the security measure
COMMENT ON COLUMN attachments.metadata_stripped IS 
  'Whether file metadata (EXIF, PDF properties, etc.) has been stripped to protect supplier identity during identity-protected evaluation';

COMMENT ON COLUMN attachments.processed_at IS 
  'Timestamp when metadata stripping was completed';

COMMIT;
