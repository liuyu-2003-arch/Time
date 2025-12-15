// timerWorker.ts

let intervalId: ReturnType<typeof setInterval> | undefined;
let totalSecondsElapsed = 0;
let intervalDuration = 0;
let isRunning = false;

self.onmessage = (e: MessageEvent) => {
  const { command, value } = e.data;

  if (command === 'start') {
    if (!isRunning) {
      isRunning = true;
      intervalDuration = value;
      intervalId = setInterval(() => {
        totalSecondsElapsed++;
        self.postMessage({ type: 'tick', totalSecondsElapsed });
      }, 1000);
    }
  } else if (command === 'pause') {
    if (isRunning) {
      isRunning = false;
      clearInterval(intervalId);
      intervalId = undefined;
    }
  } else if (command === 'reset') {
    isRunning = false;
    clearInterval(intervalId);
    intervalId = undefined;
    totalSecondsElapsed = 0;
  } else if (command === 'updateDuration') {
    intervalDuration = value;
  }
};
