import {
  LanguageLevel,
  VehicleScenarioConfig,
  InteractionStepConfig,
} from '../config/vehiclesConfig';
import { audio } from './audio';
import { IDLE_REPROMPT_MS, ReleaseResult } from './ToddlerInputManager';

/**
 * ============================================================================
 * ScenarioStateMachine —— 单车场景交互状态机
 * IDLE → PROMPT → ACTING → CASCADE_FEEDBACK → REWARD
 * ============================================================================
 * 严格区分“操作前祈使指令”与“操作后结果描述句”：
 *  - PROMPT 阶段播报 step.voice[level].prompt（祈使句）
 *  - ACTING 阶段播报 step.voice[level].actionWord（进行中伴读）
 *  - CASCADE_FEEDBACK 阶段播报 step.voice[level].complete（结果描述句）
 * 自由探索部件永远只播报 resultVoice（结果描述句），绝不播祈使句。
 * ============================================================================
 */

export type ScenarioPhase = 'IDLE' | 'PROMPT' | 'ACTING' | 'CASCADE_FEEDBACK' | 'REWARD';

export interface ScenarioSnapshot {
  phase: ScenarioPhase;
  stepIndex: number;
  stepCount: number;
  progress: number;
  completedSteps: number[];
  targetPartId: string | null;
  dragDirection: [number, number] | null;
  showGuideHand: boolean;
  level: LanguageLevel;
  /** 正在播报语音（HUD 可用于小喇叭呼吸） */
  speaking: boolean;
}

export interface StateMachineCallbacks {
  onStepStart?: (stepIndex: number, step: InteractionStepConfig) => void;
  onStepComplete?: (stepIndex: number, step: InteractionStepConfig) => void;
  onAllComplete?: () => void;
  onFreePlayVoice?: (partId: string) => void;
  onSfx?: (type: InteractionStepConfig['sfxOnStart']) => void;
}

const SNAP_RATE = 2.5; // 自动磁吸速率 2.5 s^-1
const REBOUND_RATE = 4.2;
const STEP_GAP_MS = 700; // 结果语音结束后的呼吸停顿
const INTRO_TAIL_MS = 550;

export class ScenarioStateMachine {
  private readonly config: VehicleScenarioConfig;
  private readonly callbacks: StateMachineCallbacks;
  private readonly listeners = new Set<() => void>();

  private level: LanguageLevel;
  private phase: ScenarioPhase = 'IDLE';
  private stepIndex = 0;
  private progress = 0;
  private targetProgress = 0; // 补间目标（SNAP 时为 1，REBOUND 时为 0）
  private completedSteps: number[] = [];
  private showGuideHand = false;
  private speaking = false;

  private idleTimer = 0; // 秒
  private idleArmed = false;
  private pendingTimer = 0; // 步骤切换等待
  private phaseAfterSnap: 'COMPLETE' | 'PROMPT' = 'PROMPT';

  private voiceSeq = 0;
  private disposed = false;
  private snapshot: ScenarioSnapshot;
  private freePartCooldown = new Map<string, number>();

  constructor(
    config: VehicleScenarioConfig,
    level: LanguageLevel,
    callbacks: StateMachineCallbacks = {}
  ) {
    this.config = config;
    this.callbacks = callbacks;
    this.level = level;
    this.snapshot = this.buildSnapshot();
  }

  /* ----------------------------- 订阅（React） ----------------------------- */

  public subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): ScenarioSnapshot => this.snapshot;

  /** 场景渲染层每帧读取的实时值（不触发 React 重渲染） */
  public getLive() {
    return {
      phase: this.phase,
      stepIndex: this.stepIndex,
      progress: this.progress,
      completedSteps: this.completedSteps,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  private buildSnapshot(): ScenarioSnapshot {
    const step = this.currentStep();
    return {
      phase: this.phase,
      stepIndex: this.stepIndex,
      stepCount: this.config.steps.length,
      progress: this.progress,
      completedSteps: [...this.completedSteps],
      targetPartId: this.phase === 'PROMPT' || this.phase === 'ACTING' ? step?.targetPartId ?? null : null,
      dragDirection: this.phase === 'PROMPT' || this.phase === 'ACTING' ? step?.dragDirectionScreen ?? null : null,
      showGuideHand: this.showGuideHand,
      level: this.level,
      speaking: this.speaking,
    };
  }

  private currentStep(): InteractionStepConfig | undefined {
    return this.config.steps[this.stepIndex];
  }

  private voiceLine() {
    const step = this.currentStep();
    if (!step) return null;
    return step.voice[this.level];
  }

  /* ------------------------------- 生命周期 ------------------------------- */

  /** 进入工地：播报导入语，2.8s 后固定进入第 1 步指令（不依赖 TTS 回调，避免无语音引擎时卡住） */
  public start() {
    this.phase = 'IDLE';
    this.stepIndex = 0;
    this.progress = 0;
    this.targetProgress = 0;
    this.completedSteps = [];
    this.showGuideHand = false;
    this.emit();

    const intro = this.config.introVoice[this.level];
    const seq = ++this.voiceSeq;
    this.speaking = true;
    audio.speakEnglish(intro.text, intro.id, this.level, () => {
      if (seq !== this.voiceSeq || this.disposed) return;
      this.speaking = false;
      this.emit();
    });
    this.pendingTimer = 2.8;
  }

  private speakPrompt() {
    const step = this.currentStep();
    const line = this.voiceLine();
    if (!step || !line) return;

    this.phase = 'PROMPT';
    this.showGuideHand = false;
    this.progress = 0;
    this.targetProgress = 0;
    this.emit();
    this.callbacks.onStepStart?.(this.stepIndex, step);

    const seq = ++this.voiceSeq;
    this.speaking = true;
    this.emit();
    audio.speakEnglish(line.prompt, line.promptId, this.level, () => {
      if (seq !== this.voiceSeq || this.disposed) return;
      this.speaking = false;
      this.armIdlePrompt();
      this.emit();
    });
  }

  private armIdlePrompt() {
    this.idleTimer = 0;
    this.idleArmed = this.phase === 'PROMPT';
  }

  /** 重播当前步骤指令（右下角小喇叭 / 5s 空闲自动重播） */
  public replayPrompt() {
    if (this.phase !== 'PROMPT' && this.phase !== 'ACTING') return;
    if (this.phase === 'ACTING') {
      // 操作中重播指令会让幼儿困惑，改为重播进行中伴读
      const line = this.voiceLine();
      if (!line) return;
      audio.speakEnglish(line.actionWord, line.actionWordId, this.level);
      return;
    }
    this.speakPrompt();
  }

  /* -------------------------------- 输入 -------------------------------- */

  public handleGrab(partId: string) {
    const step = this.currentStep();
    if (!step || step.targetPartId !== partId) return;
    if (this.phase !== 'PROMPT') return;

    this.phase = 'ACTING';
    this.idleArmed = false;
    this.showGuideHand = false;
    this.progress = 0;
    this.targetProgress = 0;
    this.emit();

    audio.playProceduralSfx(step.sfxOnStart);
    const line = this.voiceLine();
    if (line) {
      const seq = ++this.voiceSeq;
      this.speaking = true;
      audio.speakEnglish(line.actionWord, line.actionWordId, this.level, () => {
        if (seq !== this.voiceSeq) return;
        this.speaking = false;
        this.emit();
      });
    }
  }

  public handleDragProgress(p: number) {
    if (this.phase !== 'ACTING') return;
    this.progress = Math.min(Math.max(p, 0), 1);
    this.targetProgress = this.progress;
    this.emit();

    // 拖到 100% 直接进入级联，无需等松手
    if (this.progress >= 0.999) {
      this.beginSnapComplete();
    }
  }

  public handleRelease(result: ReleaseResult) {
    const step = this.currentStep();
    if (!step || step.targetPartId !== result.partId) return;

    if (result.outcome === 'SNAP' || result.outcome === 'TAP' || result.outcome === 'PALM_SLAP') {
      if (result.outcome !== 'SNAP') {
        // 点击兜底 / 拍击：从当前进度（通常为 0）自动磁吸至 1
        this.progress = Math.max(this.progress, 0);
      }
      this.phase = 'ACTING';
      this.targetProgress = 1;
      this.phaseAfterSnap = 'COMPLETE';
      this.showGuideHand = false;
      this.idleArmed = false;
      if (result.outcome === 'TAP') {
        // 兜底点击也播放起步音，保证强反馈
        audio.playProceduralSfx(step.sfxOnStart);
      }
      this.emit();
    } else {
      // 未达标 → 柔和回弹到 0，并重新提示
      this.phase = 'PROMPT';
      this.targetProgress = 0;
      this.phaseAfterSnap = 'PROMPT';
      this.showGuideHand = true;
      this.idleTimer = 0;
      this.idleArmed = true;
      this.emit();
    }
  }

  private beginSnapComplete() {
    const step = this.currentStep();
    if (!step) return;
    if (this.phase === 'CASCADE_FEEDBACK' || this.phase === 'REWARD') return;

    this.phase = 'CASCADE_FEEDBACK';
    this.progress = 1;
    this.targetProgress = 1;
    this.showGuideHand = false;
    this.idleArmed = false;
    if (!this.completedSteps.includes(this.stepIndex)) {
      this.completedSteps.push(this.stepIndex);
    }
    this.emit();

    audio.playProceduralSfx(step.sfxOnComplete);
    this.callbacks.onStepComplete?.(this.stepIndex, step);

    const line = this.voiceLine();
    const seq = ++this.voiceSeq;
    this.speaking = true;
    this.emit();

    const advance = () => {
      if (seq !== this.voiceSeq || this.disposed) return;
      this.speaking = false;
      this.pendingTimer = STEP_GAP_MS / 1000;
      this.emit();
    };

    if (line) {
      audio.speakEnglish(line.complete, line.completeId, this.level, advance);
    } else {
      this.pendingTimer = STEP_GAP_MS / 1000;
    }
  }

  /** 自由探索部件即时反馈：始终播报结果描述句 */
  public handleFreePlayPart(partId: string, sfxType: import('../config/vehiclesConfig').SfxType) {
    const now = performance.now();
    const last = this.freePartCooldown.get(partId) ?? 0;
    if (now - last < 700) return; // 防连点刷屏
    this.freePartCooldown.set(partId, now);

    audio.playProceduralSfx(sfxType);
    const part = this.config.freePlayParts.find((p) => p.partId === partId);
    if (!part) return;
    const line = part.resultVoice[this.level];
    this.callbacks.onFreePlayVoice?.(partId);
    // 自由探索语音不抢占主线状态，但要让人声清晰
    audio.speakEnglish(line.text, line.id, this.level);
  }

  /* -------------------------------- 等级 -------------------------------- */

  public setLevel(level: LanguageLevel) {
    if (this.level === level) return;
    this.level = level;
    this.emit();
    // 若正在等待操作，用新等级重播指令
    if (this.phase === 'PROMPT') {
      this.speakPrompt();
    }
  }

  /* ------------------------------ 每帧推进 ------------------------------ */

  public update(dt: number) {
    if (this.disposed) return;
    const step = dt > 0.1 ? 0.1 : dt;

    // 1) 自动磁吸 / 柔和回弹补间
    if (this.progress !== this.targetProgress) {
      const rate = this.targetProgress > this.progress ? SNAP_RATE : REBOUND_RATE;
      const dir = Math.sign(this.targetProgress - this.progress);
      const delta = rate * step;
      this.progress += dir * Math.min(delta, Math.abs(this.targetProgress - this.progress));
      if (Math.abs(this.targetProgress - this.progress) < 0.0005) {
        this.progress = this.targetProgress;
      }
      this.emit();

      if (this.phaseAfterSnap === 'COMPLETE' && this.progress >= 1 && this.phase === 'ACTING') {
        this.beginSnapComplete();
      }
    }

    // 2) 步骤间停顿 → 下一步 / 庆典
    if (this.pendingTimer > 0) {
      this.pendingTimer -= step;
      if (this.pendingTimer <= 0) {
        this.pendingTimer = 0;
        if (this.phase === 'IDLE') {
          this.speakPrompt();
        } else if (this.phase === 'CASCADE_FEEDBACK') {
          const nextIndex = this.stepIndex + 1;
          if (nextIndex < this.config.steps.length) {
            this.stepIndex = nextIndex;
            this.progress = 0;
            this.targetProgress = 0;
            this.phase = 'PROMPT';
            this.speakPrompt();
          } else {
            this.phase = 'REWARD';
            this.progress = 1;
            this.emit();
            this.callbacks.onAllComplete?.();
          }
        }
      }
    }

    // 3) 5 秒空闲 → 小手示范 + 重播指令
    if (this.idleArmed && this.phase === 'PROMPT' && !this.speaking) {
      this.idleTimer += step;
      if (this.idleTimer >= IDLE_REPROMPT_MS / 1000) {
        this.idleTimer = 0;
        this.showGuideHand = true;
        this.emit();
        const line = this.voiceLine();
        if (line) {
          const seq = ++this.voiceSeq;
          this.speaking = true;
          audio.speakEnglish(line.prompt, line.promptId, this.level, () => {
            if (seq !== this.voiceSeq) return;
            this.speaking = false;
            this.emit();
          });
        }
      }
    }
  }

  /** 再来一次：清空进度并从导入语重新开始（不销毁实例） */
  public reset() {
    this.voiceSeq++;
    audio.stopSpeaking();
    this.speaking = false;
    this.pendingTimer = 0;
    this.idleTimer = 0;
    this.idleArmed = false;
    this.disposed = false;
    this.start();
  }

  public dispose() {
    this.voiceSeq++;
    audio.stopSpeaking();
    this.disposed = true;
    this.listeners.clear();
  }
}
