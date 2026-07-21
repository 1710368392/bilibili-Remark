# Bilibili 用户备注助手

为 Bilibili 用户添加自定义备注，支持多标签和自定义配色。

## 功能

- 按住 Shift + 右键用户名即可添加备注
- 支持自定义彩色标签
- 支持标签＆文本备注
- 数据跨页面同步（GM 存储）
- 支持导出/导入 JSON 备份
- 管理面板支持搜索

## 版本

| 版本 | 说明 |
|------|------|
| **Tampermonkey 脚本** | 适用于 Tampermonkey / Violentmonkey 等脚本管理器 |
| **Chrome 扩展** | 适用于 Google Chrome 浏览器（Manifest V3） |
| **Edge 扩展** | 适用于 Microsoft Edge 浏览器 |

## 安装

### Tampermonkey 脚本（推荐）

**快速安装**：[点击安装脚本](https://gist.githubusercontent.com/1710368392/3029c0157b3b3be5561b54796bbb7849/raw/bilibili-user-note-v1.3.0.user.js)

或手动安装：
1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → 添加新脚本
3. 复制 `tampermonkey/bilibili-user-note.user.js` 的内容并粘贴
4. 保存（Ctrl+S）

### Chrome 扩展

1. 下载本仓库的 `chrome-extension` 文件夹
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择下载的 `chrome-extension` 文件夹

### Edge 扩展

1. 下载本仓库的 `edge-extension` 文件夹
2. 打开 Edge 浏览器，访问 `edge://extensions/`
3. 开启「开发人员模式」
4. 点击「加载解压缩的扩展」
5. 选择下载的 `edge-extension` 文件夹

## 使用

1. 按住 **Shift** 键
2. **右键**点击任意用户名
3. 在弹出的面板中添加标签和备注
4. 标签输入文字后按 **Enter** 添加，点击左侧圆点选择颜色
5. 点击扩展图标（或脚本菜单）可管理所有备注

## 支持的页面

- 视频播放页（评论区）
- 动态页
- 搜索页
- 关注/粉丝列表
- 个人主页 (space.bilibili.com)
- 聊天/私信页

## 许可证

MIT License

## 作者

**糖心月**
GitHub: https://github.com/1710368392
