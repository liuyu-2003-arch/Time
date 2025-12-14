import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, Loader2, AlertCircle } from 'lucide-react';
import { generateVoiceAsset, playSound, playGoSound, getAudioContext } from './services/audioService';
import { CircularProgress } from './components/CircularProgress';
import { TimerSettings, AudioAssets, AppState } from './types';

// --- Components ---

const WheelColumn: React.FC<{
  range: number;
  value: number;
  onChange: (val: number) => void;
  label: string;
}> = ({ range, value, onChange, label }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const ITEM_HEIGHT = 48; // h-12

  // Sync scroll position when value changes externally (e.g. Presets)
  useEffect(() => {
    if (scrollRef.current) {
      const targetTop = value * ITEM_HEIGHT;
      const currentTop = scrollRef.current.scrollTop;
      
      // Only force scroll if the difference is significant (e.g. clicking a Preset).
      if (Math.abs(currentTop - targetTop) > 30) {
        isProgrammaticScroll.current = true;
        scrollRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
        
        // Reset flag after animation duration approximation
        setTimeout(() => {
          isProgrammaticScroll.current = false;
        }, 300);
      }
    }
  }, [value]);

  const handleScroll = () => {
    // Ignore scroll events caused by our own programmatic scrolling
    if (isProgrammaticScroll.current) return;

    if (scrollRef.current) {
      const scrollTop = scrollRef.current.scrollTop;
      const index = Math.round(scrollTop / ITEM_HEIGHT);
      if (index !== value && index < range) {
        // Haptic feedback
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
           navigator.vibrate(15);
        }
        onChange(index);
      }
    }
  };

  return (
    <div className="relative h-36 w-24 flex flex-col items-center select-none">
      {/* Label */}
      <div className="absolute -top-6 text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</div>
      
      {/* Selection Highlight */}
      <div className="absolute top-[calc(50%-24px)] w-full h-12 border-t border-b border-slate-600 bg-slate-800/30 pointer-events-none z-0 rounded-lg" />

      {/* Scroll Container - h-36 is 144px (3 items). Padding ensures center alignment. */}
      {/* Added classes to hide scrollbars across browsers and force better snapping */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-scroll overflow-x-hidden snap-y snap-mandatory z-10 py-[calc(50%-24px)] touch-pan-y [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
        style={{ scrollBehavior: 'auto' }}
      >
        {Array.from({ length: range }).map((_, i) => (
          <div 
            key={i} 
            // Allow clicking a number to snap to it
            onClick={() => {
              onChange(i);
              if (scrollRef.current) {
                 scrollRef.current.scrollTo({ top: i * ITEM_HEIGHT, behavior: 'smooth' });
              }
            }}
            // Added scroll-snap-stop: always via style to ensure it doesn't float between items
            style={{ scrollSnapStop: 'always' }}
            className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-200 ${
              i === value ? 'text-2xl font-bold text-white scale-110' : 'text-lg text-slate-600'
            }`}
          >
            {i.toString().padStart(2, '0')}
          </div>
        ))}
        {/* Padding at bottom to allow last item to scroll to center */}
        <div className="h-[calc(50%-24px)]"></div> 
      </div>
      
      {/* Gradients for depth */}
      <div className="absolute top-0 w-full h-12 bg-gradient-to-b from-dark to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 w-full h-12 bg-gradient-to-t from-dark to-transparent pointer-events-none z-20" />
    </div>
  );
};


// --- Main App ---

// Helper to format MM:SS
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
  // --- State ---
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [settings, setSettings] = useState<TimerSettings>({ intervalMinutes: 2, intervalSeconds: 0 });
  
  // Timer State
  const [totalSecondsElapsed, setTotalSecondsElapsed] = useState(0);
  const [currentIntervalElapsed, setCurrentIntervalElapsed] = useState(0);
  const [cycleCount, setCycleCount] = useState(1);
  
  // Audio State
  const [audioLoadingState, setAudioLoadingState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  
  // Audio Assets Ref
  const audioAssets = useRef<AudioAssets>({
    five: null, four: null, three: null, two: null, one: null, next: null
  });

  // Derived Values
  const intervalDuration = (settings.intervalMinutes * 60) + settings.intervalSeconds;
  
  // --- Audio Logic ---
  const loadAudioInBackground = async () => {
    if (audioLoadingState === 'ready' || audioLoadingState === 'loading') return;
    
    setAudioLoadingState('loading');
    
    try {
      // Parallel generation
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
    // 1. User gesture context resume (Important for iOS)
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // 2. IMMEDIATE START: Switch state first
    setAppState(AppState.RUNNING);

    // 3. Trigger audio load in background (fire and forget)
    // The timer loop handles null buffers gracefully using beeps
    loadAudioInBackground();
  };

  // --- Timer Logic ---
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    if (appState === AppState.RUNNING) {
      intervalId = setInterval(() => {
        setTotalSecondsElapsed(prev => {
          const newTotal = prev + 1;
          
          // Calculate interval position logic
          const timeInCurrentCycle = newTotal % intervalDuration;
          const effectiveTime = timeInCurrentCycle === 0 ? intervalDuration : timeInCurrentCycle;

          // Check Triggers based on "Time Remaining" in this interval
          const timeRemaining = intervalDuration - effectiveTime;

          // Triggers
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


  // --- Handlers ---
  const toggleTimer = () => {
    if (appState === AppState.RUNNING) {
      setAppState(AppState.PAUSED);
    } else {
      setAppState(AppState.RUNNING);
    }
  };

  const resetTimer = () => {
    setAppState(AppState.IDLE); // Go back to Setup
    setTotalSecondsElapsed(0);
    setCurrentIntervalElapsed(0);
    setCycleCount(1);
  };

  // --- Views ---

  // 1. Setup View (IDLE)
  if (appState === AppState.IDLE) {
     return (
        <div className="min-h-screen bg-dark flex flex-col relative text-white">
           <header className="p-8 pt-12 text-center">
              <h1 className="text-2xl font-bold text-slate-200 tracking-tight">Set Interval</h1>
              <p className="text-slate-500 text-sm mt-1">Choose your work/rest duration</p>
           </header>

           <main className="flex-1 flex flex-col items-center justify-center space-y-10 w-full max-w-md mx-auto px-6">
              
              {/* Wheel Picker */}
              <div className="flex justify-center items-center space-x-4 bg-surface/50 p-6 rounded-3xl border border-slate-800 shadow-xl backdrop-blur-sm">
                 <WheelColumn 
                    range={61} 
                    value={settings.intervalMinutes} 
                    onChange={(val) => setSettings(s => ({...s, intervalMinutes: val}))} 
                    label="Minutes"
                 />
                 <div className="h-8 text-2xl font-bold text-slate-600 pb-2">:</div>
                 <WheelColumn 
                    range={60} 
                    value={settings.intervalSeconds} 
                    onChange={(val) => setSettings(s => ({...s, intervalSeconds: val}))} 
                    label="Seconds"
                 />
              </div>

              {/* Presets */}
              <div className="w-full">
                 <div className="text-xs font-bold text-slate-600 uppercase tracking-widest text-center mb-4">Quick Presets</div>
                 <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
                    {PRESETS.map(p => (
                       <button
                          key={p.label}
                          onClick={() => setSettings({ intervalMinutes: p.m, intervalSeconds: p.s })}
                          className={`py-4 rounded-xl text-sm font-medium transition-all active:scale-95 ${
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

           <footer className="p-8 pb-12 w-full max-w-xs mx-auto">
              <button 
                 onClick={startSession}
                 className="w-full py-5 bg-primary hover:bg-cyan-400 text-dark font-bold text-xl rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center space-x-2 transition-transform active:scale-95"
              >
                 <Play fill="currentColor" size={24} />
                 <span>Start Workout</span>
              </button>
              {audioLoadingState === 'failed' && (
                 <p className="text-center text-xs text-yellow-500 mt-4 flex items-center justify-center gap-1">
                    <AlertCircle size={12}/> Using beep sounds (AI Voice unavailable)
                 </p>
              )}
           </footer>
        </div>
     )
  }

  // 2. Running/Paused View
  const timeLeftInInterval = intervalDuration - currentIntervalElapsed;
  const percentage = (timeLeftInInterval / intervalDuration) * 100;

  return (
    <div className="min-h-screen bg-dark flex flex-col text-white overflow-hidden relative">
      
      {/* Header */}
      <header className="p-6 flex justify-between items-center z-10">
        <h1 className="text-xl font-bold text-slate-200">IntervalFlow</h1>
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

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center space-y-8 relative px-6">
        
        {/* Cycle Info */}
        <div className="text-center space-y-1">
          <p className="text-slate-400 text-sm tracking-widest uppercase">Current Cycle</p>
          <p className="text-3xl font-bold text-white">#{cycleCount}</p>
        </div>

        {/* Big Timer */}
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

        {/* Status Text */}
        <div className="h-8">
           {timeLeftInInterval <= 5 && timeLeftInInterval > 0 && (
             <span className="text-secondary font-bold text-2xl animate-pulse">Get Ready!</span>
           )}
           {timeLeftInInterval === intervalDuration && cycleCount > 1 && (
             <span className="text-primary font-bold text-2xl animate-bounce">GO!</span>
           )}
        </div>
      </main>

      {/* Footer Controls */}
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