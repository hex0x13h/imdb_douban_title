// ==UserScript==
// @name         Douban Full Title on IMDb (Readable)
// @namespace    https://your.namespace.example/
// @version      1.1.0
// @description  Show the full Douban title next to the IMDb title, with higher-contrast styling
// @description:zh-CN 在 IMDb 标题旁显示豆瓣完整标题
// @author       you
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
    }
    .douban-full-title a {
      color: #ffd166 !important;        /* 高对比金色；可改如 #ff9800 / #00e5ff */
      text-decoration: none;
      text-shadow: 0 1px 2px rgba(0,0,0,.45); /* 暗底增强可读性 */
    }
    .douban-full-title a:hover {
      text-decoration: underline;
      filter: brightness(1.1);
    }
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

  // ---------- UI insertion ----------
  function ensureStyle() {
    if (!document.getElementById('douban-full-title-style')) {
      const s = document.createElement('style');
      s.id = 'douban-full-title-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
  }

  function insertNextToIMDbTitle(text, url) {
    if (!text || !url) return;
    const h1 = document.querySelector('h1[data-testid="hero-title-block__title"]') || document.querySelector('h1');
    if (!h1) return;
    if (document.querySelector('.douban-full-title')) return; // 防重复

    ensureStyle();

    const wrap = document.createElement('span');
    wrap.className = 'douban-full-title';

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `（${text}）`;

    wrap.appendChild(a);
    h1.after(wrap);
  }

  // ---------- Main ----------
  async function run() {
    const m = location.href.match(/tt\d+/);
    if (!m) return;
    const imdbId = m[0];

    try {
      const subjectUrl = await doubanByIMDbId(imdbId);
      const info = await fetchDoubanFullTitle(subjectUrl);
      if (info) insertNextToIMDbTitle(info.full, info.url);
    } catch (e) {
      console.error('Douban title fetch error:', e);
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
    if (document.querySelector('h1[data-testid="hero-title-block__title"]') && !document.querySelector('.douban-full-title')) {
      run();
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // 首次进入
  run();
})();