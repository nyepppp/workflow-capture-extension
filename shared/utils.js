/**
 * 工具函数模块
 */

// 生成 UUID
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 格式化日期时间
export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// 格式化显示时间
export function formatDisplayTime(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// 清理文件名（移除非法字符）
export function sanitizeFilename(name) {
  return name
    .replace(/[\\/:\*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 50);
}

// 元素类型映射
export const elementTypeMap = {
  button: '按钮',
  input: '输入框',
  textarea: '文本域',
  select: '下拉框',
  checkbox: '复选框',
  radio: '单选框',
  a: '链接',
  nav: '导航',
  div: '区域',
  section: '区块',
  article: '文章',
  aside: '侧边栏',
  header: '头部',
  footer: '底部',
  span: '文本',
  p: '段落',
  h1: '标题1',
  h2: '标题2',
  h3: '标题3',
  h4: '标题4',
  h5: '标题5',
  h6: '标题6',
  img: '图片',
  video: '视频',
  canvas: '画布',
  ul: '列表',
  ol: '有序列表',
  li: '列表项',
  table: '表格',
  tr: '行',
  td: '单元格',
  form: '表单',
  label: '标签',
  default: '元素'
};

// 获取元素类型名称
export function getElementTypeName(tag) {
  return elementTypeMap[tag.toLowerCase()] || elementTypeMap.default;
}

// 生成截图文件名
export function generateScreenshotFilename(featureName, elementInfo, timestamp) {
  const type = getElementTypeName(elementInfo?.tag || 'div');
  const text = elementInfo?.text ? sanitizeFilename(elementInfo.text.substring(0, 15)) : '';
  const time = formatDateTime(timestamp);

  if (text) {
    return `${sanitizeFilename(featureName)}_${type}_${text}_${time}.png`;
  }
  return `${sanitizeFilename(featureName)}_${type}_${time}.png`;
}

// 日志工具
export const logger = {
  info: (...args) => console.log('[WFC]', ...args),
  error: (...args) => console.error('[WFC ERROR]', ...args),
  warn: (...args) => console.warn('[WFC WARN]', ...args),
  debug: (...args) => console.debug('[WFC DEBUG]', ...args)
};
