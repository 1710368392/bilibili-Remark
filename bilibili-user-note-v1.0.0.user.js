// ==UserScript==
// @name         Bilibili 用户备注助手
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  按住 Shift 右键用户名即可添加备注，支持多标签和中国风配色
// @author       糖心月
// @copyright    2026, 糖心月 (https://github.com/1710368392)
// @license      MIT
// @icon         https://raw.githubusercontent.com/1710368392/bilibili---/main/tampermonkey/icon.png
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

    // 内存缓存，避免每次读写都序列化/反序列化
    let _notesCache = null;
    let _notesLoaded = false;

    const PRESET_COLORS = [
        { name: '朱砂', value: '#CF000F' },
        { name: '胭脂', value: '#9D2933' },
        { name: '珊瑚', value: '#F05654' },
        { name: '石榴红', value: '#F20C00' },
        { name: '绛紫', value: '#8C4356' },
        { name: '黛绿', value: '#425066' },
        { name: '竹青', value: '#789262' },
        { name: '松花', value: '#BCE672' },
        { name: '藤黄', value: '#FFB61E' },
        { name: '鹅黄', value: '#FFF143' },
        { name: '赭石', value: '#845A33' },
        { name: '赤金', value: '#B76E79' },
        { name: '靛青', value: '#177CB0' },
        { name: '月白', value: '#D6ECF0' },
        { name: '鸦青', value: '#424C50' },
        { name: '黛蓝', value: '#5B7083' },
        { name: '玄青', value: '#3D3B4F' },
        { name: '墨色', value: '#50616D' },
        { name: '银鼠', value: '#8C8C8C' },
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
            animation: bn-modal-in 0.25s cubic-bezier(0.4,0,0.2,1) forwards;
            transform: scale(0.95); opacity: 0;
        }
        @keyframes bn-modal-in { to { transform: scale(1); opacity: 1; } }
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
        .bn-body { padding: 20px; }
        .bn-footer {
            display: flex; justify-content: flex-end; gap: 10px;
            padding: 16px 20px; background: #f8f9fa; border-top: 1px solid #f1f2f3;
        }
        .bn-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
        .bn-row:last-child { margin-bottom: 0; }
        .bn-label { width: 48px; font-size: 13px; color: #61666d; flex-shrink: 0; padding-top: 7px; font-weight: 500; }
        .bn-input {
            flex: 1; min-height: 36px; max-height: 120px; padding: 8px 12px;
            border: 1.5px solid #e3e5e7; border-radius: 8px;
            font-size: 13px; color: #18191c; outline: none; transition: border-color 0.2s;
            resize: none; overflow-y: auto; line-height: 1.4;
            font-family: inherit;
        }
        .bn-input:focus { border-color: #00a1d6; box-shadow: 0 0 0 3px rgba(0,161,214,0.1); }
        .bn-input[readonly] { background: linear-gradient(135deg, #f8f9fa, #f1f2f3); color: #61666d; border-style: dashed; }

        /* 标签区域 */
        .bn-tags-area { flex: 1; }
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
        .bn-tag-input-row { position: relative; display: flex; align-items: center; gap: 8px; }
        .bn-color-dot {
            width: 20px; height: 20px; border-radius: 50%; border: 2px solid #fff;
            box-shadow: 0 0 0 1px #e3e5e7; cursor: pointer; flex-shrink: 0; transition: all 0.2s;
        }
        .bn-color-dot:hover { transform: scale(1.1); }
        .bn-tag-input {
            flex: 1; min-height: 36px; max-height: 80px; padding: 8px 12px;
            border: 1.5px solid #e3e5e7; border-radius: 8px;
            font-size: 13px; outline: none; transition: border-color 0.2s;
            resize: none; overflow-y: auto; line-height: 1.4;
            font-family: inherit;
        }
        }
        .bn-tag-input:focus { border-color: #00a1d6; box-shadow: 0 0 0 3px rgba(0,161,214,0.1); }
        .bn-tag-input::placeholder { color: #c9ccd0; }
        .bn-tag-hint { font-size: 12px; color: #9499a0; margin-top: 8px; }
        .bn-tag-hint kbd {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 20px; height: 18px; padding: 0 4px;
            background: #f1f2f3; border: 1px solid #e3e5e7; border-radius: 4px;
            font-size: 11px; font-family: inherit; color: #61666d;
        }

        /* 颜色选择弹窗 */
        .bn-color-popup {
            position: absolute; top: calc(100% + 4px); left: 0;
            background: #fff; border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12); padding: 14px; z-index: 100; width: 220px;
            animation: bn-popup-in 0.2s ease;
        }
        @keyframes bn-popup-in { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes bn-toast-in { from { transform: translateX(-50%) translateY(-10px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        .bn-color-title { font-size: 12px; color: #61666d; margin-bottom: 10px; font-weight: 500; }
        .bn-color-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        .bn-color-item {
            width: 30px; height: 30px; border-radius: 50%; cursor: pointer;
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
            display: flex; align-items: center; gap: 12px; padding: 12px;
            background: linear-gradient(135deg, #f8f9fa, #fff); border-radius: 10px;
            border: 1px solid #f1f2f3; transition: all 0.2s;
        }
        .bn-manage-item:hover { border-color: #e3e5e7; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .bn-manage-info { flex: 1; min-width: 0; }
        .bn-manage-name { font-size: 13px; color: #18191c; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
        .bn-manage-uid { font-size: 11px; color: #9499a0; }
        .bn-manage-note { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .bn-manage-tag { padding: 2px 8px; height: 20px; font-size: 11px; line-height: 16px; color: #fff; border-radius: 10px; font-weight: 500; }
        .bn-manage-text { font-size: 12px; color: #61666d; padding-left: 6px; border-left: 1px solid #e3e5e7; }
        .bn-manage-actions { display: flex; gap: 6px; }
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
    `);

    // ==================== 数据层 ====================
    function _loadFromStorage() {
        let gmNotes = {}, lsNotes = {};
        try { const r = GM_getValue(STORAGE_KEY, ''); if (r) gmNotes = JSON.parse(r); } catch {}
        try { const r = localStorage.getItem(STORAGE_KEY); if (r) lsNotes = JSON.parse(r); } catch {}
        const merged = { ...lsNotes, ...gmNotes };
        if (Object.keys(merged).length > 0) {
            const s = JSON.stringify(merged);
            GM_setValue(STORAGE_KEY, s);
            localStorage.setItem(STORAGE_KEY, s);
        }
        return merged;
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
        localStorage.setItem(STORAGE_KEY, s);
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
            const merged = { ...ls, ...gm };
            const s = JSON.stringify(merged);
            GM_setValue(STORAGE_KEY, s);
            localStorage.setItem(STORAGE_KEY, s);
        } catch {}
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
        try { return JSON.parse(GM_getValue(RECENT_COLORS_KEY, '[]')); } catch { return []; }
    }

    function addRecentColor(color) {
        let colors = getRecentColors();
        colors = colors.filter(c => c !== color);
        colors.unshift(color);
        if (colors.length > 6) colors = colors.slice(0, 6);
        GM_setValue(RECENT_COLORS_KEY, JSON.stringify(colors));
    }

    // Toast 提示
    function showToast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        Object.assign(t.style, {
            position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
            background: '#18191c', color: '#fff', padding: '10px 20px',
            borderRadius: '8px', fontSize: '13px', fontWeight: '500',
            zIndex: '999999', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            animation: 'bn-toast-in 0.2s ease',
        });
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; }, 1500);
        setTimeout(() => t.remove(), 1800);
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
                el.style.backgroundColor = tag.color;
                el.innerHTML = `${ICONS.tag}<span>${tag.text}</span>`;
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

        // tooltip 单独挂到 body 上，用 fixed 定位，不受父元素裁剪
        if (fullText.length > 15) {
            const tooltip = document.createElement('div');
            tooltip.className = 'bili-note-tooltip-fixed';
            let tooltipHtml = '';
            if (hasTags) {
                note.tags.forEach((tag, i) => {
                    if (i > 0) tooltipHtml += '<span class="bn-tt-sep">·</span>';
                    tooltipHtml += `<span class="bn-tt-tag" style="background:${tag.color}">${ICONS.tag}<span>${tag.text}</span></span>`;
                });
            }
            if (hasText) {
                if (hasTags) tooltipHtml += '<span class="bn-tt-sep">·</span>';
                tooltipHtml += `<span class="bn-tt-text">${note.text}</span>`;
            }
            tooltip.innerHTML = tooltipHtml;
            document.body.appendChild(tooltip);

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
        '.h-name',               // space 个人主页用户名
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
        if (!hasTags && !hasText) return;

        // 找简介/签名元素（尝试多种选择器）
        const descEl = document.querySelector('.h-sign, .h-desc, .desc, .sign, [class*="sign"], [class*="desc"]');
        if (!descEl) return;
        if (descEl.getAttribute(PROCESSED_ATTR)) return;
        if (descEl.nextElementSibling?.classList?.contains('bili-note-wrapper')) return;

        descEl.setAttribute(PROCESSED_ATTR, '1');

        // 构建备注
        const fullParts = [];
        if (hasTags) note.tags.forEach(t => fullParts.push(t.text));
        if (hasText) fullParts.push(note.text);
        const fullText = fullParts.join(' · ');

        const wrapper = document.createElement('span');
        wrapper.className = 'bili-note-wrapper';

        if (hasTags) {
            note.tags.forEach(tag => {
                const el = document.createElement('span');
                el.className = 'bili-note-tag';
                el.style.backgroundColor = tag.color;
                el.innerHTML = `${ICONS.tag}<span>${tag.text}</span>`;
                wrapper.appendChild(el);
            });
        }
        if (hasText) {
            const el = document.createElement('span');
            el.className = 'bili-note-text';
            el.textContent = note.text;
            wrapper.appendChild(el);
        }

        descEl.insertAdjacentElement('afterend', wrapper);

        // tooltip 挂到 body 上
        if (fullText.length > 15) {
            const tooltip = document.createElement('div');
            tooltip.className = 'bili-note-tooltip-fixed';
            let tooltipHtml = '';
            if (hasTags) {
                note.tags.forEach((tag, i) => {
                    if (i > 0) tooltipHtml += '<span class="bn-tt-sep">·</span>';
                    tooltipHtml += `<span class="bn-tt-tag" style="background:${tag.color}">${ICONS.tag}<span>${tag.text}</span></span>`;
                });
            }
            if (hasText) {
                if (hasTags) tooltipHtml += '<span class="bn-tt-sep">·</span>';
                tooltipHtml += `<span class="bn-tt-text">${note.text}</span>`;
            }
            tooltip.innerHTML = tooltipHtml;
            document.body.appendChild(tooltip);

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
        document.querySelectorAll('.bili-note-wrapper').forEach(el => el.remove());
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
                const uid = urlMatch[1];
                const userName = document.querySelector('.h-name')?.textContent?.trim() || '';
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

    function showModal(uid, userName, noteData = null) {
        if (currentModal) currentModal.remove();

        const isNew = !noteData;
        const tags = noteData?.tags || [];

        const mask = document.createElement('div');
        mask.className = 'bili-note-mask';

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
                    <input type="text" class="bn-input" readonly value="${userName || 'UID: ' + uid}">
                </div>
                <div class="bn-row">
                    <span class="bn-label">标签</span>
                    <div class="bn-tags-area">
                        <div class="bn-tags-box" id="bn-tags"></div>
                        <div class="bn-tag-input-row">
                            <div class="bn-color-dot" id="bn-dot" title="点击选择颜色"></div>
                            <textarea class="bn-tag-input" id="bn-tag-input" placeholder="输入标签文字，回车添加" rows="1"></textarea>
                            <div class="bn-color-popup" id="bn-color-popup" style="display:none;"></div>
                        </div>
                        <div class="bn-tag-hint">输入文字后按 <kbd>Enter</kbd> 添加标签，点击圆点选择颜色</div>
                    </div>
                </div>
                <div class="bn-row">
                    <span class="bn-label">备注</span>
                    <textarea class="bn-input" id="bn-text" placeholder="备注内容" rows="1">${noteData?.text || ''}</textarea>
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

        let editingTags = [...tags];
        let selectedColor = PRESET_COLORS[0].value;
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
            tagsBox.innerHTML = editingTags.map((t, i) => `
                <span class="bn-tag" style="background-color:${t.color}">
                    <span>${t.text}</span>
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
            setupDrag();
        }

        function showColorPopup() {
            const recentColors = getRecentColors();
            colorPopup.innerHTML = `
                ${recentColors.length > 0 ? `
                    <div class="bn-color-title">最近使用</div>
                    <div class="bn-color-grid" style="margin-bottom: 10px;">
                        ${recentColors.map(c => `
                            <div class="bn-color-item ${selectedColor === c ? 'active' : ''}"
                                 style="background-color:${c}" data-color="${c}" data-code="${c}"></div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="bn-color-title">预设颜色</div>
                <div class="bn-color-grid">
                    ${PRESET_COLORS.map(c => `
                        <div class="bn-color-item ${selectedColor === c.value ? 'active' : ''}"
                             style="background-color:${c.value}" data-color="${c.value}" data-code="${c.value}"></div>
                    `).join('')}
                </div>
            `;
            colorPopup.style.display = 'block';
            colorPopup.querySelectorAll('.bn-color-item').forEach(item => {
                item.addEventListener('click', () => {
                    selectedColor = item.dataset.color;
                    addRecentColor(selectedColor);
                    updateDot();
                    colorPopup.querySelectorAll('.bn-color-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    hideColorPopup();
                    tagInput.focus();
                });
            });
        }

        function hideColorPopup() { colorPopup.style.display = 'none'; }

        colorDot.addEventListener('click', e => { e.stopPropagation(); colorPopup.style.display === 'block' ? hideColorPopup() : showColorPopup(); });
        document.addEventListener('click', e => { if (!e.target.closest('.bn-tag-input-row')) hideColorPopup(); });

        tagInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = tagInput.value.trim();
                if (text) {
                    editingTags.push({ text, color: selectedColor });
                    renderTags();
                    tagInput.value = '';
                    autoResize(tagInput);
                }
            }
        });

        updateDot();
        renderTags();

        modal.querySelector('.bn-close').addEventListener('click', closeModal);
        modal.querySelector('#bn-cancel').addEventListener('click', closeModal);
        mask.addEventListener('click', e => { if (e.target === mask) closeModal(); });

        modal.querySelector('#bn-save').addEventListener('click', () => {
            setNote(uid, {
                name: userName,
                tags: editingTags,
                text: modal.querySelector('#bn-text').value.trim()
            });
            refreshAll();
            closeModal();
            showToast(isNew ? '备注已添加' : '备注已更新');
        });

        modal.querySelector('#bn-delete')?.addEventListener('click', () => {
            if (confirm(`确定删除 ${userName || uid} 的备注？`)) {
                removeNote(uid);
                refreshAll();
                closeModal();
                showToast('备注已删除');
            }
        });

        document.addEventListener('keydown', function onKey(e) {
            if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onKey); }
        });
    }

    function closeModal() { currentModal?.remove(); currentModal = null; }

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
                <div class="bn-manage-item" data-uid="${n.uid}">
                    <div class="bn-manage-info">
                        <div class="bn-manage-name">${n.name || '未设置名称'}</div>
                        <div class="bn-manage-uid">UID: ${n.uid}</div>
                    </div>
                    <div class="bn-manage-note">
                        ${n.tags?.map(t => `<span class="bn-manage-tag" style="background-color:${t.color}">${t.text}</span>`).join('') || ''}
                        ${n.text ? `<span class="bn-manage-text">${n.text}</span>` : ''}
                    </div>
                    <div class="bn-manage-actions">
                        <button class="bn-manage-btn edit" title="编辑">${ICONS.tag}</button>
                        <button class="bn-manage-btn delete" title="删除">${ICONS.trash}</button>
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
            const data = JSON.stringify(loadNotes(), null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bilibili-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('备份已导出');
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
                        saveNotes(merged);
                        _notesLoaded = false;
                        refreshAll();
                        showToast(`已导入 ${Object.keys(imported).length} 条备注`);
                        // 刷新管理面板
                        showManageModal();
                    } catch {
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

        // 页面加载完成后执行一次，不使用 MutationObserver 避免干扰渲染
        // 延迟 2 秒确保页面完全渲染
        setTimeout(processPage, 2000);

        // 仅监听 URL 变化（SPA 跳转）
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(processPage, 1000);
            }
        }, 1000);

        document.addEventListener('contextmenu', handleContextMenu, true);
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
