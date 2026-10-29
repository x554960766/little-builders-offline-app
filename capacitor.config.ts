import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 跨平台配置：强制横屏、全屏沉浸式、零网络纯本地打包。
 * 严禁配置 server.url —— 确保 100% 从设备本地安装包读取静态资源。
 */
const config: CapacitorConfig = {
  appId: 'com.littlebuilders.talkandplay',
  appName: '萌宝工程车',
  webDir: 'dist',
  backgroundColor: '#7DD3FC',
  ios: {
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: false,
    backgroundColor: '#7DD3FC',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#7DD3FC',
  },
  plugins: {
    // 若接入 @capacitor-community/text-to-speech，AudioEngine 会自动优先调用原生离线 TTS
    TextToSpeech: {
      enabled: true,
    },
  },
};

export default config;
