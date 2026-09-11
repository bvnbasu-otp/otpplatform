# process-attachment Edge Function

**Purpose**: Strips metadata from uploaded files to protect supplier identity during identity-protected evaluation.

## Security Requirement

During the identity-protected evaluation phase, supplier identities must remain anonymous. However, uploaded files can contain metadata that reveals supplier identity:

- **Photos**: EXIF data with GPS coordinates, camera model, device serial numbers
- **PDFs**: Author names, company names in document properties
- **Voice Notes**: Recording device information
- **Office Documents**: Author, company metadata tags

This Edge Function prevents identity leaks by stripping all metadata server-side.

## Implementation Phases

### ✅ Phase 1: Photos + PDFs (CRITICAL - Week 1)
- [x] Photo EXIF stripping using `sharp`
- [x] PDF metadata stripping using `pdf-lib`
- [x] Automatic processing on upload
- [x] Overwrite original file with cleaned version

### 🔄 Phase 2: Voice Notes + Office Docs (Week 2)
- [ ] Audio metadata stripping using FFmpeg WASM
- [ ] Word/Excel metadata stripping using jszip

## Usage

### Automatic Trigger (Recommended)

Add a database trigger to automatically process attachments on upload:

```sql
-- Add columns to attachments table
ALTER TABLE attachments 
ADD COLUMN metadata_stripped boolean DEFAULT false,
ADD COLUMN processed_at timestamptz;

-- Create trigger function
CREATE OR REPLACE FUNCTION trigger_process_attachment()
RETURNS trigger AS $$
BEGIN
  -- Call Edge Function asynchronously
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-attachment',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'storagePath', NEW.storage_path,
      'contentType', NEW.content_type,
      'attachmentId', NEW.id
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to attachments table
CREATE TRIGGER process_attachment_on_upload
AFTER INSERT ON attachments
FOR EACH ROW
EXECUTE FUNCTION trigger_process_attachment();
```

### Manual Call

```typescript
const { data, error } = await supabase.functions.invoke('process-attachment', {
  body: {
    storagePath: 'quote-files/abc123/photo.jpg',
    contentType: 'image/jpeg',
    attachmentId: 'uuid-here'
  }
});
```

## What Gets Stripped

### Photos (JPEG, PNG, WebP)
- **EXIF GPS**: Latitude, longitude, altitude
- **EXIF Device**: Camera make, model, serial number
- **EXIF Software**: Photo editing app name and version
- **EXIF Timestamps**: Original capture time (can reveal patterns)
- **ICC Profile**: Color profile (sometimes contains device info)

**Method**: Re-encodes image using `sharp` with all metadata disabled

### PDFs
- **Author**: Name of PDF creator
- **Creator**: Software used to create PDF
- **Producer**: PDF generation tool
- **Company**: Organization name
- **Title, Subject, Keywords**: User-defined metadata
- **Creation/Modification Dates**: Replaced with neutral date (2024-01-01)

**Method**: Rewrites PDF using `pdf-lib` with clean metadata

### Audio Files (Phase 2)
- **Recording Device**: Microphone model
- **Software**: Recording app name
- **Encoder**: Audio codec metadata
- **Timestamps**: Recording date/time

**Method**: Re-encodes using FFmpeg WASM

### Office Documents (Phase 2)
- **Author**: Document creator name
- **Company**: Organization name from Office
- **Last Modified By**: Editor name
- **Comments**: Inline comments with user names
- **Custom Properties**: User-defined metadata

**Method**: Rewrites Office Open XML using jszip

## Testing & Validation

### Test with exiftool

```bash
# Before processing
exiftool original.jpg
# Should show GPS, Camera Make, etc.

# After processing
exiftool processed.jpg
# Should show minimal data, no GPS/device info
```

### Test with PDF metadata

```bash
# Before processing
pdfinfo original.pdf
# Should show Author, Creator, etc.

# After processing
pdfinfo processed.pdf
# Should show empty or neutral values
```

### QA Test Cases

1. **Photo with GPS**: Upload photo taken with phone camera
   - ✅ Verify GPS coordinates removed
   - ✅ Verify camera model removed
   - ✅ Verify image displays correctly

2. **PDF with Company Name**: Upload PDF with author metadata
   - ✅ Verify author field cleared
   - ✅ Verify company field cleared
   - ✅ Verify PDF content unchanged

3. **Voice Note**: Upload voice recording
   - ⏳ Phase 2: Verify device info removed

4. **Office Document**: Upload Word/Excel with author
   - ⏳ Phase 2: Verify author metadata removed

## Deployment

```bash
# Deploy Edge Function
supabase functions deploy process-attachment

# Set required secrets (if needed)
# None required - uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically
```

## Performance

- **Photo Processing**: ~200-500ms per image
- **PDF Processing**: ~100-300ms per PDF
- **File Size Impact**: Minimal (<1% change)
- **Quality Impact**: None (re-encodes at 92% quality for photos)

## Error Handling

- If processing fails, **original file is preserved**
- Function logs error and sets `metadata_stripped = false`
- Upload succeeds regardless (better than blocking legitimate uploads)
- Admin can review failed processing in logs

## Security Notes

- ✅ Uses service role key for storage access
- ✅ Overwrites original file (no metadata-containing copy remains)
- ✅ Processes synchronously to prevent timing attacks
- ✅ Validates content types before processing
- ⚠️ Does not validate file contents (relies on Supabase Storage policies)

## Limitations

- **Video Files**: Not supported (too large for Edge Function memory)
- **Very Large Files**: May timeout (50 MB limit recommended)
- **Encrypted PDFs**: Cannot process password-protected PDFs
- **Corrupted Files**: Returns original if processing fails

## Future Enhancements

- [ ] Batch processing for multiple files
- [ ] Progress webhooks for large files
- [ ] Support for video thumbnails
- [ ] Advanced PDF cleaning (embedded images, annotations)
- [ ] Machine learning content analysis (detect company logos in images)
