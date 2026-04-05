/**
 * 内容脚本主入口
 * 初始化悬浮按钮，处理消息通信
 */

(function() {
  'use strict';

  // 检查是否启用悬浮按钮
  async function checkEnabled() {
    const result = await chrome.storage.local.get(['floatingButtonEnabled']);
    return result.floatingButtonEnabled !== false; // 默认启用
  }

  // 初始化
  async function init() {
    console.log('[WFC] 内容脚本初始化...');

    // 不再初始化悬浮按钮
    // const enabled = await checkEnabled();
    // if (enabled && typeof window.initFloatingButton === 'function') {
    //   window.initFloatingButton();
    // }

    // 监听来自侧边栏/后台的消息
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      const { action, data } = request;

      switch (action) {
        case 'toggleFloatingButton':
          if (data.enabled) {
            window.initFloatingButton();
          } else {
            window.destroyFloatingButton();
          }
          sendResponse({ success: true });
          break;

        case 'getPageInfo':
          sendResponse({
            success: true,
            data: {
              url: window.location.href,
              title: document.title,
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight
              }
            }
          });
          break;

        case 'setCurrentFeature':
          // 保存当前功能节点到本地存储
          chrome.storage.local.set({ currentFeature: data });
          sendResponse({ success: true });
          break;

        case 'enterSelectionMode':
          // 从侧边栏触发选择模式
          // 使用与悬浮按钮相同的截图保存逻辑
          window.enterSelectionMode(async (elementInfo) => {
            console.log('[WFC] 侧边栏触发 - 元素选中:', elementInfo);

            try {
              // 获取当前功能节点和所有功能节点
              const result = await chrome.storage.local.get(['currentFeature']);
              const currentFeature = result.currentFeature;

              if (!currentFeature) {
                showToast('请先在侧边栏选择一个功能节点', 'warning');
                return;
              }

              showToast('正在截图...', 'info');

              // 请求截图
              const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });

              if (!response.success) {
                throw new Error(response.error || '截图失败');
              }

              if (!response.dataUrl || response.dataUrl.length < 100) {
                throw new Error('截图数据无效');
              }

              console.log('[WFC] 截图成功, 数据大小:', response.dataUrl.length);

              // 生成缩略图
              const thumbnail = await generateThumbnail(response.dataUrl);

              // 获取完整路径作为文件名
              const featurePath = await getFeatureFullPath(currentFeature.id);
              const timestamp = Date.now();
              const filename = generateFilename(featurePath, elementInfo, timestamp);

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

            } catch (error) {
              console.error('[WFC] 截图流程错误:', error);
              showToast('截图失败: ' + error.message, 'error');
            }
          });
          sendResponse({ success: true });
          break;

        case 'exitSelectionMode':
          window.exitSelectionMode();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action: ' + action });
      }

      return true;
    });

    console.log('[WFC] 内容脚本已加载');
  }

  // ==================== 辅助函数 ====================

  // 获取功能节点的完整路径
  async function getFeatureFullPath(featureId) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getAllFeatures' });
      if (!response.success || !response.data) {
        return '';
      }

      const features = response.data;
      const parts = [];
      let current = features.find(f => f.id === featureId);

      while (current) {
        parts.unshift(current.name);
        current = current.parentId ? features.find(f => f.id === current.parentId) : null;
      }

      return parts.join('-');
    } catch (e) {
      return '';
    }
  }

  function generateFilename(featurePath, elementInfo, timestamp) {
    const type = getElementType(elementInfo?.tag || 'div');
    const text = elementInfo?.text ? sanitizeFilename(elementInfo.text.substring(0, 15)) : '';
    const time = formatDateTime(timestamp);

    if (text) {
      return `${sanitizeFilename(featurePath)}_${type}_${text}_${time}.png`;
    }
    return `${sanitizeFilename(featurePath)}_${type}_${time}.png`;
  }

  function sanitizeFilename(name) {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
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

  async function generateThumbnail(dataUrl, maxWidth = 300) {
    return new Promise((resolve) => {
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

          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(thumbnailUrl);
        } catch (error) {
          console.error('[WFC] 缩略图生成失败:', error);
          resolve(null);
        }
      };

      img.onerror = () => {
        console.error('[WFC] 图片加载失败');
        resolve(null);
      };

      img.src = dataUrl;
    });
  }

  function showToast(message, type = 'info') {
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

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
