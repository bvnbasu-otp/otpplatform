import { useState, useEffect, useRef, useCallback } from 'react';

export interface VoiceRequirementDictationProps {
  onTranscript: (text: string) => void;
  className?: string;
  compact?: boolean;
}

export type SupportedSpeechLanguage = 'ta-IN' | 'hi-IN' | 'en-IN';

export type RecordingState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'TRANSCRIPT_AVAILABLE';

interface LanguageOption {
  code: SupportedSpeechLanguage;
  label: string;
  nativeLabel: string;
  flag: string;
  samplePhrase: string;
}

const LANGUAGES: LanguageOption[] = [
  {
    code: 'en-IN',
    label: 'English (India)',
    nativeLabel: 'English',
    flag: '🇮🇳',
    samplePhrase: '10 HP submersible motor rewinding in Coimbatore within 3 days',
  },
  {
    code: 'hi-IN',
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
    flag: '🇮🇳',
    samplePhrase: '10 HP सबमर्सिबल मोटर वाइंडिंग कोयंबटूर में 3 दिन के अंदर',
  },
  {
    code: 'ta-IN',
    label: 'Tamil',
    nativeLabel: 'தமிழ்',
    flag: '🇮🇳',
    samplePhrase: '10 HP சப்மெர்சிபிள் மோட்டார் வைண்டிங் கோயம்புத்தூரில் 3 நாட்களுக்குள்',
  },
];

// Browser speech recognition interface declaration
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function VoiceRequirementDictation({
  onTranscript,
  className = '',
  compact = false,
}: VoiceRequirementDictationProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('IDLE');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedSpeechLanguage>('en-IN');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending timers on unmount
  useEffect(() => {
    return () => {
      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
      }
    };
  }, []);

  const handleFinalResult = useCallback(
    (transcriptText: string) => {
      const trimmed = transcriptText.trim();
      if (!trimmed) {
        setRecordingState('IDLE');
        return;
      }

      setRecordingState('PROCESSING');
      setInterimTranscript(trimmed);
      setFinalTranscript(trimmed);

      if (processingTimerRef.current) {
        clearTimeout(processingTimerRef.current);
      }

      processingTimerRef.current = setTimeout(() => {
        setRecordingState('TRANSCRIPT_AVAILABLE');
        onTranscript(trimmed);
      }, 350);
    },
    [onTranscript],
  );

  useEffect(() => {
    const win = typeof window !== 'undefined' ? (window as unknown as IWindow) : null;
    const SpeechRecognition = win?.SpeechRecognition || win?.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setRecordingState('LISTENING');
        setError(null);
        setInterimTranscript('');
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let resultFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            resultFinal += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim);
        }

        if (resultFinal) {
          handleFinalResult(resultFinal);
        }
      };

      recognition.onerror = (event: any) => {
        setRecordingState('IDLE');
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please enable mic permissions in your browser.');
        } else if (event.error === 'no-speech') {
          setError('No voice detected. Please speak into the mic.');
        } else {
          setError(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setRecordingState((prev) => (prev === 'LISTENING' ? 'IDLE' : prev));
      };

      recognitionRef.current = recognition;
    } catch {
      setIsSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore cleanup stop
        }
      }
    };
  }, [handleFinalResult]);

  const toggleListening = () => {
    setError(null);
    if (!recognitionRef.current) {
      // Fallback: If Web Speech API not present in current environment, simulate sample regional dictation
      const lang = LANGUAGES.find((l) => l.code === selectedLanguage);
      if (lang) {
        handleFinalResult(lang.samplePhrase);
      }
      return;
    }

    if (recordingState === 'LISTENING') {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setRecordingState('IDLE');
    } else {
      try {
        recognitionRef.current.lang = selectedLanguage;
        recognitionRef.current.start();
      } catch {
        // Retry start
        try {
          recognitionRef.current.stop();
          recognitionRef.current.lang = selectedLanguage;
          recognitionRef.current.start();
        } catch (e: any) {
          setError(e?.message || 'Could not start microphone');
          setRecordingState('IDLE');
        }
      }
    }
  };

  const handleClearTranscript = () => {
    setInterimTranscript('');
    setFinalTranscript('');
    setRecordingState('IDLE');
    setError(null);
  };

  const currentLang = LANGUAGES.find((l) => l.code === selectedLanguage) ?? LANGUAGES[0]!;
  const isListening = recordingState === 'LISTENING';
  const isProcessing = recordingState === 'PROCESSING';

  if (compact) {
    return (
      <div className={`relative inline-flex items-center gap-1 max-w-full ${className}`}>
        <button
          type="button"
          onClick={toggleListening}
          aria-label={
            isListening
              ? `Stop voice dictation in ${currentLang.nativeLabel}`
              : `Dictate in ${currentLang.label} (${currentLang.nativeLabel})`
          }
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition shadow-2xs ${
            isListening
              ? 'bg-red-500 text-white border-red-600 animate-pulse motion-reduce:animate-none'
              : isProcessing
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-muted/80 text-foreground border-border hover:bg-muted'
          }`}
          title={`Dictate in ${currentLang.label} (${currentLang.nativeLabel})`}
          data-testid="compact-voice-dictation-btn"
        >
          {isProcessing ? (
            <span className="text-xs animate-spin motion-reduce:animate-none">⏳</span>
          ) : (
            <span className="text-sm">{isListening ? '⏹️' : '🎙️'}</span>
          )}
        </button>

        {isListening && (
          <span
            role="status"
            aria-live="polite"
            className="absolute -top-7 left-0 whitespace-nowrap rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-md animate-bounce motion-reduce:animate-none pointer-events-none z-10 flex items-center gap-1"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping motion-reduce:animate-none" />
            <span>Listening ({currentLang.nativeLabel})…</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border bg-card/95 p-3 shadow-2xs max-w-full overflow-hidden ${className}`}
      data-testid="voice-requirement-dictation-widget"
    >
      {/* Header with Title & Language Selector */}
      <div className="flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-base shrink-0" aria-hidden="true">🎙️</span>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-foreground truncate">
              Voice Dictation (Tamil · Hindi · English)
            </h3>
            <p className="text-[10px] text-muted-foreground truncate">
              Dictate requirement in your regional language — auto-converts to RFQ specs
            </p>
          </div>
        </div>

        {/* Language Selector Chips */}
        <div className="flex flex-wrap items-center gap-1 w-full xs:w-auto" role="group" aria-label="Select dictation language">
          {LANGUAGES.map((lang) => {
            const active = selectedLanguage === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (isListening && recognitionRef.current) {
                    try {
                      recognitionRef.current.stop();
                    } catch {
                      // ignore
                    }
                  }
                  setSelectedLanguage(lang.code);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition flex items-center gap-1 border min-h-[36px] xs:min-h-[40px] mobile-touch-target ${
                  active
                    ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border-border/60'
                }`}
              >
                <span aria-hidden="true">{lang.flag}</span>
                <span>{lang.nativeLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Dictate CTA & Sample Fill */}
      <div className="mt-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          type="button"
          onClick={toggleListening}
          aria-label={
            isListening
              ? `Listening in ${currentLang.nativeLabel}. Tap to complete recording.`
              : `Tap to speak in ${currentLang.label} (${currentLang.nativeLabel})`
          }
          className={`flex-1 min-h-[44px] rounded-xl px-4 py-2.5 text-xs font-extrabold transition shadow-2xs flex items-center justify-center gap-2 border mobile-touch-target ${
            isListening
              ? 'bg-red-600 text-white border-red-700 animate-pulse motion-reduce:animate-none'
              : isProcessing
                ? 'bg-amber-600 text-white border-amber-700'
                : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
          }`}
          data-testid="voice-dictate-main-btn"
        >
          {isProcessing ? (
            <>
              <span className="text-sm animate-spin motion-reduce:animate-none">⏳</span>
              <span className="text-center font-bold">Processing voice transcript…</span>
            </>
          ) : isListening ? (
            <>
              {/* Pulsing red recording dot */}
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-200 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>

              {/* Animated audio waveform equalizer bars */}
              <div className="flex items-center gap-0.5 h-4 px-1" aria-hidden="true">
                <span className="w-0.5 bg-white rounded-full h-2 animate-[pulse_0.6s_ease-in-out_infinite] motion-reduce:animate-none" />
                <span className="w-0.5 bg-white rounded-full h-4 animate-[pulse_0.4s_ease-in-out_infinite_100ms] motion-reduce:animate-none" />
                <span className="w-0.5 bg-white rounded-full h-3 animate-[pulse_0.7s_ease-in-out_infinite_200ms] motion-reduce:animate-none" />
                <span className="w-0.5 bg-white rounded-full h-4 animate-[pulse_0.5s_ease-in-out_infinite_300ms] motion-reduce:animate-none" />
                <span className="w-0.5 bg-white rounded-full h-2 animate-[pulse_0.8s_ease-in-out_infinite_400ms] motion-reduce:animate-none" />
              </div>

              <span className="text-center truncate">
                Listening in {currentLang.nativeLabel}… Tap to Finish
              </span>
            </>
          ) : (
            <>
              <span className="text-sm" aria-hidden="true">🎙️</span>
              <span className="text-center">
                Tap to Speak in {currentLang.label} ({currentLang.nativeLabel})
              </span>
            </>
          )}
        </button>

        {/* Quick Sample Regional Fill */}
        <button
          type="button"
          onClick={() => {
            handleFinalResult(currentLang.samplePhrase);
          }}
          className="rounded-xl border bg-muted/30 px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] shrink-0 mobile-touch-target flex items-center justify-center gap-1"
          title="Fill with regional sample phrase"
        >
          <span aria-hidden="true">⚡</span>
          <span>Sample</span>
        </button>
      </div>

      {/* Accessible Dynamic Recording State Live Region */}
      <div
        role="status"
        aria-live="polite"
        className="mt-2 min-h-[2.5rem] flex flex-col justify-center"
      >
        {isListening && (
          <div className="rounded-lg border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-2 text-xs text-foreground animate-in fade-in-50">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                </span>
                Live Audio Stream Active ({currentLang.nativeLabel})
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                Speak clearly…
              </span>
            </div>
            <p className="font-medium text-xs leading-relaxed italic text-foreground break-words">
              "{interimTranscript || 'Listening for speech…'}"
            </p>
          </div>
        )}

        {isProcessing && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 p-2 text-xs text-amber-900 dark:text-amber-200 animate-in fade-in-50 flex items-center gap-2">
            <span className="animate-spin text-xs motion-reduce:animate-none">⏳</span>
            <span className="font-semibold text-xs">Finalizing voice transcription…</span>
          </div>
        )}

        {recordingState === 'TRANSCRIPT_AVAILABLE' && finalTranscript && (
          <div className="rounded-lg border border-emerald-300 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 p-2 text-xs text-foreground animate-in fade-in-50">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <span>✓</span>
                <span>Transcript Captured ({currentLang.nativeLabel})</span>
              </span>
              <button
                type="button"
                onClick={handleClearTranscript}
                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground underline transition cursor-pointer"
              >
                Clear
              </button>
            </div>
            <p className="font-medium text-xs leading-relaxed text-emerald-950 dark:text-emerald-200 break-words">
              "{finalTranscript}"
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 break-words">
            ⚠️ {error}
          </div>
        )}
      </div>
    </div>
  );
}
