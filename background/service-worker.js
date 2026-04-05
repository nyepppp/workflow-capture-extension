/**
 * Background Service Worker
 * 处理截图 API、消息路由、侧边栏管理
 */

// 数据库配置
const DB_NAME = 'WorkflowCaptureDB';
const DB_VERSION = 1;

// 初始化数据库
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains('features')) {
        const featureStore = database.createObjectStore('features', { keyPath: 'id' });
        featureStore.createIndex('parentId', 'parentId', { unique: false });
        featureStore.createIndex('order', 'order', { unique: false });
      }

      if (!database.objectStoreNames.contains('screenshots')) {
        const screenshotStore = database.createObjectStore('screenshots', { keyPath: 'id' });
        screenshotStore.createIndex('featureId', 'featureId', { unique: false });
        screenshotStore.createIndex('order', 'order', { unique: false });
        screenshotStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

// 数据库操作函数
async function dbGetAllFeatures() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['features'], 'readonly');
    const store = transaction.objectStore('features');
    const request = store.getAll();
    request.onsuccess = () => {
      const features = request.result || [];
      features.sort((a, b) => (a.order || 0) - (b.order || 0));
      resolve(features);
    };
    request.onerror = () => reject(request.error);
  });
}

async function dbCreateFeature(data) {
  const db = await initDB();
  const features = await dbGetAllFeatures();
  const maxOrder = features.filter(f => f.parentId === data.parentId).length;

  const feature = {
    id: data.id || crypto.randomUUID(),
    name: data.name,
    parentId: data.parentId || null,
    order: maxOrder,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['features'], 'readwrite');
    const store = transaction.objectStore('features');
    const request = store.add(feature);
    request.onsuccess = () => resolve(feature);
    request.onerror = () => reject(request.error);
  });
}

async function dbUpdateFeature(id, updates) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['features'], 'readwrite');
    const store = transaction.objectStore('features');
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      if (!getRequest.result) {
        reject(new Error('功能节点不存在'));
        return;
      }
      const feature = { ...getRequest.result, ...updates, updatedAt: Date.now() };
      const putRequest = store.put(feature);
      putRequest.onsuccess = () => resolve(feature);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

async function dbDeleteFeature(id) {
  const db = await initDB();
  const features = await dbGetAllFeatures();

  const getAllDescendants = (parentId) => {
    const children = features.filter(f => f.parentId === parentId);
    let descendants = [...children];
    for (const child of children) {
      descendants = [...descendants, ...getAllDescendants(child.id)];
    }
    return descendants;
  };

  const descendants = getAllDescendants(id);
  const allIds = [id, ...descendants.map(d => d.id)];

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['features', 'screenshots'], 'readwrite');
    const featureStore = transaction.objectStore('features');
    const screenshotStore = transaction.objectStore('screenshots');
    const screenshotIndex = screenshotStore.index('featureId');

    for (const featureId of allIds) {
      featureStore.delete(featureId);
      const req = screenshotIndex.getAll(featureId);
      req.onsuccess = () => {
        for (const s of req.result || []) {
          screenshotStore.delete(s.id);
        }
      };
    }

    transaction.oncomplete = () => resolve({ deletedCount: allIds.length });
    transaction.onerror = () => reject(transaction.error);
  });
}

async function dbGetScreenshotsByFeature(featureId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['screenshots'], 'readonly');
    const store = transaction.objectStore('screenshots');
    const index = store.index('featureId');
    const request = index.getAll(featureId);
    request.onsuccess = () => {
      const screenshots = request.result || [];
      screenshots.sort((a, b) => (a.order || 0) - (b.order || 0));
      resolve(screenshots);
    };
    request.onerror = () => reject(request.error);
  });
}

async function dbCreateScreenshot(data) {
  const db = await initDB();
  const screenshots = await dbGetScreenshotsByFeature(data.featureId);
  const maxOrder = screenshots.length;

  const screenshot = {
    id: data.id || crypto.randomUUID(),
    featureId: data.featureId,
    filename: data.filename,
    thumbnail: data.thumbnail,
    original: data.original,
    elementInfo: data.elementInfo || null,
    pageUrl: data.pageUrl || '',
    pageTitle: data.pageTitle || '',
    viewport: data.viewport || null,
    order: maxOrder,
    createdAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['screenshots'], 'readwrite');
    const store = transaction.objectStore('screenshots');
    const request = store.add(screenshot);
    request.onsuccess = () => resolve(screenshot);
    request.onerror = () => reject(request.error);
  });
}

async function dbDeleteScreenshot(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['screenshots'], 'readwrite');
    const store = transaction.objectStore('screenshots');
    const request = store.delete(id);
    request.onsuccess = () => resolve({ success: true });
    request.onerror = () => reject(request.error);
  });
}

async function dbDeleteScreenshots(ids) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['screenshots'], 'readwrite');
    const store = transaction.objectStore('screenshots');
    for (const id of ids) {
      store.delete(id);
    }
    transaction.oncomplete = () => resolve({ success: true });
    transaction.onerror = () => reject(transaction.error);
  });
}

async function dbGetStorageStats() {
  const features = await dbGetAllFeatures();
  let totalScreenshots = 0;
  let totalSize = 0;

  for (const feature of features) {
    const screenshots = await dbGetScreenshotsByFeature(feature.id);
    totalScreenshots += screenshots.length;
    for (const s of screenshots) {
      if (s.original) totalSize += s.original.length;
    }
  }

  return {
    featureCount: features.length,
    screenshotCount: totalScreenshots,
    totalSizeBytes: totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
  };
}

// ==================== 事件监听 ====================

// 安装时初始化
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[WFC] 扩展已安装:', details.reason);
  // 不再自动打开页面
});

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// 设置侧边栏选项
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ==================== 消息处理 ====================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, data } = request;

  console.log('[WFC] 收到消息:', action);

  handleMessage(action, data, sender)
    .then(result => {
      console.log('[WFC] 消息处理成功:', action);
      sendResponse(result);
    })
    .catch(error => {
      console.error('[WFC] 消息处理错误:', error);
      sendResponse({ success: false, error: error.message });
    });

  return true; // 异步响应
});

async function handleMessage(action, data, sender) {
  switch (action) {
    case 'captureScreenshot':
      return await handleCaptureScreenshot(sender.tab?.id);

    case 'getAllFeatures':
      return await handleGetAllFeatures();

    case 'createFeature':
      return await handleCreateFeature(data);

    case 'updateFeature':
      return await handleUpdateFeature(data.id, data.updates);

    case 'deleteFeature':
      return await handleDeleteFeature(data.id);

    case 'getScreenshotsByFeature':
      return await handleGetScreenshotsByFeature(data.featureId);

    case 'createScreenshot':
      return await handleCreateScreenshot(data);

    case 'deleteScreenshot':
      return await handleDeleteScreenshot(data.id);

    case 'deleteScreenshots':
      return await handleDeleteScreenshots(data.ids);

    case 'getStorageStats':
      return await handleGetStorageStats();

    default:
      throw new Error('未知操作: ' + action);
  }
}

// ==================== 处理器函数 ====================

// 截图捕获
async function handleCaptureScreenshot(tabId) {
  console.log('[WFC] 开始截图, tabId:', tabId);

  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  }

  if (!tabId) {
    throw new Error('无法获取当前标签页');
  }

  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    throw new Error('此页面不支持截图');
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });

    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      throw new Error('截图数据无效');
    }

    console.log('[WFC] 截图成功, 数据大小:', dataUrl.length);

    return { success: true, dataUrl };
  } catch (error) {
    console.error('[WFC] 截图失败:', error);
    throw new Error('截图失败: ' + error.message);
  }
}

async function handleGetAllFeatures() {
  const features = await dbGetAllFeatures();
  return { success: true, data: features };
}

async function handleCreateFeature(data) {
  const feature = await dbCreateFeature(data);
  return { success: true, data: feature };
}

async function handleUpdateFeature(id, updates) {
  const feature = await dbUpdateFeature(id, updates);
  return { success: true, data: feature };
}

async function handleDeleteFeature(id) {
  await dbDeleteFeature(id);
  return { success: true };
}

async function handleGetScreenshotsByFeature(featureId) {
  const screenshots = await dbGetScreenshotsByFeature(featureId);
  return { success: true, data: screenshots };
}

async function handleCreateScreenshot(data) {
  // 缩略图由 content script 生成
  const screenshot = await dbCreateScreenshot({
    ...data,
    thumbnail: data.thumbnail || null
  });

  console.log('[WFC] 截图保存成功:', screenshot.id);

  return { success: true, data: screenshot };
}

async function handleDeleteScreenshot(id) {
  await dbDeleteScreenshot(id);
  return { success: true };
}

async function handleDeleteScreenshots(ids) {
  await dbDeleteScreenshots(ids);
  return { success: true };
}

async function handleGetStorageStats() {
  const stats = await dbGetStorageStats();
  return { success: true, data: stats };
}

console.log('[WFC] Service Worker 已加载');
