import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, Loader2, AlertCircle } from 'lucide-react';
import { generateVoiceAsset, playSound, playGoSound, getAudioContext, playTickSound } from './services/audioService';
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
      style={{ height: `${CONTAINER_HEIGHT}px`, width: '9rem' }} 
    >
      {/* Label - Increased gap significantly (-top-10) */}
      <div className="absolute -top-10 text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</div>
      
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
      
      {/* Gradients - lighter opacity now that interaction is click-based */}
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
  
  const [totalSecondsElapsed, setTotalSecondsElapsed] = useState(0);
  const [currentIntervalElapsed, setCurrentIntervalElapsed] = useState(0);
  const [cycleCount, setCycleCount] = useState(1);
  const [audioLoadingState, setAudioLoadingState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  
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

  const resetTimer = () => {
    setAppState(AppState.IDLE);
    setTotalSecondsElapsed(0);
    setCurrentIntervalElapsed(0);
    setCycleCount(1);
  };

  // --- Views ---

  if (appState === AppState.IDLE) {
     return (
        <div className="min-h-screen bg-dark flex flex-col relative text-white">
           {/* Header reduced padding */}
           <header className="px-8 pt-8 pb-0 text-center flex flex-col items-center">
              <div className="flex items-center gap-2 mb-6 opacity-80">
                  <Logo className="w-6 h-6" />
                  <span className="font-bold text-slate-300 tracking-wide uppercase text-xs">IntervalFlow</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-200 tracking-tight">Set Interval</h1>
              <p className="text-slate-500 text-sm mt-1">Choose your work/rest duration</p>
           </header>

           {/* Main: Increased spacing from space-y-3 to space-y-8 to match footer gaps */}
           <main className="flex-1 flex flex-col items-center justify-center space-y-8 w-full max-w-lg mx-auto px-6">
              
              {/* Wheel Picker: Increased vertical padding (pt-14 pb-6) to accommodate larger label offset */}
              <div className="flex justify-center items-center space-x-2 bg-surface/50 px-4 pt-14 pb-6 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-sm w-[22rem]">
                 <WheelColumn 
                    range={61} 
                    value={settings.intervalMinutes} 
                    onChange={(val) => setSettings(s => ({...s, intervalMinutes: val}))} 
                    label="Minutes"
                 />
                 <div className="h-10 text-3xl font-bold text-slate-600 pb-2">:</div>
                 <WheelColumn 
                    range={60} 
                    value={settings.intervalSeconds} 
                    onChange={(val) => setSettings(s => ({...s, intervalSeconds: val}))} 
                    label="Seconds"
                 />
              </div>

              {/* Presets: Compact spacing, aligned width */}
              <div className="w-full flex flex-col items-center">
                 <div className="text-xs font-bold text-slate-600 uppercase tracking-widest text-center mb-2">Quick Presets</div>
                 <div className="grid grid-cols-2 gap-2 w-[22rem]">
                    {PRESETS.map(p => (
                       <button
                          key={p.label}
                          onClick={() => setSettings({ intervalMinutes: p.m, intervalSeconds: p.s })}
                          className={`py-5 rounded-xl text-base font-medium transition-all active:scale-95 ${
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

           <footer className="p-8 pb-8 w-full flex flex-col items-center">
              <div className="w-[22rem]">
                 <button 
                    onClick={startSession}
                    className="w-full py-6 bg-primary hover:bg-cyan-400 text-dark font-bold text-2xl rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center space-x-2 transition-transform active:scale-95"
                 >
                    <Play fill="currentColor" size={28} />
                    <span>Start Workout</span>
                 </button>
                 {audioLoadingState === 'failed' && (
                    <p className="text-center text-xs text-yellow-500 mt-4 flex items-center justify-center gap-1">
                       <AlertCircle size={12}/> Using beep sounds (AI Voice unavailable)
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
    <div className="min-h-screen bg-dark flex flex-col text-white overflow-hidden relative">
      <header className="p-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
            <Logo className="w-8 h-8" />
            <h1 className="text-xl font-bold text-slate-200">IntervalFlow</h1>
        </div>
        <div className="flex items-center space-x-2">
           {audioLoadingState === 'loading' && (
             <div className="flex items-center space-x-2 px-2 py-1 bg-surface rounded-full border border-slate-700">
               <Loader2 className="animate-spin text-primary" size={14} />
               <span className="text-xs text-slate-400">Loading AI Voice...</span>
             </div>
           )}
           {audioLoadingState === 'failed' && (
              <span className="text-xs text-yellow-500 font-medium px-2 py-1 bg-yellow-500/10 rounded-full border border-yellow-500/20">Beeps Mode</span>
           )}
           {audioLoadingState === 'ready' && (
              <span className="text-xs text-primary font-medium px-2 py-1 bg-primary/10 rounded-full border border-primary/20">Voice Active</span>
           )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center space-y-8 relative px-6">
        <div className="text-center space-y-1">
          <p className="text-slate-400 text-sm tracking-widest uppercase">Current Cycle</p>
          <p className="text-3xl font-bold text-white">#{cycleCount}</p>
        </div>
        <div className="relative">
          <CircularProgress 
            size={300} 
            strokeWidth={12} 
            percentage={percentage} 
            timeLeftStr={formatTime(timeLeftInInterval)}
            totalTimeStr={formatTime(totalSecondsElapsed)}
            color={timeLeftInInterval <= 5 ? '#FF0055' : '#00D8FF'}
          />
        </div>
        <div className="h-8">
           {timeLeftInInterval <= 5 && timeLeftInInterval > 0 && (
             <span className="text-secondary font-bold text-2xl animate-pulse">Get Ready!</span>
           )}
           {timeLeftInInterval === intervalDuration && cycleCount > 1 && (
             <span className="text-primary font-bold text-2xl animate-bounce">GO!</span>
           )}
        </div>
      </main>

      <footer className="p-8 pb-12 bg-surface/50 backdrop-blur-md rounded-t-3xl border-t border-slate-700/50 flex items-center justify-center space-x-8 shadow-2xl">
        <button 
          onClick={resetTimer}
          className="p-4 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-all active:scale-95"
        >
          <RotateCcw size={28} />
        </button>

        <button 
          onClick={toggleTimer}
          className={`p-8 rounded-full shadow-lg shadow-primary/20 transition-all active:scale-95 transform hover:-translate-y-1 ${
            appState === AppState.RUNNING 
              ? 'bg-secondary text-white' 
              : 'bg-primary text-dark'
          }`}
        >
          {appState === AppState.RUNNING ? (
            <Pause size={48} fill="currentColor" />
          ) : (
            <Play size={48} fill="currentColor" className="ml-2" />
          )}
        </button>
      </footer>
    </div>
  );
};

export default App;