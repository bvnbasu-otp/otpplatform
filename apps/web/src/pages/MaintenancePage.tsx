import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getRetainedSession, type RetainedSessionData } from '@/features/maintenance';

// ----------------------------------------------------
// Funny Procurement Comic Quotes & Status Updates
// ----------------------------------------------------
const COMIC_QUOTES = [
  'Our digital hard hats are on! Tightening the cryptographic bolts and vacuuming the database indexes.',
  'Calibrating our automated quote parser to maintain strict identity protection.',
  'Refilling the virtual chai dispenser. Procurement leads require high octane tea to operate.',
  'Untangling the ONDC network cables. Someone plugged the identity-protected comparison server into the toaster.',
  'Recalibrating the committee quorum scale. Finding 2 partners who agree on anything takes time.',
];

// ----------------------------------------------------
// Game 1: Word Scramble
// ----------------------------------------------------
const JUMBLES = [
  { word: 'QUORUM', hint: 'The magical minimum number of society members needed to agree on elevator paint.' },
  { word: 'GSTIN', hint: '15 alphanumeric characters that prove you are a legitimate Indian business and not 3 raccoons in a trenchcoat.' },
  { word: 'PROTECTED', hint: 'Suppliers competing on specs and pricing without revealing identities before award.' },
  { word: 'ESCROW', hint: 'Where buyer funds sit peacefully until the work order milestone is signed off.' },
  { word: 'TENDER', hint: 'Not the chicken nugget kind. The competitive procurement kind.' },
  { word: 'WORKORDER', hint: 'The holy document that turns a quote into actual hammer-hitting reality.' },
];

function shuffleWord(w: string): string {
  const arr = w.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = temp;
  }
  const res = arr.join('');
  return res === w ? shuffleWord(w) : res;
}

// ----------------------------------------------------
// Game 2: Trivia / Riddles
// ----------------------------------------------------
const TRIVIA = [
  {
    q: 'What happens when a buyer forgets to specify GST in their requirement?',
    options: [
      'The supplier offers a 50% discount out of pure kindness',
      'The finance manager sheds a single tear into their Excel workbook',
      'The procurement lead is sentenced to 10 years of manual paper filing',
      'All of the above',
    ],
    correct: 1,
    commentary: 'Never forget the GST! Tax inspectors have built-in radars.',
  },
  {
    q: 'Why is identity-protected sourcing superior to traditional backdoor deals?',
    options: [
      'It prevents suppliers from quoting ₹1 lower than their cousin',
      'Algorithms don’t accept sweet boxes on Diwali',
      'Pure meritocracy based on delivery SLA and price',
      'All of the above!',
    ],
    correct: 3,
    commentary: 'Clean, auditable, and cryptographic proof beats sweet boxes every time!',
  },
  {
    q: 'What is the fastest way to get a milestone approved?',
    options: [
      'Uploading geo-tagged photos and delivery challans on time',
      'Sending 47 WhatsApp messages saying "Sir please check"',
      'Asking the security guard to vouch for you',
      'Bribing the office cat',
    ],
    correct: 0,
    commentary: 'Verified delivery proof = instant escrow milestone payout!',
  },
];

// ----------------------------------------------------
// Game 3: Pipe Grid Mini Puzzle (Connect 4 tiles)
// ----------------------------------------------------
type TileType = 'STRAIGHT' | 'CORNER' | 'CROSS';

interface PipeTile {
  id: number;
  type: TileType;
  rotation: number; // 0, 90, 180, 270
  targetRotation: number;
}

const INITIAL_PIPES: PipeTile[] = [
  { id: 1, type: 'CORNER', rotation: 90, targetRotation: 0 },
  { id: 2, type: 'STRAIGHT', rotation: 90, targetRotation: 0 },
  { id: 3, type: 'CORNER', rotation: 180, targetRotation: 90 },
  { id: 4, type: 'STRAIGHT', rotation: 0, targetRotation: 90 },
  { id: 5, type: 'CROSS', rotation: 0, targetRotation: 0 },
  { id: 6, type: 'STRAIGHT', rotation: 0, targetRotation: 90 },
  { id: 7, type: 'CORNER', rotation: 0, targetRotation: 270 },
  { id: 8, type: 'STRAIGHT', rotation: 90, targetRotation: 0 },
  { id: 9, type: 'CORNER', rotation: 270, targetRotation: 180 },
];

export function MaintenancePage() {
  const navigate = useNavigate();
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [activeGame, setActiveGame] = useState<'PIPES' | 'JUMBLE' | 'TRIVIA'>('PIPES');
  const [isSystemOnline, setIsSystemOnline] = useState(false);
  const [checkingBackend, setCheckingBackend] = useState(false);
  const [retainedSession] = useState<RetainedSessionData | null>(() => getRetainedSession());

  // Word Scramble State
  const [jumbleIdx, setJumbleIdx] = useState(0);
  const [jumbleGuess, setJumbleGuess] = useState('');
  const [jumbleSolved, setJumbleSolved] = useState(false);
  const currentJumble = JUMBLES[jumbleIdx] || JUMBLES[0]!;
  const [scrambled, setScrambled] = useState(() => shuffleWord(currentJumble.word));

  // Trivia State
  const [triviaIdx, setTriviaIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const currentTrivia = TRIVIA[triviaIdx] || TRIVIA[0]!;

  // Pipe Puzzle State
  const [pipes, setPipes] = useState<PipeTile[]>(INITIAL_PIPES);
  const [pipesWon, setPipesWon] = useState(false);

  // Rotate quotes every 8 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % COMIC_QUOTES.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  // Background Health Probe: Auto-check if OTP is back online
  useEffect(() => {
    let cancelled = false;
    async function checkHealth() {
      if (cancelled) return;
      setCheckingBackend(true);
      try {
        const { data, error } = await supabase.rpc('get_maintenance_status');
        if (!error && data && data.maintenanceMode === false) {
          setIsSystemOnline(true);
          setTimeout(() => {
            const params = new URLSearchParams(window.location.search);
            const returnUrl = params.get('returnUrl') || '/dashboard';
            navigate(returnUrl, { replace: true });
          }, 2000);
        }
      } catch {
        // Backend still in maintenance
      } finally {
        setCheckingBackend(false);
      }
    }

    void checkHealth();
    const probe = setInterval(checkHealth, 6000);
    return () => {
      cancelled = true;
      clearInterval(probe);
    };
  }, [navigate]);

  // Handle Pipe Rotation
  const handleRotatePipe = (id: number) => {
    setPipes((prev) => {
      const updated = prev.map((tile) =>
        tile.id === id ? { ...tile, rotation: (tile.rotation + 90) % 360 } : tile
      );

      // Check win condition
      const isComplete = updated.every((t) => {
        if (t.type === 'CROSS') return true;
        if (t.type === 'STRAIGHT') return t.rotation % 180 === t.targetRotation % 180;
        return t.rotation === t.targetRotation;
      });

      if (isComplete) setPipesWon(true);
      return updated;
    });
  };

  // Next Jumble
  const nextJumble = () => {
    const next = (jumbleIdx + 1) % JUMBLES.length;
    setJumbleIdx(next);
    setScrambled(shuffleWord(JUMBLES[next]!.word));
    setJumbleGuess('');
    setJumbleSolved(false);
  };

  // Check Jumble
  const handleJumbleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (jumbleGuess.trim().toUpperCase() === currentJumble.word) {
      setJumbleSolved(true);
    } else {
      alert('Not quite! Give it another shot!');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-8 font-sans selection:bg-amber-500 selection:text-black">
      {/* Header Banner */}
      <header className="mx-auto w-full max-w-4xl text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-500/40 px-4 py-1 text-xs font-black uppercase tracking-widest text-amber-400 animate-pulse">
          <span>🚧</span> MEN AT WORK · SCHEDULED SYSTEM MAINTENANCE
        </div>

        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white flex items-center justify-center gap-3">
          <span>👷‍♂️</span> OTP is Tuning the Engine! <span>🔧</span>
        </h1>

        <p className="text-sm sm:text-base text-amber-200/90 font-medium max-w-2xl mx-auto italic">
          &ldquo;{COMIC_QUOTES[quoteIdx]}&rdquo;
        </p>

        {/* Live Reconnect Status Probe */}
        <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          <span>
            {isSystemOnline
              ? '🎉 OTP is BACK IN PRODUCTION! Redirecting now…'
              : checkingBackend
              ? 'Checking if production is ready…'
              : 'Auto-detecting when platform is back online (polling every 6s)'}
          </span>
        </div>
      </header>

      {/* Main Interactive Comic Puzzle Container */}
      <main className="mx-auto w-full max-w-2xl my-6 bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-2xl backdrop-blur-sm space-y-6">
        {/* Retained Session & Unsaved Transaction Confirmation Banner */}
        {retainedSession && (
          <div
            data-testid="retained-session-card"
            className="rounded-xl border border-amber-500/50 bg-amber-950/40 p-4 text-left shadow-lg backdrop-blur space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <span className="text-base">💾</span>
                <span>Unsaved Transaction Data Preserved</span>
              </div>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                Session Active
              </span>
            </div>
            <p className="text-xs text-slate-300">
              You were working on <strong className="text-white font-mono">{retainedSession.path}</strong> when scheduled maintenance began. Your in-progress form inputs and drafts have been safely saved in your browser session.
            </p>
            {retainedSession.fieldCount > 0 && (
              <p className="text-[11px] text-amber-200/80 font-mono">
                ✓ {retainedSession.fieldCount} form field(s) captured &amp; stored for automatic post-maintenance restoration
              </p>
            )}
            <p className="text-[11px] text-slate-400 italic">
              As soon as maintenance concludes, you will be automatically returned to your workspace and this data will be restored.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>🎮</span> While You Wait: Play a Procurement Mini-Game
            </h2>
            <p className="text-xs text-slate-400">Keep yourself entertained while our engineers do the heavy lifting.</p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-700 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveGame('PIPES')}
              className={`rounded-lg px-3 py-1 transition ${
                activeGame === 'PIPES' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              🪢 Pipe Wire
            </button>
            <button
              type="button"
              onClick={() => setActiveGame('JUMBLE')}
              className={`rounded-lg px-3 py-1 transition ${
                activeGame === 'JUMBLE' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              🔤 Jumble
            </button>
            <button
              type="button"
              onClick={() => setActiveGame('TRIVIA')}
              className={`rounded-lg px-3 py-1 transition ${
                activeGame === 'TRIVIA' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              🧠 Trivia
            </button>
          </div>
        </div>

        {/* ---------------- GAME 1: PIPE WIRE CONNECTOR ---------------- */}
        {activeGame === 'PIPES' && (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold flex items-center gap-1">
                <span>🏛️</span> BUYER ORG (Start)
              </span>
              <span className="text-slate-400">Click tiles to rotate pipes &amp; connect line</span>
              <span className="font-semibold flex items-center gap-1">
                <span>🏪</span> SUPPLIER (Goal)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto p-3 bg-slate-900 rounded-xl border border-slate-700">
              {pipes.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => handleRotatePipe(tile.id)}
                  style={{ transform: `rotate(${tile.rotation}deg)` }}
                  className="h-16 w-16 bg-slate-800 border-2 border-slate-600 rounded-lg flex items-center justify-center text-xl font-mono hover:border-amber-400 transition-transform duration-200"
                >
                  {tile.type === 'STRAIGHT' && '━'}
                  {tile.type === 'CORNER' && '┗'}
                  {tile.type === 'CROSS' && '╋'}
                </button>
              ))}
            </div>

            {pipesWon ? (
              <div className="rounded-xl bg-emerald-500/20 border border-emerald-500 p-3 text-emerald-300 font-bold text-sm animate-bounce">
                🎉 YOU CONNECTED THE PROCUREMENT PIPELINE! RFQ Delivered to Supplier!
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPipes(INITIAL_PIPES.map((p) => ({ ...p, rotation: Math.floor(Math.random() * 4) * 90 })));
                  setPipesWon(false);
                }}
                className="text-xs text-amber-400 hover:underline font-semibold"
              >
                Scramble &amp; Try Again 🎲
              </button>
            )}
          </div>
        )}

        {/* ---------------- GAME 2: WORD JUMBLE ---------------- */}
        {activeGame === 'JUMBLE' && (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Unscramble This Procurement Term:</span>
              <div className="text-3xl font-mono font-black tracking-widest text-amber-400 bg-slate-900 py-3 rounded-xl border border-slate-700">
                {scrambled}
              </div>
              <p className="text-xs text-slate-400 italic">Hint: &quot;{currentJumble.hint}&quot;</p>
            </div>

            {jumbleSolved ? (
              <div className="rounded-xl bg-emerald-500/20 border border-emerald-500 p-4 text-center space-y-2 animate-in fade-in">
                <p className="text-emerald-300 font-bold text-sm">
                  ✓ BINGO! The word was <span className="font-black text-white">{currentJumble.word}</span>!
                </p>
                <button
                  type="button"
                  onClick={nextJumble}
                  className="rounded-lg bg-emerald-500 text-black px-4 py-1.5 text-xs font-bold hover:bg-emerald-400 transition"
                >
                  Play Next Word →
                </button>
              </div>
            ) : (
              <form onSubmit={handleJumbleSubmit} className="flex gap-2 max-w-sm mx-auto">
                <input
                  type="text"
                  value={jumbleGuess}
                  onChange={(e) => setJumbleGuess(e.target.value)}
                  placeholder="Type your guess..."
                  className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs uppercase font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500 text-black px-4 py-2 text-xs font-bold hover:bg-amber-400 transition"
                >
                  Check ✓
                </button>
              </form>
            )}
          </div>
        )}

        {/* ---------------- GAME 3: TRIVIA / RIDDLES ---------------- */}
        {activeGame === 'TRIVIA' && (
          <div className="space-y-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Question {triviaIdx + 1} of {TRIVIA.length}
              </span>
              <h3 className="text-sm sm:text-base font-bold text-white mt-1">{currentTrivia.q}</h3>
            </div>

            <div className="space-y-2">
              {currentTrivia.options.map((opt, idx) => {
                const isChosen = selectedAnswer === idx;
                const isRight = idx === currentTrivia.correct;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAnswer(idx)}
                    className={`w-full text-left rounded-xl p-3 text-xs font-semibold border transition ${
                      selectedAnswer === null
                        ? 'bg-slate-900/80 border-slate-700 hover:border-amber-400 text-slate-200'
                        : isRight
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                        : isChosen
                        ? 'bg-red-500/20 border-red-500 text-red-300'
                        : 'bg-slate-900/40 border-slate-800 text-slate-500'
                    }`}
                  >
                    <span className="mr-2 font-mono">[{String.fromCharCode(65 + idx)}]</span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {selectedAnswer !== null && (
              <div className="flex items-center justify-between text-xs pt-2">
                <span className="italic text-slate-300">{currentTrivia.commentary}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAnswer(null);
                    setTriviaIdx((prev) => (prev + 1) % TRIVIA.length);
                  }}
                  className="rounded-lg bg-amber-500 text-black px-3 py-1.5 font-bold hover:bg-amber-400"
                >
                  Next Riddle →
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-4xl text-center text-xs text-slate-500 space-y-2">
        <p>© {new Date().getFullYear()} OTP Platform (Open Trade &amp; Procurement) · Zero Commission · Identity-Protected Competitive Sourcing</p>
        <div className="flex justify-center gap-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-amber-400 hover:underline font-semibold"
          >
            Manual Page Refresh ↺
          </button>
          <Link
            to="/login?admin=true"
            className="text-amber-400 hover:text-amber-300 hover:underline font-semibold inline-flex items-center gap-1"
          >
            <span>🛡️</span> Platform Admin Emergency Sign-In
          </Link>
        </div>
      </footer>
    </div>
  );
}
