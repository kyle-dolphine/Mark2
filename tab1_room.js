/**
 * ============================================================================
 * ENG Sightline & Stage Simulator Mark2
 * モジュール：【ノート1：会場】 tab1_room.js
 * 
 * 担当機能：
 *  - 会場基本寸法（幅×奥行）
 *  - 多角形成形（正多角形・L字プリセット、辺の増減、頂点マウスドラッグ）
 *  - 壁吸着扉（片開き左右、両開き、閉鎖、壁面スナップ・スライドドラッグ）
 *  - 平面図（外郭・寸法線・扉）・立面図（床・天井境界）レンダリング
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. データモデル初期化 (共通グローバル空間への登録)
  // ==========================================================================
  window.room = window.room || {
    w: 14000,
    d: 26000,
    ceilingH: 5000, // 天井高 (mm)
    shapeType: 'rect', // 'rect' | 'polygon'
    points: [
      { x: 0, y: 0 },
      { x: 14000, y: 0 },
      { x: 14000, y: 26000 },
      { x: 0, y: 26000 }
    ],
    edges: [
      { len: 14000, angle: 0 },
      { len: 26000, angle: 90 },
      { len: 14000, angle: 180 },
      { len: 26000, angle: 270 }
    ]
  };

  window.doors = window.doors || [
    { id: 'D1', name: '正面主搬入口', type: 'double', width: 1800, edgeIndex: 2, offsetRatio: 0.5, status: 'open' },
    { id: 'D2', name: '上手袖扉', type: 'single_left', width: 900, edgeIndex: 1, offsetRatio: 0.15, status: 'open' }
  ];

  window.selectedDoorId = window.selectedDoorId || 'D1';

  // ==========================================================================
  // 2. UIテンプレート自動生成 (#panel-room へのインジェクション)
  // ==========================================================================
  function injectRoomUI() {
    const container = document.getElementById('panel-room');
    if (!container) return;

    container.innerHTML = `
      <!-- 会場基本寸法 -->
      <div class="ui-group">
        <div class="ui-group-title">
          <span>🏛 会場外形 & 形状タイプ</span>
          <select id="roomShapeType" style="font-size:11px; padding:1px 4px;">
            <option value="rect" ${window.room.shapeType === 'rect' ? 'selected' : ''}>四角形 (基本)</option>
            <option value="polygon" ${window.room.shapeType === 'polygon' ? 'selected' : ''}>多角形成形 (カスタム)</option>
          </select>
        </div>

        <!-- 四角形寸法 -->
        <div class="ui-row" id="roomBasicDimsRow" style="${window.room.shapeType === 'polygon' ? 'display:none;' : ''}">
          <div class="input-box">
            <label>間口幅 (X mm)</label>
            <input type="number" id="roomW" value="${window.room.w}" step="500">
          </div>
          <div class="input-box">
            <label>奥行 (Y mm)</label>
            <input type="number" id="roomD" value="${window.room.d}" step="500">
          </div>
          <div class="input-box">
            <label>天井高 (CH mm)</label>
            <input type="number" id="roomCH" value="${window.room.ceilingH}" step="100">
          </div>
        </div>

        <!-- 多角形成形コントロール -->
        <div id="polygonConfigGroup" style="${window.room.shapeType === 'polygon' ? 'display:block;' : 'display:none;'} margin-top:6px;">
          <div class="ui-row">
            <div class="input-box">
              <label style="color:#0284c7; font-weight:bold;">多角形プリセット</label>
              <select id="polyEdgeCount">
                <option value="3">3角形 (三角形)</option>
                <option value="4" selected>4角形 (四角形)</option>
                <option value="5">5角形 (五角形)</option>
                <option value="6">6角形 (六角形)</option>
                <option value="8">8角形 (八角形)</option>
                <option value="L">L字型 (変形6角形)</option>
              </select>
            </div>
            <div class="input-box" style="justify-content:flex-end; gap:4px;">
              <button class="btn-action" id="btnAddVertex" style="font-size:10px; padding:3px 6px;">＋ 頂点追加</button>
              <button class="btn-action" id="btnResetRect" style="font-size:10px; padding:3px 6px; background:#f1f5f9; color:#0369a1;">四角リセット</button>
            </div>
          </div>
          <div style="font-size:10px; color:#64748b; margin-top:4px;">
            💡 図面上の「青丸ハンドル」をマウスドラッグして自由に角を曲げられます。
          </div>
        </div>
      </div>

      <!-- 扉・搬入口 (壁面吸着スナップ) -->
      <div class="ui-group">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>🚪 扉・搬入口 (壁面密着スナップ)</span>
          <div style="display:flex; gap:4px;">
            <button class="btn-action" id="btnAddDoor" style="padding:2px 6px; font-size:10px;">＋ 扉追加</button>
            <button class="btn-action btn-danger" id="btnDeleteDoor" style="padding:2px 6px; font-size:10px;">削除</button>
          </div>
        </div>

        <div class="ui-row full">
          <div class="input-box">
            <label>選択中の扉</label>
            <select id="doorSelect"></select>
          </div>
        </div>

        <div id="doorEditSection">
          <div class="ui-row">
            <div class="input-box">
              <label>扉名称</label>
              <input type="text" id="doorName" value="扉">
            </div>
            <div class="input-box">
              <label>扉の種別</label>
              <select id="doorType">
                <option value="single_left">片開き (左開き)</option>
                <option value="single_right">片開き (右開き)</option>
                <option value="double">2枚 (両開き)</option>
                <option value="closed">閉鎖 (開閉不可)</option>
              </select>
            </div>
          </div>

          <div class="ui-row">
            <div class="input-box">
              <label>開口幅 (W mm)</label>
              <input type="number" id="doorWidth" value="1200" step="100">
            </div>
            <div class="input-box">
              <label style="color:#0284c7; font-weight:bold;">設置する壁 (辺)</label>
              <select id="doorWallSelect"></select>
            </div>
          </div>

          <div class="ui-row">
            <div class="input-box" style="flex:1;">
              <label>壁上の位置: <span id="doorRatioDisplay" style="font-weight:bold; color:#0284c7;">50%</span></label>
              <input type="range" id="doorWallRatio" min="5" max="95" step="1" value="50">
            </div>
          </div>

          <div style="font-size:10px; color:#64748b; margin-top:2px;">
            💡 図面上の扉をドラッグすると、最寄りの壁に自動吸着してスライドします。
          </div>
        </div>
      </div>
    `;

    bindRoomUIEvents();
    updateDoorUIList();
    updateDoorWallSelectOptions();
  }

  // ==========================================================================
  // 3. UIイベントリスナー登録
  // ==========================================================================
  function bindRoomUIEvents() {
    // 形状タイプ切替
    document.getElementById('roomShapeType').addEventListener('change', function (e) {
      pushUndo();
      window.room.shapeType = e.target.value;
      const isPoly = (window.room.shapeType === 'polygon');
      document.getElementById('roomBasicDimsRow').style.display = isPoly ? 'none' : 'grid';
      document.getElementById('polygonConfigGroup').style.display = isPoly ? 'block' : 'none';

      if (isPoly && window.room.points.length < 3) {
        applyPolygonPreset('4');
      }
      recalculateRoomBounds();
      updateDoorWallSelectOptions();
      triggerRender();
    });

    // 四角形寸法変更
    const onDimChange = function () {
      pushUndo();
      window.room.w = parseFloat(document.getElementById('roomW').value) || 14000;
      window.room.d = parseFloat(document.getElementById('roomD').value) || 26000;
      window.room.ceilingH = parseFloat(document.getElementById('roomCH').value) || 5000;
      if (window.room.shapeType === 'rect') {
        window.room.points = [
          { x: 0, y: 0 },
          { x: window.room.w, y: 0 },
          { x: window.room.w, y: window.room.d },
          { x: 0, y: window.room.d }
        ];
      }
      recalculateRoomBounds();
      updateDoorWallSelectOptions();
      triggerRender();
    };

    document.getElementById('roomW').addEventListener('change', onDimChange);
    document.getElementById('roomD').addEventListener('change', onDimChange);
    document.getElementById('roomCH').addEventListener('change', onDimChange);

    // 多角形プリセット
    document.getElementById('polyEdgeCount').addEventListener('change', function (e) {
      pushUndo();
      applyPolygonPreset(e.target.value);
    });

    // 頂点追加 / リセット
    document.getElementById('btnAddVertex').addEventListener('click', function () {
      pushUndo();
      addPolygonVertex();
    });

    document.getElementById('btnResetRect').addEventListener('click', function () {
      pushUndo();
      window.room.shapeType = 'rect';
      document.getElementById('roomShapeType').value = 'rect';
      document.getElementById('roomBasicDimsRow').style.display = 'grid';
      document.getElementById('polygonConfigGroup').style.display = 'none';
      window.room.points = [
        { x: 0, y: 0 },
        { x: window.room.w, y: 0 },
        { x: window.room.w, y: window.room.d },
        { x: 0, y: window.room.d }
      ];
      recalculateRoomBounds();
      updateDoorWallSelectOptions();
      triggerRender();
    });

    // 扉操作
    document.getElementById('btnAddDoor').addEventListener('click', addNewDoor);
    document.getElementById('btnDeleteDoor').addEventListener('click', deleteSelectedDoor);
    document.getElementById('doorSelect').addEventListener('change', function (e) {
      window.selectedDoorId = e.target.value;
      syncSelectedDoorToUI();
      triggerRender();
    });

    const onDoorParamChange = function () {
      const d = window.doors.find(item => item.id === window.selectedDoorId);
      if (!d) return;
      pushUndo();
      d.name = document.getElementById('doorName').value.trim() || '扉';
      d.type = document.getElementById('doorType').value;
      d.width = parseFloat(document.getElementById('doorWidth').value) || 1000;
      d.edgeIndex = parseInt(document.getElementById('doorWallSelect').value, 10) || 0;
      d.offsetRatio = (parseFloat(document.getElementById('doorWallRatio').value) || 50) / 100;
      document.getElementById('doorRatioDisplay').innerText = Math.round(d.offsetRatio * 100) + '%';
      updateDoorUIList();
      triggerRender();
    };

    document.getElementById('doorName').addEventListener('input', onDoorParamChange);
    document.getElementById('doorType').addEventListener('change', onDoorParamChange);
    document.getElementById('doorWidth').addEventListener('change', onDoorParamChange);
    document.getElementById('doorWallSelect').addEventListener('change', onDoorParamChange);
    document.getElementById('doorWallRatio').addEventListener('input', function (e) {
      document.getElementById('doorRatioDisplay').innerText = e.target.value + '%';
      onDoorParamChange();
    });
  }

  // ==========================================================================
  // 4. 多角形成形ロジック
  // ==========================================================================
  function applyPolygonPreset(preset) {
    const cx = window.room.w / 2;
    const cy = window.room.d / 2;
    const rx = window.room.w * 0.45;
    const ry = window.room.d * 0.45;

    if (preset === 'L') {
      window.room.points = [
        { x: 0, y: 0 },
        { x: window.room.w, y: 0 },
        { x: window.room.w, y: window.room.d * 0.55 },
        { x: window.room.w * 0.45, y: window.room.d * 0.55 },
        { x: window.room.w * 0.45, y: window.room.d },
        { x: 0, y: window.room.d }
      ];
    } else {
      const n = parseInt(preset, 10);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI / n) * i - Math.PI / 2;
        pts.push({
          x: Math.round(cx + rx * Math.cos(angle)),
          y: Math.round(cy + ry * Math.sin(angle))
        });
      }
      window.room.points = pts;
    }
    recalculateRoomBounds();
    updateDoorWallSelectOptions();
    triggerRender();
  }

  function addPolygonVertex() {
    const pts = window.room.points;
    if (pts.length < 3) return;
    const last = pts[pts.length - 1];
    const first = pts[0];
    pts.push({
      x: Math.round((last.x + first.x) / 2),
      y: Math.round((last.y + first.y) / 2)
    });
    recalculateRoomBounds();
    updateDoorWallSelectOptions();
    triggerRender();
  }

  function recalculateRoomBounds() {
    const pts = window.room.points;
    if (!pts || pts.length === 0) return;
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    // 原点(0,0)へシフト正規化
    pts.forEach(p => { p.x -= minX; p.y -= minY; });
    window.room.w = Math.max(1000, maxX - minX);
    window.room.d = Math.max(1000, maxY - minY);

    const rw = document.getElementById('roomW');
    const rd = document.getElementById('roomD');
    if (rw) rw.value = Math.round(window.room.w);
    if (rd) rd.value = Math.round(window.room.d);

    // サマリー表示の更新
    const statRoom = document.getElementById('statRoom');
    if (statRoom) statRoom.innerText = `${(window.room.w / 1000).toFixed(1)}m × ${(window.room.d / 1000).toFixed(1)}m`;
  }

  // ==========================================================================
  // 5. 扉制御・幾何計算 (壁面吸着 & 最寄りスナップ)
  // ==========================================================================
  function updateDoorWallSelectOptions() {
    const sel = document.getElementById('doorWallSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const numEdges = window.room.points.length;
    for (let i = 0; i < numEdges; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `壁(辺) ${i + 1}`;
      sel.appendChild(opt);
    }
  }

  function updateDoorUIList() {
    const sel = document.getElementById('doorSelect');
    if (!sel) return;
    sel.innerHTML = '';
    window.doors.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name} (${d.width}mm)`;
      sel.appendChild(opt);
    });
    sel.value = window.selectedDoorId;
    syncSelectedDoorToUI();
  }

  function syncSelectedDoorToUI() {
    const d = window.doors.find(item => item.id === window.selectedDoorId);
    if (!d) return;
    const dn = document.getElementById('doorName');
    const dt = document.getElementById('doorType');
    const dw = document.getElementById('doorWidth');
    const dws = document.getElementById('doorWallSelect');
    const dwr = document.getElementById('doorWallRatio');
    const drd = document.getElementById('doorRatioDisplay');

    if (dn) dn.value = d.name;
    if (dt) dt.value = d.type;
    if (dw) dw.value = d.width;
    if (dws) dws.value = d.edgeIndex;
    const ratioVal = Math.round((d.offsetRatio || 0.5) * 100);
    if (dwr) dwr.value = ratioVal;
    if (drd) drd.innerText = ratioVal + '%';
  }

  function addNewDoor() {
    pushUndo();
    const newId = 'D' + Date.now();
    window.doors.push({
      id: newId,
      name: `扉 ${window.doors.length + 1}`,
      type: 'single_left',
      width: 1000,
      edgeIndex: 0,
      offsetRatio: 0.5,
      status: 'open'
    });
    window.selectedDoorId = newId;
    updateDoorUIList();
    triggerRender();
  }

  function deleteSelectedDoor() {
    if (window.doors.length <= 1) {
      alert('これ以上扉を削除できません。');
      return;
    }
    pushUndo();
    window.doors = window.doors.filter(d => d.id !== window.selectedDoorId);
    window.selectedDoorId = window.doors[0].id;
    updateDoorUIList();
    triggerRender();
  }

  // 辺の始点・終点と比率から扉の絶対座標と壁の角度を計算
  function getDoorTransform(door) {
    const pts = window.room.points;
    const n = pts.length;
    const eIdx = (door.edgeIndex >= 0 && door.edgeIndex < n) ? door.edgeIndex : 0;
    const p1 = pts[eIdx];
    const p2 = pts[(eIdx + 1) % n];

    const ratio = Math.max(0.05, Math.min(0.95, door.offsetRatio || 0.5));
    const x = p1.x + (p2.x - p1.x) * ratio;
    const y = p1.y + (p2.y - p1.y) * ratio;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;

    return { x, y, angle, length: Math.hypot(p2.x - p1.x, p2.y - p1.y) };
  }

  // マウス座標から最も近い壁（辺）を探してスナップ＆比率を算出
  function snapDoorToNearestEdge(door, wx, wy) {
    const pts = window.room.points;
    const n = pts.length;
    let bestDist = Infinity;
    let bestEdge = 0;
    let bestRatio = 0.5;

    for (let i = 0; i < n; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) continue;

      let t = ((wx - p1.x) * dx + (wy - p1.y) * dy) / l2;
      t = Math.max(0.05, Math.min(0.95, t));
      const projX = p1.x + t * dx;
      const projY = p1.y + t * dy;
      const dist = Math.hypot(wx - projX, wy - projY);

      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = i;
        bestRatio = t;
      }
    }
    door.edgeIndex = bestEdge;
    door.offsetRatio = bestRatio;
  }

  // ==========================================================================
  // 6. 描画エンジン連動 (平面図 Top / 立面図 Side)
  // ==========================================================================
  function drawRoomTop(ctx) {
    const pts = window.room.points;
    if (!pts || pts.length < 3) return;

    ctx.save();

    // 1. 会場床面の塗りつぶし
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    pts.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.fill();

    // 2. 会場外壁ライン
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 60;
    ctx.lineJoin = 'miter';
    ctx.stroke();

    // 3. 多角形頂点ハンドル (カスタム時のみ)
    if (window.room.shapeType === 'polygon') {
      pts.forEach((pt, i) => {
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 180, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 30;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 130px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i + 1, pt.x, pt.y);
      });
    }

    // 4. 外郭CAD寸法線
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 15;
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 120px sans-serif';

    // 間口(上部寸法)
    ctx.beginPath();
    ctx.moveTo(0, -300); ctx.lineTo(window.room.w, -300);
    ctx.moveTo(0, -450); ctx.lineTo(0, -150);
    ctx.moveTo(window.room.w, -450); ctx.lineTo(window.room.w, -150);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(`間口 W: ${(window.room.w / 1000).toFixed(2)}m`, window.room.w / 2, -450);

    // 奥行(左側寸法)
    ctx.beginPath();
    ctx.moveTo(-300, 0); ctx.lineTo(-300, window.room.d);
    ctx.moveTo(-450, 0); ctx.lineTo(-150, 0);
    ctx.moveTo(-450, window.room.d); ctx.lineTo(-150, window.room.d);
    ctx.stroke();
    ctx.save();
    ctx.translate(-450, window.room.d / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`奥行 D: ${(window.room.d / 1000).toFixed(2)}m`, 0, 0);
    ctx.restore();

    // 5. 扉の描画
    window.doors.forEach(d => {
      const tf = getDoorTransform(d);
      const isSel = (d.id === window.selectedDoorId);
      const w = d.width;

      ctx.save();
      ctx.translate(tf.x, tf.y);
      ctx.rotate((tf.angle * Math.PI) / 180);

      ctx.lineWidth = isSel ? 45 : 30;

      if (d.type === 'closed') {
        // 閉鎖扉 (赤色枠線＋×印)
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = '#fee2e2';
        ctx.fillRect(-w / 2, -40, w, 80);
        ctx.strokeRect(-w / 2, -40, w, 80);
        ctx.beginPath();
        ctx.moveTo(-w / 2, -40); ctx.lineTo(w / 2, 40);
        ctx.moveTo(-w / 2, 40); ctx.lineTo(w / 2, -40);
        ctx.stroke();
      } else if (d.type === 'double') {
        // 2枚 (両開き)
        ctx.strokeStyle = isSel ? '#2563eb' : '#0284c7';
        const halfW = w / 2;
        ctx.strokeRect(-halfW, -25, w, 50);
        ctx.beginPath();
        ctx.arc(-halfW, 0, halfW, 0, Math.PI / 2, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(halfW, 0, halfW, Math.PI, Math.PI / 2, true);
        ctx.stroke();
      } else {
        // 片開き (左 / 右)
        ctx.strokeStyle = isSel ? '#2563eb' : '#0284c7';
        ctx.strokeRect(-w / 2, -25, w, 50);
        ctx.beginPath();
        if (d.type === 'single_left') {
          ctx.arc(-w / 2, 0, w, 0, Math.PI / 2, false);
        } else {
          ctx.arc(w / 2, 0, w, Math.PI, Math.PI / 2, true);
        }
        ctx.stroke();
      }

      // 扉名称ラベル
      ctx.fillStyle = isSel ? '#1d4ed8' : '#0f172a';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.name, 0, 160);

      ctx.restore();
    });

    ctx.restore();
  }

  function drawRoomSide(ctx, sliceX) {
    ctx.save();

    // 1. 床面ライン (FL±0)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(window.room.d, 0);
    ctx.stroke();

    // 2. 天井ライン (CH)
    const ch = window.room.ceilingH || 5000;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 15;
    ctx.setLineDash([40, 20]);
    ctx.beginPath();
    ctx.moveTo(0, -ch);
    ctx.lineTo(window.room.d, -ch);
    ctx.stroke();
    ctx.setLineDash([]);

    // 天井高さラベル
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 110px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`CH: ${(ch / 1000).toFixed(1)}m`, 100, -ch + 150);

    // 3. 最奥・手前の外壁ライン
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 25;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -ch);
    ctx.moveTo(window.room.d, 0); ctx.lineTo(window.room.d, -ch);
    ctx.stroke();

    ctx.restore();
  }

  // ==========================================================================
  // 7. マウスヒットテスト & ドラッグハンドラ
  // ==========================================================================
  function hitTest(wx, wy) {
    // 1. 多角形頂点ハンドル (半径400mm以内)
    if (window.room.shapeType === 'polygon') {
      const pts = window.room.points;
      for (let i = 0; i < pts.length; i++) {
        if (Math.hypot(pts[i].x - wx, pts[i].y - wy) < 400) {
          return { type: 'room_vertex', index: i };
        }
      }
    }

    // 2. 扉当たり判定 (600mm以内)
    for (let d of window.doors) {
      const tf = getDoorTransform(d);
      if (Math.hypot(tf.x - wx, tf.y - wy) < 600) {
        window.selectedDoorId = d.id;
        syncSelectedDoorToUI();
        updateDoorUIList();
        triggerRender();
        return { type: 'room_door', item: d };
      }
    }
    return null;
  }

  function handleDrag(target, wx, wy) {
    if (target.type === 'room_vertex') {
      window.room.points[target.index].x = Math.round(wx);
      window.room.points[target.index].y = Math.round(wy);
      recalculateRoomBounds();
      triggerRender();
      return true;
    } else if (target.type === 'room_door') {
      snapDoorToNearestEdge(target.item, wx, wy);
      syncSelectedDoorToUI();
      triggerRender();
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 8. ユーティリティ & 外部連携
  // ==========================================================================
  function triggerRender() {
    if (typeof window.requestRender === 'function') {
      window.requestRender();
    } else if (typeof window.render === 'function') {
      window.render();
    }
  }

  function pushUndo() {
    if (typeof window.saveHistory === 'function') {
      window.saveHistory();
    }
  }

  // ==========================================================================
  // 9. モジュール登録 & 自動初期化
  // ==========================================================================
  window.tabRoomModule = {
    drawTop: drawRoomTop,
    drawSide: drawRoomSide,
    hitTest: hitTest,
    handleDrag: handleDrag,
    recalculate: recalculateRoomBounds,
    syncUI: function () {
      updateDoorWallSelectOptions();
      updateDoorUIList();
      syncSelectedDoorToUI();
    }
  };

  // DOMロード時にUI注入
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectRoomUI);
  } else {
    injectRoomUI();
  }

})();