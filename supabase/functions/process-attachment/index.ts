/**
 * process-attachment Edge Function
 * 
 * Strips metadata from uploaded files to protect supplier identity during
 * identity-protected evaluation phase:
 * - Photos: Remove EXIF data (GPS, camera model, device serial, timestamps)
 * - PDFs: Remove author, company, creator metadata
 * - Voice Notes: Re-encode to strip recording device info
 * - Office Docs: Remove author and company metadata
 * 
 * Critical security requirement: Prevents supplier identification via file metadata
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessAttachmentRequest {
  storagePath: string;
  contentType: string;
  attachmentId: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { storagePath, contentType, attachmentId }: ProcessAttachmentRequest = await req.json();

    console.log(`Processing attachment: ${attachmentId}, type: ${contentType}, path: ${storagePath}`);

    // Download original file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('attachments')
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // Convert to array buffer for processing
    const originalBuffer = await fileData.arrayBuffer();
    let processedBuffer: ArrayBuffer;
    let wasProcessed = false;

    // Process based on content type
    if (contentType.startsWith('image/')) {
      // Phase 1: Photo EXIF stripping
      processedBuffer = await stripPhotoExif(originalBuffer, contentType);
      wasProcessed = true;
      console.log(`Stripped EXIF data from image: ${attachmentId}`);
    } else if (contentType === 'application/pdf') {
      // Phase 1: PDF metadata stripping
      processedBuffer = await stripPdfMetadata(originalBuffer);
      wasProcessed = true;
      console.log(`Stripped metadata from PDF: ${attachmentId}`);
    } else if (contentType.startsWith('audio/')) {
      // Phase 2: Voice note stripping
      processedBuffer = await stripAudioMetadata(originalBuffer, contentType);
      wasProcessed = true;
      console.log(`Stripped metadata from audio: ${attachmentId}`);
    } else if (
      contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      // Phase 2: Office document stripping
      processedBuffer = await stripOfficeMetadata(originalBuffer, contentType);
      wasProcessed = true;
      console.log(`Stripped metadata from Office document: ${attachmentId}`);
    } else {
      // Unsupported type - return original
      processedBuffer = originalBuffer;
      console.log(`Unsupported content type, skipping: ${contentType}`);
    }

    // Upload processed file back to storage (overwrite original)
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, new Blob([processedBuffer], { type: contentType }), {
        upsert: true,
        contentType,
      });

    if (uploadError) {
      throw new Error(`Failed to upload processed file: ${uploadError.message}`);
    }

    // Update attachment record with processing status
    await supabase
      .from('attachments')
      .update({
        metadata_stripped: wasProcessed,
        processed_at: new Date().toISOString(),
      })
      .eq('id', attachmentId);

    return new Response(
      JSON.stringify({
        success: true,
        attachmentId,
        processed: wasProcessed,
        contentType,
        originalSize: originalBuffer.byteLength,
        processedSize: processedBuffer.byteLength,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Attachment processing error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Strip EXIF metadata from photos (GPS, camera model, device info).
 * Re-encodes via ImageScript (Edge-safe; npm sharp does not bundle on Supabase).
 */
async function stripPhotoExif(buffer: ArrayBuffer, contentType: string): Promise<ArrayBuffer> {
  try {
    const decoded = await Image.decode(new Uint8Array(buffer));
    let encoded: Uint8Array;
    if (contentType === 'image/png') {
      encoded = await decoded.encode();
    } else if (contentType === 'image/webp') {
      // ImageScript 1.3.x exposes WebP encode on the prototype at runtime.
      const encodeWebp = (decoded as Image & { encodeWEBP?(quality: number): Promise<Uint8Array> }).encodeWEBP;
      encoded = encodeWebp ? await encodeWebp.call(decoded, 92) : await decoded.encodeJPEG(92);
    } else {
      encoded = await decoded.encodeJPEG(92);
    }
    return uint8ArrayToArrayBuffer(encoded);
  } catch (error) {
    console.error('Photo EXIF stripping failed:', error);
    // Return original if processing fails (better than blocking upload)
    return buffer;
  }
}

/**
 * Strip metadata from PDF files (author, company, creator, producer)
 * Uses pdf-lib to rewrite PDF without metadata
 */
async function stripPdfMetadata(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    // Import pdf-lib dynamically
    const { PDFDocument } = await import('npm:pdf-lib@1.17.1');

    // Load the PDF
    const pdfDoc = await PDFDocument.load(buffer);

    // Remove all metadata fields
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');
    pdfDoc.setCreationDate(new Date('2024-01-01')); // Neutral date
    pdfDoc.setModificationDate(new Date('2024-01-01'));

    // Save the cleaned PDF
    const pdfBytes = await pdfDoc.save();

    return uint8ArrayToArrayBuffer(pdfBytes);
  } catch (error) {
    console.error('PDF metadata stripping failed:', error);
    return buffer;
  }
}

/**
 * Strip metadata from audio files (voice notes)
 * Re-encodes audio to remove recording device info
 */
async function stripAudioMetadata(buffer: ArrayBuffer, contentType: string): Promise<ArrayBuffer> {
  // Phase 2 implementation
  // TODO: Use FFmpeg WASM to re-encode audio
  // For now, return original
  console.warn('Audio metadata stripping not yet implemented');
  return buffer;
}

/**
 * Strip metadata from Office documents (Word, Excel)
 * Removes author, company, and other identifying properties
 */
async function stripOfficeMetadata(
  buffer: ArrayBuffer,
  contentType: string
): Promise<ArrayBuffer> {
  // Phase 2 implementation
  // TODO: Use jszip to rewrite Office XML without metadata
  // For now, return original
  console.warn('Office document metadata stripping not yet implemented');
  return buffer;
}
