/**
 * 元素选择器模块
 *
 * 功能：
 * 1. 鼠标移动自动高亮元素（只有框框，没有遮罩）
 * 2. 点击选择元素截图
 * 3. ESC 取消
 */

(function() {
  'use strict';

  // 选择器状态
  let isSelectionMode = false;
  let highlightedElement = null;
  let highlightBox = null;
  let infoBar = null;
  let onElementSelected = null;

  // 需要忽略的标签
  const IGNORED_TAGS = new Set(['html', 'body', 'head', 'script', 'style', 'meta', 'link', 'noscript', 'iframe']);

  // ==================== 公共 API ====================

  window.enterSelectionMode = function(callback) {
    if (isSelectionMode) return;

    isSelectionMode = true;
    onElementSelected = callback;
    highlightedElement = null;

    createHighlightBox();
    createInfoBar();
    bindEvents();

    document.body.style.cursor = 'crosshair';

    console.log('[WFC] 进入元素选择模式');
  };

  window.exitSelectionMode = function() {
    if (!isSelectionMode) return;

    isSelectionMode = false;
    onElementSelected = null;

    removeHighlightBox();
    removeInfoBar();
    unbindEvents();

    if (highlightedElement) {
      highlightedElement.style.outline = '';
      highlightedElement = null;
    }

    document.body.style.cursor = '';

    console.log('[WFC] 退出元素选择模式');
  };

  // ==================== 事件处理 ====================

  function bindEvents() {
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  function unbindEvents() {
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  }

  // 鼠标移动 - 自动选择最佳元素
  function handleMouseMove(e) {
    if (!isSelectionMode) return;

    const element = document.elementFromPoint(e.clientX, e.clientY);

    if (!element) return;

    // 忽略扩展元素
    if (element.id === 'wfc-highlight-box' ||
        element.id === 'wfc-info-bar' ||
        element.closest?.('#wfc-floating-button')) {
      return;
    }

    // 过滤不需要的元素
    const validElement = findValidElement(element);

    if (validElement && validElement !== highlightedElement) {
      highlightElement(validElement);
      updateInfoBar(validElement);
    }
  }

  // 找到有效的可交互元素
  function findValidElement(element) {
    let current = element;

    while (current && current !== document.body) {
      const tag = current.tagName?.toLowerCase();

      if (IGNORED_TAGS.has(tag)) {
        current = current.parentElement;
        continue;
      }

      const rect = current.getBoundingClientRect();
      const viewportArea = window.innerWidth * window.innerHeight;
      const elementArea = rect.width * rect.height;

      if (elementArea > viewportArea * 0.7) {
        current = current.parentElement;
        continue;
      }

      return current;
    }

    if (element && !IGNORED_TAGS.has(element.tagName?.toLowerCase())) {
      return element;
    }

    return null;
  }

  // 点击 - 选择当前高亮的元素
  function handleClick(e) {
    if (!isSelectionMode) return;

    e.preventDefault();
    e.stopPropagation();

    const element = highlightedElement;
    if (element && onElementSelected) {
      const elementInfo = extractElementInfo(element);
      console.log('[WFC] 选中元素:', elementInfo);
      onElementSelected(elementInfo);
    }
  }

  // 按键处理
  function handleKeyDown(e) {
    if (!isSelectionMode) return;

    if (e.key === 'Escape') {
      window.exitSelectionMode();
    }
  }

  // ==================== 高亮逻辑 ====================

  function highlightElement(element) {
    if (highlightedElement) {
      highlightedElement.style.outline = '';
    }

    highlightedElement = element;
    element.style.outline = '3px solid #ea4335';

    updateHighlightBox(element);
  }

  // ==================== UI 创建 ====================

  function createHighlightBox() {
    if (document.getElementById('wfc-highlight-box')) return;

    const box = document.createElement('div');
    box.id = 'wfc-highlight-box';
    Object.assign(box.style, {
      position: 'absolute',
      pointerEvents: 'none',
      border: '2px dashed #ea4335',
      background: 'rgba(234, 67, 53, 0.1)',
      zIndex: '2147483645',
      display: 'none',
      transition: 'all 0.1s ease'
    });

    document.body.appendChild(box);
    highlightBox = box;
  }

  function createInfoBar() {
    if (document.getElementById('wfc-info-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'wfc-info-bar';
    bar.innerHTML = `
      <span class="wfc-info-hint">点击截图 (连续模式) | ESC 退出</span>
      <span class="wfc-info-element"></span>
    `;

    Object.assign(bar.style, {
      position: 'fixed',
      top: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#ea4335',
      color: 'white',
      padding: '10px 20px',
      borderRadius: '6px',
      fontSize: '13px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      zIndex: '2147483647',
      boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    });

    document.body.appendChild(bar);
    infoBar = bar;
  }

  function updateHighlightBox(element) {
    if (!highlightBox || !element) return;

    const rect = element.getBoundingClientRect();

    highlightBox.style.display = 'block';
    highlightBox.style.left = (rect.left + window.scrollX) + 'px';
    highlightBox.style.top = (rect.top + window.scrollY) + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';
  }

  function updateInfoBar(element) {
    if (!infoBar || !element) return;

    const infoEl = infoBar.querySelector('.wfc-info-element');
    if (infoEl) {
      const tag = element.tagName.toLowerCase();
      const id = element.id ? `#${element.id}` : '';
      const text = getElementText(element).substring(0, 25);

      infoEl.textContent = `<${tag}${id}> ${text}`;
    }
  }

  function removeHighlightBox() {
    if (highlightBox) {
      highlightBox.remove();
      highlightBox = null;
    }
  }

  function removeInfoBar() {
    if (infoBar) {
      infoBar.remove();
      infoBar = null;
    }
  }

  // ==================== 元素信息提取 ====================

  function extractElementInfo(element) {
    const rect = element.getBoundingClientRect();

    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      class: (element.className || '').toString() || null,
      text: getElementText(element),
      selector: generateSelector(element),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  }

  function getElementText(element) {
    let text = '';

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      text = element.placeholder || element.value || '';
    } else if (element.tagName === 'IMG') {
      text = element.alt || element.title || '';
    } else {
      text = element.textContent || '';
    }

    return text.trim().replace(/\s+/g, ' ').substring(0, 50);
  }

  function generateSelector(element) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const parts = [];
    let current = element;

    while (current && current !== document.body && parts.length < 4) {
      let selector = current.tagName.toLowerCase();

      if (current.className) {
        const classes = current.className.toString().split(' ').filter(c => c).slice(0, 2);
        if (classes.length > 0) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

})();
