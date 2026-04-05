/**
 * 悬浮按钮模块
 * 可拖拽位置，点击进入截图选择模式
 */

(function() {
  'use strict';

  const BUTTON_ID = 'wfc-floating-button';
  let button = null;
  let isDragging = false;
  let hasMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let buttonStartX = 0;
  let buttonStartY = 0;

  // 默认位置（右下角偏移）
  const DEFAULT_POSITION = { right: 20, bottom: 20 };

  // ==================== 公共 API ====================

  window.initFloatingButton = function() {
    if (document.getElementById(BUTTON_ID)) return;

    createButton();
    loadPosition();
    console.log('[WFC] 悬浮按钮已初始化');
  };

  window.destroyFloatingButton = function() {
    const btn = document.getElementById(BUTTON_ID);
    if (btn) {
      btn.remove();
      button = null;
    }
  };

  window.showFloatingButton = function() {
    if (button) {
      button.style.display = 'flex';
    }
  };

  window.hideFloatingButton = function() {
    if (button) {
      button.style.display = 'none';
    }
  };

  // ==================== 创建按钮 ====================

  function createButton() {
    button = document.createElement('div');
    button.id = BUTTON_ID;
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
        <circle cx="12" cy="13" r="4"></circle>
      </svg>
    `;

    // 应用样式
    Object.assign(button.style, {
      position: 'fixed',
      width: '48px',
      height: '48px',
      backgroundColor: '#ea4335',
      color: 'white',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      zIndex: '2147483647',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s',
      userSelect: 'none',
      right: DEFAULT_POSITION.right + 'px',
      bottom: DEFAULT_POSITION.bottom + 'px'
    });

    // 悬停效果
    button.addEventListener('mouseenter', () => {
      if (!isDragging) {
        button.style.transform = 'scale(1.1)';
        button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
      }
    });

    button.addEventListener('mouseleave', () => {
      if (!isDragging) {
        button.style.transform = 'scale(1)';
        button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
      }
    });

    // 拖拽和点击事件
    button.addEventListener('mousedown', handleMouseDown);

    document.body.appendChild(button);
  }

  // ==================== 拖拽逻辑 ====================

  function handleMouseDown(e) {
    e.preventDefault();

    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    // 获取按钮当前位置
    const rect = button.getBoundingClientRect();
    buttonStartX = rect.left;
    buttonStartY = rect.top;

    // 切换到绝对定位
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    button.style.left = buttonStartX + 'px';
    button.style.top = buttonStartY + 'px';

    button.style.transition = 'none';
    button.style.cursor = 'grabbing';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e) {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    // 如果移动超过 5px，认为是拖拽
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      hasMoved = true;
    }

    let newX = buttonStartX + deltaX;
    let newY = buttonStartY + deltaY;

    // 限制在视口内
    const maxX = window.innerWidth - button.offsetWidth;
    const maxY = window.innerHeight - button.offsetHeight;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    button.style.left = newX + 'px';
    button.style.top = newY + 'px';
  }

  function handleMouseUp(e) {
    if (!isDragging) return;

    isDragging = false;
    button.style.cursor = 'pointer';
    button.style.transition = 'transform 0.2s, box-shadow 0.2s';

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // 如果没有移动，触发点击事件
    if (!hasMoved) {
      handleClick(e);
    } else {
      // 保存位置
      savePosition();
    }
  }

  // ==================== 点击处理 ====================

  async function handleClick(e) {
    console.log('[WFC] 悬浮按钮点击');

    // 检查是否有选中的功能节点
    const currentFeature = await getCurrentFeature();
    if (!currentFeature) {
      showToast('请先在侧边栏选择一个功能节点', 'warning');
      return;
    }

    // 进入元素选择模式
    window.enterSelectionMode(async (elementInfo) => {
      console.log('[WFC] 元素选中:', elementInfo);

      try {
        showToast('正在截图...', 'info');

        // 请求截图
        const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });

        if (!response.success) {
          throw new Error(response.error || '截图失败');
        }

        // 验证截图数据
        if (!response.dataUrl || response.dataUrl.length < 100) {
          throw new Error('截图数据无效');
        }

        console.log('[WFC] 截图成功, 数据大小:', response.dataUrl.length);

        // 生成缩略图
        const thumbnail = await generateThumbnail(response.dataUrl);

        // 生成文件名
        const timestamp = Date.now();
        const filename = generateFilename(currentFeature.name, elementInfo, timestamp);

        // 保存截图
        const saveResponse = await chrome.runtime.sendMessage({
          action: 'createScreenshot',
          data: {
            featureId: currentFeature.id,
            filename: filename,
            original: response.dataUrl,
            thumbnail: thumbnail,
            elementInfo: elementInfo,
            pageUrl: window.location.href,
            pageTitle: document.title,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            }
          }
        });

        if (!saveResponse.success) {
          throw new Error(saveResponse.error || '保存失败');
        }

        console.log('[WFC] 截图保存成功:', saveResponse.data.id);

        showToast('截图已保存', 'success');

        // 保持选择模式，允许连续截图
        // window.exitSelectionMode();

      } catch (error) {
        console.error('[WFC] 截图流程错误:', error);
        showToast('截图失败: ' + error.message, 'error');
      }
    });
  }

  // ==================== 辅助函数 ====================

  async function getCurrentFeature() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['currentFeature'], (result) => {
        resolve(result.currentFeature || null);
      });
    });
  }

  function generateFilename(featureName, elementInfo, timestamp) {
    const type = getElementType(elementInfo?.tag || 'div');
    const text = elementInfo?.text ? sanitizeFilename(elementInfo.text.substring(0, 15)) : '';
    const time = formatDateTime(timestamp);

    if (text) {
      return `${sanitizeFilename(featureName)}_${type}_${text}_${time}.png`;
    }
    return `${sanitizeFilename(featureName)}_${type}_${time}.png`;
  }

  function sanitizeFilename(name) {
    return name
      .replace(/[\\/:\*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 30);
  }

  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
  }

  // 生成缩略图
  async function generateThumbnail(dataUrl, maxWidth = 300) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          const ratio = maxWidth / img.width;
          const width = maxWidth;
          const height = Math.round(img.height * ratio);

          canvas.width = width;
          canvas.height = height;

          ctx.drawImage(img, 0, 0, width, height);

          // 转换为 JPEG
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(thumbnailUrl);
        } catch (error) {
          console.error('[WFC] 缩略图生成失败:', error);
          resolve(null); // 失败时返回 null，不影响主流程
        }
      };

      img.onerror = () => {
        console.error('[WFC] 图片加载失败');
        resolve(null);
      };

      img.src = dataUrl;
    });
  }

  function getElementType(tag) {
    const typeMap = {
      button: '按钮',
      input: '输入框',
      textarea: '文本域',
      select: '下拉框',
      a: '链接',
      img: '图片',
      div: '区域',
      span: '文本',
      p: '段落',
      h1: '标题',
      h2: '标题',
      h3: '标题'
    };
    return typeMap[tag.toLowerCase()] || '元素';
  }

  function showToast(message, type = 'info') {
    // 移除之前的 toast
    const existingToast = document.getElementById('wfc-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'wfc-toast';
    toast.textContent = message;

    const colors = {
      success: '#34a853',
      error: '#ea4335',
      warning: '#fbbc04',
      info: '#1a73e8'
    };

    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '80px',
      right: '20px',
      backgroundColor: colors[type] || colors.info,
      color: 'white',
      padding: '12px 20px',
      borderRadius: '8px',
      fontSize: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      zIndex: '2147483647',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      maxWidth: '300px',
      wordBreak: 'break-word'
    });

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ==================== 位置持久化 ====================

  function savePosition() {
    const position = {
      left: parseInt(button.style.left) || 0,
      top: parseInt(button.style.top) || 0
    };

    chrome.storage.local.set({ floatingButtonPosition: position });
    console.log('[WFC] 按钮位置已保存:', position);
  }

  function loadPosition() {
    chrome.storage.local.get(['floatingButtonPosition'], (result) => {
      const position = result.floatingButtonPosition;
      if (position && button) {
        // 验证位置是否在视口内
        const maxX = window.innerWidth - button.offsetWidth;
        const maxY = window.innerHeight - button.offsetHeight;

        const left = Math.max(0, Math.min(position.left, maxX));
        const top = Math.max(0, Math.min(position.top, maxY));

        button.style.left = left + 'px';
        button.style.top = top + 'px';
        button.style.right = 'auto';
        button.style.bottom = 'auto';
      }
    });
  }

})();
