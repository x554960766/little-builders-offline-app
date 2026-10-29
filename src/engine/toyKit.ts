import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * 婴幼儿软胶玩具画风工具集（PRD 3.1）
 * - roughness 0.45 / metalness 0.05 的 PBR 哑光软胶
 * - 所有立方体必须使用圆角几何体，圆角半径 ≥ 0.08m，彻底消除尖角
 */

export const TOY_ROUGHNESS = 0.45;
export const TOY_METALNESS = 0.05;
export const MIN_RADIUS = 0.08;

interface MatOptions {
  roughness?: number;
  metalness?: number;
  emissive?: string | number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  flatShading?: boolean;
  side?: THREE.Side;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function toyMat(color: string | number, opts: MatOptions = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify([color, opts]);
  const cached = matCache.get(key);
  if (cached) return cached;

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? TOY_ROUGHNESS,
    metalness: opts.metalness ?? TOY_METALNESS,
    emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    flatShading: opts.flatShading ?? false,
    side: opts.side ?? THREE.FrontSide,
  });
  matCache.set(key, mat);
  return mat;
}

/** 新建（不缓存的）可独立调色的材质，用于需要动画改色的元素（泥土、水位等） */
export function freshMat(color: string | number, opts: MatOptions = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? TOY_ROUGHNESS,
    metalness: opts.metalness ?? TOY_METALNESS,
    emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
}

/** 圆角立方体（半径自动收敛，避免超过半边长导致几何爆开） */
export function roundedBox(
  w: number,
  h: number,
  d: number,
  radius = MIN_RADIUS,
  mat?: THREE.Material,
  segments = 3
): THREE.Mesh {
  const r = Math.max(0.004, Math.min(radius, Math.min(w, h, d) * 0.42));
  const geo = new RoundedBoxGeometry(w, h, d, segments, r);
  const mesh = new THREE.Mesh(geo, mat ?? toyMat('#ffffff'));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function toySphere(r: number, mat: THREE.Material, seg = 24): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(12, seg / 2)), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function toyCylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  mat: THREE.Material,
  seg = 24,
  openEnded = false
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, seg, 1, openEnded),
    mat
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 四角星形状（惊喜星星眼 / 贴纸装饰） */
export function fourPointStarShape(outer = 1, inner = 0.34): THREE.Shape {
  const shape = new THREE.Shape();
  const points = 4;
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

export function starMesh(size = 0.1, color = '#FBBF24'): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(fourPointStarShape(size, size * 0.36), {
    depth: 0.012,
    bevelEnabled: true,
    bevelSize: 0.006,
    bevelThickness: 0.004,
    bevelSegments: 2,
    curveSegments: 2,
  });
  geo.center();
  const mat = toyMat(color, { emissive: color, emissiveIntensity: 0.45, roughness: 0.35 });
  return new THREE.Mesh(geo, mat);
}

/** 心形（烟囱冒出的爱心云、纸屑） */
export function heartShape(size = 1): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -size * 0.5);
  s.bezierCurveTo(size * 0.9, size * 0.25, size * 0.45, size * 1.05, 0, size * 0.42);
  s.bezierCurveTo(-size * 0.45, size * 1.05, -size * 0.9, size * 0.25, 0, -size * 0.5);
  return s;
}

export function heartMesh(size = 0.12, color = '#FB7185'): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(heartShape(size), {
    depth: size * 0.25,
    bevelEnabled: true,
    bevelSize: size * 0.05,
    bevelThickness: size * 0.04,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.center();
  return new THREE.Mesh(geo, toyMat(color, { roughness: 0.4 }));
}

/** 糖果螺旋条纹贴图（水泥搅拌罐），100% 程序化生成，无外部图片 */
export function stripeTexture(colors: string[], stripes = 10): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);
  const step = size / stripes;
  ctx.lineWidth = step * 0.62;
  for (let i = -stripes; i < stripes * 2; i++) {
    ctx.strokeStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step + size, size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 圆形柔和阴影贴图（给粒子/花瓣做假阴影，避免额外光源） */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 递归释放几何体与材质（切车/回车库时防显存泄漏） */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) {
      const anyMat = mat as THREE.MeshStandardMaterial;
      if (anyMat.map && anyMat.map !== null) {
        // 共享缓存贴图不主动销毁
      }
      mat.dispose();
    }
  });
}

/** 缓动 */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
