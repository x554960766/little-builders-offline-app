#!/usr/bin/env node
/**
 * patchNative.mjs —— Capacitor 原生工程横屏 / 沉浸式补丁
 *
 * 在 `npx cap add ios` / `npx cap add android` 之后执行：
 *   npm run cap:patch
 *
 * 做三件事（幂等，可重复执行）：
 *  1. iOS Info.plist：仅保留 LandscapeLeft / LandscapeRight，并设置全屏与隐藏状态栏
 *  2. Android AndroidManifest.xml：MainActivity 锁定 sensorLandscape
 *  3. Android MainActivity：隐藏状态栏与虚拟导航栏（沉浸式）
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function patchPlist() {
  const path = join(ROOT, 'ios/App/App/Info.plist');
  if (!existsSync(path)) {
    console.log('[patch] 未找到 iOS 工程，跳过 Info.plist');
    return;
  }
  let xml = readFileSync(path, 'utf8');

  const orientationBlock = `\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t\t<string>UIInterfaceOrientationLandscapeRight</string>
\t</array>`;

  if (/<key>UISupportedInterfaceOrientations<\/key>\s*<array>[\s\S]*?<\/array>/.test(xml)) {
    xml = xml.replace(
      /<key>UISupportedInterfaceOrientations<\/key>\s*<array>[\s\S]*?<\/array>/,
      orientationBlock
    );
  } else {
    xml = xml.replace('</dict>\n</plist>', `${orientationBlock}\n</dict>\n</plist>`);
  }

  const ensureKey = (key, valueXml) => {
    if (new RegExp(`<key>${key}</key>`).test(xml)) {
      xml = xml.replace(new RegExp(`(<key>${key}</key>\\s*)<[^>]+>`), `$1${valueXml}`);
    } else {
      xml = xml.replace('</dict>\n</plist>', `\t<key>${key}</key>\n\t${valueXml}\n</dict>\n</plist>`);
    }
  };

  ensureKey('UIRequiresFullScreen', '<true/>');
  ensureKey('UIStatusBarHidden', '<true/>');
  ensureKey('UIViewControllerBasedStatusBarAppearance', '<false/>');

  writeFileSync(path, xml, 'utf8');
  console.log('[patch] iOS Info.plist 已锁定横屏 + 全屏 + 隐藏状态栏');
}

function patchAndroidManifest() {
  const path = join(ROOT, 'android/app/src/main/AndroidManifest.xml');
  if (!existsSync(path)) {
    console.log('[patch] 未找到 Android 工程，跳过 AndroidManifest.xml');
    return;
  }
  let xml = readFileSync(path, 'utf8');

  if (!/android:screenOrientation=/.test(xml)) {
    xml = xml.replace(
      /(<activity\b[^>]*android:name="\.MainActivity")/,
      '$1\n            android:screenOrientation="sensorLandscape"'
    );
  } else {
    xml = xml.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="sensorLandscape"');
  }

  if (!/android:configChanges=/.test(xml)) {
    xml = xml.replace(
      /(<activity\b[^>]*android:name="\.MainActivity"[^>]*?)>/,
      '$1\n            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode">'
    );
  }

  writeFileSync(path, xml, 'utf8');
  console.log('[patch] Android AndroidManifest.xml 已锁定 sensorLandscape');
}

function patchAndroidMainActivity() {
  const candidates = [
    join(ROOT, 'android/app/src/main/java/com/littlebuilders/talkandplay/MainActivity.java'),
    join(ROOT, 'android/app/src/main/java/com/littlebuilders/talkandplay/MainActivity.kt'),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    console.log('[patch] 未找到 Android MainActivity，跳过沉浸式补丁');
    return;
  }

  const isKotlin = path.endsWith('.kt');
  let src = readFileSync(path, 'utf8');

  if (src.includes('WindowInsetsControllerCompat')) {
    console.log('[patch] Android 沉浸式已存在，跳过');
    return;
  }

  if (isKotlin) {
    src = src.replace(
      /class MainActivity\s*:\s*BridgeActivity\(\)\s*\{/,
      `class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
`
    );
    src = src.replace(
      /^import com\.getcapacitor\.BridgeActivity$/m,
      `import com.getcapacitor.BridgeActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat`
    );
  } else {
    src = src.replace(
      /public class MainActivity extends BridgeActivity \{/,
      `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        androidx.core.view.WindowInsetsControllerCompat controller =
            new androidx.core.view.WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
`
    );
  }

  writeFileSync(path, src, 'utf8');
  console.log('[patch] Android MainActivity 已开启沉浸式全屏（隐藏状态栏与导航栏）');
}

patchPlist();
patchAndroidManifest();
patchAndroidMainActivity();
console.log('[patch] 完成。重新执行 npx cap sync 使改动生效。');
