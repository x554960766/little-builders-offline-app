import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/scene.css';
import './styles/hud.css';
import './styles/celebration.css';

/* 全屏无滚动锁死 + 防误触（右键菜单 / 双指缩放 / 页面橡皮筋回弹） */
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const root = document.getElementById('root');
if (root) {
  // 不使用 StrictMode：WebGL 场景双挂载会重复创建上下文
  ReactDOM.createRoot(root).render(<App />);
}
