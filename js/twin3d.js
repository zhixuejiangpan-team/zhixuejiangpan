/* ============================================================
   智行江畔 V7.3 —— 数字孪生 3D 建模查看器（沉浸式升级版）
   技术底座：Three.js r147 UMD（本地 js/vendor/，file:// 与 http:// 均可运行，零 CDN 依赖）
   仅使用 OrbitControls 一个附加控件，全部模型程序化生成，零外部资源文件
   层级表：地图100 < 孪生200 < AI300 < 彩蛋400 < 3D查看器500
   性能红线：同时仅一个渲染循环（呼吸/颤抖/粒子/剖面全部注册进同一 RAF）；
             粒子 ≤1 组且 ≤100；关闭即释放；DPR≤2；低端机关阴影/颤抖/粒子
   V7.3 新增：
     ① 建筑呼吸：scaleY 1.0~1.02 正弦 3s（原点底部防穿模）；红>85% 加 10Hz 微颤抖；绿<30% 停动
     ② 人流粒子：拥挤度>60% 触发，数量=floor(百分比/2)，门口进出，颜色同状态色
     ③ 剖面查看器：双击建筑或「▤」按钮，clipping plane 沿 Y 剖开 500ms，楼层读 spot.floors
     ④ 夜景灯光：随时间轴时刻（window.__twinNight）切换窗户发光与主光强度
     ⑤ 雨天联动：仅整体变暗（灯光 ×0.8），禁改 roughness/clearcoat 防重编译
   降级：WebGL 不可用 → 孪生 3D 按钮置灰 + tooltip，其余功能不受影响
   自检降级路径可用 ?no3d=1 强制模拟无 WebGL 环境
   ============================================================ */
(function () {
var NO3D = /[?&]no3d=1/.test(location.search);            /* 降级自检开关 */
var _avail = null;                                          /* 延迟到首次询问时检测 */
var viewer = null;                                          /* 当前查看器实例（同时只存在一个） */

function cssVar(name, fb) {
  var v = '';
  try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) {}
  return v || fb;
}
function levelColor(level) {
  return cssVar('--twin-' + level, level === 'green' ? '#4CAF7D' : level === 'yellow' ? '#C9A227' : '#E05260');
}
/* WebGL 支持检测（同步、轻量） */
function detect() {
  if (_avail !== null) return _avail;
  if (NO3D) { _avail = false; return _avail; }
  try {
    var c = document.createElement('canvas');
    _avail = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { _avail = false; }
  return _avail;
}

/* ---------- 材质工具：统一 MeshStandardMaterial，低饱和，粗糙度 0.6-0.8 ---------- */
function mat(color, rough, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough, metalness: 0.08 }, extra || {}));
}
var PAL = {   /* 与 UI 同源的低饱和色系 */
  body: 0x9AA3B2, bodyDark: 0x7A8394, roof: 0x5B6474, warm: 0xD8B98A,
  glass: 0x8FB6D9, green: 0x5FA87A, track: 0xC75D6E, white: 0xE8EAEE, accent: 0x0A84FF
};

/* ---------- 建模规范：每类点位一个 build 函数（全部基础几何体） ---------- */
var BUILDERS = {
  /* 食堂：主体盒 + 四坡屋顶（ConeGeometry 四段）+ 发光窗阵列（InstancedMesh）+ 门口雨棚 */
  canteen: function (g) {
    var main = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 7), mat(PAL.body, 0.7));
    main.position.y = 2; g.add(main);
    var roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 2.6, 4), mat(PAL.roof, 0.75));
    roof.position.y = 5.3; roof.rotation.y = Math.PI / 4; g.add(roof);
    /* 窗户阵列：InstancedMesh 小平面 + 发光材质（夜景时增强发光） */
    var winGeo = new THREE.PlaneGeometry(0.8, 0.9);
    var winMat = new THREE.MeshStandardMaterial({ color: 0xFFE9C4, emissive: 0xFFD9A0, emissiveIntensity: 0.55, roughness: 0.6 });
    var cols = 6, rowsN = 2, total = cols * rowsN * 2;
    var wins = new THREE.InstancedMesh(winGeo, winMat, total);
    var m4 = new THREE.Matrix4(), idx = 0;
    for (var side = 0; side < 2; side++) {
      for (var r = 0; r < rowsN; r++) for (var c = 0; c < cols; c++) {
        var x = -4 + c * 1.6, y = 1.5 + r * 1.6, z = (side ? 3.51 : -3.51);
        m4.makeTranslation(x, y, z); wins.setMatrixAt(idx++, m4);
      }
    }
    g.add(wins);
    /* 门口雨棚薄板 */
    var canopy = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 2), mat(PAL.accent, 0.6));
    canopy.position.set(0, 3, 4.2); g.add(canopy);
  },
  /* 运动场：椭圆跑道（圆环拉伸）+ 白色分道线 + 绿色内场 + 球门/篮架细杆 */
  stadium: function (g) {
    var track = new THREE.Mesh(new THREE.RingGeometry(4.2, 6, 48), mat(PAL.track, 0.8));
    track.rotation.x = -Math.PI / 2; track.scale.set(1.5, 1, 1); track.position.y = 0.06; g.add(track);
    /* 白色分道线：三个同心椭圆环 */
    [4.7, 5.4, 6.0].forEach(function (r) {
      var lane = new THREE.Mesh(new THREE.RingGeometry(r - 0.05, r, 48), mat(PAL.white, 0.7));
      lane.rotation.x = -Math.PI / 2; lane.scale.set(1.5, 1, 1); lane.position.y = 0.08; g.add(lane);
    });
    var field = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), mat(PAL.green, 0.85));
    field.rotation.x = -Math.PI / 2; field.scale.set(1.5, 1, 1); field.position.y = 0.05; g.add(field);
    /* 球门细杆 ×2 + 篮架 ×2 */
    var post = mat(PAL.white, 0.5);
    [[-7.2, 0], [7.2, 0]].forEach(function (p) {
      var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), post);
      bar.rotation.z = Math.PI / 2; bar.position.set(p[0], 0.8, 0); g.add(bar);
      var up1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), post);
      up1.position.set(p[0], 0.6, -0.8); g.add(up1);
      var up2 = up1.clone(); up2.position.z = 0.8; g.add(up2);
    });
    [[0, -3.2], [0, 3.2]].forEach(function (p) {
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), post);
      pole.position.set(p[0], 1.6, p[1]); g.add(pole);
      var board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.08), mat(PAL.white, 0.6));
      board.position.set(p[0], 3.1, p[1]); g.add(board);
    });
  },
  /* 图书馆：主体盒 + 竖条玻璃幕墙（MeshPhysicalMaterial 半透明）+ 顶部退台两层 */
  library: function (g) {
    var main = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 6), mat(PAL.bodyDark, 0.7));
    main.position.y = 3.5; g.add(main);
    /* 竖条玻璃幕墙 */
    var glassMat = new THREE.MeshPhysicalMaterial({
      color: PAL.glass, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.45,
      transmission: 0, side: THREE.DoubleSide
    });
    for (var i = 0; i < 10; i++) {
      var strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.2, 0.12), glassMat);
      strip.position.set(-4 + i * 0.9, 3.4, 3.06); g.add(strip);
    }
    var back = new THREE.Mesh(new THREE.BoxGeometry(9, 6.2, 0.12), glassMat);
    back.position.set(0, 3.4, -3.06); g.add(back);
    /* 顶部退台两层 */
    var r1 = new THREE.Mesh(new THREE.BoxGeometry(6.6, 1.6, 4.4), mat(PAL.body, 0.7));
    r1.position.y = 7.8; g.add(r1);
    var r2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 2.8), mat(PAL.roof, 0.75));
    r2.position.y = 9.2; g.add(r2);
  },
  /* 快递站：小盒体 + 货架阵列（细盒排列）+ 门头招牌色块 */
  express: function (g) {
    var main = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 5), mat(PAL.body, 0.75));
    main.position.y = 1.5; g.add(main);
    /* 货架阵列：开口箱式细盒 3×2 */
    var shelfMat = mat(PAL.warm, 0.7);
    for (var r = 0; r < 2; r++) for (var c = 0; c < 3; c++) {
      var cell = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 0.9), shelfMat);
      cell.position.set(-2.2 + c * 2.2, 0.5 + r * 1.1, 2.6); g.add(cell);
    }
    /* 门头招牌色块（Accent 同源蓝） */
    var sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.7, 0.18),
      new THREE.MeshStandardMaterial({ color: PAL.accent, emissive: PAL.accent, emissiveIntensity: 0.35, roughness: 0.6 }));
    sign.position.set(0, 2.7, 2.56); g.add(sign);
  },
  /* 校医院：白色盒体 + 红色十字（两盒交叉）+ 入口台阶 */
  hospital: function (g) {
    var main = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 6), mat(PAL.white, 0.7));
    main.position.y = 2.25; g.add(main);
    var crossMat = mat(0xD9534F, 0.6);
    var c1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.2), crossMat);
    c1.position.set(0, 3.6, 3.05); g.add(c1);
    var c2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.2), crossMat);
    c2.position.set(0, 3.6, 3.05); g.add(c2);
    /* 入口台阶三级 */
    for (var i = 0; i < 3; i++) {
      var step = new THREE.Mesh(new THREE.BoxGeometry(3 - i * 0.6, 0.18, 0.9), mat(PAL.bodyDark, 0.8));
      step.position.set(0, 0.09 + i * 0.18, 3.4 + (2 - i) * 0.45); g.add(step);
    }
  },
  /* 默认 fallback：发光底座 + 名称立方体，未定义类型不报错 */
  fallback: function (g) {
    var cube = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 3.2), mat(PAL.body, 0.65));
    cube.position.y = 1.6; cube.rotation.y = Math.PI / 6; g.add(cube);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4),
      new THREE.MeshStandardMaterial({ color: PAL.accent, emissive: PAL.accent, emissiveIntensity: 0.4, roughness: 0.6 }));
    cap.position.y = 3.9; g.add(cap);
  }
};

/* ---------- 查看器 ---------- */
function open(opts) {
  if (!detect()) { if (window.__toast) window.__toast('当前设备不支持 3D 查看'); return; }
  if (viewer) close();                       /* 性能红线：同时只存在一个渲染循环 */
  var REDUCED = false;
  try { REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var LOWEND = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

  /* DOM：fixed 全屏玻璃拟态层 z-index 500 */
  var wrap = document.createElement('div');
  wrap.className = 'v3d-overlay';
  wrap.innerHTML =
    '<div class="v3d-topbar"><div class="v3d-title"><b>' + esc(opts.name) + '</b>' +
    '<span class="v3d-kind">' + esc(opts.type || opts.kind || '') + '</span></div>' +
    '<div class="v3d-tools">' +
    '<button class="v3d-btn" id="v3dSec" title="查看楼层">▤</button>' +
    '<button class="v3d-btn" id="v3dFs" title="全屏">⛶</button>' +
    '<button class="v3d-btn" id="v3dX" title="关闭">✕</button></div></div>' +
    '<div class="v3d-stage" id="v3dStage"></div>' +
    '<p class="v3d-hint">拖拽旋转 · 滚轮缩放 · 双击建筑查看楼层 · 双击空白全屏</p>';
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';   /* 防页面滚动穿透 */

  var stage = wrap.querySelector('#v3dStage');
  var renderer, scene, camera, controls, raf = null, disposed = false;
  var model = new THREE.Group();
  var haloMat, baseMat;

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    _avail = false;
    wrap.remove();
    document.body.style.overflow = '';
    if (window.__setTwin3dAvail) window.__setTwin3dAvail();
    if (window.__toast) window.__toast('当前设备不支持 3D 查看');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));   /* DPR 上限 2 */
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  if (!LOWEND) renderer.shadowMap.enabled = true;                      /* 低端机关阴影 */
  renderer.localClippingEnabled = true;                                /* V7.3 剖面查看器 */
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  var fogDay = new THREE.Color(cssVar('--bg-primary', '#05070D'));
  var fogNight = new THREE.Color('#02040A');
  scene.fog = new THREE.Fog(fogDay.clone(), 30, 70);

  camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 0.1, 200);
  camera.position.set(14, 12, 18);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.05;
  controls.minPolarAngle = THREE.MathUtils.degToRad(20);   /* 极角 20°-85°，不可钻地 */
  controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
  controls.minDistance = 8; controls.maxDistance = 40;

  /* 灯光：主光 + 弱环境光 + 底部 Accent 蓝点光（科技感来源） */
  var KEY_BASE = 1.1, AMB_BASE = 0.35;
  var key = new THREE.DirectionalLight(0xFFFFFF, KEY_BASE);
  key.position.set(10, 16, 8);
  if (!LOWEND) { key.castShadow = true; key.shadow.mapSize.set(1024, 1024); }
  scene.add(key);
  var amb = new THREE.AmbientLight(0xFFFFFF, AMB_BASE);
  scene.add(amb);
  var accentLight = new THREE.PointLight(0x0A84FF, 14, 26);
  accentLight.position.set(0, 0.6, 0); scene.add(accentLight);

  /* 统一底座：圆角发光地台（圆盘 + 呼吸光晕环），颜色跟随拥挤度 */
  var baseColor = new THREE.Color(levelColor(opts.getState().level));
  baseMat = new THREE.MeshStandardMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 0.9 });
  var base = new THREE.Mesh(new THREE.CircleGeometry(8.4, 48), baseMat);
  base.rotation.x = -Math.PI / 2; base.position.y = 0.01; model.add(base);
  haloMat = new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
  var halo = new THREE.Mesh(new THREE.RingGeometry(8.4, 10.4, 48), haloMat);
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; model.add(halo);
  /* V7.2 正式版：事件驱动同步——引擎 tick 抛出 twin:status-update，命中本点位即瞬时对齐地台色；
     事件缺失时由下方渲染循环内 getState() 实时读取兜底（快照降级，注释见下） */
  var onStatus = function (e) {
    if (!e || !e.detail || e.detail.id !== opts.id) return;
    var c2 = new THREE.Color(e.detail.color || levelColor(e.detail.crowdLevel));
    baseMat.color.copy(c2); baseMat.emissive.copy(c2); haloMat.color.copy(c2);
  };
  window.addEventListener('twin:status-update', onStatus);
  if (!LOWEND) { base.receiveShadow = true; }

  /* 模型本体（V7.2 正式版：build 抛错 → fallback 发光底座立方体 + 「简化模型渲染」小字） */
  var bodyGroup = new THREE.Group();
  var simplified = false;
  try {
    (BUILDERS[opts.kind] || BUILDERS.fallback)(bodyGroup);
  } catch (buildErr) {
    simplified = true;
    try { console.warn('[Twin3D] 建模失败，使用简化模型：', opts.kind, buildErr); } catch (e) {}
    while (bodyGroup.children.length) bodyGroup.remove(bodyGroup.children[0]);
    BUILDERS.fallback(bodyGroup);
  }
  if (simplified) {
    var tag = document.createElement('span');
    tag.className = 'v3d-simple';
    tag.textContent = '简化模型渲染';
    wrap.querySelector('.v3d-stage').appendChild(tag);
  }
  if (!LOWEND) bodyGroup.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
  model.add(bodyGroup);
  scene.add(model);

  /* V7.3 夜景：收集发光材质（窗户/招牌），夜间增强发光；主光减弱、雾色加深 */
  var glowMats = [];
  bodyGroup.traverse(function (o) {
    if (o.isMesh && o.material && o.material.emissive && o.material.emissiveIntensity > 0.2) {
      if (glowMats.every(function (g2) { return g2.m !== o.material; }))
        glowMats.push({ m: o.material, base: o.material.emissiveIntensity });
    }
  });

  /* V7.3 人流粒子系统：预分配 100 上限，drawRange 控制数量（零重建零 GC 抖动） */
  var MAX_P = 100;
  var pGeo = new THREE.BufferGeometry();
  var pPos = new Float32Array(MAX_P * 3);
  var pVel = new Float32Array(MAX_P);        /* 每粒子 z 向速度（正=出门，负=进门） */
  var pOff = new Float32Array(MAX_P * 2);    /* x/y 随机偏移 */
  for (var pi = 0; pi < MAX_P; pi++) {
    pPos[pi * 3] = (Math.random() - 0.5) * 5;
    pPos[pi * 3 + 1] = 0.3 + Math.random() * 1.4;
    pPos[pi * 3 + 2] = 4.5 + Math.random() * 6;
    pVel[pi] = (Math.random() < 0.55 ? 1 : -1) * (0.04 + Math.random() * 0.06);
    pOff[pi * 2] = (Math.random() - 0.5) * 0.02;
    pOff[pi * 2 + 1] = 0;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  var pMat = new THREE.PointsMaterial({ color: baseColor.clone(), size: 0.32, transparent: true, opacity: 0.9, sizeAttenuation: true });
  var points = new THREE.Points(pGeo, pMat);
  points.visible = false;
  scene.add(points);

  /* V7.3 剖面查看器：clipping plane 沿 Y 剖开（数据读 spot.floors，无则提示待补充） */
  var clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 99);   /* 常数 99 = 不裁剪 */
  var clipMats = [];
  bodyGroup.traverse(function (o) {
    if (o.isMesh && o.material && clipMats.indexOf(o.material) === -1) clipMats.push(o.material);
  });
  var sec = { on: false, anim: 0, from: 99, to: 99 };
  var SEC_TOP = 12, SEC_CUT = 2.6, SEC_MS = 500;
  var floorsEl = document.createElement('div');
  floorsEl.className = 'v3d-floors';
  floorsEl.hidden = true;
  (function () {
    var sp = null;
    (window.spots || []).concat(window.surroundingSpots || []).forEach(function (s) { if (s.id === opts.id) sp = s; });
    var fs = sp && sp.floors;
    floorsEl.innerHTML = '<b>楼层导览</b>' + (fs && fs.length
      ? '<ul>' + fs.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>'
      : '<p class="v3d-floors-empty">楼层信息待补充</p>');
  })();
  wrap.appendChild(floorsEl);
  function setClip(c) { clipPlane.constant = c; }
  function applyClip(on) {
    clipMats.forEach(function (m) {
      m.clippingPlanes = on ? [clipPlane] : null;
      m.needsUpdate = true;
    });
  }
  function toggleSection() {
    if (sec.anim) return;
    if (!sec.on) {
      sec.on = true; sec.from = SEC_TOP; sec.to = SEC_CUT; sec.anim = performance.now();
      applyClip(true);
      floorsEl.hidden = false;
    } else {
      sec.from = SEC_CUT; sec.to = SEC_TOP; sec.anim = performance.now();
      floorsEl.hidden = true;
    }
  }
  wrap.querySelector('#v3dSec').addEventListener('click', toggleSection);

  /* 打开动效：scale 0.6 + opacity 0 → 1，300ms ease-apple */
  var introStart = performance.now();
  var fadeMats = [];
  model.traverse(function (o) {
    if (o.isMesh) { o.material.transparent = true; fadeMats.push(o.material); }
  });
  if (REDUCED) { model.scale.set(1, 1, 1); fadeMats.forEach(function (m) { m.opacity = 1; }); }

  function onResize() {
    if (disposed || !renderer) return;
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight);
  }
  window.addEventListener('resize', onResize);

  /* 天气缓存：约每 2 秒读一次 DataSource（避免每帧 JSON.parse） */
  var wxTick = 0, wxCond = 'sunny';
  /* 颤抖节流（10Hz） */
  var lastTrem = 0;
  var fsSync = 0;

  function tick(now) {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    if ((fsSync & 31) === 0) wrap.classList.toggle('fs', !!document.fullscreenElement);
    fsSync++;
    /* 进入动画 300ms */
    if (!REDUCED) {
      var k = Math.min(1, (now - introStart) / 300);
      var e = 1 - Math.pow(1 - k, 3);
      model.scale.setScalar(0.6 + 0.4 * e);
      fadeMats.forEach(function (m) { m.opacity = e; });
    }
    /* 地台颜色实时同步（复用状态引擎刷新通道，无新定时器） */
    var st = opts.getState();
    var pct = Math.round((st.p || 0) * 100);
    var c = new THREE.Color(levelColor(st.level));
    baseMat.color.lerp(c, 0.12); baseMat.emissive.lerp(c, 0.12);
    haloMat.color.lerp(c, 0.12);
    /* 光晕呼吸：查看器内唯二循环动画之一（60% 占空比缓慢缩放） */
    var ph = (now % 4000) / 4000;
    var s = ph < 0.3 ? 0.55 + (ph / 0.3) * 0.63 : (ph < 0.6 ? 1.18 : 1.18 - ((ph - 0.6) / 0.4) * 0.63);
    halo.scale.setScalar(s);
    haloMat.opacity = 0.28 * (1.2 - s * 0.45);

    /* V7.3 建筑呼吸：scaleY 1.0~1.02 正弦 3s，原点在底部（子网格 y≥0，底部恒贴地不穿模）。
       绿 <30% 停动；红 >85% 叠加 ±0.005 / 10Hz 微颤抖（低端机关闭） */
    if (!REDUCED) {
      if (pct < 30) {
        bodyGroup.scale.y = 1;
        bodyGroup.position.x = 0; bodyGroup.position.z = 0;
      } else {
        bodyGroup.scale.y = 1 + 0.01 * (1 + Math.sin(now / 1000 * Math.PI * 2 / 3));
        if (pct > 85 && !LOWEND && now - lastTrem >= 100) {
          lastTrem = now;
          bodyGroup.position.x = (Math.random() - 0.5) * 0.01;
          bodyGroup.position.z = (Math.random() - 0.5) * 0.01;
        }
      }
    }

    /* V7.3 人流粒子：拥挤度 >60% 触发，数量 = floor(百分比/2)，上限 100 */
    if (!LOWEND && !REDUCED && pct > 60) {
      var cnt = Math.min(MAX_P, Math.floor(pct / 2));
      points.visible = true;
      pGeo.setDrawRange(0, cnt);
      pMat.color.lerp(c, 0.15);
      for (var i = 0; i < cnt; i++) {
        pPos[i * 3 + 2] += pVel[i];
        pPos[i * 3] += pOff[i * 2];
        if (pPos[i * 3 + 2] > 11 || pPos[i * 3 + 2] < 4.2) {
          pPos[i * 3 + 2] = pVel[i] > 0 ? 4.5 : 10.8;   /* 到界回门口/远端，循环进出 */
          pPos[i * 3] = (Math.random() - 0.5) * 5;
        }
      }
      pGeo.attributes.position.needsUpdate = true;
    } else {
      points.visible = false;
    }

    /* V7.3 剖面动画：500ms ease-apple，沿 Y 切开/合拢 */
    if (sec.anim) {
      var sk = Math.min(1, (now - sec.anim) / SEC_MS);
      var se = 1 - Math.pow(1 - sk, 3);
      setClip(sec.from + (sec.to - sec.from) * se);
      if (sk >= 1) {
        sec.anim = 0;
        if (sec.to === SEC_TOP) { sec.on = false; applyClip(false); }   /* 合拢完成后移除裁剪面 */
      }
    }

    /* V7.3 夜景 + 雨天：只调灯光强度与雾色（禁改 roughness/clearcoat，防材质重编译） */
    if ((wxTick & 127) === 0) {
      wxCond = (window.ZXSJ && ZXSJ.DataSource) ? ZXSJ.DataSource.getWeather().condition : 'sunny';
    }
    wxTick++;
    var nightK = window.__twinNight ? 1 : 0;
    var dimK = (wxCond === 'rain' || wxCond === 'snow') ? 0.8 : 1;   /* 雨天整体变暗 0.8 */
    key.intensity += (KEY_BASE * dimK * (1 - 0.45 * nightK) - key.intensity) * 0.08;
    amb.intensity += (AMB_BASE * dimK * (1 - 0.25 * nightK) - amb.intensity) * 0.08;
    glowMats.forEach(function (g2) {
      g2.m.emissiveIntensity += (g2.base * (1 + 1.3 * nightK) - g2.m.emissiveIntensity) * 0.08;
    });
    scene.fog.color.lerp(nightK ? fogNight : fogDay, 0.06);

    controls.update();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);

  /* 交互：全屏切换（按钮或双击空白处）；双击建筑 → 剖面查看器 */
  function toggleFs() {
    if (!document.fullscreenElement) {
      (wrap.requestFullscreen || wrap.webkitRequestFullscreen || function(){}).call(wrap);
      wrap.classList.add('fs');
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
      wrap.classList.remove('fs');
    }
  }
  wrap.querySelector('#v3dFs').addEventListener('click', toggleFs);
  var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('dblclick', function (ev) {
    var rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(bodyGroup.children, true);
    if (hits.length) toggleSection();   /* 双击建筑 → 楼层剖面 */
    else toggleFs();                    /* 双击空白 → 全屏 */
  });
  document.addEventListener('fullscreenchange', onFsChange);
  function onFsChange() { wrap.classList.toggle('fs', !!document.fullscreenElement); }
  /* ESC：全屏时退出全屏（兜底：某些环境 fullscreenchange 不触发，逐帧对齐 fs 类） */
  function onEsc(e) {
    if (e.key === 'Escape' && document.fullscreenElement) {
      try { document.exitFullscreen(); } catch (err) {}
      wrap.classList.remove('fs');
    }
  }
  document.addEventListener('keydown', onEsc);

  function close() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('twin:status-update', onStatus);
    document.removeEventListener('fullscreenchange', onFsChange);
    document.removeEventListener('keydown', onEsc);
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
    applyClip(false);
    /* 完全释放：geometry/material 显存 + renderer + 粒子系统 */
    scene.traverse(function (o) {
      if (o.isMesh || o.isPoints) {
        if (o.geometry) o.geometry.dispose();
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) { for (var k in m) { if (m[k] && m[k].isTexture) m[k].dispose(); } m.dispose(); });
      }
    });
    controls.dispose();
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    renderer.forceContextLoss && renderer.forceContextLoss();
    renderer.domElement.remove();
    wrap.remove();
    document.body.style.overflow = '';
    viewer = null;
  }
  wrap.querySelector('#v3dX').addEventListener('click', close);

  viewer = { close: close };
}
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* ---------- 暴露 API ---------- */
window.Twin3D = {
  open: open,
  close: function () { if (viewer) viewer.close(); },
  available: detect
};
/* 加载完成：通知孪生主视图开启 3D 按钮 */
if (window.__setTwin3dAvail) window.__setTwin3dAvail();
})();
