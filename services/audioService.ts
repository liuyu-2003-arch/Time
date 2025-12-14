import { GoogleGenAI, Modality } from "@google/genai";

// Audio Context Singleton
let audioContext: AudioContext | null = null;

export const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000, // Gemini TTS sample rate
    });
  }
  return audioContext;
};

// PCM Decoding Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// UI Interaction Sounds
export const playTickSound = () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  // Short, high-pitch "tick"
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.type = 'sine';
  
  gain.gain.setValueAtTime(0.05, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
};

// Background Music
let bgMusic: HTMLAudioElement | null = null;
const BG_MUSIC_URL = 'https://cloud.324893.xyz/Music/Time.mp3';
const APP_ICON_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' fill='%230f172a'/%3E%3Cg transform='matrix(0.75 0 0 0.75 64 64)'%3E%3Ccircle cx='256' cy='256' r='224' stroke='%231e293b' stroke-width='64' fill='none'/%3E%3Cpath d='M256 64 A 192 192 0 0 1 448 256' stroke='%2300D8FF' stroke-width='64' stroke-linecap='round' fill='none'/%3E%3Cline x1='256' y1='256' x2='352' y2='352' stroke='%23FF0055' stroke-width='48' stroke-linecap='round'/%3E%3Ccircle cx='256' cy='256' r='32' fill='white'/%3E%3C/g%3E%3C/svg%3E";

export const setBackgroundMusicState = (enable: boolean) => {
  const ctx = getAudioContext();
  
  // Ensure context is running (helps with autoplay policies)
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (!bgMusic) {
    bgMusic = new Audio(BG_MUSIC_URL);
    bgMusic.loop = true;
    bgMusic.volume = 0.3; // Set volume to 30% so it doesn't overpower voice cues
  }

  if (enable) {
    bgMusic.play()
      .then(() => {
        // Setup MediaSession for Dynamic Island / Lock Screen controls
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: 'IntervalFlow',
                artist: 'Workout Timer',
                artwork: [
                    { src: APP_ICON_URI, sizes: '512x512', type: 'image/svg+xml' }
                ]
            });
            navigator.mediaSession.playbackState = 'playing';
        }
      })
      .catch(e => console.warn("Background music play failed:", e));
  } else {
    bgMusic.pause();
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
    }
  }
};

// Fallback Beep Generator
const playFallbackBeep = (type: 'tick' | 'end') => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === 'tick') {
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  } else {
    // End/Go sound
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.3);
    osc.type = 'square';
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }
};

// Gemini Service
export const generateVoiceAsset = async (text: string): Promise<AudioBuffer> => {
  // Check if API KEY is available, if not, throw immediately to trigger fallback
  if (!process.env.API_KEY) {
    throw new Error("No API Key found");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep, authoritative voice for workouts
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data received from Gemini");
    }

    const ctx = getAudioContext();
    const audioBuffer = await decodeAudioData(
      decode(base64Audio),
      ctx,
      24000,
      1
    );
    
    return audioBuffer;
  } catch (error) {
    console.warn("Error generating voice asset, will use fallback:", error);
    throw error;
  }
};

export const playSound = (buffer: AudioBuffer | null) => {
  const ctx = getAudioContext();
  
  // Ensure context is running (user gesture usually required previously)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(e => console.error("Audio context resume failed", e));
  }
  
  if (buffer) {
    // Play AI Voice
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } else {
    // Play Fallback Beep
    // Determine type roughly by context (not perfect but works for general feedback)
    playFallbackBeep('tick');
  }
};

// Specific fallback trigger for "GO" if buffer is missing
export const playGoSound = (buffer: AudioBuffer | null) => {
   const ctx = getAudioContext();
   if (ctx.state === 'suspended') ctx.resume();

   if (buffer) {
     const source = ctx.createBufferSource();
     source.buffer = buffer;
     source.connect(ctx.destination);
     source.start(0);
   } else {
     playFallbackBeep('end');
   }
}