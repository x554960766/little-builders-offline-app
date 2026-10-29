#!/usr/bin/env node
/**
 * buildOfflineVoices.mjs —— 构建期离线语音烘焙脚本
 *
 * 作用：
 *  1. 扫描 src/config/vehiclesConfig.ts，提取全部 clipId 与英文台本
 *     （promptId / actionWordId / completeId / resultVoice.id / introVoice / chantVoice）
 *  2. 输出 public/audio/manifest.json（App 内可直接用于自检）
 *  3. 加上 --generate 参数时，用 macOS 系统级 `say` + `afconvert` 生成
 *     m4a 离线语音包（100% 本地合成，不依赖任何云端 TTS）
 *
 * 用法：
 *   node scripts/buildOfflineVoices.mjs              # 只生成清单 + 缺失报告
 *   node scripts/buildOfflineVoices.mjs --generate    # 同时烘焙 m4a（macOS）
 *   node scripts/buildOfflineVoices.mjs --generate --force   # 覆盖已有文件
 *
 * 说明：即使完全不烘焙音频，ToddlerAudioEngine 也会自动降级到
 * iOS(AVSpeechSynthesizer) / Android(TextToSpeech) 的系统离线引擎，仍然 100% 免联网。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIG_PATH = join(ROOT, 'src/config/vehiclesConfig.ts');
const AUDIO_DIR = join(ROOT, 'public/audio');

const args = new Set(process.argv.slice(2));
const GENERATE = args.has('--generate');
const FORCE = args.has('--force');
const VOICE = process.env.VOICE_NAME || 'Samantha';
const RATE = process.env.VOICE_RATE || '154';

/* ----------------------------- 1. 解析配置 ----------------------------- */

const source = readFileSync(CONFIG_PATH, 'utf8');

// 匹配形如：promptId: 'wt_s1_p_l1', prompt: '...'
//          id: 'wt_intro_l1', text: '...'
const pairRe = /(\w*[Ii]d)\s*:\s*'([^']+)'\s*,\s*(prompt|actionWord|complete|text)\s*:\s*'((?:[^'\\]|\\.)*)'/g;

const clips = new Map(); // `${level}/${id}` → { id, text, level }
let match;
while ((match = pairRe.exec(source)) !== null) {
  const [, , id, , rawText] = match;
  const text = rawText.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  if (!text || !id) continue;

  const levelMatch = id.match(/_l([123])$/i);
  const levels = levelMatch ? [`L${levelMatch[1]}`] : ['L1', 'L2', 'L3'];
  for (const level of levels) {
    clips.set(`${level}/${id}`, { id, text, level });
  }
}

/* ----------------------------- 2. 生成清单 ----------------------------- */

const manifest = { generatedAt: new Date().toISOString(), voice: VOICE, rate: Number(RATE), clips: {} };
for (const { id, text, level } of clips.values()) {
  manifest.clips[level] ??= {};
  manifest.clips[level][id] = text;
}

mkdirSync(AUDIO_DIR, { recursive: true });
writeFileSync(join(AUDIO_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

for (const level of ['L1', 'L2', 'L3']) {
  mkdirSync(join(AUDIO_DIR, level), { recursive: true });
}

console.log(`[voices] 解析到 ${clips.size} 条离线语音片段（L1/L2/L3）`);
console.log(`[voices] 清单已写入 public/audio/manifest.json`);

/* --------------------------- 3. 可选：烘焙音频 --------------------------- */

function hasCommand(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

if (!GENERATE) {
  const missing = [...clips.values()].filter(({ id, level }) => {
    return !existsSync(join(AUDIO_DIR, level, `${id}.m4a`)) && !existsSync(join(AUDIO_DIR, level, `${id}.mp3`));
  });
  if (missing.length > 0) {
    console.log(`[voices] 仍有 ${missing.length} 条未烘焙，运行期将自动降级为系统离线 TTS。`);
    console.log(`[voices] 需要本地烘焙请执行：node scripts/buildOfflineVoices.mjs --generate`);
  } else {
    console.log('[voices] 全部离线语音已就绪。');
  }
  process.exit(0);
}

if (process.platform !== 'darwin') {
  console.warn('[voices] --generate 仅支持 macOS（依赖系统 say / afconvert）。');
  process.exit(0);
}

if (!hasCommand('say') || !hasCommand('afconvert')) {
  console.warn('[voices] 未找到 say / afconvert，跳过烘焙。');
  process.exit(0);
}

let created = 0;
let skipped = 0;
const tmpAiff = join(tmpdir(), `lb_voice_${process.pid}.aiff`);

for (const { id, text, level } of clips.values()) {
  const outM4a = join(AUDIO_DIR, level, `${id}.m4a`);
  if (existsSync(outM4a) && !FORCE) {
    skipped++;
    continue;
  }
  try {
    execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', tmpAiff, text], { stdio: 'pipe' });
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', tmpAiff, outM4a], { stdio: 'pipe' });
    created++;
    process.stdout.write(`\r[voices] 已烘焙 ${created} 条…`);
  } catch (err) {
    console.warn(`\n[voices] 生成失败 ${level}/${id}: ${err.message}`);
  }
}

if (existsSync(tmpAiff)) {
  try {
    unlinkSync(tmpAiff);
  } catch {
    /* 忽略 */
  }
}

console.log(`\n[voices] 完成：新建 ${created} 条，跳过 ${skipped} 条。`);
console.log('[voices] 记得重新执行 npm run build 让音频进入 dist/。');
