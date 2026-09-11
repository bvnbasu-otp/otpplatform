import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

export interface VoiceRecorderProps {
  /** Called with the finished recording; the caller decides where it goes. */
  onRecorded: (file: File, durationSeconds: number) => void;
  maxSeconds?: number;
  disabled?: boolean;
  className?: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Records a voice note with MediaRecorder.
 *
 * Buyers on a site with oil on their hands describe a problem far faster than
 * they type it. The recording is handed over as a file like any other
 * attachment, so nothing downstream needs to know it started as speech.
 */
export function VoiceRecorder({
  onRecorded,
  maxSeconds = 180,
  disabled,
  className,
}: VoiceRecorderProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!recording) return;

    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= maxSeconds) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, recording, maxSeconds]);

  // A live microphone left running after the component goes away is a privacy
  // problem, not just a leak.
  useEffect(() => {
    return () => {
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, {
          type: recorder.mimeType,
        });
        stream.getTracks().forEach((track) => track.stop());
        onRecorded(file, seconds);
        setSeconds(0);
      };

      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
    } catch {
      setError('Microphone permission is needed to record a voice note.');
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  if (!supported) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        Voice notes are not supported in this browser. Type the description instead.
      </p>
    );
  }

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (recording ? stop() : void start())}
        className={cn(
          'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50',
          recording ? 'bg-red-600 text-white' : 'border bg-card hover:bg-muted',
        )}
      >
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            recording ? 'animate-pulse bg-white' : 'bg-red-600',
          )}
          aria-hidden="true"
        />
        {recording ? 'Stop recording' : 'Record voice note'}
      </button>

      {recording && (
        <span className="text-xs tabular-nums text-muted-foreground" role="timer">
          {formatDuration(seconds)} / {formatDuration(maxSeconds)}
        </span>
      )}

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
