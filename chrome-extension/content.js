/*
 * Copyright (c) 2026 糖心月
 * GitHub: https://github.com/1710368392
 * SPDX-License-Identifier: MIT
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'bilibili_user_notes_v2';
    const RECENT_COLORS_KEY = 'bilibili_notes_recent_colors';
    const PROCESSED_ATTR = 'data-bn-processed';
    const TAG_MAX_LENGTH = 20;
    const MAX_TAGS = 10;
    const NOTE_TEXT_MAX_LENGTH = 200;

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
    function isValidHexColor(c) {
        return typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c);
    }
    function safeColor(c) { return isValidHexColor(c) ? c : '#95A5A6'; }

    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        return [parseInt(hex.substring(0,2),16), parseInt(hex.substring(2,4),16), parseInt(hex.substring(4,6),16)];
    }
    function rgbToHsv(r, g, b) {
        r/=255; g/=255; b/=255;
        const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
        let h=0, s=max===0?0:d/max, v=max;
        if(d!==0){switch(max){case r:h=((g-b)/d+(g<b?6:0))/6;break;case g:h=((b-r)/d+2)/6;break;case b:h=((r-g)/d+4)/6;break;}}
        return [h*360, s, v];
    }
    function hsvToRgb(h, s, v) {
        h/=360; const i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
        let r,g,b; switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}
        return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
    }
    function rgbToHex(r, g, b) { return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join(''); }
    function hexToHsv(hex) { const [r,g,b]=hexToRgb(hex); return rgbToHsv(r,g,b); }
    function hsvToHex(h, s, v) { const [r,g,b]=hsvToRgb(h,s,v); return rgbToHex(r,g,b); }

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

    const EXCLUDE_SELECTORS = [
        '.mini-avatar', '.header-entry', '.bili-header', '#app-header',
        '.bili-avatar', '.nav-user', '.nav-container', '.header-container',
        '.recommend-card', '.video-page-card', '.video-card-small',
        '.video-page-mini', '.right-container .video',
        '.comment-list', '.reply-list', '.root-reply',
        '.video-playlist', '.video-episode', '.season-item',
        '.follow-info', '.count-info',
        '.h-info', '.h-header',
    ].join(', ');

    const USERNAME_SELECTORS = [
        '.reply-user-name', '.dyn-user-name', '.up-name', '.member-name',
        '.contact-name', '.chat-user-name', '.user-name', '.info-name',
        '.relation-card-info__uname', '.h-name', '.nickname',
        '.upinfo .name', '.uname', '.user-card .name', '.card-name',
    ];

    // ==================== 数据层 ====================
    function loadNotes() {
        if (_notesLoaded) return Promise.resolve(_notesCache);
        return new Promise(resolve => {
            chrome.storage.local.get(STORAGE_KEY, (result) => {
                _notesCache = result[STORAGE_KEY] || {};
                _notesLoaded = true;
                resolve(_notesCache);
            });
        });
    }

    function loadNotesSync() {
        return _notesCache || {};
    }

    function saveNotes(notes) {
        _notesCache = notes;
        chrome.storage.local.set({ [STORAGE_KEY]: notes });
    }

    function getNote(uid) { return loadNotesSync()[uid] || null; }

    function setNote(uid, data) {
        const notes = loadNotesSync();
        notes[uid] = { ...data, uid, updatedAt: Date.now() };
        saveNotes(notes);
    }

    function removeNote(uid) {
        const notes = loadNotesSync();
        delete notes[uid];
        saveNotes(notes);
    }

    function getRecentColors() {
        return new Promise(resolve => {
            chrome.storage.local.get(RECENT_COLORS_KEY, (result) => {
                resolve(result[RECENT_COLORS_KEY] || []);
            });
        });
    }

    function addRecentColor(color) {
        getRecentColors().then(colors => {
            colors = colors.filter(c => c !== color);
            colors.unshift(color);
            if (colors.length > 5) colors = colors.slice(0, 5);
            chrome.storage.local.set({ [RECENT_COLORS_KEY]: colors });
        });
    }

    function getAllUniqueTags() {
        const notes = loadNotesSync();
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

    // Phase 1: showToast XSS 修复 — msg 改用 textContent
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
        for (let i = 0; i < 6 && el; i++) {
            if (el.tagName === 'A') {
                const uid = extractUidFromHref(el.getAttribute('href'));
                if (uid) return uid;
            }
            const selfUid = el.getAttribute?.('data-user-id') || el.getAttribute?.('data-uid') || el.getAttribute?.('data-mid');
            if (selfUid && /^\d+$/.test(selfUid)) return selfUid;
            const innerLink = el.querySelector?.(':scope > a[href*="space.bilibili.com"], :scope > a[href*="bilibili.com/space"]');
            if (innerLink) {
                const uid = extractUidFromHref(innerLink.getAttribute('href'));
                if (uid) return uid;
            }
            el = el.parentElement;
        }
        return null;
    }

    function findUidFromTarget(target) {
        if (target.tagName === 'A') {
            const uid = extractUidFromHref(target.getAttribute('href'));
            if (uid) return { uid, el: target };
        }
        const selfUid = target.getAttribute?.('data-user-id') || target.getAttribute?.('data-uid') || target.getAttribute?.('data-mid');
        if (selfUid && /^\d+$/.test(selfUid)) return { uid: selfUid, el: target };

        let current = target;
        for (let i = 0; i < 8 && current; i++) {
            const isNameEl = current.classList && (
                current.classList.contains('name') || current.classList.contains('username') ||
                current.classList.contains('user-name') || current.classList.contains('reply-user-name') ||
                current.classList.contains('dyn-user-name') || current.classList.contains('up-name') ||
                current.classList.contains('member-name') || current.classList.contains('contact-name') ||
                current.classList.contains('chat-user-name') || current.classList.contains('info-name')
            );
            if (isNameEl) {
                const link = current.querySelector('a[href*="space.bilibili.com"]') ||
                             current.closest('a[href*="space.bilibili.com"]') ||
                             current.parentElement?.querySelector('a[href*="space.bilibili.com"]');
                if (link) {
                    const uid = extractUidFromHref(link.getAttribute('href'));
                    if (uid) return { uid, el: current };
                }
                const uidAttr = current.getAttribute('data-user-id') || current.getAttribute('data-uid');
                if (uidAttr && /^\d+$/.test(uidAttr)) return { uid: uidAttr, el: current };
            }
            if (current.tagName === 'A') {
                const uid = extractUidFromHref(current.getAttribute('href'));
                if (uid) return { uid, el: current };
            }
            current = current.parentElement;
        }
        return { uid: null, el: null };
    }

    // ==================== 注入逻辑 ====================
    const NOTE_MAX_CHARS = 40;

    // Phase 2: tooltip 公共函数
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
                html += `<span class="bn-tt-tag" style="background:${safeColor(tag.color)}">${ICONS.tag}<span>${escapeHtml(tag.text)}</span></span>`;
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

    // 标签+备注渲染公共函数
    function buildNoteWrapper(note) {
        const hasTags = note.tags && note.tags.length > 0;
        const hasText = note.text;
        if (!hasTags && !hasText) return null;

        const wrapper = document.createElement('span');
        wrapper.className = 'bili-note-wrapper';

        if (hasTags) {
            let budget = NOTE_MAX_CHARS;
            for (const tag of note.tags) {
                const tagCost = tag.text.length + 2;
                if (budget <= 0) break;
                const el = document.createElement('span');
                el.className = 'bili-note-tag';
                el.style.backgroundColor = safeColor(tag.color);
                el.innerHTML = `<span>${escapeHtml(tag.text)}</span>`;
                wrapper.appendChild(el);
                budget -= tagCost;
            }
        }
        if (hasText) {
            const el = document.createElement('span');
            el.className = 'bili-note-text';
            const tagsLen = hasTags ? note.tags.reduce((s, t) => s + t.text.length + 2, 0) : 0;
            const remaining = NOTE_MAX_CHARS - Math.min(tagsLen, NOTE_MAX_CHARS);
            el.textContent = remaining <= 0 ? '...' : note.text.length > remaining ? note.text.slice(0, remaining - 3) + '...' : note.text;
            wrapper.appendChild(el);
        }
        return wrapper;
    }

    function injectNote(uid, nameEl) {
        if (nameEl.nextElementSibling?.classList?.contains('bili-note-wrapper')) return;
        const note = getNote(uid);
        if (!note) return;
        if (!nameEl.dataset.bnOrigName) nameEl.dataset.bnOrigName = nameEl.textContent.trim();
        if (note.name) {
            nameEl.textContent = note.name;
        } else if (nameEl.dataset.bnOrigName) {
            nameEl.textContent = nameEl.dataset.bnOrigName;
        }
        const hasTags = note.tags && note.tags.length > 0;
        const hasText = note.text;
        if (!hasTags && !hasText) return;

        const wrapper = buildNoteWrapper(note);
        if (!wrapper) return;

        nameEl.insertAdjacentElement('afterend', wrapper);
        attachTooltip(wrapper, note, hasTags, hasText);
    }

    // Phase 3: space 主页用户名替换（适配 .nickname 选择器）
    function processSpacePage() {
        if (!location.hostname.includes('space.bilibili.com')) return;
        const urlMatch = location.pathname.match(/\/(\d+)/);
        if (!urlMatch) return;
        const uid = urlMatch[1];
        const note = getNote(uid);
        if (!note) return;
        const hasTags = note.tags && note.tags.length > 0;
        const hasText = note.text;
        const hasName = !!note.name;
        if (!hasTags && !hasText && !hasName) return;

        // 替换用户名（适配 B 站改版）
        const nameEl = document.querySelector('.h-name, .nickname, .h-info .name, [class*="uname"]');
        if (nameEl) {
            if (!nameEl.dataset.bnOrigName) nameEl.dataset.bnOrigName = nameEl.textContent.trim();
            if (hasName) {
                nameEl.textContent = note.name;
            } else if (nameEl.dataset.bnOrigName) {
                nameEl.textContent = nameEl.dataset.bnOrigName;
            }
        }

        const descEl = document.querySelector('.h-sign, .h-desc, .desc, .sign, [class*="sign"], [class*="desc"]');
        if (!descEl || descEl.getAttribute(PROCESSED_ATTR)) return;
        if (descEl.nextElementSibling?.classList?.contains('bili-note-wrapper')) return;

        if (!hasTags && !hasText) return;

        descEl.setAttribute(PROCESSED_ATTR, '1');
        const wrapper = buildNoteWrapper(note);
        if (!wrapper) return;
        descEl.insertAdjacentElement('afterend', wrapper);
        attachTooltip(wrapper, note, hasTags, hasText);
    }

    function processPage() {
        const processed = new Set();
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
        document.querySelectorAll('.bili-note-wrapper').forEach(el => {
            if (el._tooltip) el._tooltip.remove();
            el.remove();
        });
        document.querySelectorAll('.bili-note-tooltip-fixed').forEach(el => el.remove());
        document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => el.removeAttribute(PROCESSED_ATTR));
        processPage();
    }

    // ==================== Shift+右键触发 ====================
    function handleContextMenu(e) {
        if (!e.shiftKey) return;
        if (location.hostname.includes('space.bilibili.com')) {
            const urlMatch = location.pathname.match(/\/(\d+)/);
            if (urlMatch) {
                e.preventDefault();
                const uid = urlMatch[1];
                const userName = document.querySelector('.h-name, .nickname, .h-info .name, [class*="uname"]')?.textContent?.trim() || '';
                setTimeout(() => showModal(uid, userName, getNote(uid)), 50);
                return;
            }
        }
        const { uid, el } = findUidFromTarget(e.target);
        if (!uid) return;
        e.preventDefault();
        let userName = '';
        if (el) {
            const nameEl = el.classList?.contains('name') || el.classList?.contains('username') ||
                           el.classList?.contains('user-name') || el.classList?.contains('reply-user-name') ||
                           el.classList?.contains('dyn-user-name') || el.classList?.contains('up-name')
                ? el : el.querySelector?.('.name, .username, .user-name, .reply-user-name, .dyn-user-name, .up-name');
            userName = nameEl?.textContent?.trim() || el.textContent?.trim() || '';
            if (userName.length > 25) userName = '';
        }
        setTimeout(() => showModal(uid, userName, getNote(uid)), 50);
    }

    // ==================== 弹窗 ====================
    let currentModal = null;
    let _editingTagRef = null;

    // 跑马灯控制（用于页面可见性暂停）
    let _marqueeStart = null;
    let _marqueeStop = null;

    // 文档级事件监听器管理（防止泄漏）
    let _docClickHandler = null;
    let _docKeydownHandler = null;
    function cleanupDocListeners() {
        if (_docClickHandler) { document.removeEventListener('click', _docClickHandler); _docClickHandler = null; }
        if (_docKeydownHandler) { document.removeEventListener('keydown', _docKeydownHandler); _docKeydownHandler = null; }
    }
    function setupDocListeners(colorPopup, tagInput, mask) {
        cleanupDocListeners();
        _docClickHandler = e => { if (!e.target.closest('.bn-tag-input-row') && !e.target.closest('.bn-color-picker-panel')) colorPopup.style.display = 'none'; };
        _docKeydownHandler = e => { if (e.key === 'Escape') confirmClose(); };
        document.addEventListener('click', _docClickHandler);
        document.addEventListener('keydown', _docKeydownHandler);
    }
    function confirmClose() {
        if (currentModal && currentModal._hasUnsavedChanges) {
            if (!confirm('有未保存的更改，确定关闭吗？')) return;
        }
        closeModal();
    }

    function showModal(uid, userName, noteData = null) {
        cleanupDocListeners();
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
                        <div class="bn-tag-hint">输入文字后按 <kbd>Enter</kbd> 添加标签<br>双击标签二次编辑 <kbd id="bn-hash-btn" style="cursor:pointer;" title="点击唤起检索">#</kbd> 唤起检索</div>
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

        const focusableSelectors = 'textarea, button, [tabindex]:not([tabindex="-1"])';
        const focusableElements = modal.querySelectorAll(focusableSelectors);
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
            modal.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    const firstEl = focusableElements[0];
                    const lastEl = focusableElements[focusableElements.length - 1];
                    if (e.shiftKey) {
                        if (document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
                    } else {
                        if (document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
                    }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                    const ae = document.activeElement;
                    if (ae && ae.tagName !== 'TEXTAREA' && ae.tagName !== 'INPUT') {
                        e.preventDefault();
                        modal.querySelector('#bn-save').click();
                    }
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

        function autoResize(el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
        }
        autoResize(tagInput);
        autoResize(textInput);
        tagInput.addEventListener('input', () => autoResize(tagInput));
        textInput.addEventListener('input', () => autoResize(textInput));

        const existingTagsBox = modal.querySelector('#bn-existing-tags');
        const allTags = getAllUniqueTags();

        let scrollPos = 0;
        let lastScrollPos = 0;
        let snakeDir = 1;
        let autoScrollTimer = null;
        const SCROLL_SPEED = 0.8;
        const TICK_INTERVAL = 30;

        function stopAutoScroll() {
            if (autoScrollTimer) {
                clearInterval(autoScrollTimer);
                autoScrollTimer = null;
            }
        }

        if (allTags.length > 0) {
            existingTagsBox.innerHTML = `
                <div class="bn-existing-tags-viewport">
                    <div class="bn-existing-tags-track">${allTags.map(t => `<span class="bn-existing-tag" data-text="${safeAttr(t.text)}" data-color="${safeAttr(t.color)}" style="background-color:${safeColor(t.color)}">${escapeHtml(t.text)}</span>`).join('')}</div>
                </div>
                <div class="bn-existing-scrollbar"><div class="bn-existing-scrollbar-thumb bn-existing-scrollbar-thumb-l"></div><div class="bn-existing-scrollbar-thumb bn-existing-scrollbar-thumb-r"></div></div>
            `;

            const scrollContainer = existingTagsBox.querySelector('.bn-existing-tags-viewport');
            const scrollTrack = existingTagsBox.querySelector('.bn-existing-tags-track');
            const scrollbar = existingTagsBox.querySelector('.bn-existing-scrollbar');
            const thumbL = existingTagsBox.querySelector('.bn-existing-scrollbar-thumb-l');
            const thumbR = existingTagsBox.querySelector('.bn-existing-scrollbar-thumb-r');

            const originalHTML = scrollTrack.innerHTML;
            scrollTrack.innerHTML = originalHTML + originalHTML;

            scrollTrack.addEventListener('click', (e) => {
                const tag = e.target.closest('.bn-existing-tag');
                if (!tag) return;
                const text = tag.dataset.text;
                const color = tag.dataset.color;
                if (text && !editingTags.some(t => t.text === text && t.color === color)) {
                    if (editingTags.length >= MAX_TAGS) {
                        showToast(`最多添加 ${MAX_TAGS} 个标签`, 'warning');
                        return;
                    }
                    editingTags.push({ text, color });
                    renderTags();
                }
            });

            function getOriginalWidth() { return scrollTrack.scrollWidth / 2; }
            function getContainerWidth() { return scrollContainer.offsetWidth; }

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

            existingTagsBox.addEventListener('mouseenter', stopAutoScroll);
            existingTagsBox.addEventListener('mouseleave', startAutoScroll);

            updateThumbSegments();
            _marqueeStart = startAutoScroll;
            _marqueeStop = stopAutoScroll;
            startAutoScroll();

            if (tagInput) {
                let searchActive = false;
                let searchKeyword = '';
                let searchSelectedIdx = -1;
                let searchMatchEls = [];
                const hashBtn = modal.querySelector('#bn-hash-btn');

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
                    if (hashBtn) hashBtn.classList.add('active');
                }

                function exitSearchMode() {
                    if (!searchActive) return;
                    searchActive = false;
                    searchKeyword = '';
                    searchSelectedIdx = -1;
                    searchHint.style.display = 'none';
                    if (hashBtn) hashBtn.classList.remove('active');
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
                            if (editingTags.length >= MAX_TAGS) {
                                showToast(`最多添加 ${MAX_TAGS} 个标签`, 'warning');
                                return;
                            }
                            editingTags.push({ text, color });
                            renderTags();
                        }
                        tagInput.value = '';
                        autoResize(tagInput);
                        exitSearchMode();
                    }
                });

                mask.addEventListener('mousedown', (e) => {
                    if (searchActive && !tagInput.contains(e.target) && !e.target.closest('#bn-dot') && !e.target.closest('#bn-hash-btn') && !(colorPopup && colorPopup.contains(e.target))) exitSearchMode();
                });

                // # 按钮点击唤起/退出检索
                if (hashBtn) {
                    hashBtn.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                    });
                    hashBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (searchActive) {
                            tagInput.value = '';
                            autoResize(tagInput);
                            updateTagCounter();
                            exitSearchMode();
                        } else {
                            tagInput.value = '';
                            tagInput.focus();
                            enterSearchMode();
                            doSearch();
                        }
                    });
                }
            }
        }

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
                <span class="bn-tag" style="background-color:${safeColor(t.color)}" data-i="${i}">
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
            // Phase 2: blur 竞态修复 — 用 mousedown 标记替代 setTimeout
            input.addEventListener('blur', () => {
                requestAnimationFrame(() => {
                    if (_colorDotMouseDown || !input.parentNode) return;
                    commit();
                });
            });
        }

        async function showColorPopup() {
            colorDot.classList.remove('bn-color-dot-hint');
            const recentColors = await getRecentColors();
            colorPopup.innerHTML = `
                <div class="bn-color-title">自定义颜色</div>
                <div style="margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                    <div id="bn-hex-preview" style="width: 22px; height: 22px; border-radius: 4px; border: 1px solid #e3e5e7; background: ${safeColor(selectedColor)}; flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="点击屏幕任意处取色">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 22l1-1h3l9-9"/><path d="M15.5 4.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                    </div>
                    <input type="text" id="bn-custom-color" value="${safeColor(selectedColor)}" maxlength="7" placeholder="#RRGGBB"
                        style="flex: 1; height: 22px; border: 1px solid #e3e5e7; border-radius: 4px; padding: 0 6px; font-size: 11px; font-family: monospace; outline: none;">
                </div>
                ${recentColors.length > 0 ? `
                    <div class="bn-color-title">最近使用</div>
                    <div class="bn-color-grid" style="margin-bottom: 4px;">
                        ${recentColors.map(c => `<div class="bn-color-item ${selectedColor === c ? 'active' : ''}" style="background-color:${safeColor(c)}" data-color="${safeAttr(c)}" data-code="${safeAttr(c)}"></div>`).join('')}
                    </div>
                ` : ''}
                <div class="bn-color-title">预设颜色</div>
                <div class="bn-color-grid">
                    ${PRESET_COLORS.map(c => `<div class="bn-color-item ${selectedColor === c.value ? 'active' : ''}" style="background-color:${safeColor(c.value)}" data-color="${safeAttr(c.value)}" data-code="${safeAttr(c.value)}"></div>`).join('')}
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
            // 自定义取色器面板
            const pickerPanel = document.createElement('div');
            pickerPanel.className = 'bn-color-picker-panel';
            pickerPanel.style.cssText = 'display:none;position:fixed;background:#fff;border-radius:8px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:999999;';
            pickerPanel.style.top = popupTop + 'px';
            pickerPanel.style.left = (popupLeft - 184) + 'px';
            let pickerH, pickerS, pickerV;
            try { [pickerH, pickerS, pickerV] = hexToHsv(selectedColor); } catch(e) { pickerH=0; pickerS=1; pickerV=1; }
            const svArea = document.createElement('div');
            svArea.style.cssText = 'width:160px;height:120px;position:relative;border-radius:4px;overflow:hidden;cursor:crosshair;';
            const svBg = document.createElement('div');
            svBg.style.cssText = `width:100%;height:100%;background:hsl(${pickerH},100%,50%);`;
            svArea.appendChild(svBg);
            const svWhite = document.createElement('div');
            svWhite.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to right,#fff,rgba(255,255,255,0));';
            svArea.appendChild(svWhite);
            const svBlack = document.createElement('div');
            svBlack.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to bottom,rgba(0,0,0,0),#000);';
            svArea.appendChild(svBlack);
            const svCursor = document.createElement('div');
            svCursor.style.cssText = 'position:absolute;width:10px;height:10px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 2px rgba(0,0,0,0.5);pointer-events:none;transform:translate(-50%,-50%);';
            svArea.appendChild(svCursor);
            const hueBar = document.createElement('div');
            hueBar.style.cssText = 'width:160px;height:14px;margin-top:6px;border-radius:3px;background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);cursor:pointer;position:relative;';
            const hueIndicator = document.createElement('div');
            hueIndicator.style.cssText = 'position:absolute;top:-2px;width:4px;height:18px;background:#fff;border:1px solid #999;border-radius:2px;pointer-events:none;transform:translateX(-50%);';
            hueBar.appendChild(hueIndicator);
            pickerPanel.appendChild(svArea);
            pickerPanel.appendChild(hueBar);
            document.body.appendChild(pickerPanel);
            function updatePickerFromColor(hex) {
                try { [pickerH, pickerS, pickerV] = hexToHsv(hex); } catch(e) { return; }
                svBg.style.background = `hsl(${pickerH},100%,50%)`;
                svCursor.style.left = (pickerS*100)+'%';
                svCursor.style.top = ((1-pickerV)*100)+'%';
                hueIndicator.style.left = (pickerH/360*100)+'%';
            }
            function applyPickerColor() {
                const hex = hsvToHex(pickerH, pickerS, pickerV);
                if (_editingTagRef) { _editingTagRef.tag.color = hex; colorDot.style.backgroundColor = hex; }
                else { selectedColor = hex; addRecentColor(selectedColor); updateDot(); }
                const hp = colorPopup.querySelector('#bn-hex-preview');
                const ci = colorPopup.querySelector('#bn-custom-color');
                if (hp) hp.style.backgroundColor = hex;
                if (ci) ci.value = hex;
                colorPopup.querySelectorAll('.bn-color-item').forEach(i => i.classList.remove('active'));
            }
            let svDragging = false;
            function updateSV(e) {
                const rect = svArea.getBoundingClientRect();
                pickerS = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width));
                pickerV = 1 - Math.max(0, Math.min(1, (e.clientY-rect.top)/rect.height));
                svCursor.style.left = (pickerS*100)+'%';
                svCursor.style.top = ((1-pickerV)*100)+'%';
                applyPickerColor();
            }
            svArea.addEventListener('mousedown', e => { svDragging=true; updateSV(e); e.preventDefault(); });
            let hueDragging = false;
            function updateHue(e) {
                const rect = hueBar.getBoundingClientRect();
                pickerH = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width)) * 360;
                svBg.style.background = `hsl(${pickerH},100%,50%)`;
                hueIndicator.style.left = (pickerH/360*100)+'%';
                applyPickerColor();
            }
            hueBar.addEventListener('mousedown', e => { hueDragging=true; updateHue(e); e.preventDefault(); });
            document.addEventListener('mousemove', e => { if(svDragging) updateSV(e); if(hueDragging) updateHue(e); });
            document.addEventListener('mouseup', () => { svDragging=false; hueDragging=false; });
            updatePickerFromColor(selectedColor);
            const hexPreview = colorPopup.querySelector('#bn-hex-preview');
            const customColorInput = colorPopup.querySelector('#bn-custom-color');
            // 方形按钮：切换取色器面板 & 触发屏幕取色
            if (hexPreview) {
                hexPreview.addEventListener('click', async () => {
                    // 如果取色器面板已打开，先关闭它，再触发屏幕取色
                    if (pickerPanel.style.display === 'block') {
                        pickerPanel.style.display = 'none';
                    }
                    // 屏幕取色（仅在面板关闭时可用）
                    if (!('EyeDropper' in window)) {
                        showToast('当前浏览器不支持屏幕取色', 'warning');
                        return;
                    }
                    try {
                        const result = await new EyeDropper().open();
                        if (result && result.sRGBHex) {
                            applyCustomColor(result.sRGBHex);
                        }
                    } catch(e) {}
                });
            }
            function applyCustomColor(val) {
                if (!isValidHexColor(val)) return;
                const lower = val.toLowerCase();
                if (_editingTagRef) { _editingTagRef.tag.color = lower; colorDot.style.backgroundColor = lower; }
                else { selectedColor = lower; addRecentColor(selectedColor); updateDot(); }
                if (hexPreview) hexPreview.style.backgroundColor = lower;
                colorPopup.querySelectorAll('.bn-color-item').forEach(i => i.classList.remove('active'));
                updatePickerFromColor(lower);
            }
            if (customColorInput) {
                customColorInput.addEventListener('input', e => {
                    const val = e.target.value;
                    if (hexPreview) hexPreview.style.backgroundColor = isValidHexColor(val) ? val : 'transparent';
                    applyCustomColor(val);
                });
                customColorInput.addEventListener('keydown', e => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        applyCustomColor(e.target.value);
                        colorPopup.style.display = 'none';
                        if (_editingTagRef && _editingTagRef.input) _editingTagRef.input.focus();
                        else tagInput.focus();
                    }
                });
                customColorInput.addEventListener('blur', () => { applyCustomColor(customColorInput.value); });
            }
            colorPopup.querySelectorAll('.bn-color-item').forEach(item => {
                item.addEventListener('click', () => {
                    if (_editingTagRef) { _editingTagRef.tag.color = item.dataset.color; colorDot.style.backgroundColor = item.dataset.color; }
                    else { selectedColor = item.dataset.color; addRecentColor(selectedColor); updateDot(); }
                    colorPopup.querySelectorAll('.bn-color-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    if (hexPreview) hexPreview.style.backgroundColor = item.dataset.color;
                    if (customColorInput) customColorInput.value = item.dataset.color;
                    updatePickerFromColor(item.dataset.color);
                });
            });
        }

        // Phase 2: mousedown 标记
        colorDot.addEventListener('mousedown', () => { _colorDotMouseDown = true; });
        colorDot.addEventListener('click', e => {
            e.stopPropagation();
            colorPopup.style.display === 'block' ? colorPopup.style.display = 'none' : showColorPopup();
            setTimeout(() => { _colorDotMouseDown = false; }, 0);
        });
        setupDocListeners(colorPopup, tagInput, mask);

        mask._cleanup = () => {
            stopAutoScroll();
            document.querySelectorAll('.bn-color-picker-panel').forEach(el => el.remove());
        };

        const tagCounter = modal.querySelector('#bn-tag-counter');
        function updateTagCounter() {
            const len = tagInput.value.length;
            tagCounter.textContent = `${len}/${TAG_MAX_LENGTH}`;
            tagCounter.classList.toggle('warn', len >= TAG_MAX_LENGTH);
        }
        tagInput.addEventListener('input', updateTagCounter);
        updateTagCounter();

        mask._hasUnsavedChanges = false;
        function checkUnsavedChanges() {
            const currentText = modal.querySelector('#bn-text').value;
            const origText = noteData?.text || '';
            const origTagsStr = JSON.stringify(noteData?.tags || []);
            const curTagsStr = JSON.stringify(editingTags);
            mask._hasUnsavedChanges = currentText !== origText || origTagsStr !== curTagsStr;
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
                    if (editingTags.length >= MAX_TAGS) {
                        showToast(`最多添加 ${MAX_TAGS} 个标签`, 'warning');
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

        modal.querySelector('.bn-close').addEventListener('click', confirmClose);
        modal.querySelector('#bn-cancel').addEventListener('click', confirmClose);

        // Phase 1: 空备注拦截
        modal.querySelector('#bn-save').addEventListener('click', () => {
            const newName = modal.querySelector('#bn-username').value.trim();
            const noteData = { tags: editingTags, text: modal.querySelector('#bn-text').value.trim() };
            if (newName) noteData.name = newName;
            if (editingTags.length === 0 && !noteData.text) {
                showToast('请至少添加一个标签或备注', 'warning');
                return;
            }
            if (noteData.text && noteData.text.length > NOTE_TEXT_MAX_LENGTH) {
                showToast(`备注最多 ${NOTE_TEXT_MAX_LENGTH} 个字符`);
                return;
            }
            setNote(uid, noteData);
            mask._hasUnsavedChanges = false;
            refreshAll();
            closeModal();
            showToast(isNew ? '备注已添加' : '备注已更新');
        });

        modal.querySelector('#bn-delete')?.addEventListener('click', () => {
            if (confirm(`确定删除 ${userName || uid} 的备注？`)) {
                removeNote(uid);
                mask._hasUnsavedChanges = false;
                refreshAll();
                closeModal();
                showToast('备注已删除');
            }
        });

    }

    function closeModal() {
        cleanupDocListeners();
        _marqueeStart = null;
        _marqueeStop = null;
        if (currentModal) {
            if (currentModal._cleanup) currentModal._cleanup();
            currentModal.remove();
        }
        currentModal = null;
    }

    // ==================== 跨标签页同步 ====================
    function _setupCrossTabSync() {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes[STORAGE_KEY]) {
                    _notesLoaded = false;
                    _notesCache = null;
                    refreshAll();
                }
            });
        }
    }

    // ==================== 初始化 ====================
    function init() {
        loadNotes().then(() => {
            _setupCrossTabSync();

            // 页面不可见时暂停跑马灯动画，节省 CPU
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (_marqueeStop) _marqueeStop();
                } else {
                    if (_marqueeStart) _marqueeStart();
                }
            });

            setTimeout(processPage, 2000);

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

            let _processTimer = null;
            function scheduleProcess(delay = 800) {
                if (_processTimer) clearTimeout(_processTimer);
                _processTimer = setTimeout(processPage, delay);
            }

            window.addEventListener('popstate', () => scheduleProcess(500), true);
            window.addEventListener('hashchange', () => scheduleProcess(500), true);

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

            // Phase 3: MutationObserver 收窄到用户名相关容器
            const OBSERVE_SELECTORS = [
                '.reply-list', '.comment-list',
                '.dyn-list', '.dyn-space',
                '.video-info', '.video-desc',
                '.h-info', '.h-header',
                '.member-list', '.relation-list',
                '.contact-list',
                '.chat-list', '.chat-container',
                '.search-page', '.search-result',
                '.feed-card', '.card-list',
                '#app',
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
            if (observeTargets.length === 0) {
                _observer.observe(document.body, { childList: true, subtree: true });
            }

            document.addEventListener('contextmenu', handleContextMenu, true);
        });
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();
