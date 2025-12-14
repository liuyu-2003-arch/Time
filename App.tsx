import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, Settings, Loader2, X, Plus, Minus } from 'lucide-react';
import { generateVoiceAsset, playSound, getAudioContext } from './services/audioService';
import { CircularProgress } from './components/CircularProgress';
import { TimerSettings, AudioAssets, AppState } from './types';

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
  { label: '30 min', m: 30, s: 0 },
  { label: '1 hr', m: 60, s: 0 },
];

const App: React.FC = () => {
  // --- State ---
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [settings, setSettings] = useState<TimerSettings>({ intervalMinutes: 2, intervalSeconds: 0 });
  const [showSettings, setShowSettings] = useState(false);
  
  // Timer State
  const [totalSecondsElapsed, setTotalSecondsElapsed] = useState(0);
  const [currentIntervalElapsed, setCurrentIntervalElapsed] = useState(0);
  const [cycleCount, setCycleCount] = useState(1);
  
  // Audio Assets Ref
  const audioAssets = useRef<AudioAssets>({
    five: null, four: null, three: null, two: null, one: null, next: null
  });

  // Derived Values
  const intervalDuration = (settings.intervalMinutes * 60) + settings.intervalSeconds;
  
  // --- Audio Initialization ---
  const loadAudio = async () => {
    if (appState === AppState.GENERATING_AUDIO) return;
    setAppState(AppState.GENERATING_AUDIO);
    
    try {
      // Resume context if needed
      getAudioContext().resume();

      // Parallel generation for speed
      const [five, four, three, two, one, next] = await Promise.all([
        generateVoiceAsset("Five"),
        generateVoiceAsset("Four"),
        generateVoiceAsset("Three"),
        generateVoiceAsset("Two"),
        generateVoiceAsset("One"),
        generateVoiceAsset("Next action! Go!"),
      ]);

      audioAssets.current = { five, four, three, two, one, next };
      setAppState(AppState.READY);
    } catch (err) {
      console.error("Failed to load audio", err);
      // Fallback to ready anyway, just won't play sound or could show error
      setAppState(AppState.READY);
      alert("Could not generate AI voice. Check API Key quota.");
    }
  };

  // --- Timer Logic ---
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    if (appState === AppState.RUNNING) {
      intervalId = setInterval(() => {
        setTotalSecondsElapsed(prev => {
          const newTotal = prev + 1;
          
          // Calculate interval position logic
          // Use modulo to find position in current cycle
          const timeInCurrentCycle = newTotal % intervalDuration;
          // Handle the edge case where modulo is 0 (end of cycle)
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
             playSound(audioAssets.current.next);
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
    setAppState(AppState.READY);
    setTotalSecondsElapsed(0);
    setCurrentIntervalElapsed(0);
    setCycleCount(1);
  };

  const updateSettings = (field: keyof TimerSettings, value: number) => {
    // Ensure valid inputs
    let safeValue = Math.max(0, value);
    if (field === 'intervalSeconds') safeValue = Math.min(59, safeValue);
    
    setSettings(prev => ({ ...prev, [field]: safeValue }));
    // Reset timer if settings change
    resetTimer();
  };

  // --- Render ---
  const timeLeftInInterval = intervalDuration - currentIntervalElapsed;
  const percentage = (timeLeftInInterval / intervalDuration) * 100;

  // Initial Load Screen
  if (appState === AppState.IDLE) {
    return (
      <div className="min-h-screen bg-dark flex flex-col items-center justify-center p-6 text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-primary tracking-tight">IntervalFlow</h1>
          <p className="text-slate-400">AI-Powered Workout Assistant</p>
        </div>
        
        <div className="p-6 bg-surface rounded-2xl max-w-sm w-full border border-slate-700 shadow-xl">
           <p className="text-sm text-slate-300 mb-6">
             We use Gemini TTS to generate custom high-quality voice cues for your workout. 
           </p>
           <button 
             onClick={loadAudio}
             className="w-full py-4 bg-primary hover:bg-cyan-400 text-dark font-bold rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-95"
           >
             <Volume2 size={24} />
             <span>Initialize Voice & Start</span>
           </button>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (appState === AppState.GENERATING_AUDIO) {
    return (
      <div className="min-h-screen bg-dark flex flex-col items-center justify-center p-6 text-center space-y-6">
        <Loader2 className="animate-spin text-primary" size={48} />
        <p className="text-white text-lg animate-pulse">Generating voice assets with Gemini...</p>
      </div>
    );
  }

  // Main App Interface
  return (
    <div className="min-h-screen bg-dark flex flex-col text-white overflow-hidden relative">
      
      {/* Header */}
      <header className="p-6 flex justify-between items-center z-10">
        <h1 className="text-xl font-bold text-slate-200">IntervalFlow</h1>
        <button 
          onClick={() => {
            if(appState !== AppState.RUNNING) setShowSettings(!showSettings);
          }}
          disabled={appState === AppState.RUNNING}
          className={`p-2 rounded-full transition-colors ${appState === AppState.RUNNING ? 'text-slate-600 cursor-not-allowed' : 'text-primary hover:bg-surface'}`}
        >
          {showSettings ? <X size={24} /> : <Settings size={24} />}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center space-y-8 relative px-6">
        
        {/* Settings Overlay */}
        {showSettings && (
           <div className="absolute inset-0 bg-dark/95 backdrop-blur-md z-20 flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in duration-200 overflow-y-auto">
             
             <div className="bg-surface p-6 rounded-3xl w-full max-w-md border border-slate-700 shadow-2xl space-y-8">
                <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                    <h2 className="text-xl font-bold text-white">Timer Setup</h2>
                </div>

                {/* Presets */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quick Presets</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESETS.map(p => (
                        <button
                            key={p.label}
                            onClick={() => {
                                setSettings({ intervalMinutes: p.m, intervalSeconds: p.s });
                                resetTimer();
                            }}
                            className={`py-2 px-1 rounded-lg font-medium text-xs transition-all active:scale-95 ${
                                settings.intervalMinutes === p.m && settings.intervalSeconds === p.s
                                ? 'bg-primary text-dark font-bold'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                  </div>
                </div>

                {/* Main Controls */}
                <div className="space-y-4">
                  
                  {/* Minutes Card */}
                  <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 space-y-4">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block text-center">Minutes</span>
                      
                      <div className="flex items-center justify-between">
                         <button 
                           onClick={() => updateSettings('intervalMinutes', settings.intervalMinutes - 1)}
                           className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 active:scale-95"
                         >
                            <Minus size={20} />
                         </button>
                         
                         <span className="text-5xl font-mono font-bold text-primary w-24 text-center">
                            {settings.intervalMinutes.toString().padStart(2, '0')}
                         </span>
                         
                         <button 
                           onClick={() => updateSettings('intervalMinutes', settings.intervalMinutes + 1)}
                           className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 active:scale-95"
                         >
                            <Plus size={20} />
                         </button>
                      </div>

                      <input
                          type="range"
                          min="0"
                          max="60"
                          step="1"
                          value={settings.intervalMinutes}
                          onChange={(e) => updateSettings('intervalMinutes', parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                          style={{accentColor: '#00D8FF'}}
                      />
                  </div>

                  {/* Seconds Card */}
                  <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 space-y-4">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block text-center">Seconds</span>
                      
                      <div className="flex items-center justify-between">
                         <button 
                           onClick={() => updateSettings('intervalSeconds', settings.intervalSeconds - 1)}
                           className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 active:scale-95"
                         >
                            <Minus size={20} />
                         </button>
                         
                         <span className="text-5xl font-mono font-bold text-secondary w-24 text-center">
                            {settings.intervalSeconds.toString().padStart(2, '0')}
                         </span>
                         
                         <button 
                           onClick={() => updateSettings('intervalSeconds', settings.intervalSeconds + 1)}
                           className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-700 text-white hover:bg-slate-600 active:scale-95"
                         >
                            <Plus size={20} />
                         </button>
                      </div>

                      <input
                          type="range"
                          min="0"
                          max="59"
                          step="1"
                          value={settings.intervalSeconds}
                          onChange={(e) => updateSettings('intervalSeconds', parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                          style={{accentColor: '#FF0055'}}
                      />
                  </div>

                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-4 bg-slate-200 text-dark font-bold text-lg rounded-xl shadow-lg transition-transform active:scale-95"
                >
                  Done
                </button>
             </div>
           </div>
        )}

        {/* Cycle Info */}
        <div className="text-center space-y-1">
          <p className="text-slate-400 text-sm tracking-widest uppercase">Current Cycle</p>
          <p className="text-3xl font-bold text-white">#{cycleCount}</p>
        </div>

        {/* Big Timer */}
        <div className="relative">
          {/* We animate the color based on urgency */}
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