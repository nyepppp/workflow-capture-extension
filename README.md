# 产品工作流截图工具

Chrome/Edge 浏览器扩展，帮助产品团队快速捕获、组织和管理产品工作流截图。
<img width="2880" height="1599" alt="image" src="https://github.com/user-attachments/assets/7263b997-ad08-4718-8e77-5162489d9740" />

## 安装方法

1. 打开 Chrome/Edge 浏览器
2. 访问 `chrome://extensions/` 或 `edge://extensions/`
3. 开启"开发者模式"（右上角开关）
4. 点击"加载已解压的扩展程序"
5. 选择 `workflow-capture-extension` 文件夹

## 使用方法

### 1. 创建功能节点
- 点击侧边栏顶部的"+ 新建"按钮
- 输入功能名称，可选择父节点创建子功能
- 点击"创建"

### 2. 选择功能节点
- 在功能节点树中点击要工作的节点
- 选中的节点会高亮显示
- 后续截图会自动归属到选中的节点

### 3. 截图
**方式一：悬浮按钮**
- 页面右下角会显示蓝色相机按钮
- 点击按钮进入元素选择模式
- 移动鼠标选择要截图的元素
- 使用 ↑↓ 箭头键切换嵌套元素
- 点击元素完成截图
- 按 ESC 取消

**方式二：侧边栏按钮**
- 点击"截取页面"按钮截取整个页面
- 点击"选择元素"按钮进入元素选择模式

### 4. 管理截图
- 在侧边栏中预览截图
- 点击截图查看大图
- 使用 ←→ 箭头键或按钮切换截图
- 点击删除按钮删除截图

### 5. 导出
- 点击"导出"按钮下载所有截图

## 修复的问题

### Bug 1: 截图保存问题
- **问题**: 显示保存成功但实际未保存
- **修复**:
  - 添加 dataUrl 有效性验证
  - 增加详细的错误日志
  - 优化 IndexedDB 存储流程

### Bug 2: 元素选择问题
- **问题**: 无法选择想要的按钮或 div
- **修复**:
  - 使用 `elementsFromPoint` 获取元素堆栈
  - 添加元素过滤逻辑，忽略大型容器
  - 实现 ↑↓ 箭头键切换嵌套元素
  - 使用透明遮罩层确保点击事件正确捕获

## 技术栈

- Manifest V3
- 原生 JavaScript (ES2020+)
- IndexedDB 存储
- chrome.tabs.captureVisibleTab 截图 API
- 无构建步骤

## 文件结构

```
workflow-capture-extension/
├── manifest.json          # 扩展配置
├── background/
│   └── service-worker.js  # 后台服务
├── content/
│   ├── content.js         # 内容脚本入口
│   ├── element-selector.js # 元素选择器
│   ├── floating-button.js  # 悬浮按钮
│   └── content.css        # 样式
├── sidebar/
│   ├── sidebar.html       # 侧边栏 HTML
│   ├── sidebar.js         # 侧边栏逻辑
│   └── sidebar.css        # 侧边栏样式
├── shared/
│   ├── utils.js           # 工具函数
│   └── database.js        # 数据库封装
├── assets/                # 图标资源
└── _locales/              # 国际化
```

## 调试方法

1. 打开 `chrome://extensions/`
2. 找到扩展，点击"检查视图"下的链接
3. 查看 Console 日志（搜索 `[WFC]`）

### 常见问题

**Q: 悬浮按钮不显示？**
- 检查页面是否是 chrome:// 或 edge:// 开头
- 检查扩展是否正确加载
- 查看控制台是否有错误

**Q: 截图失败？**
- 确保页面是 http:// 或 https://
- 检查扩展是否有截图权限
- 刷新页面重试

**Q: 数据丢失？**
- 数据存储在浏览器 IndexedDB 中
- 清除浏览器数据会删除截图
- 建议定期导出备份
