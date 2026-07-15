// ==UserScript==
// @name         Bilibili 用户备注助手
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  按住 Shift 右键用户名即可添加备注，支持多标签和自定义配色
// @author       糖心月
// @copyright    2026, 糖心月 (https://github.com/1710368392)
// @license      MIT
// @icon         https://raw.githubusercontent.com/1710368392/bilibili---/main/tampermonkey/icon.png
// @updateURL    https://gist.githubusercontent.com/1710368392/3029c0157b3b3be5561b54796bbb7849/raw/bilibili-user-note-v1.3.0.user.js
// @downloadURL  https://gist.githubusercontent.com/1710368392/3029c0157b3b3be5561b54796bbb7849/raw/bilibili-user-note-v1.3.0.user.js
// @match        https://www.bilibili.com/*
// @match        https://space.bilibili.com/*
// @match        https://message.bilibili.com/*
// @match        https://search.bilibili.com/*
// @match        https://t.bilibili.com/*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

/*
 * Copyright (c) 2026 糖心月
 * GitHub: https://github.com/1710368392
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

(function () {
    'use strict';

    // ==================== 常量 ====================
    const STORAGE_KEY = 'bilibili_user_notes_v2';
    const RECENT_COLORS_KEY = 'bilibili_notes_recent_colors';
    const PROCESSED_ATTR = 'data-bn-processed';
    const TAG_MAX_LENGTH = 20;

    // 内存缓存，避免每次读写都序列化/反序列化
    let _notesCache = null;
    let _notesLoaded = false;

    // ==================== XSS 防护 ====================
    const _escapeDiv = document.createElement('div');
    function escapeHtml(str) {
        if (!str) return '';
        _escapeDiv.textContent = str;
        return _escapeDiv.innerHTML;
    }
    function safeAttr(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    const PRESET_COLORS = [
        { name: '朱砂', value: '#E74C3C' },
        { name: '珊瑚', value: '#FF6B6B' },
        { name: '藤黄', value: '#F39C12' },
        { name: '鹅黄', value: '#F1C40F' },
        { name: '竹青', value: '#27AE60' },
        { name: '靛青', value: '#2980B9' },
        { name: '绛紫', value: '#8E44AD' },
        { name: '赭石', value: '#8B5E3C' },
        { name: '鸦青', value: '#2C3E50' },
        { name: '银鼠', value: '#95A5A6' },
    ];

    const ICONS = {
        tag: '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
        close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        trash: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
        search: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
        check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    };

    // ==================== 样式 ====================
    GM_addStyle(`
        /* 备注容器 */
        .bili-note-wrapper {
            display: inline-flex; align-items: center; gap: 4px;
            margin-left: 6px; vertical-align: middle;
            max-width: 300px; position: relative; overflow: hidden;
        }
        .bili-note-wrapper:hover { z-index: 10; }
        .bili-note-tag {
            display: inline-flex; align-items: center; gap: 3px;
            padding: 1px 6px; height: 18px; font-size: 11px;
            color: #fff; border-radius: 10px; white-space: nowrap; font-weight: 500;
        }
        .bili-note-tag svg { width: 10px; height: 10px; flex-shrink: 0; }
        .bili-note-text {
            display: inline-flex; align-items: center; font-size: 11px;
            color: #9499a0; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis;
            padding-left: 6px; border-left: 1px solid #e3e5e7;
        }
        .bili-note-wrapper .bili-note-tooltip {
            display: none; position: absolute; bottom: calc(100% + 6px); left: 0;
            background: rgba(255, 255, 255, 0.82); color: #18191c;
            padding: 10px 14px; border-radius: 10px;
            font-size: 12px; white-space: normal;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.6);
            backdrop-filter: blur(20px) saturate(1.6); -webkit-backdrop-filter: blur(20px) saturate(1.6);
            z-index: 2147483647; pointer-events: none; max-width: 320px;
            line-height: 1.6; flex-wrap: wrap; align-items: center; gap: 4px;
        }
        .bili-note-wrapper .bili-note-tooltip::before {
            content: ''; position: absolute; bottom: -5px; left: 16px;
            width: 10px; height: 10px;
            background: rgba(255, 255, 255, 0.82); backdrop-filter: blur(20px);
            transform: rotate(45deg);
            box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.08);
        }
        /* tooltip 固定定位版本，挂在 body 上不受父元素裁剪 */
        .bili-note-tooltip-fixed {
            display: none; position: fixed;
            background: rgba(255, 255, 255, 0.82); color: #18191c;
            padding: 10px 14px; border-radius: 10px;
            font-size: 12px; white-space: normal; word-break: break-word;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.6);
            backdrop-filter: blur(20px) saturate(1.6); -webkit-backdrop-filter: blur(20px) saturate(1.6);
            z-index: 2147483647; max-width: 320px;
            line-height: 1.6; flex-wrap: wrap; align-items: center; gap: 6px;
        }
        .bili-note-tooltip-fixed::before {
            content: ''; position: absolute; bottom: -5px; left: 16px;
            width: 10px; height: 10px;
            background: rgba(255, 255, 255, 0.82); backdrop-filter: blur(20px);
            transform: rotate(45deg);
            box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.08);
        }
        .bili-note-tooltip-fixed .bn-tt-tag {
            display: inline-flex; align-items: center; gap: 3px;
            padding: 3px 10px; height: 22px; font-size: 11px;
            color: #fff; border-radius: 11px; font-weight: 500;
            white-space: nowrap; flex-shrink: 0;
        }
        .bili-note-tooltip-fixed .bn-tt-tag svg { width: 10px; height: 10px; }
        .bili-note-tooltip-fixed .bn-tt-text {
            word-break: break-word; color: #333;
        }
        .bili-note-tooltip-fixed .bn-tt-sep {
            color: #999;
        }
        .bili-note-wrapper:hover .bili-note-tooltip { display: none; }
        .bili-note-tag:hover ~ .bili-note-tooltip,
        .bili-note-text:hover ~ .bili-note-tooltip { display: flex; }
        .bili-note-tooltip .bn-tt-tag {
            display: inline-flex; align-items: center; gap: 3px;
            padding: 2px 8px; height: 20px; font-size: 11px;
            color: #fff; border-radius: 10px; font-weight: 500;
            white-space: nowrap; flex-shrink: 0;
        }
        .bili-note-tooltip .bn-tt-tag svg { width: 10px; height: 10px; }
        .bili-note-tooltip .bn-tt-text {
            word-break: break-word; color: #333;
        }
        .bili-note-tooltip .bn-tt-sep { color: #999; }

        /* 弹窗 */
        .bili-note-mask {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0); z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            animation: bn-mask-in 0.2s ease forwards;
        }
        @keyframes bn-mask-in { to { background: rgba(0,0,0,0.5); } }
        .bili-note-modal {
            width: 400px; background: #fff; border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12); overflow: hidden;
            animation: bn-modal-in 0.25s ease forwards;
            opacity: 0;
        }
        @keyframes bn-modal-in { to { opacity: 1; } }
        .bn-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 20px; background: linear-gradient(135deg, #f8f9fa, #fff);
        }
        .bn-title { font-size: 16px; font-weight: 600; color: #18191c; display: flex; align-items: center; gap: 8px; }
        .bn-title svg { color: #00a1d6; }
        .bn-close {
            width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
            border: none; background: transparent; color: #9499a0; cursor: pointer;
            border-radius: 8px; transition: all 0.2s;
        }
        .bn-close:hover { background: #f1f2f3; color: #18191c; }
        .bn-body { padding: 20px; overflow: hidden; }
        .bn-footer {
            display: flex; justify-content: flex-end; gap: 10px;
            padding: 16px 20px; background: #f8f9fa; border-top: 1px solid #f1f2f3;
        }
        .bn-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
        .bn-row:last-child { margin-bottom: 0; }
        .bn-label { width: 48px; font-size: 13px; color: #61666d; flex-shrink: 0; padding-top: 7px; font-weight: 500; }
        .bn-input {
            flex: 1; min-width: 0; min-height: 36px; max-height: 120px; padding: 8px 12px;
            border: 1.5px solid #e3e5e7; border-radius: 8px;
            font-size: 13px; color: #18191c; outline: none; transition: border-color 0.2s;
            resize: none; overflow-y: auto; line-height: 1.4;
            font-family: inherit;
        }
        .bn-input:focus { border-color: #00a1d6; box-shadow: 0 0 0 3px rgba(0,161,214,0.1); }
        .bn-input[readonly] { background: linear-gradient(135deg, #f8f9fa, #f1f2f3); color: #61666d; border-style: dashed; }

        /* 标签区域 */
        .bn-tags-area { flex: 1; min-width: 0; }
        .bn-tags-box {
            display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;
            min-height: 32px; padding: 8px; background: #f8f9fa;
            border-radius: 8px; border: 1px dashed #e3e5e7;
        }
        .bn-tags-box:empty::before { content: '暂无标签'; color: #c9ccd0; font-size: 12px; }
        .bn-tag {
            display: inline-flex; align-items: center; gap: 4px;
            padding: 4px 8px 4px 10px; height: 28px; border-radius: 14px;
            font-size: 12px; color: #fff; font-weight: 500;
            animation: bn-tag-in 0.2s ease;
            cursor: grab; user-select: none; flex-shrink: 0;
            transition: transform 0.15s, box-shadow 0.15s;
        }
        .bn-tag:active { cursor: grabbing; }
        .bn-tag.dragging { opacity: 0.4; transform: scale(0.95); }
        .bn-tag.drag-over { box-shadow: inset 0 0 0 2px #00a1d6; }
        @keyframes bn-tag-in { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .bn-tag-del {
            width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
            background: rgba(255,255,255,0.25); border-radius: 50%; cursor: pointer;
            transition: all 0.2s; margin-left: 2px;
        }
        .bn-tag-del:hover { background: rgba(255,255,255,0.4); transform: scale(1.1); }
        .bn-tag-del svg { width: 10px; height: 10px; }
        .bn-tag-editing {
            background: #fff !important; border: 1.5px solid #00a1d6;
            box-shadow: 0 0 0 3px rgba(0,161,214,0.15);
            padding: 0; gap: 0; cursor: default;
        }
        .bn-tag-editing input {
            width: 80px; height: 24px; border: none; outline: none;
            font-size: 12px; color: #18191c; background: transparent;
            padding: 0 6px; font-family: inherit;
        }
        .bn-tag-input-row { position: relative; display: flex; align-items: flex-start; gap: 8px; margin-left: -32px; }
        .bn-tag-input-left {
            display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; padding-top: 7px;
        }
        .bn-color-dot {
            width: 20px; height: 20px; border-radius: 50%; border: 2px solid #fff;
            box-shadow: 0 0 0 1px #e3e5e7; cursor: pointer; flex-shrink: 0; transition: all 0.2s;
            position: relative;
        }
        .bn-color-dot:hover { transform: scale(1.1); }
        .bn-color-dot-hint::after {
            content: '点击更换颜色'; position: absolute; bottom: calc(100% + 6px); left: 50%;
            transform: translateX(-50%); background: #18191c; color: #fff;
            padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;
            pointer-events: none; z-index: 10; animation: bn-tooltip-in 0.2s ease;
        }
        .bn-tag-input {
            flex: 1; min-width: 0; min-height: 36px; max-height: 80px; padding: 8px 12px;
            border: 1.5px solid #e3e5e7; border-radius: 8px;
            font-size: 13px; outline: none; transition: border-color 0.2s;
            resize: none; overflow-y: auto; line-height: 1.4;
            font-family: inherit;
        }
        .bn-tag-input:focus { border-color: #00a1d6; box-shadow: 0 0 0 3px rgba(0,161,214,0.1); }
        .bn-tag-input::placeholder { color: #c9ccd0; }
        .bn-tag-counter {
            font-size: 11px; color: #9499a0; white-space: nowrap; flex-shrink: 0;
        }
        .bn-tag-counter.warn { color: #f45d5d; }
        .bn-tag-hint { font-size: 12px; color: #9499a0; margin-top: 8px; }
        .bn-template-btn {
            display: inline-flex; align-items: center; padding: 2px 8px; height: 20px;
            font-size: 11px; border: 1px solid #e3e5e7; border-radius: 10px;
            background: #fff; color: #61666d; cursor: pointer;
            transition: all 0.15s; white-space: nowrap; margin-left: 4px;
        }
        .bn-template-btn:hover { border-color: #00a1d6; color: #00a1d6; background: rgba(0,161,214,0.05); }
        .bn-existing-tags { margin-top: 8px; margin-left: -62px; }
        .bn-existing-tags-viewport {
            position: relative; width: 100%; overflow: hidden;
        }
        .bn-existing-tags-viewport::before,
        .bn-existing-tags-viewport::after {
            content: ''; position: absolute; top: 0; bottom: 0; width: 24px;
            z-index: 2; pointer-events: none;
        }
        .bn-existing-tags-viewport::before {
            left: 0;
            background: linear-gradient(90deg, #fff 0%, transparent 100%);
        }
        .bn-existing-tags-viewport::after {
            right: 0;
            background: linear-gradient(270deg, #fff 0%, transparent 100%);
        }
        .bn-existing-tags-track {
            display: flex; flex-wrap: nowrap; gap: 4px;
            width: max-content;
            will-change: transform;
        }
        .bn-existing-tags-track.is-resetting { transition: none; }
        .bn-existing-tag {
            display: inline-flex; align-items: center; padding: 2px 8px; height: 20px;
            font-size: 11px; color: #fff; border-radius: 10px; cursor: pointer;
            transition: all 0.15s; white-space: nowrap; opacity: 0.8;
            flex-shrink: 0;
        }
        .bn-existing-tag:hover { opacity: 1; transform: scale(1.05); }
        .bn-existing-scrollbar {
            position: relative; width: 100%; height: 10px; margin-top: 4px;
            background: #005580; border-radius: 5px; cursor: pointer; overflow: hidden;
        }
        .bn-existing-scrollbar-thumb {
            position: absolute; top: -1px; height: 12px;
            background: linear-gradient(90deg, #006daa, #00b4d8);
            border-radius: 6px; cursor: grab;
            touch-action: none; z-index: 1;
        }
        .bn-existing-scrollbar-thumb:hover { filter: brightness(1.15); }
        .bn-existing-scrollbar-thumb:active { cursor: grabbing; }
        .bn-existing-scrollbar-thumb.snake-r { background: linear-gradient(90deg, var(--tail-c), var(--head-c)); }
        .bn-existing-scrollbar-thumb.snake-l { background: linear-gradient(270deg, var(--tail-c), var(--head-c)); }
        .bn-existing-scrollbar-thumb.s-head-r { border-radius: 6px; }
        .bn-existing-scrollbar-thumb.s-tail-r { border-radius: 6px 0 0 6px; }
        .bn-existing-scrollbar-thumb.s-head-l { border-radius: 6px; }
        .bn-existing-scrollbar-thumb.s-tail-l { border-radius: 0 6px 6px 0; }
        .bn-tag-hint kbd {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 20px; height: 18px; padding: 0 4px;
            background: #f1f2f3; border: 1px solid #e3e5e7; border-radius: 4px;
            font-size: 11px; font-family: inherit; color: #61666d;
        }
        .bn-tag-input-disabled .bn-tag-input,
        .bn-tag-input-disabled .bn-tag-counter,
        .bn-tag-input-disabled .bn-tag-hint {
            pointer-events: none; opacity: 0.4;
        }

        /* #号标签检索模式 */
        .bn-search-hint {
            font-size: 11px; color: #00a1d6; margin-top: 4px; display: none;
            align-items: center; gap: 4px;
        }
        .bn-search-hint svg { width: 12px; height: 12px; flex-shrink: 0; }
        .bn-existing-tag.search-hidden { display: none !important; }
        .bn-existing-tag.search-selected { opacity: 1 !important; filter: none !important; }
        .bn-existing-tag.search-dim { opacity: 0.3 !important; filter: saturate(0.3); }
        .bn-empty-search {
            font-size: 11px; color: #9499a0; text-align: center;
            padding: 8px 0; display: none;
        }

        /* 颜色选择弹窗 */
        .bn-color-popup {
            position: fixed;
            background: #fff; border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 6px; z-index: 100; width: 190px;
            animation: bn-popup-in 0.2s ease;
            max-height: 280px; overflow-y: auto;
            scrollbar-width: none; -ms-overflow-style: none;
        }
        .bn-color-popup::-webkit-scrollbar { display: none; }
        @keyframes bn-popup-in { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes bn-toast-in { from { transform: translateX(-50%) translateY(-10px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        .bn-color-title { font-size: 11px; color: #61666d; margin-bottom: 3px; font-weight: 500; }
        .bn-color-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
        .bn-color-item {
            width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
            border: 2px solid transparent; position: relative; transition: all 0.2s;
        }
        .bn-color-item:hover { transform: scale(1.2); z-index: 1; }
        .bn-color-item.active { border-color: #18191c; transform: scale(1.1); }
        .bn-color-item::after {
            content: attr(data-code); position: absolute; bottom: -20px; left: 50%;
            transform: translateX(-50%); font-size: 10px; color: #61666d;
            white-space: nowrap; opacity: 0; transition: opacity 0.15s;
            background: #fff; padding: 2px 4px; border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .bn-color-item:hover::after { opacity: 1; }

        /* 按钮 */
        .bn-btn {
            height: 36px; padding: 0 18px; border: none; border-radius: 8px;
            font-size: 13px; font-weight: 500; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center;
            gap: 6px; transition: all 0.2s;
        }
        .bn-btn svg { width: 14px; height: 14px; }
        .bn-btn-primary { background: linear-gradient(135deg, #00a1d6, #0091c2); color: #fff; box-shadow: 0 2px 8px rgba(0,161,214,0.3); }
        .bn-btn-primary:hover { box-shadow: 0 4px 12px rgba(0,161,214,0.4); transform: translateY(-1px); }
        .bn-btn-default { background: #fff; color: #61666d; border: 1.5px solid #e3e5e7; }
        .bn-btn-default:hover { border-color: #00a1d6; color: #00a1d6; }
        .bn-btn-danger { background: #fff; color: #f45d5d; border: 1.5px solid #ffcfcf; }
        .bn-btn-danger:hover { background: #fff1f0; border-color: #f45d5d; }

        /* 管理列表 */
        .bn-manage-list { display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto; }
        .bn-manage-item {
            display: flex; flex-direction: column; gap: 8px; padding: 12px;
            background: linear-gradient(135deg, #f8f9fa, #fff); border-radius: 10px;
            border: 1px solid #f1f2f3; transition: all 0.2s;
        }
        .bn-manage-item:hover { border-color: #e3e5e7; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .bn-manage-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .bn-manage-info { flex: 1; min-width: 0; }
        .bn-manage-name { font-size: 13px; color: #18191c; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
        .bn-manage-uid { font-size: 11px; color: #9499a0; }
        .bn-link { color: inherit; text-decoration: none; transition: color 0.15s; }
        .bn-link:hover { color: #00a1d6; }
        .bn-manage-note { display: flex; flex-direction: column; gap: 6px; }
        .bn-manage-tags { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; }
        .bn-manage-tag { padding: 2px 8px; height: 20px; font-size: 11px; line-height: 16px; color: #fff; border-radius: 10px; font-weight: 500; }
        .bn-manage-text { font-size: 12px; color: #61666d; padding-left: 6px; border-left: 1px solid #e3e5e7; }
        .bn-manage-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .bn-manage-btn {
            width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
            border: 1.5px solid #e3e5e7; border-radius: 8px; background: #fff;
            color: #61666d; cursor: pointer; transition: all 0.2s;
        }
        .bn-manage-btn:hover { border-color: #00a1d6; color: #00a1d6; background: rgba(0,161,214,0.05); }
        .bn-manage-btn.delete:hover { border-color: #f45d5d; color: #f45d5d; background: rgba(244,93,93,0.05); }
        .bn-empty { text-align: center; padding: 40px 0; color: #9499a0; font-size: 13px; line-height: 1.8; }
        .bn-search { margin-bottom: 16px; position: relative; }
        .bn-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #c9ccd0; pointer-events: none; }
        .bn-search-input {
            width: 100%; height: 38px; padding: 0 12px 0 38px;
            border: 1.5px solid #e3e5e7; border-radius: 10px; font-size: 13px;
            outline: none; box-sizing: border-box; transition: all 0.2s;
        }
        .bn-search-input:focus { border-color: #00a1d6; box-shadow: 0 0 0 3px rgba(0,161,214,0.1); }

        /* ==================== 暗色模式 ==================== */
        @media (prefers-color-scheme: dark) {
            .bili-note-text { color: #999; border-left-color: #444; }
            .bili-note-tooltip-fixed,
            .bili-note-wrapper .bili-note-tooltip {
                background: rgba(34, 34, 38, 0.92); color: #e1e1e1;
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(60, 60, 60, 0.6);
            }
            .bili-note-tooltip-fixed::before,
            .bili-note-wrapper .bili-note-tooltip::before {
                background: rgba(34, 34, 38, 0.92);
            }
            .bili-note-tooltip-fixed .bn-tt-text,
            .bili-note-tooltip .bn-tt-text { color: #e1e1e1; }
            .bili-note-tooltip-fixed .bn-tt-sep,
            .bili-note-tooltip .bn-tt-sep { color: #666; }

            .bili-note-modal { background: #222226; }
            .bn-header { background: linear-gradient(135deg, #2a2a2e, #222226); }
            .bn-title { color: #e1e1e1; }
            .bn-close { color: #999; }
            .bn-close:hover { background: #333; color: #e1e1e1; }
            .bn-label { color: #bbb; }
            .bn-input {
                background: #2a2a2e; color: #e1e1e1; border-color: #444;
            }
            .bn-input:focus { border-color: #00a1d6; box-shadow: 0 0 0 3px rgba(0,161,214,0.15); }
            .bn-input[readonly] { background: #2a2a2e; color: #999; border-color: #555; }
            .bn-tags-box { background: #2a2a2e; border-color: #444; }
            .bn-tags-box:empty::before { color: #555; }
            .bn-tag-input {
                background: #2a2a2e; color: #e1e1e1; border-color: #444;
            }
            .bn-tag-input:focus { border-color: #00a1d6; }
            .bn-tag-input::placeholder { color: #666; }
            .bn-tag-hint { color: #777; }
            .bn-tag-hint kbd { background: #333; border-color: #444; color: #aaa; }
            .bn-tag-editing { background: #222226 !important; border-color: #00a1d6; }
            .bn-tag-editing input { color: #e1e1e1; }
            .bn-color-dot { border-color: #333; box-shadow: 0 0 0 1px #444; }
            .bn-color-dot-hint::after { background: #e1e1e1; color: #18191c; }
            .bn-color-popup { background: #2a2a2e; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
            .bn-color-title { color: #aaa; }
            .bn-color-item.active { border-color: #e1e1e1; }
            .bn-color-item::after { background: #333; color: #ccc; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
            .bn-btn-default { background: #2a2a2e; color: #bbb; border-color: #444; }
            .bn-btn-default:hover { border-color: #00a1d6; color: #00a1d6; }
            .bn-btn-danger { background: #2a2a2e; color: #f45d5d; border-color: #5a2a2a; }
            .bn-btn-danger:hover { background: #3a1a1a; border-color: #f45d5d; }
            .bn-manage-item { background: linear-gradient(135deg, #2a2a2e, #222226); border-color: #333; }
            .bn-manage-item:hover { border-color: #444; }
            .bn-manage-name { color: #e1e1e1; }
            .bn-manage-text { color: #aaa; border-left-color: #444; }
            .bn-manage-btn { background: #2a2a2e; border-color: #444; color: #aaa; }
            .bn-manage-btn:hover { border-color: #00a1d6; color: #00a1d6; background: rgba(0,161,214,0.1); }
            .bn-manage-btn.delete:hover { border-color: #f45d5d; color: #f45d5d; background: rgba(244,93,93,0.1); }
            .bn-footer { background: #2a2a2e; border-top-color: #333; }
            .bn-search-input { background: #2a2a2e; color: #e1e1e1; border-color: #444; }
            .bn-search-input:focus { border-color: #00a1d6; }
            .bn-search-icon { color: #666; }
            .bn-existing-tags-viewport::before { background: linear-gradient(90deg, #222226 0%, transparent 100%); }
            .bn-existing-tags-viewport::after { background: linear-gradient(270deg, #222226 0%, transparent 100%); }
            .bn-existing-scrollbar { background: #003d5c; }
            .bn-existing-scrollbar-thumb { background: linear-gradient(90deg, #005580, #0099cc); }
            .bn-existing-scrollbar-thumb:hover { filter: brightness(1.15); }
            .bn-search-hint { color: #00c8f0; }
        }
    `);

    // ==================== 数据层 ====================
    function _loadFromStorage() {
        let gmNotes = {};
        try { const r = GM_getValue(STORAGE_KEY, ''); if (r) gmNotes = JSON.parse(r); } catch (e) { console.warn('[BN] _loadFromStorage parse error:', e); }
        return gmNotes;
    }

    function loadNotes() {
        if (!_notesLoaded) {
            _notesCache = _loadFromStorage();
            _notesLoaded = true;
        }
        return _notesCache;
    }

    function saveNotes(notes) {
        _notesCache = notes;
        const s = JSON.stringify(notes);
        GM_setValue(STORAGE_KEY, s);
    }

    function migrateFromLocalStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const ls = JSON.parse(raw);
            if (!ls || typeof ls !== 'object' || Object.keys(ls).length === 0) {
                localStorage.removeItem(STORAGE_KEY);
                return;
            }
            const gmRaw = GM_getValue(STORAGE_KEY, '');
            const gm = gmRaw ? JSON.parse(gmRaw) : {};
            // GM 存储优先，只将 localStorage 中有但 GM 中没有的数据合并
            // 不覆盖 GM 中已有的数据（包括已删除的）
            let changed = false;
            for (const uid of Object.keys(ls)) {
                if (!(uid in gm)) {
                    gm[uid] = ls[uid];
                    changed = true;
                }
            }
            if (changed) {
                const s = JSON.stringify(gm);
                GM_setValue(STORAGE_KEY, s);
                localStorage.setItem(STORAGE_KEY, s);
            }
            // 清除 localStorage，统一使用 GM 存储
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) { console.warn('[BN] migrateFromLocalStorage error:', e); }
    }

    function getNote(uid) { return loadNotes()[uid] || null; }

    function setNote(uid, data) {
        const notes = loadNotes();
        notes[uid] = { ...data, uid, updatedAt: Date.now() };
        saveNotes(notes);
    }

    function removeNote(uid) {
        const notes = loadNotes();
        delete notes[uid];
        saveNotes(notes);
    }

    // 最近使用的颜色
    function getRecentColors() {
        try { return JSON.parse(GM_getValue(RECENT_COLORS_KEY, '[]')); } catch (e) { console.warn('[BN] getRecentColors parse error:', e); return []; }
    }

    function addRecentColor(color) {
        let colors = getRecentColors();
        colors = colors.filter(c => c !== color);
        colors.unshift(color);
        if (colors.length > 5) colors = colors.slice(0, 5);
        GM_setValue(RECENT_COLORS_KEY, JSON.stringify(colors));
    }

    function getAllUniqueTags() {
        const notes = loadNotes();
        const tagMap = new Map();
        Object.values(notes).forEach(note => {
            if (note.tags) {
                note.tags.forEach(tag => {
                    const key = tag.text + '|' + tag.color;
                    if (!tagMap.has(key)) tagMap.set(key, tag);
                });
            }
        });
        return Array.from(tagMap.values());
    }

    // Toast 提示
    const TOAST_ICONS = {
        success: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    };
    const TOAST_COLORS = {
        success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#18191c',
    };
    function showToast(msg, type = 'success') {
        const t = document.createElement('div');
        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
        const bg = TOAST_COLORS[type] || TOAST_COLORS.info;
        const wrap = document.createElement('span');
        wrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
        wrap.innerHTML = icon;
        const msgSpan = document.createElement('span');
        msgSpan.textContent = msg;
        wrap.appendChild(msgSpan);
        t.appendChild(wrap);
        Object.assign(t.style, {
            position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
            background: bg, color: '#fff', padding: '10px 20px',
            borderRadius: '8px', fontSize: '13px', fontWeight: '500',
            zIndex: '999999', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            animation: 'bn-toast-in 0.2s ease',
        });
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; }, 2000);
        setTimeout(() => t.remove(), 2300);
    }

    // ==================== DOM 工具 ====================
    function extractUidFromHref(href) {
        if (!href) return null;
        const m = href.match(/(?:space\.bilibili\.com|bilibili\.com\/space)\/(\d+)/);
        return m ? m[1] : null;
    }

    function findUid(el) {
        // 从当前元素自身开始，逐层向上查找，但限制范围避免找到错误的链接
        for (let i = 0; i < 6 && el; i++) {
            // 当前元素本身是 a 标签
            if (el.tagName === 'A') {
                const uid = extractUidFromHref(el.getAttribute('href'));
                if (uid) return uid;
            }

            // data 属性（优先级高，通常是正确的用户 ID）
            const selfUid = el.getAttribute?.('data-user-id') || el.getAttribute?.('data-uid') || el.getAttribute?.('data-mid');
            if (selfUid && /^\d+$/.test(selfUid)) return selfUid;

            // 在当前元素内部查找最近的用户链接（不递归太深）
            const innerLink = el.querySelector?.(':scope > a[href*="space.bilibili.com"], :scope > a[href*="bilibili.com/space"]');
            if (innerLink) {
                const uid = extractUidFromHref(innerLink.getAttribute('href'));
                if (uid) return uid;
            }

            el = el.parentElement;
        }
        return null;
    }

    // 从右键目标精确提取 UID：优先找最近的用户链接，避免找到无关链接
    function findUidFromTarget(target) {
        // 1. 目标元素本身是链接
        if (target.tagName === 'A') {
            const uid = extractUidFromHref(target.getAttribute('href'));
            if (uid) return { uid, el: target };
        }

        // 2. 目标元素上的 data 属性
        const selfUid = target.getAttribute?.('data-user-id') || target.getAttribute?.('data-uid') || target.getAttribute?.('data-mid');
        if (selfUid && /^\d+$/.test(selfUid)) return { uid: selfUid, el: target };

        // 3. 向上查找，但严格限制：只在用户名相关元素内查找
        let current = target;
        for (let i = 0; i < 8 && current; i++) {
            // 检查当前元素是否是用户名元素
            const isNameEl = current.classList && (
                current.classList.contains('name') || current.classList.contains('username') ||
                current.classList.contains('user-name') || current.classList.contains('reply-user-name') ||
                current.classList.contains('dyn-user-name') || current.classList.contains('up-name') ||
                current.classList.contains('member-name') || current.classList.contains('contact-name') ||
                current.classList.contains('chat-user-name') || current.classList.contains('info-name')
            );

            if (isNameEl) {
                // 在用户名元素内查找最近的用户链接
                const link = current.querySelector('a[href*="space.bilibili.com"]') ||
                             current.closest('a[href*="space.bilibili.com"]') ||
                             current.parentElement?.querySelector('a[href*="space.bilibili.com"]');
                if (link) {
                    const uid = extractUidFromHref(link.getAttribute('href'));
                    if (uid) return { uid, el: current };
                }
                // data 属性
                const uidAttr = current.getAttribute('data-user-id') || current.getAttribute('data-uid');
                if (uidAttr && /^\d+$/.test(uidAttr)) return { uid: uidAttr, el: current };
            }

            // 如果当前元素是 a 标签且指向用户空间
            if (current.tagName === 'A') {
                const uid = extractUidFromHref(current.getAttribute('href'));
                if (uid) return { uid, el: current };
            }

            current = current.parentElement;
        }
        return { uid: null, el: null };
    }

    // ==================== 注入逻辑 ====================
    // 排除区域 - 详细列出所有不需要注入的地方
    const EXCLUDE_SELECTORS = [
        // 顶部导航栏
        '.mini-avatar', '.header-entry', '.bili-header', '#app-header',
        '.bili-avatar', '.nav-user', '.nav-container', '.header-container',
        // 推荐视频区域
        '.recommend-card', '.video-page-card', '.video-card-small',
        '.video-page-mini', '.right-container .video',
        // 评论区容器（不应注入，只在评论者名字上注入）
        '.comment-list', '.reply-list', '.root-reply',
        // 播放列表/合集
        '.video-playlist', '.video-episode', '.season-item',
        // 数据统计区
        '.follow-info', '.count-info',
        // space 个人主页头部（由 processSpacePage 单独处理）
        '.h-info', '.h-header',
    ].join(', ');

    // 总长度限制（标签文字 + 备注文字合计）
    const NOTE_MAX_CHARS = 40;

    function injectNote(uid, nameEl) {
        if (nameEl.nextElementSibling?.classList?.contains('bili-note-wrapper')) return;
        const note = getNote(uid);
        if (!note) return;
        // 保存原始名字，用于删除备注时恢复
        if (!nameEl.dataset.bnOrigName) nameEl.dataset.bnOrigName = nameEl.textContent.trim();
        // 替换页面上的用户名为备注中保存的名字
        if (note.name) {
            nameEl.textContent = note.name;
        } else if (nameEl.dataset.bnOrigName) {
            nameEl.textContent = nameEl.dataset.bnOrigName;
        }

        const hasTags = note.tags && note.tags.length > 0;
        const hasText = note.text;
        if (!hasTags && !hasText) return;

        // 计算完整内容（用于 tooltip）
        const fullParts = [];
        if (hasTags) note.tags.forEach(t => fullParts.push(t.text));
        if (hasText) fullParts.push(note.text);
        const fullText = fullParts.join(' · ');

        // 计算总字符数（标签文字 + 备注文字）
        let totalLen = 0;
        if (hasTags) note.tags.forEach(t => totalLen += t.text.length);
        if (hasText) totalLen += note.text.length;
        const isOverflow = totalLen > NOTE_MAX_CHARS;

        const wrapper = document.createElement('span');
        wrapper.className = 'bili-note-wrapper';

        // 构建显示用的标签（超长时按顺序显示，直到预算用完）
        if (hasTags) {
            let budget = NOTE_MAX_CHARS;
            for (const tag of note.tags) {
                const tagCost = tag.text.length + 2;
                if (budget <= 0) break;
                const el = document.createElement('span');
                el.className = 'bili-note-tag';
                el.style.backgroundColor = safeAttr(tag.color);
                el.innerHTML = `<span>${escapeHtml(tag.text)}</span>`;
                wrapper.appendChild(el);
                budget -= tagCost;
            }
        }

        // 备注文字：截断以配合标签总预算
        if (hasText) {
            const el = document.createElement('span');
            el.className = 'bili-note-text';
            const tagsLen = hasTags ? note.tags.reduce((s, t) => s + t.text.length + 2, 0) : 0;
            const usedTags = Math.min(tagsLen, NOTE_MAX_CHARS);
            const remaining = NOTE_MAX_CHARS - usedTags;
            if (remaining <= 0) {
                el.textContent = '...';
            } else if (note.text.length > remaining) {
                el.textContent = note.text.slice(0, remaining - 3) + '...';
            } else {
                el.textContent = note.text;
            }
            wrapper.appendChild(el);
        }

        nameEl.insertAdjacentElement('afterend', wrapper);

        attachTooltip(wrapper, note, hasTags, hasText);
    }

    // tooltip 公共逻辑：挂到 body 上，用 fixed 定位，不受父元素裁剪
    function attachTooltip(wrapper, note, hasTags, hasText) {
        const fullParts = [];
        if (hasTags) note.tags.forEach(t => fullParts.push(t.text));
        if (hasText) fullParts.push(note.text);
        const fullText = fullParts.join(' · ');
        if (fullText.length <= 15) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'bili-note-tooltip-fixed';
        let html = '';
        if (hasTags) {
            note.tags.forEach((tag, i) => {
                if (i > 0) html += '<span class="bn-tt-sep">·</span>';
                html += `<span class="bn-tt-tag" style="background:${safeAttr(tag.color)}">${ICONS.tag}<span>${escapeHtml(tag.text)}</span></span>`;
            });
        }
        if (hasText) {
            if (hasTags) html += '<span class="bn-tt-sep">·</span>';
            html += `<span class="bn-tt-text">${escapeHtml(note.text)}</span>`;
        }
        tooltip.innerHTML = html;
        document.body.appendChild(tooltip);
        wrapper._tooltip = tooltip;

        wrapper.querySelectorAll('.bili-note-tag, .bili-note-text').forEach(el => {
            el.addEventListener('mouseenter', () => {
                const rect = el.getBoundingClientRect();
                tooltip.style.left = rect.left + 'px';
                tooltip.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
                tooltip.style.top = 'auto';
                tooltip.style.display = 'flex';
            });
            el.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        });
    }

    // ==================== 页面处理 ====================
    const USERNAME_SELECTORS = [
        '.reply-user-name',      // 评论区
        '.dyn-user-name',        // 动态页
        '.up-name',              // 播放页 UP 主
        '.member-name',          // 关注列表
        '.contact-name',         // 联系人
        '.chat-user-name',       // 聊天
        '.user-name',            // 通用
        '.info-name',            // 信息面板
        '.relation-card-info__uname', // 关注列表
        '.h-name',               // space 个人主页用户名（旧版）
        '.nickname',             // space 个人主页用户名（新版）
        '.upinfo .name',         // 搜索结果用户名
        '.uname',                // 搜索结果用户名（备选）
        '.user-card .name',      // 用户卡片
        '.card-name',            // 卡片用户名
    ];

    // space 个人主页：从 URL 提取 UID，在简介旁边注入
    function processSpacePage() {
        if (!location.hostname.includes('space.bilibili.com')) return;

        // 从 URL 提取 UID
        const urlMatch = location.pathname.match(/\/(\d+)/);
        if (!urlMatch) return;
        const uid = urlMatch[1];

        // 检查是否有备注
        const note = getNote(uid);
        if (!note) return;
        const hasTags = note.tags && note.tags.length > 0;
        const hasText = note.text;
        const hasName = !!note.name;
        if (!hasTags && !hasText && !hasName) return;

        // 替换用户名（尝试多种选择器，适配 B 站改版）
        const nameEl = document.querySelector('.h-name, .nickname, .h-info .name, [class*="uname"]');
        if (nameEl) {
            if (!nameEl.dataset.bnOrigName) nameEl.dataset.bnOrigName = nameEl.textContent.trim();
            if (hasName) {
                nameEl.textContent = note.name;
            } else if (nameEl.dataset.bnOrigName) {
                nameEl.textContent = nameEl.dataset.bnOrigName;
            }
        }

        // 找简介/签名元素（尝试多种选择器）
        const descEl = document.querySelector('.h-sign, .h-desc, .desc, .sign, [class*="sign"], [class*="desc"]');
        if (!descEl) return;
        if (descEl.getAttribute(PROCESSED_ATTR)) return;
        if (descEl.nextElementSibling?.classList?.contains('bili-note-wrapper')) return;

        // 仅有用户名修改时不需要注入标签/备注区域
        if (!hasTags && !hasText) return;

        descEl.setAttribute(PROCESSED_ATTR, '1');

        const wrapper = document.createElement('span');
        wrapper.className = 'bili-note-wrapper';

        if (hasTags) {
            let budget = NOTE_MAX_CHARS;
            for (const tag of note.tags) {
                const tagCost = tag.text.length + 2;
                if (budget <= 0) break;
                const el = document.createElement('span');
                el.className = 'bili-note-tag';
                el.style.backgroundColor = safeAttr(tag.color);
                el.innerHTML = `<span>${escapeHtml(tag.text)}</span>`;
                wrapper.appendChild(el);
                budget -= tagCost;
            }
        }
        if (hasText) {
            const el = document.createElement('span');
            el.className = 'bili-note-text';
            el.textContent = note.text;
            wrapper.appendChild(el);
        }

        descEl.insertAdjacentElement('afterend', wrapper);

        attachTooltip(wrapper, note, hasTags, hasText);
    }

    function processPage() {
        const processed = new Set();

        // 先处理 space 个人主页
        processSpacePage();

        USERNAME_SELECTORS.forEach(sel => {
            document.querySelectorAll(sel).forEach(nameEl => {
                if (nameEl.closest(EXCLUDE_SELECTORS)) return;
                if (nameEl.getAttribute(PROCESSED_ATTR)) return;
                if (nameEl.nextElementSibling?.classList?.contains('bili-note-wrapper')) return;

                const text = nameEl.textContent?.trim();
                if (!text || text.length < 1 || text.length > 20) return;

                const uid = findUid(nameEl);
                if (!uid) return;

                const key = uid + '_' + sel;
                if (processed.has(key)) return;
                processed.add(key);

                nameEl.setAttribute(PROCESSED_ATTR, '1');
                injectNote(uid, nameEl);
            });
        });
    }

    function refreshAll() {
        // 先清理所有关联的 tooltip
        document.querySelectorAll('.bili-note-wrapper').forEach(el => {
            if (el._tooltip) el._tooltip.remove();
            el.remove();
        });
        // 清理剩余的孤立 tooltip
        document.querySelectorAll('.bili-note-tooltip-fixed').forEach(el => el.remove());
        document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => el.removeAttribute(PROCESSED_ATTR));
        processPage();
    }

    // ==================== Shift+右键触发 ====================
    function handleContextMenu(e) {
        if (!e.shiftKey) return;

        // space 个人主页：直接从 URL 取 UID
        if (location.hostname.includes('space.bilibili.com')) {
            const isSubPage = location.pathname.includes('/relation/') || location.pathname.includes('/upload') || location.pathname.includes('/dynamic');
            if (!isSubPage) {
                const levelArea = e.target.closest('.h-level, .h-info, [class*="level"], [class*="vip"]');
                if (!levelArea) return;
                const urlMatch = location.pathname.match(/\/(\d+)/);
                if (!urlMatch) return;
                e.preventDefault();
                const uid = urlMatch[1];
                const userName = document.querySelector('.h-name, .nickname, .h-info .name, [class*="uname"]')?.textContent?.trim() || '';
                setTimeout(() => {
                    const note = getNote(uid);
                    showModal(uid, userName, note);
                }, 50);
                return;
            }
        }

        // 通用逻辑：从右键目标精确查找 UID
        const { uid, el } = findUidFromTarget(e.target);
        if (!uid) return;
        e.preventDefault();

        let userName = '';
        if (el) {
            // 获取用户名文本
            const nameEl = el.classList?.contains('name') || el.classList?.contains('username') ||
                           el.classList?.contains('user-name') || el.classList?.contains('reply-user-name') ||
                           el.classList?.contains('dyn-user-name') || el.classList?.contains('up-name')
                ? el : el.querySelector?.('.name, .username, .user-name, .reply-user-name, .dyn-user-name, .up-name');
            userName = nameEl?.textContent?.trim() || el.textContent?.trim() || '';
            if (userName.length > 25) userName = '';
        }

        setTimeout(() => {
            const note = getNote(uid);
            showModal(uid, userName, note);
        }, 50);
    }

    // ==================== 弹窗 ====================
    let currentModal = null;
    let _editingTagRef = null;

    function showModal(uid, userName, noteData = null) {
        if (currentModal) currentModal.remove();

        const isNew = !noteData;
        const tags = noteData?.tags || [];

        const mask = document.createElement('div');
        mask.className = 'bili-note-mask';
        mask.setAttribute('role', 'dialog');
        mask.setAttribute('aria-modal', 'true');
        mask.setAttribute('aria-label', isNew ? '添加备注' : '编辑备注');

        const modal = document.createElement('div');
        modal.className = 'bili-note-modal';

        modal.innerHTML = `
            <div class="bn-header">
                <span class="bn-title">${ICONS.tag} ${isNew ? '添加备注' : '编辑备注'}</span>
                <button class="bn-close">${ICONS.close}</button>
            </div>
            <div class="bn-body">
                <div class="bn-row">
                    <span class="bn-label">用户</span>
                    <input type="text" class="bn-input" id="bn-username" value="${safeAttr(noteData?.name || userName)}">
                </div>
                <div class="bn-row">
                    <span class="bn-label">标签</span>
                    <div class="bn-tags-area">
                        <div class="bn-tags-box" id="bn-tags"></div>
                        <div class="bn-tag-input-row">
                            <div class="bn-tag-input-left">
                                <div class="bn-color-dot" id="bn-dot" title="点击选择颜色"></div>
                                <span class="bn-tag-counter" id="bn-tag-counter">0/${TAG_MAX_LENGTH}</span>
                            </div>
                            <textarea class="bn-tag-input" id="bn-tag-input" placeholder="输入标签文字，回车添加" rows="1" maxlength="${TAG_MAX_LENGTH}"></textarea>
                            <div class="bn-color-popup" id="bn-color-popup" style="display:none;"></div>
                        </div>
                        <div class="bn-tag-hint">输入文字后按 <kbd>Enter</kbd> 添加标签<br>双击标签二次编辑 <kbd>#</kbd> 唤起检索</div>
                        <div class="bn-existing-tags" id="bn-existing-tags"></div>
                    </div>
                </div>
                <div class="bn-row">
                    <span class="bn-label">备注</span>
                    <textarea class="bn-input" id="bn-text" placeholder="备注内容" rows="1">${escapeHtml(noteData?.text || '')}</textarea>
                </div>
            </div>
            <div class="bn-footer">
                ${noteData ? `<button class="bn-btn bn-btn-danger" id="bn-delete">${ICONS.trash} 删除</button>` : ''}
                <button class="bn-btn bn-btn-default" id="bn-cancel">取消</button>
                <button class="bn-btn bn-btn-primary" id="bn-save">${ICONS.check} 保存</button>
            </div>
        `;

        mask.appendChild(modal);
        document.body.appendChild(mask);
        currentModal = mask;

        // 焦点锁定 - Tab 键只在弹窗内循环
        const focusableSelectors = 'textarea, button, [tabindex]:not([tabindex="-1"])';
        const focusableElements = modal.querySelectorAll(focusableSelectors);
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
            modal.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab') return;
                const firstEl = focusableElements[0];
                const lastEl = focusableElements[focusableElements.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
                } else {
                    if (document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
                }
            });
        }

        let editingTags = [...tags];
        let selectedColor = PRESET_COLORS[0].value;
        let _colorDotMouseDown = false;
        const tagsBox = modal.querySelector('#bn-tags');
        const tagInput = modal.querySelector('#bn-tag-input');
        const colorPopup = modal.querySelector('#bn-color-popup');
        const colorDot = modal.querySelector('#bn-dot');
        const textInput = modal.querySelector('#bn-text');

        function updateDot() { colorDot.style.backgroundColor = selectedColor; }

        // 自动调整 textarea 高度
        function autoResize(el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
        }
        autoResize(tagInput);
        autoResize(textInput);
        tagInput.addEventListener('input', () => autoResize(tagInput));
        textInput.addEventListener('input', () => autoResize(textInput));

        // 已有标签快捷添加
        const existingTagsBox = modal.querySelector('#bn-existing-tags');
        const allTags = getAllUniqueTags();
        if (allTags.length > 0) {
            existingTagsBox.innerHTML = `
                <div class="bn-existing-tags-viewport">
                    <div class="bn-existing-tags-track">${allTags.map(t => `<span class="bn-existing-tag" data-text="${safeAttr(t.text)}" data-color="${safeAttr(t.color)}" style="background-color:${safeAttr(t.color)}">${escapeHtml(t.text)}</span>`).join('')}</div>
                </div>
                <div class="bn-existing-scrollbar"><div class="bn-existing-scrollbar-thumb bn-existing-scrollbar-thumb-l"></div><div class="bn-existing-scrollbar-thumb bn-existing-scrollbar-thumb-r"></div></div>
            `;

            // 跑马灯无缝循环滚动逻辑
            const scrollContainer = existingTagsBox.querySelector('.bn-existing-tags-viewport');
            const scrollTrack = existingTagsBox.querySelector('.bn-existing-tags-track');
            const scrollbar = existingTagsBox.querySelector('.bn-existing-scrollbar');
            const thumbL = existingTagsBox.querySelector('.bn-existing-scrollbar-thumb-l');
            const thumbR = existingTagsBox.querySelector('.bn-existing-scrollbar-thumb-r');

            // 复制一份内容实现无缝循环
            const originalHTML = scrollTrack.innerHTML;
            scrollTrack.innerHTML = originalHTML + originalHTML;

            // 事件委托：点击标签快速添加
            scrollTrack.addEventListener('click', (e) => {
                const tag = e.target.closest('.bn-existing-tag');
                if (!tag) return;
                const text = tag.dataset.text;
                const color = tag.dataset.color;
                if (text && !editingTags.some(t => t.text === text && t.color === color)) {
                    editingTags.push({ text, color });
                    renderTags();
                }
            });

            let scrollPos = 0;
            let lastScrollPos = 0;
            let snakeDir = 1;
            let autoScrollTimer = null;
            const SCROLL_SPEED = 0.8;
            const TICK_INTERVAL = 30;

            function getOriginalWidth() {
                return scrollTrack.scrollWidth / 2;
            }

            function getContainerWidth() {
                return scrollContainer.offsetWidth;
            }

            function updateThumbSegments() {
                const trackWidth = scrollbar.offsetWidth;
                const origWidth = getOriginalWidth();
                const containerWidth = getContainerWidth();
                const scrollRange = origWidth - containerWidth;
                if (scrollRange <= 0) {
                    thumbL.style.width = '100%';
                    thumbL.style.left = '0px';
                    thumbL.style.display = '';
                    thumbR.style.display = 'none';
                    return;
                }
                const thumbWidth = Math.max(40, trackWidth * containerWidth / origWidth);
                const offset = (scrollPos / scrollRange) * trackWidth;
                const pos = ((offset % trackWidth) + trackWidth) % trackWidth;

                const dirClass = snakeDir > 0 ? 'snake-r' : 'snake-l';
                const headTailColor = snakeDir > 0 ? '#005580' : '#00b4d8';
                const headBrightColor = snakeDir > 0 ? '#00c8f0' : '#7de8ff';
                const tailBrightColor = snakeDir > 0 ? '#00b4d8' : '#005580';

                if (pos + thumbWidth <= trackWidth) {
                    thumbL.className = 'bn-existing-scrollbar-thumb ' + dirClass;
                    thumbL.style.left = pos + 'px';
                    thumbL.style.width = thumbWidth + 'px';
                    thumbL.style.setProperty('--tail-c', headTailColor);
                    thumbL.style.setProperty('--head-c', headBrightColor);
                    thumbL.style.display = '';
                    thumbR.style.display = 'none';
                } else {
                    const rightW = trackWidth - pos;
                    const leftW = thumbWidth - rightW;

                    thumbL.className = 'bn-existing-scrollbar-thumb ' + dirClass + ' s-head-r';
                    thumbL.style.left = '0px';
                    thumbL.style.width = leftW + 'px';
                    thumbL.style.setProperty('--tail-c', tailBrightColor);
                    thumbL.style.setProperty('--head-c', headBrightColor);
                    thumbL.style.display = '';

                    thumbR.className = 'bn-existing-scrollbar-thumb ' + dirClass + ' s-tail-r';
                    thumbR.style.left = pos + 'px';
                    thumbR.style.width = rightW + 'px';
                    thumbR.style.setProperty('--tail-c', headTailColor);
                    thumbR.style.setProperty('--head-c', tailBrightColor);
                    thumbR.style.display = '';
                }
            }

            function setScroll(pos) {
                const origWidth = getOriginalWidth();
                scrollPos = ((pos % origWidth) + origWidth) % origWidth;
                scrollTrack.style.transform = `translateX(-${scrollPos}px)`;
                updateThumbSegments();
            }

            // 自定义滚动条拖拽
            let dragging = false, dragStartX = 0, dragStartPos = 0;
            function onDragStart(e) {
                e.preventDefault(); e.stopPropagation();
                dragging = true;
                dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
                dragStartPos = scrollPos;
                stopAutoScroll();
                document.addEventListener('mousemove', onDragMove);
                document.addEventListener('mouseup', onDragEnd);
                document.addEventListener('touchmove', onDragMove, { passive: false });
                document.addEventListener('touchend', onDragEnd);
            }

            thumbL.addEventListener('mousedown', onDragStart);
            thumbR.addEventListener('mousedown', onDragStart);
            thumbL.addEventListener('touchstart', onDragStart, { passive: false });
            thumbR.addEventListener('touchstart', onDragStart, { passive: false });

            function onDragMove(e) {
                if (!dragging) return;
                if (e.cancelable) e.preventDefault();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const trackWidth = scrollbar.offsetWidth;
                const origWidth = getOriginalWidth();
                const containerWidth = getContainerWidth();
                const scrollRange = origWidth - containerWidth;
                if (scrollRange <= 0) return;
                const thumbWidth = Math.max(40, trackWidth * containerWidth / origWidth);
                const thumbRange = trackWidth - thumbWidth;
                const dx = clientX - dragStartX;
                const posDelta = thumbRange > 0 ? dx / thumbRange * scrollRange : 0;
                snakeDir = dx >= 0 ? 1 : -1;
                setScroll(dragStartPos + posDelta);
            }

            function onDragEnd() {
                dragging = false;
                document.removeEventListener('mousemove', onDragMove);
                document.removeEventListener('mouseup', onDragEnd);
                document.removeEventListener('touchmove', onDragMove);
                document.removeEventListener('touchend', onDragEnd);
                startAutoScroll();
            }

            // 点击轨道跳转
            scrollbar.addEventListener('click', (e) => {
                if (e.target.classList.contains('bn-existing-scrollbar-thumb')) return;
                const origWidth = getOriginalWidth();
                const containerWidth = getContainerWidth();
                const scrollRange = origWidth - containerWidth;
                if (scrollRange <= 0) return;
                const trackWidth = scrollbar.offsetWidth;
                const rect = scrollbar.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pos = clickX / trackWidth * scrollRange;
                setScroll(pos);
                stopAutoScroll();
                startAutoScroll();
            });

            function startAutoScroll() {
                stopAutoScroll();
                const origWidth = getOriginalWidth();
                if (origWidth <= getContainerWidth()) return;
                snakeDir = 1;
                autoScrollTimer = setInterval(() => {
                    lastScrollPos = scrollPos;
                    scrollPos += SCROLL_SPEED;
                    const origWidth = getOriginalWidth();
                    if (scrollPos >= origWidth) {
                        scrollTrack.classList.add('is-resetting');
                        scrollPos = 0;
                        scrollTrack.style.transform = 'translateX(0px)';
                        scrollTrack.offsetHeight;
                        scrollTrack.classList.remove('is-resetting');
                    } else {
                        scrollTrack.style.transform = `translateX(-${scrollPos}px)`;
                    }
                    updateThumbSegments();
                }, TICK_INTERVAL);
            }

            function stopAutoScroll() {
                if (autoScrollTimer) {
                    clearInterval(autoScrollTimer);
                    autoScrollTimer = null;
                }
            }

            existingTagsBox.addEventListener('mouseenter', stopAutoScroll);
            existingTagsBox.addEventListener('mouseleave', startAutoScroll);

            updateThumbSegments();
            startAutoScroll();

            // ========== #号标签检索模式 ==========
            if (tagInput) {
                let searchActive = false;
                let searchKeyword = '';
                let searchSelectedIdx = -1;
                let searchMatchEls = [];

                const searchHint = document.createElement('div');
                searchHint.className = 'bn-search-hint';
                searchHint.innerHTML = `${ICONS.search}<span>正在检索已有标签</span>`;
                tagInput.closest('.bn-tags-area').appendChild(searchHint);

                function getHashInfo() {
                    const val = tagInput.value;
                    const idx = val.indexOf('#');
                    if (idx === -1) {
                        const idx2 = val.indexOf('＃');
                        if (idx2 === -1) return null;
                        return { kw: val.substring(idx2 + 1) };
                    }
                    return { kw: val.substring(idx + 1) };
                }

                function enterSearchMode() {
                    if (searchActive) return;
                    searchActive = true;
                    searchHint.style.display = 'flex';
                }

                function exitSearchMode() {
                    if (!searchActive) return;
                    searchActive = false;
                    searchKeyword = '';
                    searchSelectedIdx = -1;
                    searchHint.style.display = 'none';
                    const viewport = existingTagsBox.querySelector('.bn-existing-tags-viewport');
                    if (viewport) {
                        viewport.querySelectorAll('.bn-existing-tag').forEach(el => {
                            el.classList.remove('search-hidden', 'search-dim', 'search-selected');
                        });
                    }
                    const emptyEl = existingTagsBox.querySelector('.bn-empty-search');
                    if (emptyEl) emptyEl.style.display = 'none';
                }

                function doSearch() {
                    const info = getHashInfo();
                    if (!info) { exitSearchMode(); return; }
                    if (!searchActive) enterSearchMode();
                    searchKeyword = info.kw.toLowerCase();
                    searchSelectedIdx = -1;
                    searchMatchEls = [];

                    const viewport = existingTagsBox.querySelector('.bn-existing-tags-viewport');
                    if (!viewport) return;
                    const allEls = viewport.querySelectorAll('.bn-existing-tag');

                    allEls.forEach(el => {
                        el.classList.remove('search-hidden', 'search-dim', 'search-selected');
                        const text = (el.dataset.text || '').toLowerCase();
                        if (searchKeyword === '' || text.includes(searchKeyword)) {
                            searchMatchEls.push(el);
                        } else {
                            el.classList.add('search-hidden');
                        }
                    });

                    let emptyEl = existingTagsBox.querySelector('.bn-empty-search');
                    if (!emptyEl) {
                        emptyEl = document.createElement('div');
                        emptyEl.className = 'bn-empty-search';
                        emptyEl.textContent = '无匹配标签';
                        existingTagsBox.querySelector('.bn-existing-tags-viewport').parentElement.appendChild(emptyEl);
                    }
                    emptyEl.style.display = searchMatchEls.length === 0 ? 'block' : 'none';

                    if (searchMatchEls.length > 0) {
                        searchSelectedIdx = 0;
                        searchMatchEls.forEach(el => el.classList.add('search-dim'));
                        searchMatchEls[0].classList.remove('search-dim');
                        searchMatchEls[0].classList.add('search-selected');
                    } else {
                        allEls.forEach(el => el.classList.add('search-dim'));
                    }
                }

                function selectMatch(idx) {
                    if (searchMatchEls.length === 0) return;
                    searchMatchEls.forEach(el => {
                        el.classList.remove('search-selected', 'search-dim');
                        el.classList.add('search-dim');
                    });
                    searchSelectedIdx = ((idx % searchMatchEls.length) + searchMatchEls.length) % searchMatchEls.length;
                    searchMatchEls[searchSelectedIdx].classList.remove('search-dim');
                    searchMatchEls[searchSelectedIdx].classList.add('search-selected');
                }

                function checkCursor() {
                    const info = getHashInfo();
                    if (!info) { exitSearchMode(); return; }
                    doSearch();
                }

                tagInput.addEventListener('input', checkCursor);
                tagInput.addEventListener('click', checkCursor);

                tagInput.addEventListener('keydown', (e) => {
                    if (!searchActive) return;
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (searchMatchEls.length === 0) return;
                        if (e.key === 'ArrowDown') selectMatch(searchSelectedIdx + 1);
                        else selectMatch(searchSelectedIdx - 1);
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        exitSearchMode();
                    }
                    if (e.key === 'Enter' && !e.shiftKey && searchSelectedIdx >= 0 && searchMatchEls.length > 0) {
                        e.preventDefault();
                        const el = searchMatchEls[searchSelectedIdx];
                        const text = el.dataset.text;
                        const color = el.dataset.color;
                        if (text && !editingTags.some(t => t.text === text && t.color === color)) {
                            editingTags.push({ text, color });
                            renderTags();
                        }
                        tagInput.value = '';
                        autoResize(tagInput);
                        exitSearchMode();
                    }
                });

                mask.addEventListener('mousedown', (e) => {
                    if (searchActive && !tagInput.contains(e.target) && !e.target.closest('#bn-dot') && !(colorPopup && colorPopup.contains(e.target))) exitSearchMode();
                });
            }
        }

        // 拖拽排序
        let dragIndex = null;
        function setupDrag() {
            tagsBox.querySelectorAll('.bn-tag').forEach((tag, i) => {
                tag.setAttribute('draggable', 'true');
                tag.addEventListener('dragstart', (e) => {
                    dragIndex = i;
                    tag.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });
                tag.addEventListener('dragend', () => {
                    tag.classList.remove('dragging');
                    tagsBox.querySelectorAll('.bn-tag').forEach(t => t.classList.remove('drag-over'));
                    dragIndex = null;
                });
                tag.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    tag.classList.add('drag-over');
                });
                tag.addEventListener('dragleave', () => {
                    tag.classList.remove('drag-over');
                });
                tag.addEventListener('drop', (e) => {
                    e.preventDefault();
                    tag.classList.remove('drag-over');
                    const dropIndex = i;
                    if (dragIndex === null || dragIndex === dropIndex) return;
                    const [moved] = editingTags.splice(dragIndex, 1);
                    editingTags.splice(dropIndex, 0, moved);
                    renderTags();
                });
            });
        }

        function renderTags() {
            _editingTagRef = null;
            colorDot.classList.remove('bn-color-dot-hint');
            updateDot();
            const inputRow = document.querySelector('.bn-tag-input-row');
            if (inputRow) inputRow.classList.remove('bn-tag-input-disabled');
            tagsBox.innerHTML = editingTags.map((t, i) => `
                <span class="bn-tag" style="background-color:${safeAttr(t.color)}" data-i="${i}">
                    <span>${escapeHtml(t.text)}</span>
                    <span class="bn-tag-del" data-i="${i}">${ICONS.close}</span>
                </span>
            `).join('');
            tagsBox.querySelectorAll('.bn-tag-del').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    editingTags.splice(parseInt(btn.dataset.i), 1);
                    renderTags();
                });
            });
            tagsBox.querySelectorAll('.bn-tag').forEach(tag => {
                tag.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startEditTag(parseInt(tag.dataset.i), tag);
                });
            });
            setupDrag();
        }

        function startEditTag(index, tagEl) {
            const tag = editingTags[index];
            if (!tag) return;
            tagEl.classList.add('bn-tag-editing');
            tagEl.style.backgroundColor = '#fff';
            tagEl.innerHTML = `<input type="text" value="${safeAttr(tag.text)}" maxlength="${TAG_MAX_LENGTH}">`;
            const input = tagEl.querySelector('input');
            input.focus();
            input.select();

            _editingTagRef = { index, tag, input };
            colorDot.classList.add('bn-color-dot-hint');
            colorDot.style.backgroundColor = tag.color;
            document.querySelector('.bn-tag-input-row').classList.add('bn-tag-input-disabled');

            let committed = false;
            function commit() {
                if (committed) return;
                committed = true;
                const newText = input.value.trim();
                if (newText) {
                    editingTags[index] = { text: newText, color: tag.color };
                }
                renderTags();
            }
            function cancel() {
                committed = true;
                renderTags();
            }
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            });
            input.addEventListener('blur', () => {
                requestAnimationFrame(() => {
                    if (_colorDotMouseDown || !input.parentNode) return;
                    commit();
                });
            });
        }

        function showColorPopup() {
            colorDot.classList.remove('bn-color-dot-hint');
            const recentColors = getRecentColors();
            colorPopup.innerHTML = `
                <div class="bn-color-title">自定义颜色</div>
                <div style="margin-bottom: 4px;">
                    <input type="color" id="bn-custom-color" value="${safeAttr(selectedColor)}" style="width: 100%; height: 22px; border: 1px solid #e3e5e7; border-radius: 4px; cursor: pointer; padding: 0;">
                </div>
                ${recentColors.length > 0 ? `
                    <div class="bn-color-title">最近使用</div>
                    <div class="bn-color-grid" style="margin-bottom: 4px;">
                        ${recentColors.map(c => `
                            <div class="bn-color-item ${selectedColor === c ? 'active' : ''}"
                                 style="background-color:${safeAttr(c)}" data-color="${safeAttr(c)}" data-code="${safeAttr(c)}"></div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="bn-color-title">预设颜色</div>
                <div class="bn-color-grid">
                    ${PRESET_COLORS.map(c => `
                        <div class="bn-color-item ${selectedColor === c.value ? 'active' : ''}"
                             style="background-color:${safeAttr(c.value)}" data-color="${safeAttr(c.value)}" data-code="${safeAttr(c.value)}"></div>
                    `).join('')}
                </div>
            `;
            colorPopup.style.display = 'block';
            const dotRect = colorDot.getBoundingClientRect();
            let popupTop = dotRect.bottom + 4;
            let popupLeft = dotRect.left;
            if (popupTop + colorPopup.offsetHeight > window.innerHeight - 8) {
                popupTop = dotRect.top - colorPopup.offsetHeight - 4;
            }
            if (popupLeft + colorPopup.offsetWidth > window.innerWidth - 8) {
                popupLeft = window.innerWidth - colorPopup.offsetWidth - 8;
            }
            colorPopup.style.top = popupTop + 'px';
            colorPopup.style.left = popupLeft + 'px';
            // 自定义颜色选择器
            const customColorInput = colorPopup.querySelector('#bn-custom-color');
            if (customColorInput) {
                customColorInput.addEventListener('input', (e) => {
                    if (_editingTagRef) {
                        _editingTagRef.tag.color = e.target.value;
                        colorDot.style.backgroundColor = e.target.value;
                    } else {
                        selectedColor = e.target.value;
                        addRecentColor(selectedColor);
                        updateDot();
                    }
                    colorPopup.querySelectorAll('.bn-color-item').forEach(i => i.classList.remove('active'));
                });
                customColorInput.addEventListener('change', (e) => {
                    if (_editingTagRef) {
                        _editingTagRef.tag.color = e.target.value;
                        colorDot.style.backgroundColor = e.target.value;
                    } else {
                        selectedColor = e.target.value;
                        addRecentColor(selectedColor);
                        updateDot();
                    }
                    hideColorPopup();
                    if (_editingTagRef && _editingTagRef.input) {
                        _editingTagRef.input.focus();
                    } else {
                        tagInput.focus();
                    }
                });
            }
            colorPopup.querySelectorAll('.bn-color-item').forEach(item => {
                item.addEventListener('click', () => {
                    if (_editingTagRef) {
                        _editingTagRef.tag.color = item.dataset.color;
                        colorDot.style.backgroundColor = item.dataset.color;
                    } else {
                        selectedColor = item.dataset.color;
                        addRecentColor(selectedColor);
                        updateDot();
                    }
                    colorPopup.querySelectorAll('.bn-color-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    hideColorPopup();
                    if (_editingTagRef && _editingTagRef.input) {
                        _editingTagRef.input.focus();
                    } else {
                        tagInput.focus();
                    }
                });
            });
        }

        function hideColorPopup() { colorPopup.style.display = 'none'; }

        colorDot.addEventListener('mousedown', () => { _colorDotMouseDown = true; });
        colorDot.addEventListener('click', e => {
            e.stopPropagation();
            colorPopup.style.display === 'block' ? hideColorPopup() : showColorPopup();
            setTimeout(() => { _colorDotMouseDown = false; }, 0);
        });
        const _onDocClick = e => { if (!e.target.closest('.bn-tag-input-row')) hideColorPopup(); };
        document.addEventListener('click', _onDocClick);

        // 保存清理函数，弹窗关闭时移除监听器
        mask._cleanup = () => {
            document.removeEventListener('click', _onDocClick);
        };

        // 标签字数计数器
        const tagCounter = modal.querySelector('#bn-tag-counter');
        function updateTagCounter() {
            const len = tagInput.value.length;
            tagCounter.textContent = `${len}/${TAG_MAX_LENGTH}`;
            tagCounter.classList.toggle('warn', len >= TAG_MAX_LENGTH);
        }
        tagInput.addEventListener('input', updateTagCounter);
        updateTagCounter();

        // 未保存变更检测
        let _hasUnsavedChanges = false;
        function checkUnsavedChanges() {
            const currentText = modal.querySelector('#bn-text').value;
            const origText = noteData?.text || '';
            const origTagsStr = JSON.stringify(noteData?.tags || []);
            const curTagsStr = JSON.stringify(editingTags);
            _hasUnsavedChanges = currentText !== origText || origTagsStr !== curTagsStr;
        }
        modal.querySelector('#bn-text').addEventListener('input', checkUnsavedChanges);
        const _origRenderTags = renderTags;
        renderTags = function() { _origRenderTags(); checkUnsavedChanges(); };

        tagInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = tagInput.value.trim();
                if (text) {
                    if (text.length > TAG_MAX_LENGTH) {
                        showToast(`标签最多 ${TAG_MAX_LENGTH} 个字符`);
                        return;
                    }
                    editingTags.push({ text, color: selectedColor });
                    renderTags();
                    tagInput.value = '';
                    autoResize(tagInput);
                    updateTagCounter();
                }
            }
        });

        updateDot();
        renderTags();

        // 带确认的关闭
        function confirmClose() {
            checkUnsavedChanges();
            if (_hasUnsavedChanges) {
                if (!confirm('有未保存的更改，确定关闭吗？')) return;
            }
            closeModal();
        }

        modal.querySelector('.bn-close').addEventListener('click', confirmClose);
        modal.querySelector('#bn-cancel').addEventListener('click', confirmClose);

        modal.querySelector('#bn-save').addEventListener('click', () => {
            const newName = modal.querySelector('#bn-username').value.trim();
            const noteData = { tags: editingTags, text: modal.querySelector('#bn-text').value.trim() };
            if (newName) noteData.name = newName;
            if (editingTags.length === 0 && !noteData.text) {
                showToast('请至少添加一个标签或备注', 'warning');
                return;
            }
            setNote(uid, noteData);
            _hasUnsavedChanges = false;
            refreshAll();
            closeModal();
            showToast(isNew ? '备注已添加' : '备注已更新');
        });

        modal.querySelector('#bn-delete')?.addEventListener('click', () => {
            if (confirm(`确定删除 ${userName || uid} 的备注？`)) {
                removeNote(uid);
                _hasUnsavedChanges = false;
                refreshAll();
                closeModal();
                showToast('备注已删除');
            }
        });

        // keydown 监听器 - 存储以便清理
        const _onKeydown = (e) => {
            if (e.key === 'Escape') { confirmClose(); }
        };
        document.addEventListener('keydown', _onKeydown);

        // 更新清理函数，包含 keydown 监听器
        const _origCleanup = mask._cleanup;
        mask._cleanup = () => {
            document.removeEventListener('keydown', _onKeydown);
            if (_origCleanup) _origCleanup();
        };
    }

    function closeModal() {
        if (currentModal) {
            if (currentModal._cleanup) currentModal._cleanup();
            currentModal.remove();
        }
        currentModal = null;
    }

    // ==================== 管理面板 ====================
    function showManageModal() {
        if (currentModal) currentModal.remove();
        const notes = Object.values(loadNotes());
        const mask = document.createElement('div');
        mask.className = 'bili-note-mask';
        const modal = document.createElement('div');
        modal.className = 'bili-note-modal';
        modal.style.width = '500px';

        modal.innerHTML = `
            <div class="bn-header">
                <span class="bn-title">${ICONS.tag} 管理备注 (${notes.length} 条)</span>
                <button class="bn-close">${ICONS.close}</button>
            </div>
            <div class="bn-body">
                <div style="display:flex;gap:8px;margin-bottom:16px;">
                    <button class="bn-btn bn-btn-default" id="bn-export" style="flex:1;">${ICONS.search} 导出备份</button>
                    <button class="bn-btn bn-btn-default" id="bn-import" style="flex:1;">${ICONS.check} 导入数据</button>
                </div>
                <div class="bn-search">
                    <span class="bn-search-icon">${ICONS.search}</span>
                    <input type="text" class="bn-search-input" id="bn-search" placeholder="搜索用户名或备注...">
                </div>
                <div class="bn-manage-list" id="bn-list">
                    ${notes.length === 0 ? '<div class="bn-empty">暂无备注<br>按住 Shift 右键用户名即可添加</div>' : ''}
                </div>
            </div>
        `;

        mask.appendChild(modal);
        document.body.appendChild(mask);
        currentModal = mask;

        const list = modal.querySelector('#bn-list');

        function renderList(kw = '') {
            const currentNotes = Object.values(loadNotes());
            const filtered = kw
                ? currentNotes.filter(n => n.name?.toLowerCase().includes(kw) || n.text?.toLowerCase().includes(kw) || n.tags?.some(t => t.text.toLowerCase().includes(kw)))
                : currentNotes;
            if (filtered.length === 0) { list.innerHTML = '<div class="bn-empty">暂无匹配的备注</div>'; return; }
            list.innerHTML = filtered.map(n => `
                <div class="bn-manage-item" data-uid="${safeAttr(String(n.uid))}">
                    <div class="bn-manage-header">
                        <div class="bn-manage-info">
                            <div class="bn-manage-name"><a class="bn-link" href="https://space.bilibili.com/${safeAttr(String(n.uid))}" target="_blank" rel="noopener">${escapeHtml(n.name) || '未设置名称'}</a></div>
                            <div class="bn-manage-uid"><a class="bn-link" href="https://space.bilibili.com/${safeAttr(String(n.uid))}" target="_blank" rel="noopener">UID: ${escapeHtml(String(n.uid))}</a></div>
                        </div>
                        <div class="bn-manage-actions">
                            <button class="bn-manage-btn edit" title="编辑">${ICONS.tag}</button>
                            <button class="bn-manage-btn delete" title="删除">${ICONS.trash}</button>
                        </div>
                    </div>
                    <div class="bn-manage-note">
                        ${n.tags?.length ? `<div class="bn-manage-tags">${n.tags.map(t => `<span class="bn-manage-tag" style="background-color:${safeAttr(t.color)}">${escapeHtml(t.text)}</span>`).join('')}</div>` : ''}
                        ${n.text ? `<div class="bn-manage-text">${escapeHtml(n.text)}</div>` : ''}
                    </div>
                </div>
            `).join('');
            list.querySelectorAll('.bn-manage-item').forEach(item => {
                const uid = item.dataset.uid;
                const note = getNote(uid);
                item.querySelector('.edit').addEventListener('click', () => showModal(uid, note.name, note));
                item.querySelector('.delete').addEventListener('click', () => {
                    if (confirm(`确定删除 ${note.name || uid} 的备注？`)) {
                        removeNote(uid); refreshAll();
                        const newCount = Object.values(loadNotes()).length;
                        modal.querySelector('.bn-title').innerHTML = `${ICONS.tag} 管理备注 (${newCount} 条)`;
                        renderList(modal.querySelector('#bn-search').value.toLowerCase());
                        showToast('备注已删除');
                    }
                });
            });
        }

        renderList();
        modal.querySelector('#bn-search').addEventListener('click', e => e.stopPropagation());
        modal.querySelector('#bn-search').addEventListener('input', e => renderList(e.target.value.toLowerCase()));
        modal.querySelector('.bn-close').addEventListener('click', closeModal);
        mask.addEventListener('click', e => { if (e.target === mask) closeModal(); });

        // 导出
        modal.querySelector('#bn-export').addEventListener('click', () => {
            const notes = loadNotes();
            const count = Object.keys(notes).length;
            if (count === 0) { showToast('暂无备注可导出', 'warning'); return; }
            const data = JSON.stringify(notes, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const filename = `bilibili-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showToast(`已导出 ${count} 条备注 → ${filename}`, 'success');
        });

        // 导入
        modal.querySelector('#bn-import').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const imported = JSON.parse(ev.target.result);
                        if (typeof imported !== 'object' || Array.isArray(imported)) {
                            showToast('文件格式不正确'); return;
                        }
                        const current = loadNotes();
                        const merged = { ...imported, ...current };
                        const importedCount = Object.keys(imported).length;
                        const overlappedCount = Object.keys(imported).filter(k => k in current).length;
                        saveNotes(merged);
                        _notesLoaded = false;
                        refreshAll();
                        const hint = overlappedCount > 0
                            ? `已导入 ${importedCount} 条备注（${overlappedCount} 条已有备注保留）`
                            : `已导入 ${importedCount} 条备注`;
                        showToast(hint);
                        // 刷新管理面板
                        showManageModal();
                    } catch (e) {
                        console.warn('[BN] import parse error:', e);
                        showToast('文件解析失败');
                    }
                };
                reader.readAsText(file);
            });
            input.click();
        });
    }

    // ==================== 初始化 ====================
    function init() {
        if (typeof GM_registerMenuCommand !== 'undefined') {
            GM_registerMenuCommand('管理所有备注', showManageModal);
            GM_registerMenuCommand('清空所有备注', () => {
                if (confirm('确定要清空所有备注数据吗？此操作不可恢复。')) {
                    saveNotes({});
                    _notesLoaded = false;
                    refreshAll();
                    showToast('所有备注已清空');
                }
            });
        }

        migrateFromLocalStorage();

        // 页面加载完成后执行一次
        setTimeout(processPage, 2000);

        // 首次使用引导
        const FIRST_USE_KEY = 'bilibili_notes_first_use_done';
        if (!localStorage.getItem(FIRST_USE_KEY)) {
            setTimeout(() => {
                const guide = document.createElement('div');
                guide.className = 'bili-note-tooltip-fixed';
                guide.style.cssText = 'display:flex; bottom:auto; top: 20px; left: 50%; transform: translateX(-50%); z-index: 2147483647; white-space: nowrap;';
                guide.innerHTML = `<span class="bn-tt-text" style="color:#e1e1e1;">按住 <b>Shift</b> + <b>右键</b> 点击用户名即可添加备注</span>`;
                document.body.appendChild(guide);
                setTimeout(() => {
                    guide.style.opacity = '0';
                    guide.style.transition = 'opacity 0.5s';
                    setTimeout(() => guide.remove(), 500);
                }, 3000);
                localStorage.setItem(FIRST_USE_KEY, '1');
            }, 2500);
        }

        // 防抖处理页面更新
        let _processTimer = null;
        function scheduleProcess(delay = 800) {
            if (_processTimer) clearTimeout(_processTimer);
            _processTimer = setTimeout(processPage, delay);
        }

        // 监听 SPA 路由变化（popstate + hashchange）
        window.addEventListener('popstate', () => scheduleProcess(500), true);
        window.addEventListener('hashchange', () => scheduleProcess(500), true);

        // 监听 pushState/replaceState（SPA 跳转）
        const _origPush = history.pushState;
        const _origReplace = history.replaceState;
        history.pushState = function () {
            _origPush.apply(this, arguments);
            scheduleProcess(500);
        };
        history.replaceState = function () {
            _origReplace.apply(this, arguments);
            scheduleProcess(500);
        };

        // MutationObserver 监听 DOM 变化（动态加载内容）
        // 收窄到用户名可能出现的容器，避免播放器/广告等无关变化触发
        const OBSERVE_SELECTORS = [
            '.reply-list', '.comment-list',   // 评论区
            '.dyn-list', '.dyn-space',        // 动态页
            '.video-info', '.video-desc',     // 视频页
            '.h-info', '.h-header',           // space 主页
            '.member-list', '.relation-list', // 关注列表
            '.contact-list',                  // 联系人
            '.chat-list', '.chat-container',  // 聊天
            '.search-page', '.search-result', // 搜索结果
            '.feed-card', '.card-list',       // 信息流
            '#app',                           // 兜底
        ];
        const _observer = new MutationObserver((mutations) => {
            let hasNewNodes = false;
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length > 0) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE && !node.classList?.contains('bili-note-wrapper')) {
                            hasNewNodes = true;
                            break;
                        }
                    }
                }
                if (hasNewNodes) break;
            }
            if (hasNewNodes) scheduleProcess(1500);
        });
        const observeTargets = OBSERVE_SELECTORS
            .map(sel => document.querySelector(sel))
            .filter(Boolean);
        observeTargets.forEach(el => _observer.observe(el, { childList: true, subtree: true }));
        // 兜底：如果没找到任何已知容器，监听 body
        if (observeTargets.length === 0) {
            _observer.observe(document.body, { childList: true, subtree: true });
        }

        document.addEventListener('contextmenu', handleContextMenu, true);
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
