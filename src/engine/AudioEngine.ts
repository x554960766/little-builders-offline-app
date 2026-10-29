import { SfxType, LanguageLevel } from '../config/vehiclesConfig';

/** Capacitor 原生离线 TTS 插件可选接口声明（在 iOS/Android 真机包中无网直接调用系统语音引擎） */
interface CapacitorNativeTTS {
  speak(options: { text: string; lang: string; rate: number; pitch: number; volume: number }): Promise<void>;
  stop(): Promise<void>;
}

export class ToddlerAudioEngine {
  private ctx: AudioContext | null = null;
  /** 三路独立增益节点，严格对应第 4.2 节混音闪避规范 */
  private voiceGain: GainNode | null = null; // 0 dB (1.00)
  private sfxGain: GainNode | null = null;   // 常态 -3 dB (0.71) / 闪避 -18 dB (0.125)
  private bgmGain: GainNode | null = null;   // 常态 -14 dB (0.20) / 闪避 -26 dB (0.05)

  private cachedVoices: SpeechSynthesisVoice[] = [];
  private speechTimeoutId: number | null = null;
  private bgmIntervalId: number | null = null;
  private isBgmPlaying = false;
  /** 当前正在播放的本地离线语音 BufferSource（用于跨场景打断） */
  private activeVoiceSource: AudioBufferSourceNode | null = null;

  constructor() {
    this.initAsyncVoices();
  }

  /** 1. 异步加载并缓存系统离线 TTS 语音列表 (处理 Android/iOS WebView onvoiceschanged 延迟) */
  private initAsyncVoices() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        const list = window.speechSynthesis.getVoices();
        if (list && list.length > 0) {
          this.cachedVoices = list;
        }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  /** 2. 初始化 WebAudio 上下文与三路 GainNode (适配 iOS 静音键与首次触摸解锁) */
  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.voiceGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();

      this.voiceGain.gain.value = 1.0;  // 0 dB
      this.sfxGain.gain.value = 0.71;   // -3 dB
      this.bgmGain.gain.value = 0.20;   // -14 dB

      this.voiceGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.bgmGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** 开启语音闪避：50ms 内压低 SFX (-18dB) 与 BGM (-26dB) */
  private engageDucking() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.bgmGain) return;
    const now = ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(0.125, now, 0.03);
    this.bgmGain.gain.setTargetAtTime(0.050, now, 0.03);
  }

  /** 结束语音闪避：200ms 平滑恢复 SFX (-3dB) 与 BGM (-14dB) */
  private releaseDucking() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.bgmGain) return;
    const now = ctx.currentTime + 0.2;
    this.sfxGain.gain.setTargetAtTime(0.71, now, 0.12);
    this.bgmGain.gain.setTargetAtTime(0.20, now, 0.12);
  }

  /**
   * 3. 100% 纯离线英语播报主入口：
   * 优先级 A: 读取随包内置的本地离线音频 `/audio/{level}/{clipId}.mp3` 并接入 voiceGain
   * 优先级 B: 调用 Capacitor iOS/Android 原生系统级离线 TTS
   * 优先级 C: 调用 WebView speechSynthesis (含 onerror 与超时防死锁兜底)
   */
  public async speakEnglish(text: string, clipId?: string, level: LanguageLevel = 'L2', onEnd?: () => void) {
    this.ensureContext();
    this.clearSpeechTimeout();
    this.engageDucking();

    let finished = false;
    let startGuard: number | null = null;
    const finalize = () => {
      if (finished) return;
      finished = true;
      if (startGuard !== null) {
        window.clearTimeout(startGuard);
        startGuard = null;
      }
      this.clearSpeechTimeout();
      this.releaseDucking();
      onEnd?.();
    };

    // 超时兜底保护：防止部分安卓机型 TTS 不触发 onend 导致状态机永久卡死
    const safetyDurationMs = Math.max(2800, text.length * 110);
    this.speechTimeoutId = window.setTimeout(finalize, safetyDurationMs);

    // 尝试优先级 A：播放本地预打包的离线音频（mp3 优先，其次系统 afconvert 生成的 m4a）
    if (clipId && this.ctx && this.voiceGain) {
      const candidates = [
        `./audio/${level}/${clipId}.mp3`,
        `./audio/${level}/${clipId}.m4a`,
      ];
      for (const localUrl of candidates) {
        try {
          const response = await fetch(localUrl);
          if (!response.ok) continue;
          const arrayBuf = await response.arrayBuffer();
          const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
          const source = this.ctx.createBufferSource();
          source.buffer = audioBuf;
          source.connect(this.voiceGain);
          source.onended = () => {
            if (this.activeVoiceSource === source) this.activeVoiceSource = null;
            finalize();
          };
          this.activeVoiceSource = source;
          source.start(0);
          return;
        } catch {
          // 该格式不存在或解码失败，继续尝试下一个 → 最终降级至系统离线 TTS
        }
      }
    }

    // 尝试优先级 B：Capacitor iOS/Android 原生离线 TTS 插件
    const capTts = (window as unknown as { Capacitor?: { Plugins?: { TextToSpeech?: CapacitorNativeTTS } } })
      .Capacitor?.Plugins?.TextToSpeech;
    if (capTts) {
      try {
        await capTts.stop().catch(() => {});
        await capTts.speak({ text, lang: 'en-US', rate: 0.88, pitch: 1.18, volume: 1.0 });
        finalize();
        return;
      } catch {
        // 降级至 Web SpeechSynthesis
      }
    }

    // 尝试优先级 C：浏览器内置离线 speechSynthesis
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        utter.rate = 0.88;
        utter.pitch = 1.18;

        if (this.cachedVoices.length === 0) {
          this.cachedVoices = window.speechSynthesis.getVoices();
        }
        const preferred = this.cachedVoices.find(
          v => v.lang.startsWith('en') && (v.localService || v.name.includes('Samantha') || v.name.includes('Natural'))
        );
        if (preferred) utter.voice = preferred;

        utter.onend = finalize;
        utter.onerror = finalize;
        // 无语音引擎的 WebView（桌面无 TTS 语音包 / 精简 ROM）不会触发 onstart，
        // 2s 后主动放行，避免状态机等满超时
        utter.onstart = () => {
          if (startGuard !== null) {
            window.clearTimeout(startGuard);
            startGuard = null;
          }
        };
        startGuard = window.setTimeout(() => {
          if (!finished) finalize();
        }, 2000);
        window.speechSynthesis.speak(utter);
        return;
      } catch {
        finalize();
      }
    } else {
      finalize();
    }
  }

  private clearSpeechTimeout() {
    if (this.speechTimeoutId !== null) {
      clearTimeout(this.speechTimeoutId);
      this.speechTimeoutId = null;
    }
  }

  /** 3.1 中断当前语音（切换车辆 / 返回车库时调用，避免跨场景语音串台） */
  public stopSpeaking() {
    this.clearSpeechTimeout();
    this.releaseDucking();
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.stop();
      } catch {
        /* 已停止 */
      }
      this.activeVoiceSource = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    const capTts = (window as unknown as { Capacitor?: { Plugins?: { TextToSpeech?: CapacitorNativeTTS } } })
      .Capacitor?.Plugins?.TextToSpeech;
    capTts?.stop().catch(() => {});
  }

  /** 3.2 等级切换上行木琴音：幼苗株数越多音高越高（纯图形切换器的听觉反馈） */
  public playLevelChime(stageCount: number) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const index = Math.min(Math.max(stageCount, 1), 3) - 1;
    const root = [523.25, 659.25, 783.99][index];
    const now = ctx.currentTime;
    // 大三和弦上行琶音：根音 → 大三度 → 纯五度 → 八度
    [0, 4, 7, 12].forEach((semi, i) => {
      const freq = root * Math.pow(2, semi / 12);
      const t = now + i * 0.075;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.42, t);
      g.gain.exponentialRampToValueAtTime(0.008, t + 0.28);
      osc.connect(g).connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.30);
    });
  }

  /** 3.3 轻柔的“啵”提示音：长按返回键单次轻点时的防误触反馈 */
  public playSoftBoop() {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.10);
    g.gain.setValueAtTime(0.30, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.connect(g).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** 4. 启动纯离线程序化轻快木琴背景音乐 (接入 bgmGain) */
  public startProceduralBGM() {
    if (this.isBgmPlaying) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.bgmGain) return;
    this.isBgmPlaying = true;

    // 欢快五声音阶旋律 (C5, D5, E5, G5, A5)
    const melody = [523.25, 587.33, 659.25, 783.99, 659.25, 880.0, 783.99, 523.25];
    let step = 0;

    this.bgmIntervalId = window.setInterval(() => {
      if (!this.ctx || !this.bgmGain || this.ctx.state !== 'running') return;
      const now = this.ctx.currentTime;
      const freq = melody[step % melody.length];
      step++;

      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      noteGain.gain.setValueAtTime(0.25, now);
      noteGain.gain.exponentialRampToValueAtTime(0.005, now + 0.35);

      osc.connect(noteGain).connect(this.bgmGain);
      osc.start(now);
      osc.stop(now + 0.36);
    }, 450);
  }

  public stopProceduralBGM() {
    this.isBgmPlaying = false;
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
  }

  /** 5. 全量 18 种 SfxType 程序化合成实现 (100% 离线零外部文件依赖，全部接入 sfxGain) */
  public playProceduralSfx(type: SfxType) {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;

    switch (type) {
      case 'pop': {
        // 轻快气泡弹跳音
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
        osc.connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'valve': {
        // 阀门旋转金属清脆咔哒+水流涌入声
        [0, 0.12, 0.24].forEach((offset, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(400 + i * 120, now + offset);
          g.gain.setValueAtTime(0.4, now + offset);
          g.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.1);
          osc.connect(g).connect(this.sfxGain!);
          osc.start(now + offset);
          osc.stop(now + offset + 0.11);
        });
        break;
      }
      case 'splash': {
        // 白噪声带通滤波模拟洒水声
        const bufSize = Math.floor(ctx.sampleRate * 0.65);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1100, now);
        filter.frequency.linearRampToValueAtTime(2400, now + 0.55);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.45, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
        noise.connect(filter).connect(g).connect(this.sfxGain);
        noise.start(now);
        break;
      }
      case 'dig': {
        // 挖土/装沙低频颗粒摩擦音
        const bufSize = Math.floor(ctx.sampleRate * 0.45);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.25));
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, now);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.02, now + 0.45);
        noise.connect(filter).connect(g).connect(this.sfxGain);
        noise.start(now);
        break;
      }
      case 'hydraulic': {
        // 液压杆升降平滑变频嗡鸣声
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(280, now + 0.45);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        g.gain.setValueAtTime(0.3, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.connect(filter).connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.52);
        break;
      }
      case 'crane': {
        // 起重吊臂棘轮齿轮伸展声
        for (let i = 0; i < 5; i++) {
          const t = now + i * 0.08;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(300 + i * 60, t);
          g.gain.setValueAtTime(0.25, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
          osc.connect(g).connect(this.sfxGain);
          osc.start(t);
          osc.stop(t + 0.07);
        }
        break;
      }
      case 'mix': {
        // 搅拌罐旋转咕噜泡泡声
        for (let i = 0; i < 6; i++) {
          const t = now + i * 0.09;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(240 + (i % 3) * 160, t);
          osc.frequency.exponentialRampToValueAtTime(580, t + 0.07);
          g.gain.setValueAtTime(0.35, t);
          g.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
          osc.connect(g).connect(this.sfxGain);
          osc.start(t);
          osc.stop(t + 0.085);
        }
        break;
      }
      case 'engine': {
        // 推土机引擎启动 Vroom + 吐烟圈噗噗声
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(75, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.35);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.6);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 350;
        g.gain.setValueAtTime(0.5, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
        osc.connect(filter).connect(g).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.66);
        break;
      }
      case 'horn': {
        // 双音萌系喇叭声 Beep-Beep
        [0, 0.20].forEach(offset => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(523.25, now + offset);
          osc.frequency.exponentialRampToValueAtTime(659.25, now + offset + 0.14);
          g.gain.setValueAtTime(0.5, now + offset);
          g.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.16);
          osc.connect(g).connect(this.sfxGain!);
          osc.start(now + offset);
          osc.stop(now + offset + 0.17);
        });
        break;
      }
      case 'wheel': {
        // 轮胎/履带滚动轻快弹跳声
        [0, 0.12].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(180 + idx * 90, now + offset);
          osc.frequency.exponentialRampToValueAtTime(90, now + offset + 0.1);
          g.gain.setValueAtTime(0.45, now + offset);
          g.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.11);
          osc.connect(g).connect(this.sfxGain!);
          osc.start(now + offset);
          osc.stop(now + offset + 0.12);
        });
        break;
      }
      case 'light': {
        // 车灯点亮魔法叮咚声
        [880, 1318.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          g.gain.setValueAtTime(0.4, now + idx * 0.08);
          g.gain.exponentialRampToValueAtTime(0.008, now + idx * 0.08 + 0.25);
          osc.connect(g).connect(this.sfxGain!);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.26);
        });
        break;
      }
      case 'eye_giggle': {
        // 眼睛眨动俏皮木琴跳音
        [659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.065);
          g.gain.setValueAtTime(0.4, now + idx * 0.065);
          g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.065 + 0.14);
          osc.connect(g).connect(this.sfxGain!);
          osc.start(now + idx * 0.065);
          osc.stop(now + idx * 0.065 + 0.15);
        });
        break;
      }
      case 'bloom_chime':
      case 'treasure_fanfare':
      case 'dump_whoosh':
      case 'build_tada':
      case 'star_magic':
      case 'clear_cheer': {
        // 根据不同完成事件合成专属的上行欢庆音阶
        const chordMap: Record<string, number[]> = {
          bloom_chime: [523.25, 659.25, 783.99, 1046.5, 1318.5],     // 花朵绽放五音竖琴
          treasure_fanfare: [392.0, 523.25, 659.25, 783.99, 1046.5], // 寻宝铜管号角音阶
          dump_whoosh: [329.63, 440.0, 554.37, 659.25, 880.0],       // 倾倒欢快滑音
          build_tada: [440.0, 554.37, 659.25, 880.0],                // 树屋建成 Ta-da
          star_magic: [523.25, 659.25, 783.99, 1046.5],              // 通用步骤完成星星音
          clear_cheer: [261.63, 392.0, 523.25, 659.25, 783.99]       // 道路畅通庆典音
        };
        const notes = chordMap[type] || chordMap.star_magic;
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = type === 'treasure_fanfare' ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.085);
          g.gain.setValueAtTime(0.45, now + idx * 0.085);
          g.gain.exponentialRampToValueAtTime(0.008, now + idx * 0.085 + 0.38);
          osc.connect(g).connect(this.sfxGain!);
          osc.start(now + idx * 0.085);
          osc.stop(now + idx * 0.085 + 0.40);
        });
        break;
      }
    }
  }
}

