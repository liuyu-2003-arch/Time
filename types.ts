export interface TimerSettings {
  intervalMinutes: number;
  intervalSeconds: number;
}

export interface AudioAssets {
  five: AudioBuffer | null;
  four: AudioBuffer | null;
  three: AudioBuffer | null;
  two: AudioBuffer | null;
  one: AudioBuffer | null;
  next: AudioBuffer | null;
}

export enum AppState {
  IDLE = 'IDLE',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  READY = 'READY',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED'
}