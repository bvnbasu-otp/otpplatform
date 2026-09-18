import { useRef, useState } from 'react';
import { cn } from './cn';

export interface FileDropzoneProps {
  label?: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  maxSizeMb?: number;
  disabled?: boolean;
  captureMode?: 'user' | 'environment';
  hasFiles?: boolean;
  onClear?: () => void;
  onFilesSelected: (files: File[]) => void;
  className?: string;
}

function tooLarge(file: File, maxSizeMb: number): boolean {
  return file.size > maxSizeMb * 1024 * 1024;
}

/**
 * Picks files by drop or browse, with optional direct camera capture support
 * and explicit clear affordance.
 */
export function FileDropzone({
  label = 'Drop files here',
  hint = 'Drawings, photos, BoQ spreadsheets, or scans',
  accept,
  multiple = true,
  maxSizeMb = 10,
  disabled,
  captureMode,
  hasFiles,
  onClear,
  onFilesSelected,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  function accept_(fileList: FileList | null) {
    if (!fileList) return;

    const files = Array.from(fileList);
    const oversized = files.filter((f) => tooLarge(f, maxSizeMb));
    const usable = files.filter((f) => !tooLarge(f, maxSizeMb));

    setRejected(oversized.map((f) => f.name));
    if (usable.length > 0) onFilesSelected(multiple ? usable : usable.slice(0, 1));
  }

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept_(e.dataTransfer.files);
        }}
        className={cn(
          'rounded-lg border border-dashed p-4 text-center',
          dragging ? 'border-primary bg-accent' : 'bg-card',
          disabled && 'opacity-50',
        )}
      >
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
          >
            📁 Browse files
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => cameraInputRef.current?.click()}
            className="rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1"
          >
            📷 Take Photo
          </button>

          {hasFiles && onClear && (
            <button
              type="button"
              disabled={disabled}
              onClick={onClear}
              className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 disabled:opacity-50 inline-flex items-center gap-1"
            >
              🗑️ Clear Files
            </button>
          )}
        </div>

        {/* Standard File Picker */}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            accept_(e.target.files);
            e.target.value = '';
          }}
          className="sr-only"
        />

        {/* Dedicated Camera Capture Picker */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture={captureMode || 'environment'}
          disabled={disabled}
          onChange={(e) => {
            accept_(e.target.files);
            e.target.value = '';
          }}
          className="sr-only"
        />
      </div>

      {rejected.length > 0 && (
        <p className="mt-1 text-xs text-red-600">
          Too large (max {maxSizeMb} MB): {rejected.join(', ')}
        </p>
      )}
    </div>
  );
}
