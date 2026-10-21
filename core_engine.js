/**
 * ==============================================================================
 * EQWEL 会場図面 & ENG視界シミュレーター Mark2
 * 【基盤】コアエンジン (core_engine.js)
 * 
 * 修正内容:
 * 1. 100%ボタン(setZoom100) / 全体ボタン(fitView) を実装・完全連動
 * 2. パレット触ると消える現象を防止（イベント伝播遮断・親コンテナ座標補正・画面外脱出リミッター）
 * 3. 図面背景の勝手なドラッグ移動（パン）を停止・中央固定
 * 4. 立面図の「断面X」を廃止し、横スクロール方式に差し戻し。底面を上に引き上げ。
 * 5. 平面・立面ともにUIと被らないように配置を最適化
 * ==============================================================================
 */

// ==============================================================================
// 1. グローバル共通データストア & 初期状態
// ==============================================================================
window.simData = window.simData || {};

// 会場外郭初期値
window.room = window.room || {
  w: 14000,
  d: 26000,
  shapeType: 'rect',
  points: [
    { x: 0, y: 0 },
    { x: 14000, y: 0 },
    { x: 14000, y: 26000 },
    { x: 0, y: 26000 }
  ]
};

// ステージ初期値
window.stage = window.stage || {
  x: 2000,
  y: 1200,
  w: 10000,
  d: 3000,
  h: 800
};
window.isStageLocked = (typeof window.isStageLocked !== 'undefined') ? window.isStageLocked : true;

// 共通表示設定
window.displaySettings = window.displaySettings || {
  showRoomDims: true,
  showStageDims: true,
  showGrid: true,
  showFov: true,
  gridPitch: 1000
};

// キャンバス参照 & 描画コンテキスト
let canvas = null;
let ctx = null;
let isRenderPending = false;

// 視点 & 座標変換パラメータ
let viewMode = 'top'; // 'top' (平面図) | 'side' (立面図)
let zoomLevel = 1.0;
const BASE_SCALE_TOP = 0.045;
const BASE_SCALE_SIDE = 0.085;
let scale = BASE_SCALE_TOP;
let panX = 100;
let panY = 100;

// 操作ステート
let dragTarget = null;
// ★修正: 断面Xを廃止

// 複数選択・ラバーバンド用
let isBoxSelecting = false;
let boxSelectStart = { x: 0, y: 0 };
let boxSelectEnd = { x: 0, y: 0 };

// ==============================================================================
// 2. 履歴管理 (Undo / Redo) システム
// ==============================================================================
const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 40;
let isHistoryRestoring = false;

function saveHistory() {
  if (isHistoryRestoring) return;
  const snapshot = getCurrentStateSnapshot();
  const snapshotStr = JSON.stringify(snapshot);

  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === snapshotStr) return;

  undoStack.push(snapshotStr);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function getCurrentStateSnapshot() {
  const state = {
    room: window.room,
    stage: window.stage,
    isStageLocked: window.isStageLocked,
    displaySettings: window.displaySettings,
    // sideSliceX は廃止
    modules: {}
  };

  const moduleKeys = [
    'tabRoomModule', 'tabFacilityModule', 'tabPodiumModule', 'tabGuestsModule',
    'tabStageItemsModule', 'tabSeatsModule', 'tabCameraModule', 'tabDisplayModule',
    'tabEquipmentModule', 'tabMonitorModule', 'tabBgimageModule', 'tabAiGenModule'
  ];

  moduleKeys.forEach(mKey => {
    if (window[mKey] && typeof window[mKey].exportData === 'function') {
      state.modules[mKey] = window[mKey].exportData();
    }
  });

  return state;
}

function undo() {
  if (undoStack.length === 0) return;
  const currentSnapshotStr = JSON.stringify(getCurrentStateSnapshot());
  redoStack.push(currentSnapshotStr);
  const prevSnapshotStr = undoStack.pop();
  applyStateSnapshot(JSON.parse(prevSnapshotStr));
  updateHistoryButtons();
}

function redo() {
  if (redoStack.length === 0) return;
  const currentSnapshotStr = JSON.stringify(getCurrentStateSnapshot());
  undoStack.push(currentSnapshotStr);
  const nextSnapshotStr = redoStack.pop();
  applyStateSnapshot(JSON.parse(nextSnapshotStr));
  updateHistoryButtons();
}

function applyStateSnapshot(data) {
  if (!data) return;
  isHistoryRestoring = true;
  try {
    if (data.room) window.room = data.room;
    if (data.stage) window.stage = data.stage;
    if (typeof data.isStageLocked !== 'undefined') window.isStageLocked = data.isStageLocked;
    if (data.displaySettings) window.displaySettings = data.displaySettings;
    // sideSliceX は廃止

    if (data.modules) {
      Object.keys(data.modules).forEach(mKey => {
        if (window[mKey] && typeof window[mKey].importData === 'function') {
          window[mKey].importData(data.modules[mKey]);
        }
      });
    }

    syncCoreInputs();
    updateStats();
    requestRender();
  } finally {
    isHistoryRestoring = false;
  }
}

function updateHistoryButtons() {
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  if (btnUndo) btnUndo.disabled = (undoStack.length === 0);
  if (btnRedo) btnRedo.disabled = (redoStack.length === 0);
}

// ==============================================================================
// 3. 描画ループ & レンダリング制御
// ==============================================================================
function requestRender() {
  if (!isRenderPending) {
    isRenderPending = true;
    requestAnimationFrame(() => {
      try {
        render();
      } catch (err) {
        console.error('Render execution error:', err);
      } finally {
        isRenderPending = false;
      }
    });
  }
}

function render() {
  if (!canvas || !ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);

  if (viewMode === 'top') {
    renderTopPlanTo(ctx);
  } else {
    renderSidePlanTo(ctx);
  }

  ctx.restore();

  if (isBoxSelecting && viewMode === 'top') {
    renderSelectionBox(ctx);
  }

  updateStats();
}

function renderTopPlanTo(tCtx) {
  if (window.tabBgimageModule && typeof window.tabBgimageModule.drawTop === 'function') {
    window.tabBgimageModule.drawTop(tCtx);
  }

  if (window.displaySettings.showGrid) {
    drawGrid(tCtx);
  }

  tCtx.save();
  tCtx.strokeStyle = '#94a3b8';
  tCtx.lineWidth = 30;
  tCtx.setLineDash([200, 100]);
  tCtx.beginPath();
  tCtx.moveTo(window.room.w / 2, 0);
  tCtx.lineTo(window.room.w / 2, window.room.d);
  tCtx.stroke();
  tCtx.restore();

  if (window.tabRoomModule && typeof window.tabRoomModule.drawTop === 'function') {
    window.tabRoomModule.drawTop(tCtx);
  } else {
    tCtx.strokeStyle = '#000000';
    tCtx.lineWidth = 70;
    tCtx.strokeRect(0, 0, window.room.w, window.room.d);
    if (window.displaySettings.showRoomDims) {
      drawDimLine(tCtx, 0, 0, window.room.w, 0, `会場全幅 W: ${window.room.w}`, -450, false);
      drawDimLine(tCtx, 0, 0, 0, window.room.d, `会場奥行 D: ${window.room.d}`, -450, true);
    }
  }

  if (window.tabFacilityModule && typeof window.tabFacilityModule.drawTop === 'function') {
    window.tabFacilityModule.drawTop(tCtx);
  } else {
    tCtx.save();
    tCtx.strokeStyle = window.isStageLocked ? '#000000' : '#2563eb';
    tCtx.lineWidth = 60;
    tCtx.fillStyle = '#f8fafc';
    tCtx.fillRect(window.stage.x, window.stage.y, window.stage.w, window.stage.d);
    tCtx.strokeRect(window.stage.x, window.stage.y, window.stage.w, window.stage.d);
    tCtx.fillStyle = 'rgba(15, 23, 42, 0.08)';
    tCtx.font = '900 450px sans-serif';
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';
    tCtx.fillText('STAGE', window.stage.x + window.stage.w / 2, window.stage.y + window.stage.d / 2);
    tCtx.restore();
  }

  if (window.tabPodiumModule && typeof window.tabPodiumModule.drawTop === 'function') window.tabPodiumModule.drawTop(tCtx);
  if (window.tabStageItemsModule && typeof window.tabStageItemsModule.drawTop === 'function') window.tabStageItemsModule.drawTop(tCtx);
  if (window.tabGuestsModule && typeof window.tabGuestsModule.drawTop === 'function') window.tabGuestsModule.drawTop(tCtx);
  if (window.tabMonitorModule && typeof window.tabMonitorModule.drawTop === 'function') window.tabMonitorModule.drawTop(tCtx);
  if (window.tabSeatsModule && typeof window.tabSeatsModule.drawTop === 'function') window.tabSeatsModule.drawTop(tCtx);
  if (window.tabEquipmentModule && typeof window.tabEquipmentModule.drawTop === 'function') window.tabEquipmentModule.drawTop(tCtx);
  if (window.tabCameraModule && typeof window.tabCameraModule.drawTop === 'function') window.tabCameraModule.drawTop(tCtx);
  if (window.tabDisplayModule && typeof window.tabDisplayModule.drawTop === 'function') window.tabDisplayModule.drawTop(tCtx);
}

function renderSidePlanTo(tCtx) {
  tCtx.save();
  // 横スクロールベースの立面図共通背景・グリッド
  tCtx.strokeStyle = '#f1f5f9';
  tCtx.lineWidth = 20;
  for (let y = 0; y <= window.room.d; y += 2000) {
    tCtx.beginPath();
    tCtx.moveTo(y, 1000);
    tCtx.lineTo(y, -4000);
    tCtx.stroke();
  }
  for (let z = 0; z <= 4000; z += 1000) {
    tCtx.beginPath();
    tCtx.moveTo(0, -z);
    tCtx.lineTo(window.room.d, -z);
    tCtx.stroke();
  }

  // 床ライン
  tCtx.beginPath();
  tCtx.moveTo(-1000, 0);
  tCtx.lineTo(window.room.d + 1000, 0);
  tCtx.strokeStyle = '#000000';
  tCtx.lineWidth = 60;
  tCtx.stroke();
  tCtx.restore();

  // モジュール呼び出し（断面Xスライス方式から、単なるdrawSide方式へ変更を想定）
  // ※各タブモジュール側も初期モデルと同様の横スクロール描画になっていることを前提とします。
  if (window.tabRoomModule && typeof window.tabRoomModule.drawSide === 'function') window.tabRoomModule.drawSide(tCtx);
  if (window.tabFacilityModule && typeof window.tabFacilityModule.drawSide === 'function') window.tabFacilityModule.drawSide(tCtx);
  if (window.tabPodiumModule && typeof window.tabPodiumModule.drawSide === 'function') window.tabPodiumModule.drawSide(tCtx);
  if (window.tabGuestsModule && typeof window.tabGuestsModule.drawSide === 'function') window.tabGuestsModule.drawSide(tCtx);
  if (window.tabMonitorModule && typeof window.tabMonitorModule.drawSide === 'function') window.tabMonitorModule.drawSide(tCtx);
  if (window.tabSeatsModule && typeof window.tabSeatsModule.drawSide === 'function') window.tabSeatsModule.drawSide(tCtx);
  if (window.tabCameraModule && typeof window.tabCameraModule.drawSide === 'function') window.tabCameraModule.drawSide(tCtx);
}

function drawGrid(tCtx) {
  tCtx.save();
  tCtx.strokeStyle = '#f1f5f9';
  tCtx.lineWidth = 15;
  for (let x = 0; x <= window.room.w; x += 1000) {
    tCtx.beginPath();
    tCtx.moveTo(x, 0);
    tCtx.lineTo(x, window.room.d);
    tCtx.stroke();
  }
  for (let y = 0; y <= window.room.d; y += 1000) {
    tCtx.beginPath();
    tCtx.moveTo(0, y);
    tCtx.lineTo(window.room.w, y);
    tCtx.stroke();
  }

  tCtx.strokeStyle = '#e2e8f0';
  tCtx.lineWidth = 30;
  for (let x = 0; x <= window.room.w; x += 5000) {
    tCtx.beginPath();
    tCtx.moveTo(x, 0);
    tCtx.lineTo(x, window.room.d);
    tCtx.stroke();
  }
  for (let y = 0; y <= window.room.d; y += 5000) {
    tCtx.beginPath();
    tCtx.moveTo(0, y);
    tCtx.lineTo(window.room.w, y);
    tCtx.stroke();
  }
  tCtx.restore();
}

function drawDimLine(tCtx, x1, y1, x2, y2, text, offset = 0, isVertical = false) {
  tCtx.save();
  tCtx.strokeStyle = '#0f172a';
  tCtx.fillStyle = '#0f172a';
  tCtx.lineWidth = 15;
  tCtx.font = 'bold 200px sans-serif';
  tCtx.textAlign = 'center';
  tCtx.textBaseline = 'middle';
  const tick = 80;

  if (!isVertical) {
    const lineY = y1 + offset;
    tCtx.beginPath();
    tCtx.moveTo(x1, lineY);
    tCtx.lineTo(x2, lineY);
    tCtx.moveTo(x1, lineY - tick);
    tCtx.lineTo(x1, lineY + tick);
    tCtx.moveTo(x2, lineY - tick);
    tCtx.lineTo(x2, lineY + tick);

    if (Math.abs(offset) > 100) {
      tCtx.strokeStyle = '#94a3b8';
      tCtx.lineWidth = 10;
      tCtx.moveTo(x1, y1);
      tCtx.lineTo(x1, lineY);
      tCtx.moveTo(x2, y2);
      tCtx.lineTo(x2, lineY);
    }
    tCtx.stroke();
    tCtx.fillText(text, (x1 + x2) / 2, lineY - 140);
  } else {
    const lineX = x1 + offset;
    tCtx.beginPath();
    tCtx.moveTo(lineX, y1);
    tCtx.lineTo(lineX, y2);
    tCtx.moveTo(lineX - tick, y1);
    tCtx.lineTo(lineX + tick, y1);
    tCtx.moveTo(lineX - tick, y2);
    tCtx.lineTo(lineX + tick, y2);

    if (Math.abs(offset) > 100) {
      tCtx.strokeStyle = '#94a3b8';
      tCtx.lineWidth = 10;
      tCtx.moveTo(x1, y1);
      tCtx.lineTo(lineX, y1);
      tCtx.moveTo(x2, y2);
      tCtx.lineTo(lineX, y2);
    }
    tCtx.stroke();

    tCtx.save();
    tCtx.translate(lineX - 140, (y1 + y2) / 2);
    tCtx.rotate(-Math.PI / 2);
    tCtx.fillText(text, 0, 0);
    tCtx.restore();
  }
  tCtx.restore();
}

function renderSelectionBox(targetCtx) {
  const left = Math.min(boxSelectStart.x, boxSelectEnd.x);
  const top = Math.min(boxSelectStart.y, boxSelectEnd.y);
  const width = Math.abs(boxSelectEnd.x - boxSelectStart.x);
  const height = Math.abs(boxSelectEnd.y - boxSelectStart.y);

  targetCtx.save();
  targetCtx.strokeStyle = '#2563eb';
  targetCtx.lineWidth = 1.5;
  targetCtx.setLineDash([4, 4]);
  targetCtx.fillStyle = 'rgba(37, 99, 235, 0.12)';
  targetCtx.fillRect(left, top, width, height);
  targetCtx.strokeRect(left, top, width, height);
  targetCtx.restore();
}

// ==============================================
// 4. イベント & 操作管理 (マウス・キーボード・ズーム)
// ==============================================
function setupCanvasEvents() {
  if (!canvas) return;

  canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - panX) / scale;
    const wy = (my - panY) / scale;

    const moduleHitList = [
      'tabCameraModule', 'tabSeatsModule', 'tabMonitorModule',
      'tabGuestsModule', 'tabStageItemsModule', 'tabPodiumModule',
      'tabFacilityModule', 'tabRoomModule', 'tabBgimageModule'
    ];

    for (const mKey of moduleHitList) {
      if (window[mKey] && typeof window[mKey].hitTest === 'function') {
        const target = window[mKey].hitTest(wx, wy);
        if (target) {
          dragTarget = { ...target, module: window[mKey] };
          requestRender();
          return;
        }
      }
    }

    if (!window.isStageLocked &&
        wx >= window.stage.x && wx <= window.stage.x + window.stage.w &&
        wy >= window.stage.y && wy <= window.stage.y + window.stage.d) {
      dragTarget = { type: 'stage', offsetX: wx - window.stage.x, offsetY: wy - window.stage.y };
      switchTab('facility');
      return;
    }

    if (e.shiftKey && viewMode === 'top') {
      isBoxSelecting = true;
      boxSelectStart = { x: mx, y: my };
      boxSelectEnd = { x: mx, y: my };
      return;
    }
  });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - panX) / scale;
    const wy = (my - panY) / scale;

    if (dragTarget) {
      if (dragTarget.module && typeof dragTarget.module.handleDrag === 'function') {
        dragTarget.module.handleDrag(dragTarget, wx, wy);
        requestRender();
        return;
      }
      if (dragTarget.type === 'stage' && !window.isStageLocked) {
        window.stage.x = Math.round(wx - dragTarget.offsetX);
        window.stage.y = Math.round(wy - dragTarget.offsetY);
        syncCoreInputs();
        requestRender();
        return;
      }
    }

    if (isBoxSelecting) {
      boxSelectEnd = { x: mx, y: my };
      requestRender();
      return;
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragTarget) {
      saveHistory();
      dragTarget = null;
    }
    if (isBoxSelecting) {
      isBoxSelecting = false;
      const wx1 = (Math.min(boxSelectStart.x, boxSelectEnd.x) - panX) / scale;
      const wy1 = (Math.min(boxSelectStart.y, boxSelectEnd.y) - panY) / scale;
      const wx2 = (Math.max(boxSelectStart.x, boxSelectEnd.x) - panX) / scale;
      const wy2 = (Math.max(boxSelectStart.y, boxSelectEnd.y) - panY) / scale;
      
      if (window.tabSeatsModule && typeof window.tabSeatsModule.selectInBox === 'function') {
        window.tabSeatsModule.selectInBox(wx1, wy1, wx2, wy2);
      }
      requestRender();
    }
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    adjustZoom(zoomFactor);
  }, { passive: false });
}

function setupKeyShortcuts() {
  window.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); openSaveModal(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (window.tabSeatsModule && typeof window.tabSeatsModule.deleteSelected === 'function') window.tabSeatsModule.deleteSelected();
    }
  });
}

// ==============================================================================
// 5. 視点・ズーム・配置制御 (UI被り防止・立面図底面引き上げ)
// ==============================================================================
function setViewMode(mode) {
  viewMode = mode;
  document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
  const targetBtn = document.getElementById(`btn-${mode}`);
  if (targetBtn) targetBtn.classList.add('active');

  const sliceBar = document.getElementById('side-scrollbar-container');
  if (sliceBar) sliceBar.style.display = (mode === 'side') ? 'flex' : 'none';

  const badge = document.getElementById('viewModeBadge');
  if (badge) badge.innerText = (mode === 'top') ? '🗺️ 平面図' : '📐 立面図';

  resetView();
}

function adjustZoom(factor) {
  zoomLevel = Math.max(0.15, Math.min(5.0, zoomLevel * factor));
  scale = (viewMode === 'top' ? BASE_SCALE_TOP : BASE_SCALE_SIDE) * zoomLevel;
  
  const badge = document.getElementById('zoomBadge');
  if (badge) badge.innerText = `${Math.round(zoomLevel * 100)}%`;

  requestRender();
}

// 100%ボタン専用関数 (setZoom100)
function setZoom100() {
  zoomLevel = 1.0;
  scale = (viewMode === 'top' ? BASE_SCALE_TOP : BASE_SCALE_SIDE) * zoomLevel;

  const badge = document.getElementById('zoomBadge');
  if (badge) badge.innerText = '100%';

  if (canvas) {
    if (viewMode === 'top') {
      // ★修正: パレット（右側約390px）と左上の情報パネル（約300px）を避けた空きスペースの中央へ配置
      const availW = canvas.width - 400; // パレット分引く
      panX = (availW - window.room.w * scale) / 2 + 30; // やや右へオフセット
      panY = Math.max(140, (canvas.height - window.room.d * scale) / 2); // 上部UIを避ける
    } else {
      // ★修正: 立面図の床面を上に引き上げ (canvas.heightの55%〜60%付近へ)
      panX = 60;
      panY = canvas.height * 0.58; 
      const range = document.getElementById('side-scroll-range');
      if (range) range.value = 0;
      const disp = document.getElementById('sideScrollValDisplay');
      if (disp) disp.innerText = '0.0m';
    }
  }
  requestRender();
}

// 全体ボタン専用関数 (fitView)
function fitView() {
  resetView();
}

function resetView() {
  if (!canvas) return;

  if (viewMode === 'top') {
    const availW = canvas.width - 400; 
    const availH = canvas.height - 140; 
    const fitScaleX = availW / window.room.w;
    const fitScaleY = availH / window.room.d;
    zoomLevel = (Math.min(fitScaleX, fitScaleY) * 0.92) / BASE_SCALE_TOP;
    scale = BASE_SCALE_TOP * zoomLevel;
    panX = (availW - window.room.w * scale) / 2 + 30;
    panY = (canvas.height - window.room.d * scale) / 2;
  } else {
    const availW = canvas.width - 400;
    zoomLevel = (availW / window.room.d * 0.90) / BASE_SCALE_SIDE;
    scale = BASE_SCALE_SIDE * zoomLevel;
    panX = 60;
    // ★修正: 立面図の床面を上に引き上げ
    panY = canvas.height * 0.58;
    const range = document.getElementById('side-scroll-range');
    if (range) range.value = 0;
    const disp = document.getElementById('sideScrollValDisplay');
    if (disp) disp.innerText = '0.0m';
  }

  const badge = document.getElementById('zoomBadge');
  if (badge) badge.innerText = `${Math.round(zoomLevel * 100)}%`;

  requestRender();
}

function resizeCanvas() {
  const container = document.getElementById('main-container');
  if (!container || !canvas) return;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  requestRender();
}

// ★修正：立面図横スクロール処理（HTML側の <input type="range" id="side-scroll-range" oninput="onSideScrollChange()"> と連動）
window.onSideScrollChange = function() {
  const range = document.getElementById('side-scroll-range');
  if (!range) return;
  const val = parseFloat(range.value) || 0;
  panX = 60 - val * scale; // スクロール量に応じてpanXを移動
  const disp = document.getElementById('sideScrollValDisplay');
  if (disp) disp.innerText = `${(val / 1000).toFixed(1)}m`;
  requestRender();
};

window.stepSideScroll = function(delta) {
  const range = document.getElementById('side-scroll-range');
  if (!range) return;
  let val = parseFloat(range.value) + delta;
  val = Math.max(0, Math.min(window.room.d, val)); // 最大値は奥行(d)
  range.value = val;
  window.onSideScrollChange();
};

function toggleFov() {
  window.displaySettings.showFov = !window.displaySettings.showFov;
  const btn = document.getElementById('btn-fov');
  if (btn) btn.innerText = window.displaySettings.showFov ? '👁️ 画角・視線: ON' : '👁️ 画角・視線: OFF';
  requestRender();
}

// ==============================================================================
// 6. フローティングパレット & タブ切り替え
// ==============================================================================
function setupFloatingUI() {
  const floatUi = document.getElementById('floating-ui');
  const floatHeader = document.getElementById('floating-header');
  if (!floatUi || !floatHeader) return;

  floatUi.addEventListener('mousedown', e => e.stopPropagation());
  floatUi.addEventListener('wheel', e => e.stopPropagation(), { passive: false });

  let isDraggingUi = false;
  let startX = 0;
  let startY = 0;
  let initLeft = 0;
  let initTop = 0;

  floatHeader.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON' || e.target.classList.contains('ctrl-btn')) return;

    isDraggingUi = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = floatUi.getBoundingClientRect();
    const parent = floatUi.offsetParent || document.body;
    const parentRect = parent.getBoundingClientRect();

    initLeft = rect.left - parentRect.left;
    initTop = rect.top - parentRect.top;

    floatUi.style.right = 'auto'; 
    floatUi.style.left = `${initLeft}px`;
    floatUi.style.top = `${initTop}px`;

    document.body.style.userSelect = 'none';

    function onMouseMove(m) {
      if (!isDraggingUi) return;
      const dx = m.clientX - startX;
      const dy = m.clientY - startY;

      let newLeft = initLeft + dx;
      let newTop = initTop + dy;

      const maxLeft = window.innerWidth - floatUi.offsetWidth - 10;
      const maxTop = window.innerHeight - 60;
      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      floatUi.style.left = `${newLeft}px`;
      floatUi.style.top = `${newTop}px`;
    }

    function onMouseUp() {
      if (isDraggingUi) {
        isDraggingUi = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = 'auto';
      }
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function togglePalette() {
  const el = document.getElementById('floating-ui');
  if (!el) return;
  el.style.display = (el.style.display === 'none') ? 'flex' : 'none';
}

let isUiCollapsed = false;
function toggleFloatingUi() {
  const body = document.getElementById('floating-body');
  const btn = document.getElementById('btn-collapse');
  if (!body) return;
  isUiCollapsed = !isUiCollapsed;
  body.style.display = isUiCollapsed ? 'none' : 'flex';
  if (btn) btn.innerText = isUiCollapsed ? '＋' : '－';
}

function switchTab(tabKey) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const activeBtn = document.getElementById(`tabbtn-${tabKey}`);
  const activePanel = document.getElementById(`panel-${tabKey}`);

  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');

  if (isUiCollapsed) toggleFloatingUi();
}

// ==============================================================================
// 7. データ同期 & HUDサマリー
// ==============================================================================
function syncCoreInputs() {
  const roomWInput = document.getElementById('roomW');
  const roomDInput = document.getElementById('roomD');
  if (roomWInput) roomWInput.value = window.room.w;
  if (roomDInput) roomDInput.value = window.room.d;

  const stageWInput = document.getElementById('stageW');
  const stageDInput = document.getElementById('stageD');
  const stageHInput = document.getElementById('stageH');
  const stageXInput = document.getElementById('stageX');
  const stageYInput = document.getElementById('stageY');
  const stageLock = document.getElementById('stageLockCheck');

  if (stageWInput) stageWInput.value = window.stage.w;
  if (stageDInput) stageDInput.value = window.stage.d;
  if (stageHInput) stageHInput.value = window.stage.h;
  if (stageXInput) stageXInput.value = window.stage.x;
  if (stageYInput) stageYInput.value = window.stage.y;
  if (stageLock) stageLock.checked = window.isStageLocked;
}

function updateStats() {
  const statRoom = document.getElementById('statRoom');
  const statStage = document.getElementById('statStage');
  const statSeats = document.getElementById('statSeats');

  if (statRoom) statRoom.innerText = `${(window.room.w / 1000).toFixed(1)}m × ${(window.room.d / 1000).toFixed(1)}m`;
  if (statStage) statStage.innerText = `W:${(window.stage.w / 1000).toFixed(1)}m D:${(window.stage.d / 1000).toFixed(1)}m (H:${window.stage.h}mm)`;

  if (window.tabSeatsModule && typeof window.tabSeatsModule.getStats === 'function') {
    const seatStats = window.tabSeatsModule.getStats();
    if (statSeats) statSeats.innerText = `${seatStats.total || 0}席`;
    const statClear = document.getElementById('statClear');
    const statPartial = document.getElementById('statPartial');
    if (statClear) statClear.innerText = `${seatStats.clear || 0} 席`;
    if (statPartial) statPartial.innerText = `${seatStats.blocked || 0} 席`;
  }
}

// ==============================================================================
// 8. 画像出力 & JSON保存・読込モーダル
// ==============================================================================
function exportCanvasImage() {
  const expCanvas = document.createElement('canvas');
  const expW = 2400;
  const expH = 1350;
  expCanvas.width = expW;
  expCanvas.height = expH;
  const expCtx = expCanvas.getContext('2d');

  expCtx.fillStyle = '#ffffff';
  expCtx.fillRect(0, 0, expW, expH);

  expCtx.save();
  if (viewMode === 'top') {
    const fitScaleX = (expW - 200) / window.room.w;
    const fitScaleY = (expH - 260) / window.room.d;
    const expScale = Math.min(fitScaleX, fitScaleY);
    const expPanX = (expW - window.room.w * expScale) / 2;
    const expPanY = 130;
    expCtx.translate(expPanX, expPanY);
    expCtx.scale(expScale, expScale);
    renderTopPlanTo(expCtx);
  } else {
    const expScale = (expW - 240) / window.room.d;
    const expPanX = 120;
    const expPanY = expH * 0.62;
    expCtx.translate(expPanX, expPanY);
    expCtx.scale(expScale, expScale);
    renderSidePlanTo(expCtx);
  }
  expCtx.restore();

  expCtx.fillStyle = '#0f172a';
  expCtx.font = 'bold 32px sans-serif';
  expCtx.fillText(`会場図面シミュレーター 【${viewMode === 'top' ? '平面図 (俯瞰レイアウト)' : '立面図 (ENG視界断面)'}】`, 50, 50);

  expCtx.font = '16px sans-serif';
  expCtx.fillStyle = '#64748b';
  expCtx.fillText(`会場外郭: ${window.room.w}×${window.room.d}mm | ステージ: ${window.stage.w}×${window.stage.d}mm (H:${window.stage.h}mm)`, 50, 85);

  const link = document.createElement('a');
  link.download = `StagePlan_${viewMode === 'top' ? 'Top' : 'Side'}_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = expCanvas.toDataURL('image/png');
  link.click();
}

function openSaveModal() {
  const modal = document.getElementById('saveModal');
  if (modal) modal.style.display = 'flex';
}

function closeSaveModal() {
  const modal = document.getElementById('saveModal');
  if (modal) modal.style.display = 'none';
}

function confirmSaveJson() {
  const fnInput = document.getElementById('modalFileName');
  let fn = fnInput ? fnInput.value : 'Venue_Layout_Mark2.json';
  if (!fn.endsWith('.json')) fn += '.json';

  const snapshot = getCurrentStateSnapshot();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fn;
  a.click();
  closeSaveModal();
}

function importJson(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      applyStateSnapshot(data);
      saveHistory();
    } catch (err) {
      alert('JSONファイルの読み込みに失敗しました。');
      console.error(err);
    }
  };
  reader.readAsText(file);
}

// ==============================================================================
// 9. エンジン初期化エントリポイント
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('simCanvas');
  if (canvas) {
    ctx = canvas.getContext('2d');
  }

  setupFloatingUI();
  setupCanvasEvents();
  setupKeyShortcuts();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  syncCoreInputs();
  setZoom100(); 
  saveHistory();
});