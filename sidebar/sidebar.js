/**
 * 侧边栏 JavaScript
 * 功能节点管理、截图预览、导出功能
 */

(function() {
  'use strict';

  // ==================== 状态管理 ====================

  const state = {
    features: [],
    screenshotsMap: {}, // featureId -> screenshots[]
    currentFeature: null,
    screenshots: [],
    currentScreenshotIndex: -1,
    viewMode: 'grid'
  };

  // ==================== DOM 元素 ====================

  const elements = {
    featureTree: document.getElementById('feature-tree'),
    screenshotsGrid: document.getElementById('screenshots-grid'),
    screenshotsInfo: document.getElementById('screenshots-info'),
    storageStats: document.getElementById('storage-stats'),

    btnNewFeature: document.getElementById('btn-new-feature'),
    btnCapturePage: document.getElementById('btn-capture-page'),
    btnSelectElement: document.getElementById('btn-select-element'),
    btnExport: document.getElementById('btn-export'),
    btnGridView: document.getElementById('btn-grid-view'),
    btnListView: document.getElementById('btn-list-view'),

    modalNewFeature: document.getElementById('modal-new-feature'),
    modalPreview: document.getElementById('modal-preview'),
    modalConfirm: document.getElementById('modal-confirm'),

    featureName: document.getElementById('feature-name'),
    featureParent: document.getElementById('feature-parent'),
    btnCreateFeature: document.getElementById('btn-create-feature'),

    previewImage: document.getElementById('preview-image'),
    previewTitle: document.getElementById('preview-title'),
    previewInfo: document.getElementById('preview-info'),
    btnPrevScreenshot: document.getElementById('btn-prev-screenshot'),
    btnNextScreenshot: document.getElementById('btn-next-screenshot'),
    btnDeleteScreenshot: document.getElementById('btn-delete-screenshot'),
    btnDownloadScreenshot: document.getElementById('btn-download-screenshot'),

    confirmMessage: document.getElementById('confirm-message'),
    btnConfirm: document.getElementById('btn-confirm'),

    toastContainer: document.getElementById('toast-container')
  };

  // ==================== 初始化 ====================

  async function init() {
    console.log('[WFC Sidebar] 初始化...');
    bindEvents();
    await loadAllData();
    await updateStorageStats();

    // 加载当前选中的功能节点
    const result = await chrome.storage.local.get(['currentFeature']);
    if (result.currentFeature) {
      await selectFeature(result.currentFeature.id);
    }

    console.log('[WFC Sidebar] 初始化完成');
  }

  function bindEvents() {
    elements.btnNewFeature.addEventListener('click', () => openNewFeatureModal());
    elements.btnCapturePage.addEventListener('click', capturePage);
    elements.btnSelectElement.addEventListener('click', selectElement);
    elements.btnExport.addEventListener('click', exportData);
    elements.btnGridView.addEventListener('click', () => setViewMode('grid'));
    elements.btnListView.addEventListener('click', () => setViewMode('list'));

    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', closeAllModals);
    });

    elements.btnCreateFeature.addEventListener('click', createFeature);
    elements.btnPrevScreenshot.addEventListener('click', () => navigatePreview(-1));
    elements.btnNextScreenshot.addEventListener('click', () => navigatePreview(1));
    elements.btnDeleteScreenshot.addEventListener('click', deleteCurrentScreenshot);
    elements.btnDownloadScreenshot.addEventListener('click', downloadCurrentScreenshot);

    document.addEventListener('keydown', handleKeydown);
  }

  // ==================== 数据加载 ====================

  async function loadAllData() {
    try {
      // 加载功能节点
      const featuresResponse = await chrome.runtime.sendMessage({ action: 'getAllFeatures' });
      if (featuresResponse.success) {
        state.features = featuresResponse.data || [];
      }

      // 加载所有功能节点的截图
      for (const feature of state.features) {
        const screenshotsResponse = await chrome.runtime.sendMessage({
          action: 'getScreenshotsByFeature',
          data: { featureId: feature.id }
        });
        if (screenshotsResponse.success) {
          state.screenshotsMap[feature.id] = screenshotsResponse.data || [];
        }
      }

      renderFeatureTree();
    } catch (error) {
      console.error('[WFC] 加载数据失败:', error);
      showToast('加载数据失败', 'error');
    }
  }

  // ==================== 功能节点管理 ====================

  function renderFeatureTree() {
    if (state.features.length === 0) {
      elements.featureTree.innerHTML = '<div class="empty-state">暂无功能节点，点击"新建"创建</div>';
      return;
    }

    const rootFeatures = state.features.filter(f => !f.parentId);
    const html = renderFeatureNodes(rootFeatures, 0);

    elements.featureTree.innerHTML = html;

    // 绑定点击事件
    elements.featureTree.querySelectorAll('.feature-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.feature-actions')) return;
        selectFeature(item.dataset.id);
      });

      item.querySelector('.btn-add-child')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openNewFeatureModal(item.dataset.id);
      });

      item.querySelector('.btn-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteFeature(item.dataset.id);
      });
    });
  }

  function renderFeatureNodes(features, level) {
    return features.map(feature => {
      const children = state.features.filter(f => f.parentId === feature.id);
      const screenshots = state.screenshotsMap[feature.id] || [];
      const isSelected = state.currentFeature?.id === feature.id;

      return `
        <div class="feature-item ${isSelected ? 'selected' : ''}" data-id="${feature.id}" data-level="${level}">
          <span class="feature-icon">${children.length > 0 ? '📁' : '📄'}</span>
          <span class="feature-name">${escapeHtml(feature.name)}</span>
          <span class="feature-count">${screenshots.length}</span>
          <div class="feature-actions">
            <button class="btn btn-icon btn-add-child" title="添加子节点">➕</button>
            <button class="btn btn-icon btn-delete" title="删除">🗑️</button>
          </div>
        </div>
        ${children.length > 0 ? renderFeatureNodes(children, level + 1) : ''}
      `;
    }).join('');
  }

  async function selectFeature(id) {
    const feature = state.features.find(f => f.id === id);
    if (!feature) return;

    state.currentFeature = feature;
    state.screenshots = state.screenshotsMap[id] || [];

    await chrome.storage.local.set({ currentFeature: feature });

    renderFeatureTree();
    renderScreenshots();
    updateScreenshotsInfo();
  }

  function openNewFeatureModal(parentId = null) {
    elements.featureName.value = '';
    elements.featureParent.value = parentId || '';

    const modalTitle = document.getElementById('modal-feature-title');
    if (parentId) {
      const parentFeature = state.features.find(f => f.id === parentId);
      modalTitle.textContent = `添加子节点 - ${parentFeature?.name || ''}`;
    } else {
      modalTitle.textContent = '新建功能节点';
    }

    elements.modalNewFeature.classList.add('active');
    elements.featureName.focus();
  }

  async function createFeature() {
    const name = elements.featureName.value.trim();
    if (!name) {
      showToast('请输入功能名称', 'warning');
      return;
    }

    const parentId = elements.featureParent.value || null;

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'createFeature',
        data: { name, parentId }
      });

      if (response.success) {
        showToast('功能节点创建成功', 'success');
        closeAllModals();
        state.features.push(response.data);
        state.screenshotsMap[response.data.id] = [];
        renderFeatureTree();
        await selectFeature(response.data.id);
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('[WFC] 创建功能节点失败:', error);
      showToast('创建失败: ' + error.message, 'error');
    }
  }

  async function confirmDeleteFeature(id) {
    const feature = state.features.find(f => f.id === id);
    if (!feature) return;

    elements.confirmMessage.textContent = `确定要删除"${feature.name}"吗？这将同时删除所有子节点和相关截图。`;
    elements.btnConfirm.onclick = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'deleteFeature',
          data: { id }
        });

        if (response.success) {
          showToast('删除成功', 'success');
          closeAllModals();

          state.features = state.features.filter(f => f.id !== id);
          delete state.screenshotsMap[id];

          if (state.currentFeature?.id === id) {
            state.currentFeature = null;
            state.screenshots = [];
          }

          renderFeatureTree();
          renderScreenshots();
          await updateStorageStats();
        }
      } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
      }
    };

    elements.modalConfirm.classList.add('active');
  }

  // ==================== 截图管理 ====================

  function renderScreenshots() {
    if (!state.currentFeature) {
      elements.screenshotsGrid.innerHTML = '<div class="empty-state">选择功能节点查看截图</div>';
      return;
    }

    if (state.screenshots.length === 0) {
      elements.screenshotsGrid.innerHTML = '<div class="empty-state">暂无截图，点击页面悬浮按钮开始截图</div>';
      return;
    }

    const isListView = state.viewMode === 'list';

    const html = state.screenshots.map((screenshot, index) => {
      if (isListView) {
        return `
          <div class="screenshot-item" data-index="${index}">
            <img src="${screenshot.thumbnail || screenshot.original}" alt="${escapeHtml(screenshot.filename)}">
            <div class="screenshot-info">
              <div class="screenshot-filename">${escapeHtml(screenshot.filename)}</div>
              <div class="screenshot-time">${formatTime(screenshot.createdAt)}</div>
            </div>
            <div class="screenshot-actions-inline">
              <button class="btn btn-sm btn-secondary btn-preview" title="预览">🔍</button>
              <button class="btn btn-sm btn-danger btn-delete" title="删除">🗑️</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="screenshot-item" data-index="${index}">
          <img src="${screenshot.thumbnail || screenshot.original}" alt="${escapeHtml(screenshot.filename)}">
          <div class="screenshot-filename-overlay">${escapeHtml(screenshot.filename.substring(0, 20))}...</div>
          <div class="screenshot-actions">
            <button class="btn btn-icon btn-preview" title="预览">🔍</button>
            <button class="btn btn-icon btn-delete" title="删除">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    elements.screenshotsGrid.innerHTML = html;

    // 绑定事件
    elements.screenshotsGrid.querySelectorAll('.screenshot-item').forEach(item => {
      const index = parseInt(item.dataset.index);

      item.querySelector('.btn-preview')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openPreview(index);
      });

      item.querySelector('.btn-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteScreenshot(index);
      });

      item.addEventListener('click', () => openPreview(index));
    });
  }

  function updateScreenshotsInfo() {
    if (state.currentFeature) {
      elements.screenshotsInfo.textContent = `${state.currentFeature.name} - 共 ${state.screenshots.length} 张截图`;
    } else {
      elements.screenshotsInfo.textContent = '';
    }
  }

  function setViewMode(mode) {
    state.viewMode = mode;
    elements.btnGridView.classList.toggle('active', mode === 'grid');
    elements.btnListView.classList.toggle('active', mode === 'list');
    elements.screenshotsGrid.classList.toggle('list-view', mode === 'list');
    renderScreenshots();
  }

  // ==================== 截图操作 ====================

  async function capturePage() {
    if (!state.currentFeature) {
      showToast('请先选择一个功能节点', 'warning');
      return;
    }

    try {
      showToast('正在截图...', 'info');

      const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });

      if (!response.success) {
        throw new Error(response.error);
      }

      const timestamp = Date.now();
      const featurePath = getFeatureFullPath(state.currentFeature);
      const filename = `${sanitizeFilename(featurePath)}_页面_${formatDateTime(timestamp)}.png`;

      const saveResponse = await chrome.runtime.sendMessage({
        action: 'createScreenshot',
        data: {
          featureId: state.currentFeature.id,
          filename,
          original: response.dataUrl,
          pageUrl: '',
          pageTitle: ''
        }
      });

      if (saveResponse.success) {
        showToast('截图已保存', 'success');
        state.screenshotsMap[state.currentFeature.id] = state.screenshotsMap[state.currentFeature.id] || [];
        state.screenshotsMap[state.currentFeature.id].push(saveResponse.data);
        state.screenshots = state.screenshotsMap[state.currentFeature.id];
        renderFeatureTree();
        renderScreenshots();
        await updateStorageStats();
      } else {
        throw new Error(saveResponse.error);
      }

    } catch (error) {
      console.error('[WFC] 截图失败:', error);
      showToast('截图失败: ' + error.message, 'error');
    }
  }

  async function selectElement() {
    if (!state.currentFeature) {
      showToast('请先选择一个功能节点', 'warning');
      return;
    }

    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showToast('无法获取当前标签页', 'error');
      return;
    }

    // 检查是否是特殊页面
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      showToast('此页面不支持截图', 'warning');
      return;
    }

    try {
      // 注入脚本并发送消息
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/element-selector.js', 'content/floating-button.js']
      });

      await chrome.tabs.sendMessage(tab.id, { action: 'enterSelectionMode' });
      showToast('请在页面中选择元素', 'info');
    } catch (error) {
      console.error('[WFC] 启动选择模式失败:', error);
      showToast('启动失败，请刷新页面重试', 'error');
    }
  }

  // ==================== 预览 ====================

  function openPreview(index) {
    if (index < 0 || index >= state.screenshots.length) return;

    state.currentScreenshotIndex = index;
    const screenshot = state.screenshots[index];

    elements.previewImage.src = screenshot.original;
    elements.previewTitle.textContent = screenshot.filename;
    elements.previewInfo.textContent = `${formatTime(screenshot.createdAt)} | ${screenshot.pageTitle || ''}`;

    updatePreviewNavigation();
    elements.modalPreview.classList.add('active');
  }

  function navigatePreview(direction) {
    const newIndex = state.currentScreenshotIndex + direction;
    if (newIndex >= 0 && newIndex < state.screenshots.length) {
      openPreview(newIndex);
    }
  }

  function updatePreviewNavigation() {
    elements.btnPrevScreenshot.disabled = state.currentScreenshotIndex <= 0;
    elements.btnNextScreenshot.disabled = state.currentScreenshotIndex >= state.screenshots.length - 1;
  }

  async function deleteCurrentScreenshot() {
    if (state.currentScreenshotIndex < 0) return;

    const screenshot = state.screenshots[state.currentScreenshotIndex];

    elements.confirmMessage.textContent = '确定要删除这张截图吗？';
    elements.btnConfirm.onclick = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'deleteScreenshot',
          data: { id: screenshot.id }
        });

        if (response.success) {
          showToast('截图已删除', 'success');
          closeAllModals();

          state.screenshotsMap[state.currentFeature.id] = state.screenshotsMap[state.currentFeature.id].filter(s => s.id !== screenshot.id);
          state.screenshots = state.screenshotsMap[state.currentFeature.id];

          renderFeatureTree();
          renderScreenshots();
          await updateStorageStats();
        }
      } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
      }
    };

    elements.modalConfirm.classList.add('active');
  }

  async function downloadCurrentScreenshot() {
    if (state.currentScreenshotIndex < 0) return;

    const screenshot = state.screenshots[state.currentScreenshotIndex];

    try {
      const a = document.createElement('a');
      a.href = screenshot.original;
      a.download = screenshot.filename;
      a.click();
      showToast('下载已开始', 'success');
    } catch (error) {
      showToast('下载失败: ' + error.message, 'error');
    }
  }

  function confirmDeleteScreenshot(index) {
    state.currentScreenshotIndex = index;
    const screenshot = state.screenshots[index];

    elements.confirmMessage.textContent = '确定要删除这张截图吗？';
    elements.btnConfirm.onclick = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'deleteScreenshot',
          data: { id: screenshot.id }
        });

        if (response.success) {
          showToast('截图已删除', 'success');
          closeAllModals();

          state.screenshotsMap[state.currentFeature.id] = state.screenshotsMap[state.currentFeature.id].filter(s => s.id !== screenshot.id);
          state.screenshots = state.screenshotsMap[state.currentFeature.id];

          renderFeatureTree();
          renderScreenshots();
          await updateStorageStats();
        }
      } catch (error) {
        showToast('删除失败: ' + error.message, 'error');
      }
    };

    elements.modalConfirm.classList.add('active');
  }

  // ==================== ZIP 导出 ====================

  // 获取功能节点的完整路径名称
  function getFeatureFullPath(feature) {
    const parts = [feature.name];
    let current = feature;

    while (current.parentId) {
      const parent = state.features.find(f => f.id === current.parentId);
      if (parent) {
        parts.unshift(parent.name);
        current = parent;
      } else {
        break;
      }
    }

    return parts.join('-');
  }

  // 递归获取所有功能节点（包括子节点）
  function getAllFeaturesRecursive(parentId = null) {
    const result = [];
    const children = state.features.filter(f => f.parentId === parentId);

    for (const child of children) {
      result.push(child);
      result.push(...getAllFeaturesRecursive(child.id));
    }

    return result;
  }

  async function exportData() {
    if (state.features.length === 0) {
      showToast('暂无数据可导出', 'warning');
      return;
    }

    try {
      showToast('正在准备导出...', 'info');

      // 动态加载 JSZip
      await loadJSZip();

      if (typeof JSZip === 'undefined') {
        throw new Error('JSZip 库未加载成功');
      }

      console.log('[WFC] 开始创建 ZIP 文件');
      const zip = new JSZip();
      let folderIndex = 1;
      let exportedCount = 0;

      // 获取所有功能节点（按树形结构递归）
      const allFeatures = getAllFeaturesRecursive();

      // 按功能节点创建文件夹
      for (const feature of allFeatures) {
        const screenshots = state.screenshotsMap[feature.id] || [];

        // 使用完整路径作为文件夹名
        const fullPath = getFeatureFullPath(feature);
        const folderName = `${String(folderIndex).padStart(2, '0')}-${sanitizeFilename(fullPath)}`;
        const folder = zip.folder(folderName);

        // 添加截图文件
        for (let i = 0; i < screenshots.length; i++) {
          const s = screenshots[i];
          try {
            if (!s.original || !s.original.includes(',')) {
              console.warn('[WFC] 截图数据无效:', s.filename);
              continue;
            }
            const base64Data = s.original.split(',')[1];
            if (base64Data) {
              folder.file(s.filename, base64Data, { base64: true });
              exportedCount++;
            }
          } catch (e) {
            console.error('[WFC] 添加文件失败:', s.filename, e);
          }
        }

        // 添加 metadata.json
        folder.file('metadata.json', JSON.stringify({
          feature: { id: feature.id, name: feature.name, fullPath: fullPath },
          screenshots: screenshots.map(s => ({
            filename: s.filename,
            pageUrl: s.pageUrl,
            createdAt: new Date(s.createdAt).toISOString()
          }))
        }, null, 2));

        folderIndex++;
      }

      // 添加总览文件
      zip.file('summary.json', JSON.stringify({
        exportedAt: new Date().toISOString(),
        totalFeatures: allFeatures.length,
        totalScreenshots: exportedCount,
        features: allFeatures.map(f => ({
          id: f.id,
          name: f.name,
          fullPath: getFeatureFullPath(f),
          screenshotCount: (state.screenshotsMap[f.id] || []).length
        }))
      }, null, 2));

      console.log('[WFC] 生成 ZIP 文件中...');
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);

      const timestamp = Date.now();
      const a = document.createElement('a');
      a.href = url;
      a.download = `workflow-captures_${formatDateTime(timestamp)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
      showToast(`已导出 ${allFeatures.length} 个功能节点，${exportedCount} 张截图`, 'success');

    } catch (error) {
      console.error('[WFC] 导出失败:', error);
      showToast('导出失败: ' + (error.message || '未知错误'), 'error');
    }
  }

  async function loadJSZip() {
    // 如果已经加载过，直接返回
    if (typeof JSZip !== 'undefined') {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../shared/jszip.min.js';
      script.onload = () => {
        console.log('[WFC] JSZip 加载成功');
        resolve();
      };
      script.onerror = () => {
        console.error('[WFC] JSZip 加载失败');
        reject(new Error('JSZip 库加载失败'));
      };
      document.head.appendChild(script);
    });
  }

  // ==================== 工具函数 ====================

  async function updateStorageStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStorageStats' });
      if (response.success) {
        const stats = response.data;
        elements.storageStats.textContent = `存储: ${stats.featureCount} 个功能, ${stats.screenshotCount} 张截图, ${stats.totalSizeMB} MB`;
      }
    } catch (error) {
      console.error('[WFC] 获取存储统计失败:', error);
    }
  }

  function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('active');
    });
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      closeAllModals();
    }

    if (elements.modalPreview.classList.contains('active')) {
      if (e.key === 'ArrowLeft') navigatePreview(-1);
      if (e.key === 'ArrowRight') navigatePreview(1);
    }
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sanitizeFilename(name) {
    return name
      .replace(/[\\/:\*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 30);
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}`;
  }

  // 监听来自 content script 的截图完成消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'screenshotCreated') {
      loadAllData();
    }
  });

  // ==================== 启动 ====================

  document.addEventListener('DOMContentLoaded', init);

})();
