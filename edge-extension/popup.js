const ICONS = {
    tag: '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
};

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

const STORAGE_KEY = 'bilibili_user_notes_v2';

// ==================== Toast 提示 ====================
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
        position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
        background: bg, color: '#fff', padding: '8px 16px',
        borderRadius: '6px', fontSize: '12px', fontWeight: '500',
        zIndex: '99999', boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        transition: 'opacity 0.3s, transform 0.3s',
        animation: 'toast-in 0.3s ease',
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(-10px)'; }, 2000);
    setTimeout(() => t.remove(), 2300);
}

function loadNotes() {
    return new Promise(resolve => {
        chrome.storage.local.get(STORAGE_KEY, result => resolve(result[STORAGE_KEY] || {}));
    });
}

function getAllUniqueTags(notes) {
    const tagMap = new Map();
    Object.values(notes).forEach(note => {
        if (note.tags) {
            note.tags.forEach(tag => {
                const key = tag.text.toLowerCase() + '|' + (tag.color || '').toLowerCase();
                if (!tagMap.has(key)) tagMap.set(key, tag);
            });
        }
    });
    return Array.from(tagMap.values());
}

let activeFilterTags = new Set();

function renderTagFilter() {
    loadNotes().then(notes => {
        const allTags = getAllUniqueTags(notes);
        const tagFilter = document.getElementById('tag-filter');
        if (allTags.length === 0) {
            tagFilter.innerHTML = '<span style="font-size:11px;color:#9499a0;">暂无标签</span>';
            return;
        }
        tagFilter.innerHTML = allTags.map(t => {
            const key = t.text.toLowerCase() + '|' + (t.color || '').toLowerCase();
            const isActive = activeFilterTags.has(key);
            return `<span class="tag-filter-item ${isActive ? 'active' : ''}" data-key="${safeAttr(key)}" data-text="${safeAttr(t.text)}" data-color="${safeAttr(t.color)}" style="background-color:${safeAttr(t.color)}">${escapeHtml(t.text)}</span>`;
        }).join('');

        tagFilter.querySelectorAll('.tag-filter-item').forEach(el => {
            const key = el.dataset.key;
            const text = el.dataset.text;
            const color = el.dataset.color;

            el.addEventListener('click', () => {
                if (activeFilterTags.has(key)) {
                    activeFilterTags.delete(key);
                } else {
                    activeFilterTags.add(key);
                }
                renderTagFilter();
                renderList(document.getElementById('search').value.toLowerCase());
            });

            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!confirm(`确定要全盘删除标签「${text}」？\n这会移除所有用户身上的该标签。`)) return;
                loadNotes().then(allNotes => {
                    let removedCount = 0;
                    Object.values(allNotes).forEach(note => {
                        if (note.tags) {
                            const before = note.tags.length;
                            note.tags = note.tags.filter(t => !(t.text.toLowerCase() === text.toLowerCase() && (t.color || '').toLowerCase() === color.toLowerCase()));
                            removedCount += before - note.tags.length;
                        }
                    });
                    chrome.storage.local.set({ [STORAGE_KEY]: allNotes });
                    activeFilterTags.delete(key);
                    renderTagFilter();
                    renderList(document.getElementById('search').value.toLowerCase());
                    showToast(`已删除 ${removedCount} 个「${text}」标签`);
                });
            });
        });
    });
}

function renderList(kw = '') {
    loadNotes().then(notes => {
        const list = document.getElementById('list');
        let all = Object.values(notes);
        // 标签筛选
        if (activeFilterTags.size > 0) {
            all = all.filter(n => {
                if (!n.tags || n.tags.length === 0) return false;
                return n.tags.some(t => activeFilterTags.has(t.text.toLowerCase() + '|' + (t.color || '').toLowerCase()));
            });
        }
        // 更新标题计数
        document.getElementById('note-count').textContent = all.length > 0 ? `${all.length} 条` : '';
        const filtered = kw
            ? all.filter(n => n.name?.toLowerCase().includes(kw) || n.text?.toLowerCase().includes(kw) || n.tags?.some(t => t.text.toLowerCase().includes(kw)))
            : all;

        if (filtered.length === 0) {
            const isSearch = kw && kw.length > 0;
            list.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 120 80" width="120" height="80" fill="none">
                        <rect x="20" y="10" width="80" height="55" rx="6" stroke="#c9ccd0" stroke-width="2"/>
                        <circle cx="40" cy="30" r="6" fill="#e3e5e7"/>
                        <line x1="52" y1="28" x2="80" y2="28" stroke="#e3e5e7" stroke-width="2" stroke-linecap="round"/>
                        <line x1="52" y1="34" x2="72" y2="34" stroke="#e3e5e7" stroke-width="2" stroke-linecap="round"/>
                        <circle cx="40" cy="50" r="6" fill="#e3e5e7"/>
                        <line x1="52" y1="48" x2="76" y2="48" stroke="#e3e5e7" stroke-width="2" stroke-linecap="round"/>
                        <line x1="52" y1="54" x2="68" y2="54" stroke="#e3e5e7" stroke-width="2" stroke-linecap="round"/>
                        <rect x="35" y="65" width="50" height="8" rx="2" fill="#f1f2f3"/>
                    </svg>
                    <div class="empty-title">${isSearch ? '未找到匹配的备注' : '暂无备注'}</div>
                    <div class="empty-desc">${isSearch ? '试试其他关键词' : '按住 Shift + 右键用户名即可添加'}</div>
                </div>
            `;
            return;
        }

        list.innerHTML = filtered.map(n => `
            <div class="item" data-uid="${safeAttr(String(n.uid))}">
                <div class="info">
                    <div class="name"><a class="bn-link" href="https://space.bilibili.com/${safeAttr(String(n.uid))}" target="_blank" rel="noopener">${escapeHtml(n.name) || '未设置名称'}</a></div>
                    <div class="uid"><a class="bn-link" href="https://space.bilibili.com/${safeAttr(String(n.uid))}" target="_blank" rel="noopener">UID: ${escapeHtml(String(n.uid))}</a></div>
                </div>
                <div class="tags">
                    ${n.tags?.map(t => `<span class="tag" data-uid="${safeAttr(String(n.uid))}" data-text="${safeAttr(t.text)}" data-color="${safeAttr(t.color)}" style="background:${safeAttr(t.color)}">${escapeHtml(t.text)}</span>`).join('') || ''}
                    ${n.text ? `<span class="text">${escapeHtml(n.text)}</span>` : ''}
                </div>
                <div class="actions">
                    <button class="btn edit" title="编辑">${ICONS.edit}</button>
                    <button class="btn del" title="删除">${ICONS.trash}</button>
                </div>
                <div class="edit-form" id="edit-${n.uid}">
                    <div class="edit-tags" id="edit-tags-${n.uid}"></div>
                    <textarea class="edit-text" placeholder="备注内容">${escapeHtml(n.text || '')}</textarea>
                    <div class="edit-actions">
                        <button class="cancel">取消</button>
                        <button class="save">保存</button>
                    </div>
                </div>
            </div>
        `).join('');

        // 编辑功能
        list.querySelectorAll('.btn.edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.item');
                const uid = item.dataset.uid;
                const form = item.querySelector('.edit-form');
                const isOpen = form.classList.contains('active');
                // 关闭所有其他编辑表单
                list.querySelectorAll('.edit-form.active').forEach(f => f.classList.remove('active'));
                if (!isOpen) form.classList.add('active');
            });
        });

        // 初始化编辑表单的标签渲染
        list.querySelectorAll('.edit-form').forEach(form => {
            const uid = form.id.replace('edit-', '');
            loadNotes().then(notes => {
                const note = notes[uid];
                if (!note) return;
                const editTags = [...(note.tags || [])];
                const tagsContainer = form.querySelector('.edit-tags');

                function renderEditTags() {
                    tagsContainer.innerHTML = editTags.map((t, i) =>
                        `<span class="edit-tag" style="background:${safeAttr(t.color)}">${escapeHtml(t.text)}<span class="del" data-i="${i}">&times;</span></span>`
                    ).join('');
                    tagsContainer.querySelectorAll('.del').forEach(d => {
                        d.addEventListener('click', () => {
                            editTags.splice(parseInt(d.dataset.i), 1);
                            renderEditTags();
                        });
                    });
                }
                renderEditTags();

                form.querySelector('.cancel').addEventListener('click', () => {
                    form.classList.remove('active');
                });

                form.querySelector('.save').addEventListener('click', () => {
                    const text = form.querySelector('.edit-text').value.trim();
                    loadNotes().then(current => {
                        if (current[uid]) {
                            current[uid].tags = editTags;
                            current[uid].text = text;
                            current[uid].updatedAt = Date.now();
                            chrome.storage.local.set({ [STORAGE_KEY]: current });
                            renderList(document.getElementById('search').value.toLowerCase());
                        }
                    });
                });
            });
        });

        list.querySelectorAll('.btn.del').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = btn.closest('.item').dataset.uid;
                if (confirm('确定删除这条备注？')) {
                    loadNotes().then(notes => {
                        delete notes[uid];
                        chrome.storage.local.set({ [STORAGE_KEY]: notes });
                        renderList(kw);
                    });
                }
            });
        });

        // 右键删除单个标签
        list.querySelectorAll('.tag').forEach(tag => {
            tag.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const uid = tag.dataset.uid;
                const text = tag.dataset.text;
                const color = tag.dataset.color;
                if (!uid || !confirm(`确定要删除 ${uid} 的标签「${text}」？`)) return;
                loadNotes().then(notes => {
                    const n = notes[uid];
                    if (!n || !n.tags) return;
                    n.tags = n.tags.filter(t => !(t.text === text && t.color === color));
                    chrome.storage.local.set({ [STORAGE_KEY]: notes });
                    renderList(kw);
                    showToast('标签已删除');
                });
            });
        });
    });
}

document.getElementById('search').addEventListener('input', e => renderList(e.target.value.toLowerCase()));

document.getElementById('export').addEventListener('click', () => {
    loadNotes().then(notes => {
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
});

document.getElementById('import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (typeof imported !== 'object' || Array.isArray(imported)) {
                    showToast('文件格式不正确');
                    return;
                }
                // 过滤原型污染键
                const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
                const items = Object.entries(imported)
                    .filter(([k]) => !DANGEROUS_KEYS.has(k))
                    .map(([, v]) => v)
                    .filter(v => v && typeof v === 'object' && v.uid);
                if (items.length === 0) {
                    showToast('文件中无有效备注数据');
                    return;
                }
                // 校验并清洗每条数据
                const cleaned = items.map(n => ({
                    uid: String(n.uid),
                    name: typeof n.name === 'string' ? n.name : '',
                    text: typeof n.text === 'string' ? n.text : '',
                    tags: Array.isArray(n.tags) ? n.tags
                        .filter(t => t && typeof t.text === 'string' && typeof t.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(t.color))
                        .map(t => ({ text: t.text, color: t.color.toLowerCase() }))
                        : [],
                    updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : Date.now(),
                }));
                showImportPreview(cleaned);
            } catch {
                showToast('文件解析失败');
            }
        };
        reader.readAsText(file);
    });
    input.click();
});

function showImportPreview(items) {
    const mask = document.createElement('div');
    mask.className = 'preview-mask';
    const modal = document.createElement('div');
    modal.className = 'preview-modal';
    modal.innerHTML = `
        <div class="preview-title">导入预览 (${items.length} 条)</div>
        <div class="preview-list">
            ${items.slice(0, 20).map(n => `
                <div class="preview-item">
                    <div class="p-name">${escapeHtml(n.name) || '未设置名称'}</div>
                    <div class="p-info">UID: ${escapeHtml(String(n.uid))}${n.tags?.length ? ' · ' + n.tags.length + ' 个标签' : ''}</div>
                </div>
            `).join('')}
            ${items.length > 20 ? `<div class="preview-item"><div class="p-info">...还有 ${items.length - 20} 条</div></div>` : ''}
        </div>
        <div class="preview-actions">
            <button class="cancel">取消</button>
            <button class="confirm">确认导入</button>
        </div>
    `;
    mask.appendChild(modal);
    document.body.appendChild(mask);

    mask.addEventListener('click', e => { if (e.target === mask) mask.remove(); });
    modal.querySelector('.cancel').addEventListener('click', () => mask.remove());
    modal.querySelector('.confirm').addEventListener('click', () => {
        loadNotes().then(current => {
            const imported = {};
            items.forEach(n => { imported[n.uid] = n; });
            const merged = { ...imported, ...current };
            chrome.storage.local.set({ [STORAGE_KEY]: merged });
            renderList();
            showToast(`已导入 ${items.length} 条备注`);
            mask.remove();
        });
    });
}

// 清空所有备注
document.getElementById('clear').addEventListener('click', () => {
    loadNotes().then(notes => {
        const count = Object.keys(notes).length;
        if (count === 0) { showToast('暂无备注可清空', 'warning'); return; }
        if (confirm('确定要清空所有备注数据吗？此操作不可恢复。')) {
            chrome.storage.local.set({ [STORAGE_KEY]: {} });
            renderList();
            showToast('所有备注已清空', 'success');
        }
    });
});

// ==================== 快捷键支持 ====================
document.addEventListener('keydown', (e) => {
    // Ctrl+S / Cmd+S 保存当前编辑的表单
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const activeForm = document.querySelector('.edit-form.active');
        if (activeForm) {
            const saveBtn = activeForm.querySelector('.save');
            if (saveBtn) saveBtn.click();
        }
    }
    // Esc 关闭当前编辑的表单
    if (e.key === 'Escape') {
        const activeForm = document.querySelector('.edit-form.active');
        if (activeForm) {
            activeForm.classList.remove('active');
        }
    }
});

renderList();

// ==================== 标签筛选功能 ====================
const tagExpandBtn = document.getElementById('tag-expand');
const tagPanel = document.getElementById('tag-panel');

tagExpandBtn.addEventListener('click', () => {
    const isOpen = tagPanel.style.display !== 'none';
    tagPanel.style.display = isOpen ? 'none' : 'block';
    tagExpandBtn.classList.toggle('active', !isOpen);
    if (!isOpen) {
        renderTagFilter();
    }
});

// 右键删除列表中的单个标签
document.addEventListener('contextmenu', (e) => {
    const tag = e.target.closest('.tag');
    if (!tag) return;
    e.preventDefault();
    const item = tag.closest('.item');
    if (!item) return;
    const uid = item.dataset.uid;
    const text = tag.textContent;
    const color = tag.style.background || tag.style.backgroundColor;
    if (!confirm(`确定要删除 ${uid} 的标签「${text}」？`)) return;
    loadNotes().then(notes => {
        const note = notes[uid];
        if (!note || !note.tags) return;
        note.tags = note.tags.filter(t => !(t.text === text && (t.color || '').toLowerCase() === color.toLowerCase()));
        notes[uid] = note;
        chrome.storage.local.set({ [STORAGE_KEY]: notes });
        renderList(document.getElementById('search').value.toLowerCase());
        showToast('标签已删除');
    });
});
