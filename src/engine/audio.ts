import { ToddlerAudioEngine } from './AudioEngine';

/**
 * 全局唯一音频引擎实例。
 * 纯离线：三路增益（voice / sfx / bgm）+ Web Audio 程序化音效 + 系统离线 TTS 兜底。
 */
export const audio = new ToddlerAudioEngine();

/** iOS / Android WebView 需要首次用户手势才能解锁 AudioContext */
let unlocked = false;

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  audio.ensureContext();
  audio.startProceduralBGM();
}

export function lockAudioIsReady() {
  return unlocked;
}
