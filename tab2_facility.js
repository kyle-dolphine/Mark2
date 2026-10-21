/**
 * ============================================================================
 * ENG Sightline & Stage Simulator Mark2
 * モジュール：【ノート2：会場設備】 tab2_facility.js
 * 
 * 担当機能：
 *  - ステージ（ロック機能、中央配置）
 *  - バックパネル（複数管理、ステージ連動/自由配置ドラッグ）
 *  - スクリーン（複数管理、インチ指定、下端床高、ドラッグ・角度調整）
 * ============================================================================
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. データモデル初期化 (共通グローバル空間への登録)
  // ==========================================================================
  window.stage = window.stage || { x: 2000, y: 1200, w: 10000, d: 3000, h: 800 };
  window.isStageLocked = window.isStageLocked !== undefined ? window.isStageLocked : true;

  window.panels = window.panels || [
    { id: 'BP1', name: 'メインパネル', enabled: true, w: 8000, d: 100, h: 2400, posType: 'on_stage', customPos: false, x: 3000, y: 1200 }
  ];
  window.selectedPanelId = window.selectedPanelId || 'BP1';

  window.screens = window.screens || [
    { id: 'SCR1', name: 'スクリーン下手', w: 3320, h: 1870, bottomZ: 1200, x: 2500, y: 2200, angle: 10 },
    { id: 'SCR2', name: 'スクリーン上手', w: 3320, h: 1870, bottomZ: 1200, x: 11500, y: 2200, angle: -10 }
  ];
  window.selectedScreenId = window.selectedScreenId || 'SCR1';

  // ==========================================================================
  // 2. UIテンプレート自動生成 (#panel-facility へのインジェクション)
  // ==========================================================================
  function injectFacilityUI() {
    const container = document.getElementById('panel-facility');
    if (!container) return;

    container.innerHTML = `
      <!-- 🎭 ステージ寸法 & 配置 -->
      <div class="ui-group">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>🎭 ステージ寸法 & 配置</span>
          <label style="color:#b91c1c; font-size:10px; font-weight:bold; cursor:pointer;">
            <input type="checkbox" id="stageLockCheck" ${window.isStageLocked ? 'checked' : ''}> 🔒 位置ロック
          </label>
        </div>
        <div class="ui-row">
          <div class="input-box"><label>幅 (W mm)</label><input type="number" id="stageW" value="${window.stage.w}" step="500"></div>
          <div class="input-box"><label>奥行 (D mm)</label><input type="number" id="stageD" value="${window.stage.d}" step="200"></div>
          <div class="input-box"><label>高さ (H mm)</label><input type="number" id="stageH" value="${window.stage.h}" step="50"></div>
        </div>
        <div class="ui-row">
          <div class="input-box"><label>配置X</label><input type="number" id="stageX" value="${window.stage.x}" step="100" ${window.isStageLocked ? 'disabled' : ''}></div>
          <div class="input-box"><label>配置Y (奥から)</label><input type="number" id="stageY" value="${window.stage.y}" step="100" ${window.isStageLocked ? 'disabled' : ''}></div>
        </div>
        <div class="ui-row full" style="margin-top:4px;">
          <button class="btn-action" id="btnCenterStage" style="background:#f1f5f9; color:#0369a1; border-color:#0284c7;">🎯 ステージをX軸中央に配置</button>
        </div>
      </div>

      <!-- 🖼️ バックパネル -->
      <div class="ui-group">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>🖼️ バックパネル (複数・自由配置)</span>
          <div style="display:flex; gap:4px;">
            <button class="btn-action" id="btnAddPanel" style="padding:2px 6px; font-size:10px;">＋ 追加</button>
            <button class="btn-action btn-danger" id="btnDelPanel" style="padding:2px 6px; font-size:10px;">削除</button>
          </div>
        </div>
        <div class="ui-row full">
          <div class="input-box">
            <label>選択パネル</label>
            <select id="panelSelect"></select>
          </div>
        </div>
        <div class="ui-row">
          <div class="input-box"><label>名称</label><input type="text" id="panelName"></div>
          <div class="input-box">
            <label>配置モード</label>
            <label style="font-size:10px; display:flex; align-items:center; gap:4px; height:26px;">
              <input type="checkbox" id="panelCustomPos"> 📍 自由配置
            </label>
          </div>
        </div>
        <div class="ui-row">
          <div class="input-box"><label>幅 (W)</label><input type="number" id="panelW" step="200"></div>
          <div class="input-box"><label>高さ (H)</label><input type="number" id="panelH" step="100"></div>
          <div class="input-box"><label>厚み (D)</label><input type="number" id="panelD" step="50"></div>
          <div class="input-box">
            <label>表示</label>
            <label style="font-size:10px; display:flex; align-items:center; gap:4px; height:26px;">
              <input type="checkbox" id="panelEnabled"> 表示する
            </label>
          </div>
        </div>
        <div class="ui-row" id="panelAutoPosBox">
          <div class="input-box" style="grid-column: 1 / -1;">
            <label>ステージ連動 基準位置</label>
            <select id="panelPosType">
              <option value="on_stage">天板奥 (ステージ上奥端)</option>
              <option value="behind_stage">床置き (ステージ背後床面)</option>
            </select>
          </div>
        </div>
        <div class="ui-row" id="panelCustomCoordBox" style="display:none;">
          <div class="input-box"><label>配置 X (mm)</label><input type="number" id="panelX" step="100"></div>
          <div class="input-box"><label>配置 Y (mm)</label><input type="number" id="panelY" step="100"></div>
        </div>
      </div>

      <!-- 📽️ スクリーン -->
      <div class="ui-group">
        <div class="ui-group-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>📽️ スクリーン</span>
          <div style="display:flex; gap:4px;">
            <button class="btn-action" id="btnAddScreen" style="padding:2px 6px; font-size:10px;">＋ 追加</button>
            <button class="btn-action btn-danger" id="btnDelScreen" style="padding:2px 6px; font-size:10px;">削除</button>
          </div>
        </div>
        <div class="ui-row full">
          <div class="input-box">
            <label>選択スクリーン</label>
            <select id="screenSelect"></select>
          </div>
        </div>
        <div class="ui-row">
          <div class="input-box">
            <label>インチ (16:9 換算)</label>
            <select id="screenPreset">
              <option value="custom">手動 / カスタム指定</option>
              <option value="100">100インチ (W2214×H1245)</option>
              <option value="120">120インチ (W2656×H1494)</option>
              <option value="150">150インチ (W3320×H1868)</option>
              <option value="200">200インチ (W4428×H2490)</option>
              <option value="250">250インチ (W5535×H3113)</option>
            </select>
          </div>
          <div class="input-box"><label>下端床高 (Z mm)</label><input type="number" id="screenBottomZ" step="100"></div>
        </div>
        <div class="ui-row">
          <div class="input-box"><label>名称</label><input type="text" id="screenName"></div>
          <div class="input-box"><label>幅 (W)</label><input type="number" id="screenW" step="100"></div>
          <div class="input-box"><label>高さ (H)</label><input type="number" id="screenH" step="100"></div>
        </div>
        <div class="ui-row">
          <div class="input-box"><label>配置 X</label><input type="number" id="screenX" step="100"></div>
          <div class="input-box"><label>配置 Y</label><input type="number" id="screenY" step="100"></div>
          <div class="input-box"><label>振り角 (°)</label><input type="number" id="screenAngle" step="5"></div>
        </div>
      </div>
    `;

    bindFacilityEvents();
    updatePanelUIList();
    updateScreenUIList();
  }

  // ==========================================================================
  // 3. UIイベントリスナー登録
  // ==========================================================================
  function bindFacilityEvents() {
    // --- ステージ ---
    const onStageChange = function () {
      pushUndo();
      window.stage.w = parseFloat(document.getElementById('stageW').value) || 10000;
      window.stage.d = parseFloat(document.getElementById('stageD').value) || 3000;
      window.stage.h = parseFloat(document.getElementById('stageH').value) || 800;
      window.stage.x = parseFloat(document.getElementById('stageX').value) || 0;
      window.stage.y = parseFloat(document.getElementById('stageY').value) || 0;
      triggerRender();
    };
    document.getElementById('stageW').addEventListener('change', onStageChange);
    document.getElementById('stageD').addEventListener('change', onStageChange);
    document.getElementById('stageH').addEventListener('change', onStageChange);
    document.getElementById('stageX').addEventListener('change', onStageChange);
    document.getElementById('stageY').addEventListener('change', onStageChange);

    document.getElementById('stageLockCheck').addEventListener('change', function(e) {
      window.isStageLocked = e.target.checked;
      document.getElementById('stageX').disabled = window.isStageLocked;
      document.getElementById('stageY').disabled = window.isStageLocked;
      triggerRender();
    });

    document.getElementById('btnCenterStage').addEventListener('click', function() {
      pushUndo();
      if (window.room && window.room.w) {
        window.stage.x = Math.round((window.room.w - window.stage.w) / 2);
        document.getElementById('stageX').value = window.stage.x;
        triggerRender();
      }
    });

    // --- パネル ---
    document.getElementById('btnAddPanel').addEventListener('click', function() {
      pushUndo();
      const num = window.panels.length + 1;
      const newId = 'BP' + Date.now();
      window.panels.push({
        id: newId, name: `バックパネル ${num}`, enabled: true, w: 5000, d: 100, h: 2400, posType: 'on_stage',
        customPos: true, x: window.stage.x + (window.stage.w / 2) - 2500, y: window.stage.y + 100
      });
      window.selectedPanelId = newId;
      updatePanelUIList();
      triggerRender();
    });
    
    document.getElementById('btnDelPanel').addEventListener('click', function() {
      if (window.panels.length <= 1) return alert('これ以上削除できません。表示チェックを外してください。');
      pushUndo();
      window.panels = window.panels.filter(p => p.id !== window.selectedPanelId);
      window.selectedPanelId = window.panels[0].id;
      updatePanelUIList();
      triggerRender();
    });

    document.getElementById('panelSelect').addEventListener('change', function(e) {
      window.selectedPanelId = e.target.value;
      syncPanelUI();
      triggerRender();
    });

    const onPanelParamChange = function() {
      const p = window.panels.find(item => item.id === window.selectedPanelId);
      if(!p) return;
      pushUndo();
      p.name = document.getElementById('panelName').value || 'パネル';
      p.enabled = document.getElementById('panelEnabled').checked;
      p.customPos = document.getElementById('panelCustomPos').checked;
      p.w = parseFloat(document.getElementById('panelW').value) || 5000;
      p.h = parseFloat(document.getElementById('panelH').value) || 2400;
      p.d = parseFloat(document.getElementById('panelD').value) || 100;
      p.posType = document.getElementById('panelPosType').value;
      if (p.customPos) {
        p.x = parseFloat(document.getElementById('panelX').value) || 0;
        p.y = parseFloat(document.getElementById('panelY').value) || 0;
      }
      syncPanelUI();
      triggerRender();
    };

    ['panelName', 'panelEnabled', 'panelCustomPos', 'panelW', 'panelH', 'panelD', 'panelPosType', 'panelX', 'panelY']
      .forEach(id => document.getElementById(id).addEventListener('change', onPanelParamChange));

    // --- スクリーン ---
    document.getElementById('btnAddScreen').addEventListener('click', function() {
      pushUndo();
      const num = window.screens.length + 1;
      const newId = 'SCR' + Date.now();
      window.screens.push({
        id: newId, name: `スクリーン ${num}`, w: 3320, h: 1870, bottomZ: 1200,
        x: window.stage.x + 1000 + (num * 100), y: window.stage.y + 1500, angle: 0
      });
      window.selectedScreenId = newId;
      updateScreenUIList();
      triggerRender();
    });

    document.getElementById('btnDelScreen').addEventListener('click', function() {
      if (window.screens.length <= 1) return alert('これ以上削除できません。');
      pushUndo();
      window.screens = window.screens.filter(s => s.id !== window.selectedScreenId);
      window.selectedScreenId = window.screens[0].id;
      updateScreenUIList();
      triggerRender();
    });

    document.getElementById('screenSelect').addEventListener('change', function(e) {
      window.selectedScreenId = e.target.value;
      syncScreenUI();
      triggerRender();
    });

    document.getElementById('screenPreset').addEventListener('change', function(e) {
      const preset = e.target.value;
      const s = window.screens.find(item => item.id === window.selectedScreenId);
      if(!s || preset === 'custom') return;
      pushUndo();
      if (preset === '100') { s.w = 2214; s.h = 1245; }
      else if (preset === '120') { s.w = 2656; s.h = 1494; }
      else if (preset === '150') { s.w = 3320; s.h = 1870; }
      else if (preset === '200') { s.w = 4428; s.h = 2490; }
      else if (preset === '250') { s.w = 5535; s.h = 3113; }
      syncScreenUI();
      triggerRender();
    });

    const onScreenParamChange = function() {
      const s = window.screens.find(item => item.id === window.selectedScreenId);
      if(!s) return;
      pushUndo();
      s.name = document.getElementById('screenName').value || 'スクリーン';
      s.w = parseFloat(document.getElementById('screenW').value) || 3000;
      s.h = parseFloat(document.getElementById('screenH').value) || 1800;
      s.bottomZ = parseFloat(document.getElementById('screenBottomZ').value) || 1200;
      s.x = parseFloat(document.getElementById('screenX').value) || 0;
      s.y = parseFloat(document.getElementById('screenY').value) || 0;
      s.angle = parseFloat(document.getElementById('screenAngle').value) || 0;
      document.getElementById('screenPreset').value = 'custom';
      updateScreenUIList(); // 名前が変わった時のため
      triggerRender();
    };

    ['screenName', 'screenW', 'screenH', 'screenBottomZ', 'screenX', 'screenY', 'screenAngle']
      .forEach(id => document.getElementById(id).addEventListener('change', onScreenParamChange));
  }

  // ==========================================================================
  // 4. データ・UI 同期処理
  // ==========================================================================
  function updatePanelUIList() {
    const sel = document.getElementById('panelSelect');
    if (!sel) return;
    sel.innerHTML = '';
    window.panels.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (W:${p.w})`;
      sel.appendChild(opt);
    });
    sel.value = window.selectedPanelId;
    syncPanelUI();
  }

  function syncPanelUI() {
    const p = window.panels.find(item => item.id === window.selectedPanelId);
    if (!p) return;
    document.getElementById('panelName').value = p.name;
    document.getElementById('panelEnabled').checked = p.enabled;
    document.getElementById('panelCustomPos').checked = !!p.customPos;
    document.getElementById('panelW').value = p.w;
    document.getElementById('panelH').value = p.h;
    document.getElementById('panelD').value = p.d;
    document.getElementById('panelPosType').value = p.posType || 'on_stage';
    document.getElementById('panelX').value = Math.round(p.x);
    document.getElementById('panelY').value = Math.round(p.y);

    document.getElementById('panelAutoPosBox').style.display = p.customPos ? 'none' : 'grid';
    document.getElementById('panelCustomCoordBox').style.display = p.customPos ? 'grid' : 'none';
  }

  function getPanelActualPos(p) {
    if (p.customPos) return { x: p.x, y: p.y };
    const px = window.stage.x + (window.stage.w - p.w) / 2;
    const py = (p.posType === 'behind_stage') ? window.stage.y - p.d - 20 : window.stage.y;
    return { x: px, y: py };
  }

  function updateScreenUIList() {
    const sel = document.getElementById('screenSelect');
    if (!sel) return;
    sel.innerHTML = '';
    window.screens.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (W:${s.w})`;
      sel.appendChild(opt);
    });
    sel.value = window.selectedScreenId;
    syncScreenUI();
  }

  function syncScreenUI() {
    const s = window.screens.find(item => item.id === window.selectedScreenId);
    if (!s) return;
    document.getElementById('screenName').value = s.name;
    document.getElementById('screenW').value = s.w;
    document.getElementById('screenH').value = s.h;
    document.getElementById('screenBottomZ').value = s.bottomZ;
    document.getElementById('screenX').value = Math.round(s.x);
    document.getElementById('screenY').value = Math.round(s.y);
    document.getElementById('screenAngle').value = s.angle;
  }

  // ==========================================================================
  // 5. 描画エンジン連動 (平面図 Top / 立面図 Side)
  // ==========================================================================
  function drawFacilityTop(ctx) {
    // 1. ステージ
    ctx.save();
    if (window.isStageLocked) {
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 40;
    } else {
      // ロック解除時は青い点線にしてドラッグ可能をアピール
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 60;
      ctx.setLineDash([100, 50]);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(window.stage.x, window.stage.y, window.stage.w, window.stage.d);
    ctx.strokeRect(window.stage.x, window.stage.y, window.stage.w, window.stage.d);
    ctx.setLineDash([]);
    ctx.restore();

    // 2. パネル
    window.panels.forEach(p => {
      if (!p.enabled) return;
      const isSel = (p.id === window.selectedPanelId);
      const pos = getPanelActualPos(p);
      ctx.save();
      ctx.fillStyle = isSel ? '#bfdbfe' : '#e2e8f0';
      ctx.strokeStyle = isSel ? '#2563eb' : '#475569';
      ctx.lineWidth = isSel ? 45 : 30;
      ctx.fillRect(pos.x, pos.y, p.w, p.d);
      ctx.strokeRect(pos.x, pos.y, p.w, p.d);
      
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, pos.x + p.w / 2, pos.y - 60);
      ctx.restore();
    });

    // 3. スクリーン
    window.screens.forEach(s => {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate((s.angle * Math.PI) / 180);

      const isSel = (s.id === window.selectedScreenId);
      ctx.strokeStyle = isSel ? '#2563eb' : '#0284c7';
      ctx.lineWidth = isSel ? 60 : 40;
      ctx.fillStyle = isSel ? '#e0f2fe' : '#ffffff';

      // 幕の厚みは便宜上 100mm とする
      ctx.fillRect(-s.w / 2, -50, s.w, 100);
      ctx.strokeRect(-s.w / 2, -50, s.w, 100);

      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 140px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, 0, -120);
      ctx.restore();
    });
  }

  function drawFacilitySide(ctx, sliceX) {
    // 1. ステージ断面 (スライス座標がステージ幅内にある場合)
    if (sliceX >= window.stage.x && sliceX <= window.stage.x + window.stage.w) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 30;
      // 立面はY軸上がマイナス方向（空方向）なので -h とする
      ctx.fillRect(window.stage.y, 0, window.stage.d, -window.stage.h);
      ctx.strokeRect(window.stage.y, 0, window.stage.d, -window.stage.h);
      ctx.restore();
    }

    // 2. パネル断面
    window.panels.forEach(p => {
      if (!p.enabled) return;
      const pos = getPanelActualPos(p);
      if (sliceX >= pos.x && sliceX <= pos.x + p.w) {
        ctx.save();
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 20;
        // パネルは床置きかステージ上かでベースのZが変わる
        const baseZ = (p.posType === 'behind_stage') ? 0 : window.stage.h;
        ctx.fillRect(pos.y, -baseZ, p.d, -p.h);
        ctx.strokeRect(pos.y, -baseZ, p.d, -p.h);
        ctx.restore();
      }
    });

    // 3. スクリーン断面 (簡易判定: 角度を考慮せず中心Xからの幅で切断)
    window.screens.forEach(s => {
      if (sliceX >= s.x - s.w / 2 && sliceX <= s.x + s.w / 2) {
        ctx.save();
        ctx.fillStyle = '#e0f2fe';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 30;
        // スクリーンの厚みは100として描画
        ctx.fillRect(s.y - 50, -s.bottomZ, 100, -s.h);
        ctx.strokeRect(s.y - 50, -s.bottomZ, 100, -s.h);
        ctx.restore();
      }
    });
  }

  // ==========================================================================
  // 6. マウスヒットテスト & ドラッグハンドラ
  // ==========================================================================
  function hitTest(wx, wy) {
    // 1. スクリーン (優先)
    for (let s of window.screens) {
      if (Math.hypot(s.x - wx, s.y - wy) < s.w / 2) {
        window.selectedScreenId = s.id;
        syncScreenUI();
        triggerRender();
        // ドラッグ用オフセットを記憶
        return { type: 'facility_screen', item: s, offsetX: s.x - wx, offsetY: s.y - wy };
      }
    }

    // 2. パネル
    for (let p of window.panels) {
      if (!p.enabled) continue;
      const pos = getPanelActualPos(p);
      if (wx >= pos.x && wx <= pos.x + p.w && wy >= pos.y - 150 && wy <= pos.y + p.d + 150) {
        window.selectedPanelId = p.id;
        p.customPos = true; // 掴んだ時点で自由配置モードへ移行
        syncPanelUI();
        triggerRender();
        return { type: 'facility_panel', item: p, offsetX: p.x - wx, offsetY: p.y - wy };
      }
    }

    // 3. ステージ (ロック解除時のみ)
    if (!window.isStageLocked) {
      if (wx >= window.stage.x && wx <= window.stage.x + window.stage.w &&
          wy >= window.stage.y && wy <= window.stage.y + window.stage.d) {
        return { type: 'facility_stage', offsetX: window.stage.x - wx, offsetY: window.stage.y - wy };
      }
    }

    return null;
  }

  function handleDrag(target, wx, wy) {
    if (target.type === 'facility_screen') {
      target.item.x = Math.round(wx + target.offsetX);
      target.item.y = Math.round(wy + target.offsetY);
      syncScreenUI();
      triggerRender();
      return true;
    } else if (target.type === 'facility_panel') {
      target.item.x = Math.round(wx + target.offsetX);
      target.item.y = Math.round(wy + target.offsetY);
      syncPanelUI();
      triggerRender();
      return true;
    } else if (target.type === 'facility_stage') {
      window.stage.x = Math.round(wx + target.offsetX);
      window.stage.y = Math.round(wy + target.offsetY);
      document.getElementById('stageX').value = window.stage.x;
      document.getElementById('stageY').value = window.stage.y;
      triggerRender();
      return true;
    }
    return false;
  }

  // ==========================================================================
  // 7. ユーティリティ & 外部連携
  // ==========================================================================
  function triggerRender() {
    if (typeof window.requestRender === 'function') window.requestRender();
    else if (typeof window.render === 'function') window.render();
  }

  function pushUndo() {
    if (typeof window.saveHistory === 'function') window.saveHistory();
  }

  // ==========================================================================
  // 8. モジュール登録 & 自動初期化
  // ==========================================================================
  window.tabFacilityModule = {
    drawTop: drawFacilityTop,
    drawSide: drawFacilitySide,
    hitTest: hitTest,
    handleDrag: handleDrag,
    syncUI: function () {
      updatePanelUIList();
      updateScreenUIList();
    }
  };

  // DOMロード時にUI注入
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFacilityUI);
  } else {
    injectFacilityUI();
  }

})();