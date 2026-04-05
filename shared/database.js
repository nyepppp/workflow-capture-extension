/**
 * IndexedDB 数据库层
 * 使用 idb 库封装
 */

// 数据库配置
const DB_NAME = 'WorkflowCaptureDB';
const DB_VERSION = 1;

let db = null;

// 初始化数据库
export async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[WFC] 数据库打开失败:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      console.log('[WFC] 数据库连接成功');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      console.log('[WFC] 数据库升级中...');

      // 创建 features store
      if (!database.objectStoreNames.contains('features')) {
        const featureStore = database.createObjectStore('features', { keyPath: 'id' });
        featureStore.createIndex('parentId', 'parentId', { unique: false });
        featureStore.createIndex('order', 'order', { unique: false });
        console.log('[WFC] features store 创建成功');
      }

      // 创建 screenshots store
      if (!database.objectStoreNames.contains('screenshots')) {
        const screenshotStore = database.createObjectStore('screenshots', { keyPath: 'id' });
        screenshotStore.createIndex('featureId', 'featureId', { unique: false });
        screenshotStore.createIndex('order', 'order', { unique: false });
        screenshotStore.createIndex('createdAt', 'createdAt', { unique: false });
        console.log('[WFC] screenshots store 创建成功');
      }
    };
  });
}

// ==================== 功能节点操作 ====================

// 获取所有功能节点
export async function getAllFeatures() {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['features'], 'readonly');
    const store = transaction.objectStore('features');
    const request = store.getAll();

    request.onsuccess = () => {
      const features = request.result || [];
      // 按 order 排序
      features.sort((a, b) => (a.order || 0) - (b.order || 0));
      resolve(features);
    };

    request.onerror = () => {
      console.error('[WFC] 获取功能节点失败:', request.error);
      reject(request.error);
    };
  });
}

// 创建功能节点
export async function createFeature(data) {
  const database = await initDB();

  // 获取当前最大 order
  const features = await getAllFeatures();
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
    const transaction = database.transaction(['features'], 'readwrite');
    const store = transaction.objectStore('features');
    const request = store.add(feature);

    request.onsuccess = () => {
      console.log('[WFC] 功能节点创建成功:', feature.id);
      resolve(feature);
    };

    request.onerror = () => {
      console.error('[WFC] 功能节点创建失败:', request.error);
      reject(request.error);
    };
  });
}

// 更新功能节点
export async function updateFeature(id, updates) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['features'], 'readwrite');
    const store = transaction.objectStore('features');
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const feature = getRequest.result;
      if (!feature) {
        reject(new Error('功能节点不存在'));
        return;
      }

      const updated = {
        ...feature,
        ...updates,
        updatedAt: Date.now()
      };

      const putRequest = store.put(updated);
      putRequest.onsuccess = () => {
        console.log('[WFC] 功能节点更新成功:', id);
        resolve(updated);
      };
      putRequest.onerror = () => reject(putRequest.error);
    };

    getRequest.onerror = () => reject(getRequest.error);
  });
}

// 删除功能节点（及其子节点和相关截图）
export async function deleteFeature(id) {
  const database = await initDB();

  // 获取所有子节点
  const getAllDescendants = async (parentId) => {
    const features = await getAllFeatures();
    const children = features.filter(f => f.parentId === parentId);
    let descendants = [...children];

    for (const child of children) {
      const childDescendants = await getAllDescendants(child.id);
      descendants = [...descendants, ...childDescendants];
    }

    return descendants;
  };

  const descendants = await getAllDescendants(id);
  const allIds = [id, ...descendants.map(d => d.id)];

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['features', 'screenshots'], 'readwrite');

    // 删除所有相关截图
    const screenshotStore = transaction.objectStore('screenshots');
    const screenshotIndex = screenshotStore.index('featureId');

    for (const featureId of allIds) {
      const screenshotRequest = screenshotIndex.getAll(featureId);
      screenshotRequest.onsuccess = () => {
        const screenshots = screenshotRequest.result || [];
        for (const screenshot of screenshots) {
          screenshotStore.delete(screenshot.id);
        }
      };
    }

    // 删除功能节点
    const featureStore = transaction.objectStore('features');
    for (const featureId of allIds) {
      featureStore.delete(featureId);
    }

    transaction.oncomplete = () => {
      console.log('[WFC] 功能节点删除成功:', id, '共删除', allIds.length, '个节点');
      resolve({ deletedCount: allIds.length });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

// 更新功能节点顺序
export async function updateFeatureOrder(orderedIds) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['features'], 'readwrite');
    const store = transaction.objectStore('features');

    orderedIds.forEach((id, index) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const feature = getRequest.result;
        if (feature) {
          feature.order = index;
          store.put(feature);
        }
      };
    });

    transaction.oncomplete = () => {
      console.log('[WFC] 功能节点顺序更新成功');
      resolve({ success: true });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

// ==================== 截图操作 ====================

// 获取指定功能节点的截图
export async function getScreenshotsByFeature(featureId) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['screenshots'], 'readonly');
    const store = transaction.objectStore('screenshots');
    const index = store.index('featureId');
    const request = index.getAll(featureId);

    request.onsuccess = () => {
      const screenshots = request.result || [];
      // 按 order 排序
      screenshots.sort((a, b) => (a.order || 0) - (b.order || 0));
      resolve(screenshots);
    };

    request.onerror = () => {
      console.error('[WFC] 获取截图失败:', request.error);
      reject(request.error);
    };
  });
}

// 创建截图
export async function createScreenshot(data) {
  const database = await initDB();

  // 获取当前功能节点下的最大 order
  const screenshots = await getScreenshotsByFeature(data.featureId);
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
    const transaction = database.transaction(['screenshots'], 'readwrite');
    const store = transaction.objectStore('screenshots');
    const request = store.add(screenshot);

    request.onsuccess = () => {
      console.log('[WFC] 截图创建成功:', screenshot.id);
      resolve(screenshot);
    };

    request.onerror = () => {
      console.error('[WFC] 截图创建失败:', request.error);
      reject(request.error);
    };
  });
}

// 删除截图
export async function deleteScreenshot(id) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['screenshots'], 'readwrite');
    const store = transaction.objectStore('screenshots');
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log('[WFC] 截图删除成功:', id);
      resolve({ success: true });
    };

    request.onerror = () => reject(request.error);
  });
}

// 批量删除截图
export async function deleteScreenshots(ids) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['screenshots'], 'readwrite');
    const store = transaction.objectStore('screenshots');

    for (const id of ids) {
      store.delete(id);
    }

    transaction.oncomplete = () => {
      console.log('[WFC] 批量删除截图成功:', ids.length);
      resolve({ success: true, deletedCount: ids.length });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

// 更新截图顺序
export async function updateScreenshotOrder(featureId, orderedIds) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['screenshots'], 'readwrite');
    const store = transaction.objectStore('screenshots');

    orderedIds.forEach((id, index) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const screenshot = getRequest.result;
        if (screenshot) {
          screenshot.order = index;
          store.put(screenshot);
        }
      };
    });

    transaction.oncomplete = () => {
      console.log('[WFC] 截图顺序更新成功');
      resolve({ success: true });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}

// 获取存储统计
export async function getStorageStats() {
  const features = await getAllFeatures();
  let totalScreenshots = 0;
  let totalSize = 0;

  for (const feature of features) {
    const screenshots = await getScreenshotsByFeature(feature.id);
    totalScreenshots += screenshots.length;
    for (const s of screenshots) {
      if (s.original) {
        totalSize += s.original.length;
      }
    }
  }

  return {
    featureCount: features.length,
    screenshotCount: totalScreenshots,
    totalSizeBytes: totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
  };
}

// 清空所有数据
export async function clearAllData() {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['features', 'screenshots'], 'readwrite');

    transaction.objectStore('features').clear();
    transaction.objectStore('screenshots').clear();

    transaction.oncomplete = () => {
      console.log('[WFC] 所有数据已清空');
      resolve({ success: true });
    };

    transaction.onerror = () => reject(transaction.error);
  });
}
