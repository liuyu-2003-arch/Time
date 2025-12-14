import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Music, Loader2, AlertCircle } from 'lucide-react';
import { generateVoiceAsset, playSound, playGoSound, getAudioContext, playTickSound, setBackgroundMusicState } from './services/audioService';
import { CircularProgress } from './components/CircularProgress';
import { TimerSettings, AudioAssets, AppState } from './types';

// --- Components ---

const Logo: React.FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <circle cx="16" cy="16" r="14" stroke="#334155" strokeWidth="4" />
    <path d="M16 2C8.26801 2 2 8.26801 2 16" stroke="#00D8FF" strokeWidth="4" strokeLinecap="round" />
    <path d="M16 16L21 21" stroke="#FF0055" strokeWidth="3" strokeLinecap="round" />
    <circle cx="16" cy="16" r="3" fill="white" />
  </svg>
);

const WheelColumn: React.FC<{
  range: number;
  value: number;
  onChange: (val: number) => void;
  label: string;
}> = ({ range, value, onChange, label }) => {
  const [direction, setDirection] = useState<0 | 1 | -1>(0);
  const valueRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep ref in sync with prop for the interval closure
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopInteraction();
  }, []);

  const handleChange = (dir: 1 | -1) => {
    const next = valueRef.current + dir;
    if (next >= 0 && next < range) {
        onChange(next);
        playTickSound();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
           navigator.vibrate(5); 
        }
        return true;
    }
    return false;
  };

  const startInteraction = (dir: 1 | -1) => {
    setDirection(dir);
    
    // Immediate action
    const canMove = handleChange(dir);
    if (!canMove) return;

    // Wait for long press
    timerRef.current = setTimeout(() => {
        // Start rapid fire
        intervalRef.current = setInterval(() => {
            const moved = handleChange(dir);
            if (!moved) stopInteraction();
        }, 100);
    }, 400); // 400ms delay for long press
  };

  const stopInteraction = () => {
    setDirection(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timerRef.current = null;
    intervalRef.current = null;
  };

  const ITEM_HEIGHT = 64; 
  const VISIBLE_ITEMS = 3;
  const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS; // 192px

  const prevVal = value - 1;
  const nextVal = value + 1;

  return (
    <div 
      className="relative flex flex-col items-center select-none touch-none" 
      style={{ height: `${CONTAINER_HEIGHT}px`, width: '8rem' }} 
    >
      {/* Label - Adjusted position */}
      <div className="absolute -top-8 text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
      
      {/* Selection Highlight */}
      <div 
        className="absolute w-full border-t border-b border-slate-600 bg-slate-800/30 pointer-events-none z-0 rounded-lg"
        style={{ top: `${ITEM_HEIGHT}px`, height: `${ITEM_HEIGHT}px` }} 
      />

      <div className="flex flex-col w-full h-full z-10">
          {/* Top Button (Decrement) */}
          <div 
            onPointerDown={(e) => { e.preventDefault(); startInteraction(-1); }}
            onPointerUp={(e) => { e.preventDefault(); stopInteraction(); }}
            onPointerLeave={(e) => { e.preventDefault(); stopInteraction(); }}
            onPointerCancel={(e) => { e.preventDefault(); stopInteraction(); }}
            style={{ height: `${ITEM_HEIGHT}px` }}
            className={`w-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform duration-100 ${direction === -1 ? 'text-white' : 'text-slate-500'}`}
          >
             <span className="text-2xl tabular-nums leading-none">
                {prevVal >= 0 ? prevVal.toString().padStart(2, '0') : ''}
            </span>
          </div>

          {/* Middle Display (Current) */}
          <div 
             style={{ height: `${ITEM_HEIGHT}px` }}
             className="w-full flex items-center justify-center font-bold text-white"
          >
            <span className="text-4xl tabular-nums leading-none translate-y-[2px]">
                {value.toString().padStart(2, '0')}
            </span>
          </div>

          {/* Bottom Button (Increment) */}
          <div 
            onPointerDown={(e) => { e.preventDefault(); startInteraction(1); }}
            onPointerUp={(e) => { e.preventDefault(); stopInteraction(); }}
            onPointerLeave={(e) => { e.preventDefault(); stopInteraction(); }}
            onPointerCancel={(e) => { e.preventDefault(); stopInteraction(); }}
            style={{ height: `${ITEM_HEIGHT}px` }}
            className={`w-full flex items-center justify-center cursor-pointer active:scale-95 transition-transform duration-100 ${direction === 1 ? 'text-white' : 'text-slate-500'}`}
          >
             <span className="text-2xl tabular-nums leading-none">
                {nextVal < range ? nextVal.toString().padStart(2, '0') : ''}
            </span>
          </div>
      </div>
      
      {/* Gradients */}
      <div className="absolute top-0 w-full bg-gradient-to-b from-dark via-dark/60 to-transparent pointer-events-none z-20" style={{ height: `${ITEM_HEIGHT}px` }} />
      <div className="absolute bottom-0 w-full bg-gradient-to-t from-dark via-dark/60 to-transparent pointer-events-none z-20" style={{ height: `${ITEM_HEIGHT}px` }} />
    </div>
  );
};


// --- Main App ---

const formatTime = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const PRESETS = [
  { label: '1 min', m: 1, s: 0 },
  { label: '2 min', m: 2, s: 0 },
  { label: '5 min', m: 5, s: 0 },
  { label: '10 min', m: 10, s: 0 },
];

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [settings, setSettings] = useState<TimerSettings>({ intervalMinutes: 2, intervalSeconds: 0 });
  const [isMusicEnabled, setIsMusicEnabled] = useState(true);
  
  const [totalSecondsElapsed, setTotalSecondsElapsed] = useState(0);
  const [currentIntervalElapsed, setCurrentIntervalElapsed] = useState(0);
  const [cycleCount, setCycleCount] = useState(1);
  const [audioLoadingState, setAudioLoadingState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  
  // Ref for Wake Lock Sentinel
  const wakeLockRef = useRef<any>(null);
  
  const audioAssets = useRef<AudioAssets>({
    five: null, four: null, three: null, two: null, one: null, next: null
  });

  const intervalDuration = (settings.intervalMinutes * 60) + settings.intervalSeconds;
  
  const loadAudioInBackground = async () => {
    if (audioLoadingState === 'ready' || audioLoadingState === 'loading') return;
    setAudioLoadingState('loading');
    try {
      const [five, four, three, two, one, next] = await Promise.all([
        generateVoiceAsset("Five"),
        generateVoiceAsset("Four"),
        generateVoiceAsset("Three"),
        generateVoiceAsset("Two"),
        generateVoiceAsset("One"),
        generateVoiceAsset("Next action! Go!"),
      ]);
      audioAssets.current = { five, four, three, two, one, next };
      setAudioLoadingState('ready');
    } catch (err) {
      console.warn("Audio generation failed, switching to fallback beeps.", err);
      setAudioLoadingState('failed');
    }
  };

  const startSession = async () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    setAppState(AppState.RUNNING);
    loadAudioInBackground();
  };

  // Manage Background Music
  useEffect(() => {
    const shouldPlay = appState === AppState.RUNNING && isMusicEnabled;
    setBackgroundMusicState(shouldPlay);
  }, [appState, isMusicEnabled]);

  // Manage Screen Wake Lock
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          const sentinel = await (navigator as any).wakeLock.request('screen');
          wakeLockRef.current = sentinel;
        } catch (err) {
          console.warn("Wake Lock request failed:", err);
        }
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (err) {
           // Ignore errors on release
           console.warn("Wake Lock release failed:", err);
        }
      }
    };

    const handleVisibilityChange = () => {
      // Re-acquire lock if app comes back to foreground and is running
      if (document.visibilityState === 'visible' && appState === AppState.RUNNING) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (appState === AppState.RUNNING) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [appState]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (appState === AppState.RUNNING) {
      intervalId = setInterval(() => {
        setTotalSecondsElapsed(prev => {
          const newTotal = prev + 1;
          const timeInCurrentCycle = newTotal % intervalDuration;
          const effectiveTime = timeInCurrentCycle === 0 ? intervalDuration : timeInCurrentCycle;
          const timeRemaining = intervalDuration - effectiveTime;

          if (timeRemaining === 5) playSound(audioAssets.current.five);
          if (timeRemaining === 4) playSound(audioAssets.current.four);
          if (timeRemaining === 3) playSound(audioAssets.current.three);
          if (timeRemaining === 2) playSound(audioAssets.current.two);
          if (timeRemaining === 1) playSound(audioAssets.current.one);
          if (timeRemaining === 0) {
             playGoSound(audioAssets.current.next);
             setCycleCount(c => c + 1);
          }
          setCurrentIntervalElapsed(effectiveTime === intervalDuration ? 0 : effectiveTime);
          return newTotal;
        });
      }, 1000);
    }
    return () => clearInterval(intervalId);
  }, [appState, intervalDuration]);

  const toggleTimer = () => {
    setAppState(prev => prev === AppState.RUNNING ? AppState.PAUSED : AppState.RUNNING);
  };

  const toggleMusic = () => {
      setIsMusicEnabled(prev => !prev);
  };

  const resetTimer = () => {
    setAppState(AppState.IDLE);
    setTotalSecondsElapsed(0);
    setCurrentIntervalElapsed(0);
    setCycleCount(1);
    setBackgroundMusicState(false);
  };

  // --- Views ---

  if (appState === AppState.IDLE) {
     return (
        <div className="h-[100dvh] w-full bg-dark flex flex-col relative text-white overflow-hidden">
           {/* Header: reduced vertical padding */}
           <header className="px-6 pt-6 pb-2 text-center flex flex-col items-center flex-shrink-0">
              <div className="flex items-center gap-2 mb-2 opacity-80">
                  <Logo className="w-5 h-5" />
                  <span className="font-bold text-slate-300 tracking-wide uppercase text-[10px]">IntervalFlow</span>
              </div>
              <h1 className="text-xl font-bold text-slate-200 tracking-tight">Set Interval</h1>
           </header>

           {/* Main: Use flex-col and justify-evenly to distribute space dynamically, reduced max width */}
           <main className="flex-1 flex flex-col items-center justify-center gap-4 w-full max-w-sm mx-auto px-6">
              
              {/* Wheel Picker: Reduced internal padding */}
              <div className="flex justify-center items-center space-x-2 bg-surface/50 px-2 pt-10 pb-4 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-sm w-full">
                 <WheelColumn 
                    range={61} 
                    value={settings.intervalMinutes} 
                    onChange={(val) => setSettings(s => ({...s, intervalMinutes: val}))} 
                    label="MIN"
                 />
                 <div className="h-10 text-2xl font-bold text-slate-600 pb-2">:</div>
                 <WheelColumn 
                    range={60} 
                    value={settings.intervalSeconds} 
                    onChange={(val) => setSettings(s => ({...s, intervalSeconds: val}))} 
                    label="SEC"
                 />
              </div>

              {/* Presets: Compact spacing */}
              <div className="w-full flex flex-col items-center gap-2">
                 <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">Quick Presets</div>
                 <div className="grid grid-cols-2 gap-2 w-full">
                    {PRESETS.map(p => (
                       <button
                          key={p.label}
                          onClick={() => setSettings({ intervalMinutes: p.m, intervalSeconds: p.s })}
                          className={`py-3 rounded-lg text-sm font-medium transition-all active:scale-95 ${
                             settings.intervalMinutes === p.m && settings.intervalSeconds === p.s
                             ? 'bg-slate-700 text-white shadow-lg'
                             : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                          }`}
                       >
                          {p.label}
                       </button>
                    ))}
                 </div>
              </div>
           </main>

           {/* Footer: reduced padding */}
           <footer className="p-6 pb-8 w-full flex flex-col items-center flex-shrink-0">
              <div className="w-full max-w-sm flex flex-col items-center">
                 <button 
                    onClick={startSession}
                    className="w-64 py-4 bg-primary hover:bg-cyan-400 text-dark font-bold text-xl rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center space-x-2 transition-transform active:scale-95"
                 >
                    <Play fill="currentColor" size={24} />
                    <span>Start Workout</span>
                 </button>
                 {audioLoadingState === 'failed' && (
                    <p className="text-center text-[10px] text-yellow-500 mt-2 flex items-center justify-center gap-1">
                       <AlertCircle size={10}/> Audio fallback active
                    </p>
                 )}
              </div>
           </footer>
        </div>
     )
  }

  const timeLeftInInterval = intervalDuration - currentIntervalElapsed;
  const percentage = (timeLeftInInterval / intervalDuration) * 100;

  return (
    <div className="h-[100dvh] w-full bg-dark flex flex-col text-white overflow-hidden relative">
      <header className="p-6 flex justify-between items-center z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
            <Logo className="w-8 h-8" />
            <h1 className="text-xl font-bold text-slate-200">IntervalFlow</h1>
        </div>
        <div className="flex items-center space-x-2">
           {audioLoadingState === 'loading' && (
             <div className="flex items-center space-x-2 px-2 py-1 bg-surface rounded-full border border-slate-700">
               <Loader2 className="animate-spin text-primary" size={14} />
             </div>
           )}
           {audioLoadingState === 'failed' && (
              <span className="text-xs text-yellow-500 font-medium px-2 py-1 bg-yellow-500/10 rounded-full border border-yellow-500/20">Beeps</span>
           )}
           {audioLoadingState === 'ready' && (
              <span className="text-xs text-primary font-medium px-2 py-1 bg-primary/10 rounded-full border border-primary/20">Voice</span>
           )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative px-6 w-full">
        <div className="text-center space-y-1 mb-6">
          <p className="text-slate-400 text-xs tracking-widest uppercase">Cycle</p>
          <p className="text-3xl font-bold text-white">#{cycleCount}</p>
        </div>
        
        <div className="flex flex-col items-center">
           <div className="relative">
             <CircularProgress 
               size={280} 
               strokeWidth={10} 
               percentage={percentage} 
               timeLeftStr={formatTime(timeLeftInInterval)}
               color={timeLeftInInterval <= 5 ? '#FF0055' : '#00D8FF'}
             />
           </div>
           
           <div className="mt-6 text-slate-500 font-medium tracking-widest uppercase text-xs">
              Interval: {formatTime(intervalDuration)}
           </div>
        </div>

        <div className="h-8 mt-4 flex items-center justify-center">
           {timeLeftInInterval <= 5 && timeLeftInInterval > 0 && (
             <span className="text-secondary font-bold text-2xl animate-pulse">Get Ready!</span>
           )}
           {timeLeftInInterval === intervalDuration && cycleCount > 1 && (
             <span className="text-primary font-bold text-2xl animate-bounce">GO!</span>
           )}
        </div>
      </main>

      <footer className="px-8 pb-10 pt-6 bg-surface/50 backdrop-blur-md rounded-t-3xl border-t border-slate-700/50 grid grid-cols-3 items-center w-full shadow-2xl flex-shrink-0">
        <div className="flex justify-start">
            <button 
            onClick={resetTimer}
            className="p-4 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-all active:scale-95"
            >
            <RotateCcw size={24} />
            </button>
        </div>

        <div className="flex justify-center">
            <button 
            onClick={toggleTimer}
            className={`p-6 rounded-full shadow-lg shadow-primary/20 transition-all active:scale-95 transform hover:-translate-y-1 ${
                appState === AppState.RUNNING 
                ? 'bg-secondary text-white' 
                : 'bg-primary text-dark'
            }`}
            >
            {appState === AppState.RUNNING ? (
                <Pause size={36} fill="currentColor" />
            ) : (
                <Play size={36} fill="currentColor" className="ml-1" />
            )}
            </button>
        </div>
        
        <div className="flex justify-end">
            <button 
                onClick={toggleMusic}
                className={`p-4 rounded-full transition-all active:scale-95 ${
                    isMusicEnabled
                    ? 'bg-primary/20 text-primary hover:bg-primary/30'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
                >
                <Music size={24} />
            </button>
        </div>
      </footer>
    </div>
  );
};

export default App;