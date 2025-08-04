// ==UserScript==
// @name         Douban Full Title on IMDb
// @namespace    https://your.namespace.example/
// @version      1.2.0
// @description  Show the Douban full title next to IMDb title; with loading spinner; no parentheses.
// @description:zh-CN 在 IMDb 标题旁显示豆瓣完整标题
// @author       hex0x13h
// @match        *://www.imdb.com/title/tt*
// @grant        GM.xmlHttpRequest
// @connect      api.douban.com
// @connect      movie.douban.com
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 可调样式 ----------
  const STYLE = `
    .douban-full-title {
      margin-left: 10px;
      font-size: 1.1em;                 /* 可改为 1.2em/1.0em */
      font-weight: 600;                 /* 半粗体，提高辨识度 */
      line-height: 1;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .douban-full-title a {
      color: #ffd166 !important;        /* 高对比金色；可改如 #ff9800 / #00e5ff */
      text-decoration: none;
      text-shadow: 0 1px 2px rgba(0,0,0,.45);
    }
    .douban-full-title a:hover {
      text-decoration: underline;
      filter: brightness(1.1);
    }
    .douban-title-spinner {
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,.35);
      border-top-color: #ffd166;
      border-radius: 50%;
      display: inline-block;
      animation: douban-spin 0.9s linear infinite;
    }
    .douban-title-loading-text {
      font-size: .95em;
      color: #bbb;
    }
    @keyframes douban-spin { to { transform: rotate(360deg); } }
  `;

  // ---------- GM fetch helpers ----------
  function gmRequest(url, headers, data) {
    return new Promise(resolve => GM.xmlHttpRequest({
      method: data ? 'POST' : 'GET',
      url,
      headers,
      data,
      onload: (res) => {
        if (res.status >= 200 && res.status < 400) resolve(res.responseText);
        else { console.error('GM request fail:', url, res.status, res.statusText); resolve(); }
      },
      onerror: (err) => { console.error('GM request error:', url, err.statusText); resolve(); }
    }));
  }
  async function gmJSON(url, headers, data) {
    const t = await gmRequest(url, headers, data);
    if (!t) return;
    try { return JSON.parse(t); } catch { /* ignore */ }
  }

  // ---------- Douban lookups ----------
  async function doubanByIMDbId(imdbId) {
    const data = await gmJSON(
      `https://api.douban.com/v2/movie/imdb/${imdbId}`,
      { "Content-Type": "application/x-www-form-urlencoded; charset=utf8" },
      "apikey=0ab215a8b1977939201640fa14c66bab"
    );
    if (data && data.alt) {
      return data.alt.replace('/movie/', '/subject/') + '/';
    }
    const s = await gmJSON(`https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(imdbId)}`);
    if (s && s.length > 0 && s[0].id) {
      return `https://movie.douban.com/subject/${s[0].id}/`;
    }
  }

  async function fetchDoubanFullTitle(subjectUrl) {
    if (!subjectUrl) return;
    const html = await gmRequest(subjectUrl);
    if (!html) return;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const main = doc.querySelector('h1 span[property="v:itemreviewed"]');
    const year = doc.querySelector('h1 span.year');
    const title = main ? main.textContent.trim() : '';
    const y = year ? year.textContent.trim() : '';
    const full = (title + ' ' + (y || '')).trim();
    return { full, url: subjectUrl };
  }

  // ---------- UI helpers ----------
  function ensureStyle() {
    if (!document.getElementById('douban-full-title-style')) {
      const s = document.createElement('style');
      s.id = 'douban-full-title-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
  }

  function getTitleH1() {
    return document.querySelector('h1[data-testid="hero-title-block__title"]') || document.querySelector('h1');
  }

  function insertLoadingBadge() {
    const h1 = getTitleH1();
    if (!h1) return null;
    if (document.querySelector('.douban-full-title')) return null; // 已存在

    ensureStyle();

    const wrap = document.createElement('span');
    wrap.className = 'douban-full-title';

    const spinner = document.createElement('i');
    spinner.className = 'douban-title-spinner';

    const text = document.createElement('span');
    text.className = 'douban-title-loading-text';
    text.textContent = '加载中…';

    wrap.appendChild(spinner);
    wrap.appendChild(text);

    h1.after(wrap);
    return wrap;
  }

  function replaceWithTitle(wrap, text, url) {
    if (!wrap) return;
    wrap.innerHTML = ''; // 清空加载内容

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text; // 直接显示名字，不加括号

    wrap.appendChild(link);
  }

  function showError(wrap, msg = '未找到豆瓣标题') {
    if (!wrap) return;
    wrap.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'douban-title-loading-text';
    span.textContent = msg;
    wrap.appendChild(span);
  }

  // ---------- Main ----------
  async function run() {
    const m = location.href.match(/tt\d+/);
    if (!m) return;

    // 先放加载动画
    const badge = insertLoadingBadge();
    if (!badge) return; // 可能标题未就绪或已存在

    try {
      const imdbId = m[0];
      const subjectUrl = await doubanByIMDbId(imdbId);
      const info = await fetchDoubanFullTitle(subjectUrl);
      if (info && info.full && info.url) {
        replaceWithTitle(badge, info.full, info.url);
      } else {
        showError(badge);
      }
    } catch (e) {
      console.error('Douban title fetch error:', e);
      showError(badge, '加载失败');
    }
  }

  // IMDb SPA：路由变化时重跑
  let last = location.pathname;
  setInterval(() => {
    if (location.pathname !== last) {
      last = location.pathname;
      document.querySelectorAll('.douban-full-title').forEach(n => n.remove());
      run();
    }
  }, 800);

  // DOM 渲染后尝试插入
  const obs = new MutationObserver(() => {
    const h1 = getTitleH1();
    if (h1 && !document.querySelector('.douban-full-title')) {
      run();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // 首次进入
  run();
})();
