import { useRef, useState } from 'react';
import { cn } from './cn';

export interface FileDropzoneProps {
  label?: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  maxSizeMb?: number;
  disabled?: boolean;
  onFilesSelected: (files: File[]) => void;
  className?: string;
}

function tooLarge(file: File, maxSizeMb: number): boolean {
  return file.size > maxSizeMb * 1024 * 1024;
}

/**
 * Picks files by drop or by browse. It hands the files to the caller and keeps
 * no upload state of its own, because who may upload what is a question for the
 * feature, not for a control.
 */
export function FileDropzone({
  label = 'Drop files here',
  hint = 'Drawings, photos, or a scan of a handwritten note',
  accept,
  multiple = true,
  maxSizeMb = 10,
  disabled,
  onFilesSelected,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          Browse files
        </button>
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
      </div>

      {rejected.length > 0 && (
        <p className="mt-1 text-xs text-red-600">
          Too large (max {maxSizeMb} MB): {rejected.join(', ')}
        </p>
      )}
    </div>
  );
}
