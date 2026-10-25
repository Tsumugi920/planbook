/* ===== planbook · 旅行行程规划 =====
 * 纯静态单页应用：多日行程 / 预算跟踪 / 打包清单
 * 数据存 localStorage，支持 JSON 导入导出，首次打开载入 3 天示例行程。
 */
'use strict';

/* ---------- 常量与工具 ---------- */

const STORAGE_KEY = 'planbook.v1';
const BUDGET_CATEGORIES = ['交通', '住宿', '餐饮', '门票', '购物', '其他'];
const PACKING_CATEGORIES = ['证件', '电子', '衣物', '洗漱', '药品', '其他'];

const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function pad2(n) { return String(n).padStart(2, '0'); }

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDaysStr(dateStr, n) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function weekday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return '周' + '日一二三四五六'[d.getDay()];
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [, m, d] = dateStr.split('-');
  return m && d ? `${m}-${d}` : dateStr;
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 2200);
}

function findDay(id) { return state.trip.days.find((d) => d.id === id); }

function findActivity(activityId) {
  for (const day of state.trip.days) {
    const act = day.activities.find((a) => a.id === activityId);
    if (act) return { day, act };
  }
  return null;
}

/* ---------- 数据模型 ---------- */

let state = null;
let activeTab = 'trip';
let editingActivityId = null;
let editingExpenseId = null;
let editingPackingId = null;

function normalizeData(d) {
  return {
    version: 1,
    trip: {
      title: String((d.trip && d.trip.title) || '新行程').slice(0, 80),
      days: (d.trip && Array.isArray(d.trip.days) ? d.trip.days : []).map((day) => ({
        id: day.id || uid(),
        date: String(day.date || ''),
        note: String(day.note || '').slice(0, 80),
        activities: (Array.isArray(day.activities) ? day.activities : []).map((a) => ({
          id: a.id || uid(),
          time: String(a.time || '').slice(0, 5),
          place: String(a.place || '').slice(0, 80),
          note: String(a.note || '').slice(0, 120),
        })),
      })),
    },
    budget: {
      total: Math.max(0, Number(d.budget && d.budget.total) || 0),
      expenses: (d.budget && Array.isArray(d.budget.expenses) ? d.budget.expenses : []).map((e) => ({
        id: e.id || uid(),
        date: String(e.date || ''),
        category: BUDGET_CATEGORIES.includes(e.category) ? e.category : '其他',
        amount: Math.max(0, Math.round((Number(e.amount) || 0) * 100) / 100),
        note: String(e.note || '').slice(0, 80),
      })),
    },
    packing: (Array.isArray(d.packing) ? d.packing : []).map((p) => ({
      id: p.id || uid(),
      text: String(p.text || '').slice(0, 60),
      category: PACKING_CATEGORIES.includes(p.category) ? p.category : '其他',
      packed: !!p.packed,
    })),
  };
}

function isValidShape(d) {
  return !!(d && typeof d === 'object'
    && d.trip && Array.isArray(d.trip.days)
    && d.budget && Array.isArray(d.budget.expenses)
    && Array.isArray(d.packing));
}

function emptyData() {
  return normalizeData({ trip: { title: '新行程', days: [] }, budget: { total: 0, expenses: [] }, packing: [] });
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('保存失败：', err);
    toast('⚠️ 保存失败：浏览器本地存储不可用');
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isValidShape(parsed)) return normalizeData(parsed);
      console.warn('本地数据格式异常，已重新载入示例数据');
    }
  } catch (err) {
    console.warn('本地数据读取失败，将载入示例数据：', err);
  }
  return sampleData();
}

/* ---------- 示例数据：杭州 3 日游 ---------- */

function sampleData() {
  return normalizeData({
    version: 1,
    trip: {
      title: '杭州 3 日悠闲游',
      days: [
        {
          id: uid(), date: todayStr(), note: '抵达 · 西湖东线',
          activities: [
            { id: uid(), time: '09:30', place: '抵达杭州东站', note: '地铁 1 号线到定安路，先去酒店寄存行李' },
            { id: uid(), time: '10:30', place: '断桥残雪 · 白堤', note: '沿白堤慢慢走到孤山，拍照黄金机位' },
            { id: uid(), time: '12:00', place: '午餐 · 楼外楼（孤山店）', note: '西湖醋鱼、龙井虾仁，人均约 120' },
            { id: uid(), time: '14:00', place: '浙江省博物馆（孤山馆）', note: '免费参观，注意周一闭馆' },
            { id: uid(), time: '16:30', place: '湖滨步行街', note: '逛逛商场，顺手带点特产' },
            { id: uid(), time: '18:30', place: '晚餐 · 河坊街', note: '定胜糕、葱包桧，边逛边吃' },
          ],
        },
        {
          id: uid(), date: todayStr(1), note: '灵隐寺 · 龙井茶山',
          activities: [
            { id: uid(), time: '07:30', place: '酒店出发', note: '打车去灵隐，早点出门避开人流' },
            { id: uid(), time: '08:00', place: '飞来峰 · 灵隐寺', note: '先买飞来峰门票，香花券在寺门口另购' },
            { id: uid(), time: '12:00', place: '午餐 · 十方苑素面', note: '灵隐寺旁，一碗素面约 30 元' },
            { id: uid(), time: '14:00', place: '龙井村 · 茶园', note: '找户人家坐下喝茶，看看茶园' },
            { id: uid(), time: '16:30', place: '九溪十八涧', note: '轻徒步约 1.5 小时，穿舒适的鞋' },
          ],
        },
        {
          id: uid(), date: todayStr(2), note: '西溪湿地 · 返程',
          activities: [
            { id: uid(), time: '09:00', place: '西溪湿地国家公园', note: '建议坐摇橹船，提前在线购票' },
            { id: uid(), time: '12:00', place: '午餐 · 西溪天堂', note: '返程前好好吃一顿' },
            { id: uid(), time: '14:00', place: '回酒店取行李', note: '顺路买龙井茶酥当伴手礼' },
            { id: uid(), time: '16:30', place: '杭州东站返程', note: '提前 30 分钟进站，别赶啦' },
          ],
        },
      ],
    },
    budget: {
      total: 2600,
      expenses: [
        { id: uid(), date: todayStr(), category: '交通', amount: 480, note: '高铁往返票（2 人）' },
        { id: uid(), date: todayStr(), category: '住宿', amount: 720, note: '西湖边民宿两晚' },
        { id: uid(), date: todayStr(), category: '交通', amount: 35, note: '地铁 + 打车' },
        { id: uid(), date: todayStr(), category: '餐饮', amount: 160, note: '楼外楼午餐' },
        { id: uid(), date: todayStr(), category: '餐饮', amount: 55, note: '河坊街小吃' },
        { id: uid(), date: todayStr(1), category: '门票', amount: 75, note: '飞来峰 + 灵隐寺' },
        { id: uid(), date: todayStr(1), category: '餐饮', amount: 30, note: '灵隐素面' },
        { id: uid(), date: todayStr(1), category: '购物', amount: 260, note: '明前龙井两罐' },
        { id: uid(), date: todayStr(2), category: '门票', amount: 80, note: '西溪湿地 + 船票' },
      ],
    },
    packing: [
      { id: uid(), text: '身份证', category: '证件', packed: true },
      { id: uid(), text: '高铁票（电子票截图）', category: '证件', packed: true },
      { id: uid(), text: '手机充电器', category: '电子', packed: false },
      { id: uid(), text: '充电宝', category: '电子', packed: false },
      { id: uid(), text: '相机 + 存储卡', category: '电子', packed: false },
      { id: uid(), text: '换洗衣物 ×2', category: '衣物', packed: false },
      { id: uid(), text: '轻便外套', category: '衣物', packed: true },
      { id: uid(), text: '好走的运动鞋', category: '衣物', packed: true },
      { id: uid(), text: '牙刷牙膏旅行装', category: '洗漱', packed: false },
      { id: uid(), text: '防晒霜', category: '洗漱', packed: false },
      { id: uid(), text: '创可贴', category: '药品', packed: false },
      { id: uid(), text: '肠胃药', category: '药品', packed: false },
      { id: uid(), text: '雨伞（杭州多雨）', category: '其他', packed: true },
      { id: uid(), text: '保温水杯', category: '其他', packed: false },
    ],
  });
}

/* ---------- 渲染：行程 ---------- */

function renderTrip() {
  const daysEl = document.getElementById('days');
  const titleInput = document.getElementById('trip-title');
  if (titleInput !== document.activeElement) titleInput.value = state.trip.title;

  if (!state.trip.days.length) {
    daysEl.innerHTML = '<div class="empty card">还没有行程安排，点右上角「添加一天」开始规划吧。</div>';
    return;
  }

  const editing = findActivity(editingActivityId);

  daysEl.innerHTML = state.trip.days.map((day, i) => {
    const acts = [...day.activities]
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))
      .map((a) => `
        <li class="activity">
          <span class="a-time">${escapeHtml(a.time || '--:--')}</span>
          <div class="a-body">
            <span class="a-place">${escapeHtml(a.place)}</span>
            ${a.note ? `<span class="a-note">${escapeHtml(a.note)}</span>` : ''}
          </div>
          <div class="a-ops">
            <button class="icon-btn" type="button" data-action="edit-activity" data-id="${a.id}" title="编辑">✏️</button>
            <button class="icon-btn danger" type="button" data-action="del-activity" data-id="${a.id}" title="删除">🗑️</button>
          </div>
        </li>`).join('');

    const editingHere = editing && editing.day.id === day.id;
    const ea = editingHere ? editing.act : null;

    return `
      <article class="day-card card" data-day-id="${day.id}">
        <header class="day-head">
          <span class="day-index">D${i + 1}</span>
          <div class="day-meta">
            <input type="date" class="day-date" value="${escapeHtml(day.date)}"
                   data-change="day-date" data-id="${day.id}" aria-label="第 ${i + 1} 天日期" />
            <span class="day-weekday">${escapeHtml(weekday(day.date))}</span>
            <input type="text" class="day-note" placeholder="当天主题（可编辑）" maxlength="40"
                   value="${escapeHtml(day.note)}" data-change="day-note" data-id="${day.id}" aria-label="当天主题" />
          </div>
          <button class="icon-btn danger" type="button" data-action="del-day" data-id="${day.id}"
                  title="删除这一天">🗑️ 删除这天</button>
        </header>
        ${acts ? `<ul class="activity-list">${acts}</ul>` : '<p class="hint" style="padding:8px 0 0">这一天还没有安排，在下面添加第一项吧。</p>'}
        <form class="activity-form ${editingHere ? 'editing' : ''}" data-day-id="${day.id}" autocomplete="off">
          <input type="time" name="time" required aria-label="时间" value="${escapeHtml(ea ? ea.time : '')}" />
          <input type="text" name="place" placeholder="地点 / 事项" maxlength="60" required
                 value="${escapeHtml(ea ? ea.place : '')}" />
          <input type="text" name="note" placeholder="备注（可选）" maxlength="120"
                 value="${escapeHtml(ea ? ea.note : '')}" />
          <button class="btn primary" type="submit">${ea ? '💾 保存' : '➕ 添加'}</button>
          ${ea ? '<button class="btn ghost" type="button" data-action="cancel-edit-activity">取消</button>' : ''}
        </form>
      </article>`;
  }).join('');
}

/* ---------- 渲染：预算 ---------- */

function renderBudget() {
  const expenses = state.budget.expenses;
  const total = Number(state.budget.total) || 0;
  const spent = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const remain = total - spent;
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;

  document.getElementById('budget-stats').innerHTML = `
    <div class="stat card">
      <span class="stat-label">总预算</span>
      <div class="stat-value">
        <input type="number" min="0" step="1" value="${total || ''}" placeholder="设置预算"
               data-change="budget-total" aria-label="总预算（元）" />
      </div>
      <span class="stat-sub">直接输入即可修改</span>
    </div>
    <div class="stat card">
      <span class="stat-label">已花费</span>
      <span class="stat-value">${fmtMoney(spent)}</span>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <span class="stat-sub">${total > 0 ? `占预算 ${pct}%` : '先在左边设置总预算'}</span>
    </div>
    <div class="stat card ${remain < 0 ? 'neg' : ''}">
      <span class="stat-label">剩余</span>
      <span class="stat-value">${fmtMoney(remain)}</span>
      <span class="stat-sub">${total === 0 ? '—' : (remain < 0 ? '⚠️ 已超支 ' + fmtMoney(-remain) : '还在预算内，放心花')}</span>
    </div>`;

  const byCat = BUDGET_CATEGORIES
    .map((cat) => ({
      cat,
      sum: expenses.filter((x) => x.category === cat).reduce((s, x) => s + (Number(x.amount) || 0), 0),
    }))
    .filter((x) => x.sum > 0)
    .sort((a, b) => b.sum - a.sum);

  document.getElementById('budget-breakdown').innerHTML = `
    <h3>分类汇总</h3>
    ${byCat.length ? byCat.map(({ cat, sum }) => {
      const share = spent > 0 ? Math.round((sum / spent) * 100) : 0;
      return `
        <div class="cat-row">
          <span class="cat-badge cat-${BUDGET_CATEGORIES.indexOf(cat)}">${escapeHtml(cat)}</span>
          <div class="bar"><i style="width:${share}%"></i></div>
          <span class="cat-amount">${fmtMoney(sum)}</span>
          <span class="cat-share">${share}%</span>
        </div>`;
    }).join('') : '<p class="hint">还没有支出记录，记第一笔后这里会自动汇总。</p>'}`;

  document.getElementById('expense-list').innerHTML = `
    <h3>支出明细${expenses.length ? `（${expenses.length} 笔）` : ''}</h3>
    ${expenses.length ? `<ul class="expense-list">${[...expenses].reverse().map((x) => `
      <li class="expense">
        <span class="e-date">${escapeHtml(fmtDate(x.date))}</span>
        <span class="cat-badge cat-${BUDGET_CATEGORIES.indexOf(x.category)}">${escapeHtml(x.category)}</span>
        <span class="e-note">${escapeHtml(x.note || '—')}</span>
        <span class="e-amount">${fmtMoney(x.amount)}</span>
        <button class="icon-btn" type="button" data-action="edit-expense" data-id="${x.id}" title="编辑">✏️</button>
        <button class="icon-btn danger" type="button" data-action="del-expense" data-id="${x.id}" title="删除">🗑️</button>
      </li>`).join('')}</ul>`
      : '<p class="hint">暂无支出，用上方表单记第一笔吧。</p>'}`;

  // 表单：编辑态回填 / 新增态重置
  const form = document.getElementById('expense-form');
  const editing = expenses.find((x) => x.id === editingExpenseId);
  if (editing) {
    form.elements['exp-date'].value = editing.date;
    form.elements['exp-category'].value = editing.category;
    form.elements['exp-amount'].value = editing.amount;
    form.elements['exp-note'].value = editing.note;
    form.classList.add('editing');
    form.querySelector('button[type="submit"]').textContent = '💾 保存修改';
  } else {
    form.classList.remove('editing');
    form.querySelector('button[type="submit"]').textContent = '记一笔';
    form.reset();
    form.elements['exp-date'].value = (state.trip.days[0] && state.trip.days[0].date) || todayStr();
  }
}

/* ---------- 渲染：打包清单 ---------- */

function renderPacking() {
  const items = state.packing;
  const packed = items.filter((x) => x.packed).length;
  const pct = items.length ? Math.round((packed / items.length) * 100) : 0;

  document.getElementById('packing-progress').innerHTML = `
    <div class="progress-head">
      <h3>打包进度</h3>
      <span>${packed} / ${items.length} 已打包 · ${pct}%</span>
    </div>
    <div class="bar big"><i style="width:${pct}%"></i></div>`;

  const groups = PACKING_CATEGORIES
    .map((cat) => ({ cat, list: items.filter((x) => x.category === cat) }))
    .filter((g) => g.list.length);

  document.getElementById('packing-list').innerHTML = groups.length
    ? groups.map(({ cat, list }) => `
        <div class="pack-group card">
          <h4>${escapeHtml(cat)}<span class="count">${list.filter((x) => x.packed).length}/${list.length}</span></h4>
          <ul>${list.map((x) => `
            <li class="pack-item ${x.packed ? 'done' : ''}">
              <label>
                <input type="checkbox" data-change="toggle-pack" data-id="${x.id}" ${x.packed ? 'checked' : ''} />
                <span>${escapeHtml(x.text)}</span>
              </label>
              <div class="a-ops">
                <button class="icon-btn" type="button" data-action="edit-packing" data-id="${x.id}" title="编辑">✏️</button>
                <button class="icon-btn danger" type="button" data-action="del-packing" data-id="${x.id}" title="删除">🗑️</button>
              </div>
            </li>`).join('')}</ul>
        </div>`).join('')
    : '<div class="empty card">清单还是空的，添加第一件要带的东西吧。</div>';

  // 表单：编辑态回填 / 新增态重置
  const form = document.getElementById('packing-form');
  const editing = items.find((x) => x.id === editingPackingId);
  if (editing) {
    form.elements['pack-text'].value = editing.text;
    form.elements['pack-category'].value = editing.category;
    form.classList.add('editing');
    form.querySelector('button[type="submit"]').textContent = '💾 保存修改';
  } else {
    form.classList.remove('editing');
    form.querySelector('button[type="submit"]').textContent = '➕ 添加';
    form.reset();
  }
}

/* ---------- 渲染：数据管理 / 顶部统计 ---------- */

function renderData() {
  const dayCount = state.trip.days.length;
  const actCount = state.trip.days.reduce((s, d) => s + d.activities.length, 0);
  const expCount = state.budget.expenses.length;
  const packCount = state.packing.length;

  document.getElementById('header-stats').innerHTML = [
    `${dayCount} 天行程`,
    `${actCount} 项活动`,
    `${expCount} 笔支出`,
    `${packCount} 件行李`,
  ].map((t) => `<span class="chip">${t}</span>`).join('');

  const bytes = new Blob([JSON.stringify(state)]).size;
  document.getElementById('data-summary').innerHTML = `
    <h3>当前数据概况</h3>
    <p>行程：<strong>${escapeHtml(state.trip.title)}</strong> · <strong>${dayCount}</strong> 天 · <strong>${actCount}</strong> 项活动</p>
    <p>预算：总预算 <strong>${fmtMoney(state.budget.total)}</strong> · <strong>${expCount}</strong> 笔支出</p>
    <p>打包清单：<strong>${packCount}</strong> 件物品（已打包 <strong>${state.packing.filter((x) => x.packed).length}</strong> 件）</p>
    <p class="hint">存储键名 <code>${STORAGE_KEY}</code>，本地占用约 ${(bytes / 1024).toFixed(1)} KB。</p>`;
}

function renderAll() {
  renderTrip();
  renderBudget();
  renderPacking();
  renderData();
}

/* ---------- 操作：行程 ---------- */

function addDay() {
  const last = state.trip.days[state.trip.days.length - 1];
  const date = last && last.date ? addDaysStr(last.date, 1) : todayStr();
  state.trip.days.push({ id: uid(), date, note: '', activities: [] });
  save();
  renderTrip();
  renderData();
  toast('已添加新的一天 ✓');
  const cards = document.querySelectorAll('.day-card');
  const lastCard = cards[cards.length - 1];
  if (lastCard) lastCard.querySelector('.day-note').focus();
}

function deleteDay(id) {
  const i = state.trip.days.findIndex((d) => d.id === id);
  if (i < 0) return;
  const day = state.trip.days[i];
  const extra = day.activities.length ? `该天的 ${day.activities.length} 项活动也会一并删除。` : '';
  if (!confirm(`确定删除第 ${i + 1} 天（${day.date || '未设日期'}）吗？${extra}`)) return;
  if (findActivity(editingActivityId) && findActivity(editingActivityId).day.id === id) editingActivityId = null;
  state.trip.days.splice(i, 1);
  save();
  renderTrip();
  renderData();
  toast('已删除该天');
}

/* ---------- 操作：导入导出 ---------- */

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planbook-${todayStr().replace(/-/g, '')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出 JSON 备份 ⬇️');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!isValidShape(parsed)) throw new Error('文件格式不符：需要包含 trip.days / budget.expenses / packing');
      if (!confirm('导入将覆盖当前全部数据，确定继续吗？')) return;
      state = normalizeData(parsed);
      editingActivityId = editingExpenseId = editingPackingId = null;
      save();
      renderAll();
      toast('导入成功 ✓');
    } catch (err) {
      alert('导入失败：' + err.message);
    }
  };
  reader.onerror = () => alert('导入失败：文件读取错误');
  reader.readAsText(file, 'utf-8');
}

/* ---------- 事件绑定 ---------- */

function bindEvents() {
  // 选项卡切换
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + activeTab));
  });

  // 添加一天
  document.getElementById('add-day').addEventListener('click', addDay);

  // 点击操作（编辑 / 删除 / 取消编辑）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'del-day') { deleteDay(id); return; }

    if (action === 'edit-activity') {
      editingActivityId = id;
      renderTrip();
      const found = findActivity(id);
      const form = document.querySelector(`.activity-form[data-day-id="${found.day.id}"]`);
      if (form) form.elements['place'].focus();
      return;
    }
    if (action === 'cancel-edit-activity') { editingActivityId = null; renderTrip(); return; }
    if (action === 'del-activity') {
      const found = findActivity(id);
      if (!found) return;
      found.day.activities = found.day.activities.filter((a) => a.id !== id);
      if (editingActivityId === id) editingActivityId = null;
      save(); renderTrip(); renderData();
      toast('已删除活动');
      return;
    }

    if (action === 'edit-expense') { editingExpenseId = id; renderBudget(); return; }
    if (action === 'cancel-edit-expense') { editingExpenseId = null; renderBudget(); return; }
    if (action === 'del-expense') {
      state.budget.expenses = state.budget.expenses.filter((x) => x.id !== id);
      if (editingExpenseId === id) editingExpenseId = null;
      save(); renderBudget(); renderData();
      toast('已删除支出');
      return;
    }

    if (action === 'edit-packing') { editingPackingId = id; renderPacking(); return; }
    if (action === 'cancel-edit-packing') { editingPackingId = null; renderPacking(); return; }
    if (action === 'del-packing') {
      state.packing = state.packing.filter((x) => x.id !== id);
      if (editingPackingId === id) editingPackingId = null;
      save(); renderPacking(); renderData();
      toast('已删除物品');
      return;
    }
  });

  // 输入变化（日期 / 主题 / 预算 / 勾选）
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const kind = el.dataset.change;
    const id = el.dataset.id;

    if (kind === 'trip-title') {
      state.trip.title = el.value.trim() || '未命名行程';
      save(); renderData();
    } else if (kind === 'day-date') {
      const day = findDay(id);
      if (day) { day.date = el.value; save(); renderTrip(); }
    } else if (kind === 'day-note') {
      const day = findDay(id);
      if (day) { day.note = el.value.trim(); save(); }
    } else if (kind === 'budget-total') {
      state.budget.total = Math.max(0, Number(el.value) || 0);
      save(); renderBudget(); renderData();
    } else if (kind === 'toggle-pack') {
      const item = state.packing.find((x) => x.id === id);
      if (item) { item.packed = el.checked; save(); renderPacking(); renderData(); }
    }
  });

  // 表单提交
  document.addEventListener('submit', (e) => {
    const form = e.target;

    if (form.classList.contains('activity-form')) {
      e.preventDefault();
      const day = findDay(form.dataset.dayId);
      if (!day) return;
      const values = {
        time: form.elements['time'].value,
        place: form.elements['place'].value.trim(),
        note: form.elements['note'].value.trim(),
      };
      if (!values.place) { toast('请填写地点或事项'); return; }
      if (editingActivityId) {
        const found = findActivity(editingActivityId);
        if (found) Object.assign(found.act, values);
        editingActivityId = null;
        toast('活动已更新 ✓');
      } else {
        day.activities.push({ id: uid(), ...values });
        toast('已添加活动 ✓');
      }
      save(); renderTrip(); renderData();
      return;
    }

    if (form.id === 'expense-form') {
      e.preventDefault();
      const values = {
        date: form.elements['exp-date'].value || todayStr(),
        category: form.elements['exp-category'].value,
        amount: Math.round((Number(form.elements['exp-amount'].value) || 0) * 100) / 100,
        note: form.elements['exp-note'].value.trim(),
      };
      if (!values.amount || values.amount <= 0) { toast('请填写有效金额'); return; }
      if (editingExpenseId) {
        const item = state.budget.expenses.find((x) => x.id === editingExpenseId);
        if (item) Object.assign(item, values);
        editingExpenseId = null;
        toast('支出已更新 ✓');
      } else {
        state.budget.expenses.push({ id: uid(), ...values });
        toast('已记一笔 ✓');
      }
      save(); renderBudget(); renderData();
      return;
    }

    if (form.id === 'packing-form') {
      e.preventDefault();
      const text = form.elements['pack-text'].value.trim();
      const category = form.elements['pack-category'].value;
      if (!text) { toast('请填写物品名称'); return; }
      if (editingPackingId) {
        const item = state.packing.find((x) => x.id === editingPackingId);
        if (item) { item.text = text; item.category = category; }
        editingPackingId = null;
        toast('物品已更新 ✓');
      } else {
        state.packing.push({ id: uid(), text, category, packed: false });
        toast('已添加物品 ✓');
      }
      save(); renderPacking(); renderData();
    }
  });

  // 数据管理
  document.getElementById('btn-export').addEventListener('click', exportJSON);

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importJSON(file);
    e.target.value = '';
  });

  document.getElementById('btn-sample').addEventListener('click', () => {
    if (!confirm('恢复示例数据会覆盖当前全部数据，确定继续吗？')) return;
    state = sampleData();
    editingActivityId = editingExpenseId = editingPackingId = null;
    save(); renderAll();
    toast('已载入示例行程（杭州 3 日游）🧪');
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('确定清空所有数据吗？此操作不可撤销，建议先导出备份。')) return;
    state = emptyData();
    editingActivityId = editingExpenseId = editingPackingId = null;
    save(); renderAll();
    toast('已清空，从新行程开始吧');
  });
}

/* ---------- 启动 ---------- */

function init() {
  // 填充下拉选项
  const fillSelect = (sel, options) => {
    sel.innerHTML = options.map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
  };
  fillSelect(document.querySelector('#expense-form [name="exp-category"]'), BUDGET_CATEGORIES);
  fillSelect(document.querySelector('#packing-form [name="pack-category"]'), PACKING_CATEGORIES);

  state = load();
  save(); // 首次打开时把示例数据落盘，刷新后仍可看到

  bindEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
