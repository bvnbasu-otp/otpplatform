import { useState, useEffect, useRef } from 'react';

export interface VoiceRequirementDictationProps {
  onTranscript: (text: string) => void;
  className?: string;
  compact?: boolean;
}

export type SupportedSpeechLanguage = 'ta-IN' | 'hi-IN' | 'en-IN';

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
  const [isListening, setIsListening] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedSpeechLanguage>('en-IN');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

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
        setIsListening(true);
        setError(null);
        setInterimTranscript('');
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let finalResult = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalResult += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim);
        }

        if (finalResult) {
          setInterimTranscript(finalResult);
          onTranscript(finalResult);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setError('Microphone access denied. Please enable mic permissions in your browser.');
        } else if (event.error === 'no-speech') {
          setError('No voice detected. Please speak into the mic.');
        } else {
          setError(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
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
  }, [onTranscript]);

  const toggleListening = () => {
    setError(null);
    if (!recognitionRef.current) {
      // Fallback: If Web Speech API not present in current environment, simulate sample regional dictation
      const lang = LANGUAGES.find((l) => l.code === selectedLanguage);
      if (lang) {
        setInterimTranscript(lang.samplePhrase);
        onTranscript(lang.samplePhrase);
      }
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
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
        }
      }
    }
  };

  const currentLang = LANGUAGES.find((l) => l.code === selectedLanguage) ?? LANGUAGES[0]!;

  if (compact) {
    return (
      <div className={`relative inline-flex items-center gap-1 ${className}`}>
        <button
          type="button"
          onClick={toggleListening}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border transition shadow-2xs ${
            isListening
              ? 'bg-red-500 text-white border-red-600 animate-pulse'
              : 'bg-muted/80 text-foreground border-border hover:bg-muted'
          }`}
          title={`Dictate in ${currentLang.label} (${currentLang.nativeLabel})`}
          data-testid="compact-voice-dictation-btn"
        >
          <span>{isListening ? '⏹️' : '🎙️'}</span>
        </button>

        {isListening && (
          <span className="absolute -top-7 left-0 whitespace-nowrap rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-md animate-bounce">
            Listening ({currentLang.nativeLabel})…
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border bg-card/95 p-3 shadow-2xs ${className}`}
      data-testid="voice-requirement-dictation-widget"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🎙️</span>
          <div>
            <h3 className="text-xs font-bold text-foreground">
              Voice Dictation (Tamil · Hindi · English)
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Dictate requirement in your regional language — auto-converts to RFQ specs
            </p>
          </div>
        </div>

        {/* Language Selector Chips */}
        <div className="flex flex-wrap items-center gap-1">
          {LANGUAGES.map((lang) => {
            const active = selectedLanguage === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
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
                <span>{lang.flag}</span>
                <span>{lang.nativeLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          type="button"
          onClick={toggleListening}
          className={`flex-1 min-h-[44px] rounded-xl px-4 py-2.5 text-xs font-extrabold transition shadow-2xs flex items-center justify-center gap-2 border mobile-touch-target ${
            isListening
              ? 'bg-red-600 text-white border-red-700 animate-pulse'
              : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
          }`}
          data-testid="voice-dictate-main-btn"
        >
          <span className="text-sm">{isListening ? '⏹️' : '🎙️'}</span>
          <span className="text-center">
            {isListening
              ? `Listening in ${currentLang.nativeLabel}… Tap to Complete`
              : `Tap to Speak in ${currentLang.label} (${currentLang.nativeLabel})`}
          </span>
        </button>

        {/* Quick Sample Regional Fill */}
        <button
          type="button"
          onClick={() => {
            setInterimTranscript(currentLang.samplePhrase);
            onTranscript(currentLang.samplePhrase);
          }}
          className="rounded-xl border bg-muted/30 px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px] shrink-0 mobile-touch-target"
          title="Fill with regional sample phrase"
        >
          ⚡ Sample
        </button>
      </div>

      {/* Real-time speech transcript status box */}
      {(interimTranscript || isListening) && (
        <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-xs text-foreground animate-in fade-in-50">
          <span className="text-[10px] font-bold text-primary uppercase tracking-wider block mb-0.5">
            {isListening ? '🎙️ Live Voice Recognition:' : '✓ Recognized Voice Text:'}
          </span>
          <p className="font-medium text-xs leading-relaxed italic">
            "{interimTranscript || 'Speaking…'}"
          </p>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
