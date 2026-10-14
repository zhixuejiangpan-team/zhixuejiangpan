/* ============================================================
   智行江畔 V6.6 —— 交互逻辑
   模块：路由 | 敏感解密 | 搜索 | 力导向图谱 | 地图 | 问卷 | 指南 | 我的
   路由为内存态变量，不使用 URL hash（避免与高德锚点机制冲突）
   ============================================================ */
(function () {
  'use strict';

  /* V7.1 无障碍：prefers-reduced-motion 全局判定（CSS 同步关闭动效） */
  var RM = false;
  try { RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  /* V7.1 主题变量读取（图谱/缩略图等主 IIFE 内的视觉着色使用） */
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  /* 全局错误探针：仅显示同域脚本错误（过滤 CDN 跨域 Script error 噪音） */
  window.addEventListener('error', function (e) {
    if (!e.filename) return;   /* 无文件名的跨域错误不上屏 */
    var b = document.getElementById('resultList');
    if (b && !b.innerHTML) b.innerHTML = '<p class="empty-tip" style="color:#E05260">JS错误：' + esc(String(e.message)) + '（行' + e.lineno + '）</p>';
  });

  /* ================= 工具与存储 ================= */
  var LS = {
    votes: 'zxsj66_votes', voted: 'zxsj66_voted',
    counts: 'zxsj66_counts', hist: 'zxsj66_hist', survey: 'zxsj66_survey'
  };
  function load(k, def) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var voteMap = load(LS.votes, {});
  var votedSet = load(LS.voted, []);
  var countMap = load(LS.counts, {});
  function getVotes(id) { return voteMap[id] || 0; }
  function getCount(qid) { return countMap[qid] || 0; }
  function findSpot(id) {
    for (var i = 0; i < spots.length; i++) if (spots[i].id === id) return spots[i];
    for (var j = 0; j < surroundingSpots.length; j++) if (surroundingSpots[j].id === id) return surroundingSpots[j];
    return null;
  }
  /* 投票：写 localStorage 并广播 votesUpdated，搜索视图监听联动 */
  function castVote(id) {
    if (votedSet.indexOf(id) !== -1) return false;
    votedSet.push(id);
    voteMap[id] = getVotes(id) + 1;
    save(LS.votes, voteMap); save(LS.voted, votedSet);
    document.dispatchEvent(new Event('votesUpdated'));
    return true;
  }
  /* Base64(UTF-8) 解密 */
  function decryptB64(s) {
    try {
      var b = atob(s), bytes = new Uint8Array(b.length);
      for (var i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) { return '（答案解析失败）'; }
  }
  function hitSensitiveKey(q) {
    q = q || '';
    for (var i = 0; i < SENSITIVE_KEY.length; i++) if (q.indexOf(SENSITIVE_KEY[i]) !== -1) return true;
    return false;
  }
  function displayAnswer(item, query) {
    if (!item.isSensitive) return item.answer;
    return hitSensitiveKey(query) ? decryptB64(item.answer) : '';
  }

  var TYPE_COLOR = { '食堂': '#D89B4A', '商店': '#6B8BC7', '医疗': '#5FA87A', '教学楼': '#8B7BC7', '宿舍': '#A08A6A', '体育': '#4FA8B5', '行政': '#C75D6E', '饭店': '#D89B4A', '学院': '#6B8BC7', '场馆': '#4FA8B5', '其他': '#6A6F78' };

  /* ================= 一、内存态路由 ================= */
  var currentView = 'search';
  var VIEW_IDS = { search: 'view-search', map: 'view-map', guide: 'view-guide', mine: 'view-mine' };
  function switchView(name) {
    currentView = name;
    Object.keys(VIEW_IDS).forEach(function (k) {
      document.getElementById(VIEW_IDS[k]).classList.toggle('active', k === name);
    });
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === name);
    });
    window.scrollTo(0, 0);
    if (name === 'map') MapModule.enter();
    if (name === 'search') GraphModule.ensure();
  }
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); if (window.switchView) window.switchView(a.getAttribute('data-nav')); else switchView(a.getAttribute('data-nav')); });
  });

  /* ================= 二、搜索视图 ================= */
  var searchInput = document.getElementById('searchInput');
  var suggestBox = document.getElementById('suggestBox');
  var resultBox = document.getElementById('resultList');
  var hotBox = document.getElementById('hotList');
  var histBox = document.getElementById('historyChips');

  function matchQuestions(q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    return hotQuestions.filter(function (item) {
      var text = (item.question + ' ' + item.category + ' ' + item.tags.join(' ')).toLowerCase();
      return q.split(/\s+/).every(function (w) { return text.indexOf(w) !== -1; });
    });
  }

  /* 实时下拉建议（V6.7：分组+去重逻辑在 __renderSuggest / __suggestClick 中实现） */
  searchInput.addEventListener('input', function () {
    if (window.__renderSuggest) window.__renderSuggest();
  });
  suggestBox.addEventListener('click', function (e) {
    if (window.__suggestClick) window.__suggestClick(e);
  });
  function questionOf(qid) {
    var it = hotQuestions.find(function (x) { return x.id === qid; });
    return it ? it.question : '';
  }
  document.getElementById('searchBtn').addEventListener('click', function () { runSearch(searchInput.value); });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { suggestBox.hidden = true; runSearch(searchInput.value); }
  });

  function runSearch(q) {
    q = (q || '').trim();
    if (!q) return;
    pushHist(q);
    var list = matchQuestions(q);
    renderResults(list, q);
    /* V6.7：插入"相关办事流程/医保政策"卡片（AI 卡片之下、结果列表之上） */
    if (window.__renderRelatedCards) window.__renderRelatedCards(q);
  }

  function renderResults(list, q) {
    if (!list.length) {
      resultBox.innerHTML = '<p class="empty-tip">没有匹配的问题，换个关键词试试，比如"医保""学生证""食堂"。</p>';
      return;
    }
    resultBox.innerHTML = list.map(function (item) {
      var masked = item.isSensitive && !displayAnswer(item, q);
      var summary = masked ? '该问题涉及隐私，请输入关键词（如"心理""压力"）查看'
        : esc(displayAnswer(item, q)).slice(0, 80) + (displayAnswer(item, q).length > 80 ? '…' : '');
      var crossTag = item.campusScope === 'cross'
        ? '<span class="cross-tag" title="涉及跨校区办事，请注意预留通勤时间">🔀 跨校区</span>' : '';
      return '<div class="result-item card" data-qid="' + item.id + '">' +
        '<h4>' + crossTag + esc(item.question) + '</h4>' +
        '<p class="result-summary">' + summary + '</p>' +
        '<div class="result-foot"><span class="cat-badge">' + esc(item.category) + '</span>' +
        '<span class="result-count">🔥 ' + getCount(item.id) + '</span></div>' +
        '<div class="result-detail" hidden></div></div>';
    }).join('');
  }
  /* 点击结果：展开完整答案 + 相关点位；searchCount+1 */
  resultBox.addEventListener('click', function (e) {
    var card = e.target.closest('.result-item');
    if (!card) return;
    var qid = card.getAttribute('data-qid');
    var detail = card.querySelector('.result-detail');
    var wfb = e.target.closest('[data-wfgoto]');
    if (wfb) { if (window.__gotoWorkflow) window.__gotoWorkflow(wfb.getAttribute('data-wfgoto')); return; }
    var btn = e.target.closest('[data-loc]');
    if (btn) { MapModule.locate(btn.getAttribute('data-loc')); return; }
    if (!detail.hidden) { detail.hidden = true; return; }
    var item = hotQuestions.find(function (x) { return x.id === qid; });
    var q = searchInput.value;
    countMap[qid] = getCount(qid) + 1; save(LS.counts, countMap);
    var full = item.isSensitive && !hitSensitiveKey(q)
      ? '该问题涉及隐私，请输入关键词（如"心理""压力""失眠"）后重新搜索查看完整答案。'
      : esc(displayAnswer(item, q));
    var spotsHtml = item.relatedSpotIds.map(function (sid) {
      var sp = findSpot(sid);
      return sp ? '<button class="spot-jump chip" data-loc="' + sid + '">📍 ' + esc(sp.name) + '</button>' : '';
    }).join('');
    detail.innerHTML = '<p class="detail-answer">' + full + '</p>' +
      (spotsHtml ? '<div class="detail-spots">相关点位：' + spotsHtml + '</div>' : '') +
      (window.__wfLinkButton ? window.__wfLinkButton(qid) : '');
    detail.hidden = false;
    card.querySelector('.result-count').textContent = '🔥 ' + getCount(qid);
    renderHot(); GraphModule.refreshSizes();
  });

  /* 搜索历史 */
  function getHist() { return load(LS.hist, []); }
  function pushHist(q) {
    /* V6.9 彩蛋拦截：输入"蛟湖"不写入历史，直接触发彩蛋 */
    if (q.trim() === '蛟湖') {
      searchInput.value = '';
      document.getElementById('suggestBox').hidden = true;
      if (window.EasterModule) window.EasterModule.open('search');
      return;
    }
    var h = getHist().filter(function (x) { return x !== q; });
    h.unshift(q); h = h.slice(0, 10);
    save(LS.hist, h); renderHist();
  }
  function renderHist() {
    var h = getHist();
    histBox.innerHTML = h.length
      ? h.map(function (x) { return '<button class="chip hist-chip">' + esc(x) + '</button>'; }).join('') +
        '<button class="chip hist-clear" id="histClear">清空</button>'
      : '<span class="empty-tip">暂无搜索历史</span>';
    histBox.querySelectorAll('.hist-chip').forEach(function (c) {
      c.addEventListener('click', function () { searchInput.value = c.textContent; runSearch(c.textContent); });
    });
    var clr = document.getElementById('histClear');
    if (clr) clr.addEventListener('click', function () { save(LS.hist, []); renderHist(); renderMineHist(); });
  }

  /* 热点 Top10（按 searchCount） */
  function renderHot() {
    var top = hotQuestions.slice().sort(function (a, b) { return getCount(b.id) - getCount(a.id); }).slice(0, 10);
    hotBox.innerHTML = top.map(function (item, i) {
      return '<div class="hot-item" data-qid="' + item.id + '">' +
        '<span class="hot-rank r' + (i < 3 ? i + 1 : 0) + '">' + (i + 1) + '</span>' +
        (item.campusScope === 'cross' ? '<span class="cross-tag" title="涉及跨校区办事">🔀</span>' : '') +
        '<span class="hot-q">' + esc(item.question) + '</span>' +
        '<span class="hot-c">🔥' + getCount(item.id) + '</span></div>';
    }).join('');
  }
  hotBox.addEventListener('click', function (e) {
    var it = e.target.closest('.hot-item');
    if (!it) return;
    searchInput.value = questionOf(it.getAttribute('data-qid'));
    runSearch(searchInput.value);
  });

  /* votesUpdated：热点与图谱联动刷新 */
  document.addEventListener('votesUpdated', function () { renderHot(); renderMineVotes(); });

  /* ================= 三、问卷面板（V6.9：真实数据 N=29，实现移至 window.__initSurvey） ================= */
  if (window.__initSurvey) window.__initSurvey();

  /* ================= 四、力导向问题图谱（D3 v7） ================= */
  var GraphModule = (function () {
    var inited = false, degraded = false, svg, simulation, nodeSel, linkSel, zoomBehav;
    var W = 560, H = 460;

    function selectNodes() {
      var isMobile = window.matchMedia('(max-width: 768px)').matches;
      if (!isMobile) return hotQuestions.slice();
      var cross = hotQuestions.filter(function (q) { return q.campusScope === 'cross'; });
      var rest = hotQuestions.filter(function (q) { return q.campusScope !== 'cross'; })
        .sort(function (a, b) { return getCount(b.id) - getCount(a.id); });
      if (cross.length >= 30) {
        return cross.sort(function (a, b) { return getCount(b.id) - getCount(a.id); }).slice(0, 30);
      }
      return cross.concat(rest.slice(0, 30 - cross.length));
    }
    function buildLinks(nodes) {
      var links = [];
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var shared = nodes[i].item.relatedSpotIds.some(function (id) { return nodes[j].item.relatedSpotIds.indexOf(id) !== -1; });
          if (shared) links.push({ source: nodes[i].id, target: nodes[j].id });
        }
      }
      return links;
    }
    function radius(item) { return Math.min(26, 8 + Math.sqrt(getCount(item.id)) * 2.2); }
    function opacityOf(item) {
      if (item.campusScope === 'cross') return 1;
      var c = getCount(item.id);
      return c === 0 ? 0.45 : Math.min(1, 0.55 + c / 40);
    }
    function truncate(s) { return s.length > 9 ? s.slice(0, 9) + '…' : s; }

    function renderGraph() {
      var wrap = document.getElementById('graphWrap');
      wrap.innerHTML = '<svg id="graphSvg" width="100%" height="' + H + '"></svg><svg id="miniMap" width="150" height="120"></svg><div id="graphCard" hidden></div>';
      var nodes = selectNodes().map(function (q) { return { id: q.id, item: q }; });
      var links = buildLinks(nodes);
      svg = d3.select('#graphSvg');
      var gRoot = svg.append('g');
      zoomBehav = d3.zoom().scaleExtent([0.5, 3]).on('zoom', function (ev) {
        gRoot.attr('transform', ev.transform);
        updateMini(nodes, ev.transform);
      });
      svg.call(zoomBehav);

      linkSel = gRoot.append('g').selectAll('line').data(links).enter().append('line')
        .attr('stroke', '#D8D2C6').attr('stroke-width', 1);

      var nodeG = gRoot.append('g').selectAll('g').data(nodes).enter().append('g')
        .style('cursor', 'pointer')
        .on('click', function (ev, d) { showCard(d.item, ev); });

      nodeSel = nodeG.append('circle')
        .attr('r', function (d) { return radius(d.item); })
        .attr('fill', function (d) { return d.item.isSensitive ? '#86868B' : (cssVar('--accent') || '#0A84FF'); })
        .attr('stroke', function (d) { return d.item.campusScope === 'cross' ? '#C9A227' : cssVar('--bg-primary'); })
        .attr('stroke-width', function (d) { return d.item.campusScope === 'cross' ? 3 : 1.5; })
        .attr('opacity', function (d) { return opacityOf(d.item); });

      nodeG.append('text').text(function (d) { return truncate(d.item.question); })
        .attr('font-size', 10).attr('fill', cssVar('--text-primary') || '#1D1D1F')
        .attr('dy', function (d) { return radius(d.item) + 12; })
        .attr('text-anchor', 'middle');

      simulation = d3.forceSimulation(nodes)
        .force('charge', d3.forceManyBody().strength(-160))
        .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(90))
        .force('collide', d3.forceCollide(function (d) { return radius(d.item) + 14; }))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .on('tick', function () {
          linkSel.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; })
            .attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
          nodeG.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
        });

      /* 帧率检测：<30fps 降级为纯列表 */
      var frames = 0, t0 = performance.now();
      function fpsProbe() {
        frames++;
        if (frames < 90) requestAnimationFrame(fpsProbe);
        else {
          var fps = frames / ((performance.now() - t0) / 1000);
          if (fps < 30 && !degraded) { degraded = true; renderList(); }
        }
      }
      requestAnimationFrame(fpsProbe);
      initMini(nodes);
    }
    /* 降级列表（保留点击交互） */
    function renderList() {
      var wrap = document.getElementById('graphWrap');
      var nodes = selectNodes();
      wrap.innerHTML = '<div class="graph-list"><p class="graph-note">检测到设备帧率较低，已切换为列表模式（点击条目查看详情）：</p>' +
        nodes.map(function (q) {
          return '<div class="graph-list-item" data-qid="' + q.id + '">' +
            (q.campusScope === 'cross' ? '🔀 ' : '') + esc(q.question) + '</div>';
        }).join('') + '<div id="graphCard" hidden></div></div>';
      wrap.querySelectorAll('.graph-list-item').forEach(function (el) {
        el.addEventListener('click', function (ev) {
          var q = hotQuestions.find(function (x) { return x.id === el.getAttribute('data-qid'); });
          showCard(q, { clientX: ev.clientX, clientY: ev.clientY });
        });
      });
    }
    /* 节点详情浮动卡片 */
    function showCard(item, ev) {
      var card = document.getElementById('graphCard');
      var wrapRect = document.getElementById('graphWrap').getBoundingClientRect();
      var x = (ev.clientX || 0) - wrapRect.left + 12, y = (ev.clientY || 0) - wrapRect.top + 12;
      x = Math.min(x, wrapRect.width - 260); y = Math.min(y, wrapRect.height - 180);
      card.style.left = Math.max(4, x) + 'px'; card.style.top = Math.max(4, y) + 'px';
      var ans = item.isSensitive
        ? '该问题涉及隐私，请到搜索框输入关键词（如"心理""压力"）后查看。'
        : esc(displayAnswer(item, searchInput.value)).slice(0, 140) + '…';
      card.innerHTML = '<button class="card-x" id="cardX">✕</button><h5>' +
        (item.campusScope === 'cross' ? '🔀 ' : '') + esc(item.question) + '</h5>' +
        '<p>' + ans + '</p><div class="detail-spots">' +
        item.relatedSpotIds.map(function (sid) {
          var sp = findSpot(sid);
          return sp ? '<button class="chip" data-loc="' + sid + '">' + esc(sp.name) + '</button>' : '';
        }).join('') + '</div>';
      card.hidden = false;
      card.querySelectorAll('[data-loc]').forEach(function (b) {
        b.addEventListener('click', function () { MapModule.locate(b.getAttribute('data-loc')); });
      });
      document.getElementById('cardX').addEventListener('click', function () { card.hidden = true; });
    }
    /* 缩略导航图 */
    function initMini(nodes) {
      var mini = d3.select('#miniMap');
      var xs = nodes.map(function (d) { return d.x || W / 2; }), ys = nodes.map(function (d) { return d.y || H / 2; });
      var pad = 30;
      var x0 = Math.min.apply(null, xs.concat([W / 2])) - pad, x1 = Math.max.apply(null, xs.concat([W / 2])) + pad;
      var y0 = Math.min.apply(null, ys.concat([H / 2])) - pad, y1 = Math.max.apply(null, ys.concat([H / 2])) + pad;
      var sc = Math.min(146 / (x1 - x0), 116 / (y1 - y0));
      mini.selectAll('circle').data(nodes).enter().append('circle')
        .attr('cx', function (d) { return ((d.x || W / 2) - x0) * sc + 2; })
        .attr('cy', function (d) { return ((d.y || H / 2) - y0) * sc + 2; })
        .attr('r', 2.5).attr('fill', cssVar('--accent') || '#0A84FF').attr('opacity', 0.7);
      mini.append('rect').attr('id', 'miniRect').attr('x', 2).attr('y', 2)
        .attr('width', W * sc).attr('height', H * sc)
        .attr('fill', 'none').attr('stroke', cssVar('--accent') || '#0A84FF').attr('stroke-width', 1.2);
      mini.attr('viewBox', null);
      window.__mini = { sc: sc, x0: x0, y0: y0 };
    }
    function updateMini(nodes, t) {
      if (!window.__mini) return;
      var m = window.__mini, rect = d3.select('#miniRect');
      if (rect.empty()) return;
      rect.attr('x', (t.x / t.k - m.x0 * 0 + (m.x0 - m.x0 / t.k)) * m.sc + 2);
      /* 简化处理：以平移量/缩放比映射可视框 */
      var vx = (-t.x / t.k), vy = (-t.y / t.k), vw = W / t.k, vh = H / t.k;
      rect.attr('x', (vx - m.x0) * m.sc + 2).attr('y', (vy - m.y0) * m.sc + 2)
        .attr('width', vw * m.sc).attr('height', vh * m.sc);
    }
    return {
      ensure: function () {
        if (inited || typeof d3 === 'undefined') return;
        inited = true;
        try {
          if (window.matchMedia('(max-width: 768px)').matches && degraded) renderList(); else renderGraph();
        } catch (err) {
          document.getElementById('graphWrap').innerHTML =
            '<p class="empty-tip">图谱渲染失败：' + esc(err.message) + '</p>';
        }
      },
      refreshSizes: function () {
        if (!inited || degraded || !nodeSel) return;
        nodeSel.transition().duration(300)
          .attr('r', function (d) { return radius(d.item); })
          .attr('opacity', function (d) { return opacityOf(d.item); });
      }
    };
  })();

  /* ================= 五、地图视图（高德 JS API 2.0） ================= */
  var MapModule = (function () {
    var map = null, inited = false, campusMarkers = [], surMarkers = [], overlays = [];
    var state = { layerCampus: true, layerSur: false, walking: null, routeWfs: null };

    function enter() {
      if (inited) return;
      var box = document.getElementById('mapBox');
      if (typeof AMap === 'undefined') {
        box.innerHTML = '<div class="map-placeholder"><h3>地图占位提示</h3>' +
          '<p>高德 Key 未配置或加载失败。请由团队申请「Web端(JS API)」Key 后填入 index.html 的 key= 处，' +
          '并将 <b>zhixuejiangpan-team.github.io</b> 主域名（不含子路径）加入域名白名单；' +
          '同时填写配套的安全密钥 securityJsCode。其余功能不受影响。</p></div>';
        inited = true; return;
      }
      try {
        map = new AMap.Map('mapBox', { center: CAMPUS_CENTER['蛟桥园'], zoom: 16 });
        map.addControl(new AMap.Scale());
      } catch (e) {
        box.innerHTML = '<div class="map-placeholder"><h3>地图初始化失败</h3><p>' + esc(e.message) + '</p></div>';
        inited = true; return;
      }
      inited = true;
      renderMarkers();
      buildDrawer();
    }

    function markerOf(sp) {
      var color = TYPE_COLOR[sp.type] || '#6A6F78';
      var voted = votedSet.indexOf(sp.id) !== -1;
      var html = '<div class="map-dot" style="background:' + color + '" title="' + esc(sp.name) + '"></div>';
      var m = new AMap.Marker({ position: [sp.lng, sp.lat], content: html, offset: new AMap.Pixel(-11, -11), title: sp.name });
      m.on('click', function () { openPopup(sp); });
      return m;
    }
    function renderMarkers() {
      if (!map) return;
      campusMarkers.concat(surMarkers).forEach(function (m) { m.setMap(null); });
      campusMarkers = []; surMarkers = [];
      if (state.layerCampus) spots.forEach(function (sp) { var m = markerOf(sp); m.setMap(map); campusMarkers.push(m); });
      if (state.layerSur) surroundingSpots.forEach(function (sp) { var m = markerOf(sp); m.setMap(map); surMarkers.push(m); });
    }
    function openPopup(sp) {
      if (!map) return;
      var voted = votedSet.indexOf(sp.id) !== -1;
      var html = '<div class="pop-title">' + esc(sp.name) + '</div>' +
        '<div class="pop-meta">📍 ' + esc(sp.campus) + ' · ' + esc(sp.type) + ' · ⭐' + sp.rating.toFixed(1) + '</div>' +
        '<div class="pop-tags">' + sp.tags.map(function (t) { return '<span class="pop-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
        '<button class="pop-vote' + (voted ? ' voted' : '') + '" data-voteid="' + sp.id + '">' +
        (voted ? '已支持(' + getVotes(sp.id) + ')' : '👍 支持(' + getVotes(sp.id) + ')') + '</button>';
      new AMap.InfoWindow({ content: html, offset: new AMap.Pixel(0, -10) }).open(map, [sp.lng, sp.lat]);
    }
    /* 投票事件委托（InfoWindow 渲染在地图容器内） */
    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.pop-vote') : null;
      if (!btn) return;
      var id = btn.getAttribute('data-voteid');
      if (castVote(id)) {
        var sp = findSpot(id);
        if (sp && map) openPopup(sp);
        buildDrawer();
      }
    });
    /* 图层复选框 */
    document.getElementById('layerCampus').addEventListener('change', function (e) { state.layerCampus = e.target.checked; renderMarkers(); });
    document.getElementById('layerSur').addEventListener('change', function (e) { state.layerSur = e.target.checked; renderMarkers(); });

    /* 办事路径规划：AMap.Walking 串联各步骤点位 */
    function clearRoute() {
      overlays.forEach(function (o) { o.setMap && o.setMap(null); });
      overlays = [];
      if (state.walking) { state.walking.clear(); state.walking = null; }
      document.getElementById('routePanel').hidden = true;
    }
    function loadWorkflow(wfId) {
      var wf = workflows.find(function (w) { return w.id === wfId; });
      if (!wf || !map) return;
      clearRoute();
      state.routeWfs = wf;
      var pts = [];
      wf.steps.forEach(function (st) {
        if (st.spotId) { var sp = findSpot(st.spotId); if (sp) pts.push(sp); }
      });
      /* 数字序号标 */
      pts.forEach(function (sp, i) {
        var m = new AMap.Marker({
          position: [sp.lng, sp.lat],
          content: '<div class="route-num">' + (i + 1) + '</div>',
          offset: new AMap.Pixel(-13, -13), zIndex: 150
        });
        m.setMap(map); overlays.push(m);
      });
      /* 步骤列表在 showRoutePanel 中渲染；此处绘制序号标与步行路线 */
      var walkSum = 0;
      /* Walking 路线串联 */
      if (pts.length > 1 && AMap.Walking) {
        var i = 0;
        state.walking = new AMap.Walking({ map: map, hideMarkers: true, autoFitView: false });
        function next() {
          if (i >= pts.length - 1) { showRoutePanel(wf, walkSum); return; }
          var a = pts[i], b = pts[i + 1]; i++;
          state.walking.search([a.lng, a.lat], [b.lng, b.lat], function (status, result) {
            if (status === 'complete' && result.routes && result.routes[0]) walkSum += Math.round(result.routes[0].time / 60); /* Walking.time 单位：秒 → 分钟 */
            next();
          });
        }
        next();
      } else showRoutePanel(wf, 0);
      if (pts.length) {
        map.setFitView(overlays.length ? overlays.concat() : null);
      }
    }
    function showRoutePanel(wf, walkSum) {
      var total = wf.estimatedMinutes + Math.round(walkSum);
      var prevCampus = null;
      var stepsHtml = wf.steps.map(function (st) {
        var cross = false;
        if (st.campus && st.campus.indexOf('🔀') !== -1) cross = true;
        if (prevCampus && st.campus && st.campus !== prevCampus && st.campus !== '自备材料' && prevCampus !== '自备材料') cross = true;
        if (st.campus && st.campus !== '自备材料') prevCampus = st.campus;
        return '<li>' + (cross ? '<span class="cross-tag">🔀</span>' : '') + '<b>' + esc(st.campus || '') + '</b> ' + esc(st.text) + '</li>';
      }).join('');
      var panel = document.getElementById('routePanel');
      panel.innerHTML = '<button class="card-x" id="routeClose">✕</button>' +
        '<h4>' + (wf.campusScope === 'cross' ? '🔀 ' : '') + esc(wf.title) + '</h4>' +
        '<p class="route-total">全程约 <b>' + total + '</b> 分钟（含步行 ' + Math.round(walkSum) + ' 分钟）</p>' +
        '<ol class="route-steps">' + stepsHtml + '</ol>';
      panel.hidden = false;
      document.getElementById('routeClose').addEventListener('click', function () { panel.hidden = true; });
    }
    /* 点位抽屉 */
    function buildDrawer() {
      var list = document.getElementById('drawerList');
      var groups = ['蛟桥园', '麦庐园', '枫林园'];
      list.innerHTML = groups.map(function (c) {
        return '<div class="drawer-group"><h5>' + c + '</h5>' +
          spots.filter(function (s) { return s.campus === c; }).map(function (s) {
            return '<div class="drawer-item" data-loc="' + s.id + '">' +
              '<span class="dot" style="background:' + (TYPE_COLOR[s.type] || '#666') + '"></span>' +
              esc(s.name) + '<span class="drawer-votes">👍' + getVotes(s.id) + '</span></div>';
          }).join('') + '</div>';
      }).join('');
    }
    document.getElementById('drawerList').addEventListener('click', function (e) {
      var it = e.target.closest('.drawer-item');
      if (it) locate(it.getAttribute('data-loc'));
    });
    /* 抽屉拖拽（移动端上拉全屏/下拉收起） */
    (function () {
      var drawer = document.getElementById('spotDrawer');
      var startY = null, startH = null;
      drawer.addEventListener('touchstart', function (e) {
        startY = e.touches[0].clientY; startH = drawer.offsetHeight;
      });
      drawer.addEventListener('touchmove', function (e) {
        if (startY == null) return;
        var dy = startY - e.touches[0].clientY;
        var h = Math.min(window.innerHeight * 0.92, Math.max(120, startH + dy));
        drawer.style.height = h + 'px';
      });
      drawer.addEventListener('touchend', function (e) {
        if (startY == null) return;
        var dy = startY - e.changedTouches[0].clientY;
        if (dy > 60) { drawer.style.height = '82vh'; drawer.classList.add('full'); }
        else if (dy < -60) { drawer.style.height = '180px'; drawer.classList.remove('full'); }
        startY = null;
      });
      document.getElementById('drawerHandle').addEventListener('click', function () {
        drawer.classList.toggle('full');
        drawer.style.height = drawer.classList.contains('full') ? '82vh' : '180px';
      });
    })();
    function locate(id) {
      var sp = findSpot(id);
      if (!sp) return;
      switchView('map');
      setTimeout(function () {
        if (!map) return;
        map.setCenter([sp.lng, sp.lat]);
        map.setZoom(17);
        openPopup(sp);
      }, 120);
    }
    return {
      enter: enter, locate: locate, loadWorkflow: loadWorkflow, clearRoute: clearRoute, buildDrawer: buildDrawer,
      centerCampus: function (c) {
        if (!map || !CAMPUS_CENTER[c]) return;
        map.setCenter(CAMPUS_CENTER[c]);
        map.setZoom(16);
      },
      /* V6.9 深色：预检通过后地图套用高德深色样式 */
      setDark: function () {
        if (!map) return;
        try { map.setMapStyle('amap://styles/dark'); } catch (e) { console.warn('[dark] 地图深色样式应用失败：', e); }
      }
    };
  })();

  /* ================= 六、指南视图 ================= */
  (function () {
    /* 办事流程：workflows + extraWorkflows（guide-data.js）合并 */
    var allFlows = workflows.concat(window.extraWorkflows || []);
    document.getElementById('guideFlows').innerHTML = allFlows.map(function (wf) {
      var prevCampus = null;
      var steps = wf.steps.map(function (st, i) {
        var cross = false;
        if (st.campus && st.campus.indexOf('🔀') !== -1) cross = true;
        if (prevCampus && st.campus && st.campus !== prevCampus && st.campus !== '自备材料' && prevCampus !== '自备材料') cross = true;
        if (st.campus && st.campus !== '自备材料') prevCampus = st.campus;
        return '<li>' + (cross ? '<span class="cross-tag" title="跨校区步骤">🔀</span>' : '') +
          '<span class="step-no">' + (i + 1) + '</span>' + esc(st.text) +
          '<span class="step-min">' + (st.minutes || 0) + '分钟</span></li>';
      }).join('');
      return '<div class="card flow-card" data-wf="' + wf.id + '">' +
        '<h3>' + (wf.campusScope === 'cross' ? '🔀 ' : '') + esc(wf.title) + '</h3>' +
        '<p class="flow-total">预计全程 <b>' + wf.estimatedMinutes + '</b> 分钟 · 共 ' + wf.steps.length + ' 步</p>' +
        '<ol class="flow-steps">' + steps + '</ol>' +
        '<button class="btn btn-primary flow-map-btn" data-wf="' + wf.id + '">在地图中查看</button></div>';
    }).join('');
    document.getElementById('guideFlows').addEventListener('click', function (e) {
      var btn = e.target.closest('.flow-map-btn');
      if (!btn) return;
      switchView('map');
      setTimeout(function () { MapModule.loadWorkflow(btn.getAttribute('data-wf')); }, 150);
    });
    /* 校历 */
    document.getElementById('guideCalendar').innerHTML =
      '<h3 class="cal-title">' + esc(calendarData.term) + ' 校历关键节点</h3><div class="cal-timeline">' +
      calendarData.nodes.map(function (n) {
        return '<div class="cal-node"><span class="cal-date">' + esc(n.date) + '</span>' +
          '<div class="cal-body"><b>' + esc(n.title) + '</b><p>' + esc(n.desc) + '</p></div></div>';
      }).join('') + '</div>';
    /* 医保指南：在校生（insuranceGuide）+ 毕业生停保专区（insuranceStopGuide）；卡片可折叠（data-idx 供跳转定位） */
    function medCard(m, idx) {
      return '<div class="card med-card" data-idx="' + idx + '">' +
        '<h4 class="med-q">Q：' + esc(m.q) + '<span class="med-arrow">▾</span></h4>' +
        '<p class="med-a">' + esc(m.a) + '</p></div>';
    }
    var stopOffset = (window.insuranceGuide || []).length;
    document.getElementById('guideMedical').innerHTML =
      (window.insuranceGuide || []).map(function (m, i) { return medCard(m, i); }).join('') +
      '<h3 class="med-stop-title">🎓 毕业生停保专区</h3>' +
      (window.insuranceStopGuide || []).map(function (m, i) { return medCard(m, stopOffset + i); }).join('');
    /* 折叠交互：点标题切换展开/收起 */
    document.getElementById('guideMedical').addEventListener('click', function (e) {
      var h = e.target.closest('.med-q');
      if (!h) return;
      h.parentNode.classList.toggle('collapsed');
    });
    /* 指南子标签 */
    document.querySelectorAll('#view-guide .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('#view-guide .tab').forEach(function (x) { x.classList.remove('active'); });
        document.querySelectorAll('#view-guide .tab-panel').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        document.getElementById('tab-' + t.getAttribute('data-tab')).classList.add('active');
        if (window.__applyGuideFilter) window.__applyGuideFilter();   // V6.7：切标签保留过滤词
      });
    });
  })();

  /* ================= 七、我的视图 ================= */
  function renderMineVotes() {
    var box = document.getElementById('mineVotes');
    if (!votedSet.length) { box.innerHTML = '<p class="empty-tip">还没有支持过任何点位，去地图页点点看～</p>'; return; }
    box.innerHTML = votedSet.map(function (id) {
      var sp = findSpot(id);
      return sp ? '<div class="mine-row"><b>' + esc(sp.name) + '</b><span>👍 ' + getVotes(id) + ' · ' + esc(sp.campus) + '</span></div>' : '';
    }).join('');
  }
  function renderMineHist() {
    var box = document.getElementById('mineHist');
    var h = getHist();
    box.innerHTML = h.length
      ? h.map(function (x) { return '<span class="chip">' + esc(x) + '</span>'; }).join('')
      : '<span class="empty-tip">暂无搜索历史</span>';
  }
  document.getElementById('guideEntry').addEventListener('click', function () { if (window.switchView) window.switchView('guide'); else switchView('guide'); });

  /* 项目简介：读取 config.js 的团队名与版本号 */
  document.getElementById('mineTeam').textContent = (window.TEAM_NAME || '智行江畔团队') + ' · 江财校园生活智能助手：搜得到答案，看得见路径。';
  document.getElementById('mineVer').textContent = '版本号 ' + (window.SITE_VERSION || 'V6.6+AI');

  /* 学习资源彩蛋：默认收起，按 type 分组渲染 */
  var STUDY_GROUPS = ['高数', '英语', '编程', '社区'];
  function renderStudy() {
    document.getElementById('studyBody').innerHTML = STUDY_GROUPS.map(function (t) {
      var items = (window.studyResources || []).filter(function (r) { return r.type === t; });
      if (!items.length) return '';
      return '<div class="study-group"><h5>' + t + '</h5>' + items.map(function (r) {
        return '<a class="study-item" href="' + esc(r.url) + '" target="_blank" rel="noopener">' +
          '<b>' + esc(r.title) + '</b><span>' + esc(r.description) + '</span></a>';
      }).join('') + '</div>';
    }).join('');
  }
  document.getElementById('studyHeader').addEventListener('click', function () {
    var open = document.getElementById('studyPanel').classList.toggle('open');
    document.getElementById('studyArrow').textContent = open ? '▾' : '▸';
    if (open) renderStudy();
  });

  /* 问卷数据导出（V6.9：数据只读，导出按钮移除；保留空守卫防旧节点残留） */
  var __oldExport = document.getElementById('surveyExport');
  /* ================= 启动 ================= */
  renderHist(); renderHot(); renderMineVotes(); renderMineHist();
  if (window.__renderKbGrowth) window.__renderKbGrowth();   /* V7.0 知识库成长卡片 */
  /* V7.1 首屏时段问候语：按当天小时计算，localStorage 存当天文案不重复切换 */
  (function greet() {
    var el = document.getElementById('searchGreet');
    if (!el) return;
    var now = new Date(), dateStr = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
    var text = null, saved = null;
    try { saved = JSON.parse(localStorage.getItem('zxsj71_greet')); } catch (e) {}
    if (saved && saved.date === dateStr && saved.text) text = saved.text;
    if (!text) {
      var h = now.getHours();
      text = h < 12 ? '早上好，今天去哪栋楼？' : (h < 18 ? '下午好，食堂现在应该不挤' : '晚上好，图书馆还有位置吗？');
      try { localStorage.setItem('zxsj71_greet', JSON.stringify({ date: dateStr, text: text })); } catch (e) {}
    }
    el.textContent = text;
  })();
  /* V7.1 滚动渐现：.reveal 进入视口只播一次（reduced-motion 下 CSS 直接置为可见） */
  (function revealInit() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window) || RM) { els.forEach(function (e2) { e2.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.06 });
    els.forEach(function (e2) { io.observe(e2); });
  })();
  /* V7.1 地图页副文案：实测坐标数动态填充 */
  (function mapHead() {
    var el = document.getElementById('mapHeadSub');
    if (el) el.textContent = ((window.spots || []).length) + ' 个实测坐标，三步走到任何办公室';
  })();
  switchView('search');
  window.switchView = switchView;
  window.MapModule = MapModule;
})();

/* ============================================================
   V6.6+AI 增量：在线 AI 问答模块（Kimi，经本地代理）
   - 搜索结果区顶部"🤖 AI 回答"卡片：防抖500ms自动触发
   - 高危词完全阻断 / 中危词走安全 system prompt / 返回二次过滤
   - 点位模糊解析 → 📍相关地点按钮（断网检测、图层自动勾选、跳转定位）
   - 上下文追问（localStorage 10条/携带5条）、频率限制（10秒3次）
   ============================================================ */
(function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* V7.1 reduced-motion 判定（本 IIFE 独立作用域） */
  var RM = false;
  try { RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  var AI = window.AIService;
  var searchInput = document.getElementById('searchInput');
  var resultBox = document.getElementById('resultList');

  /* ---------- Toast ---------- */
  var toastEl = document.createElement('div');
  toastEl.className = 'app-toast';
  toastEl.hidden = true;
  document.body.appendChild(toastEl);
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2500);
  }
  window.__toast = toast;   /* V7.2 供孪生模块提示 3D 降级 */

  /* ---------- AI 卡片 ---------- */
  var aiCard = document.createElement('div');
  aiCard.className = 'card ai-card';
  aiCard.id = 'aiCard';
  aiCard.hidden = true;

  function aiState(state, payload) {
    aiCard.hidden = false;
    if (state === 'loading') {
      aiCard.innerHTML = '<div class="ai-head">🤖 AI 回答</div><p class="ai-loading">正在咨询 AI（推理模型，约需 1 分钟）…</p>';
    } else if (state === 'unconfigured') {
      aiCard.innerHTML = '<div class="ai-head">🤖 AI 未配置</div><p class="ai-text">' +
        '请启动本地代理（<code>node server.js</code>），并在 js/config.js 填入 AI_CONFIG.PROXY_URL 与 API_KEY 后使用在线 AI 问答。本地知识库搜索不受影响。</p>';
    } else if (state === 'blocked') {
      aiCard.innerHTML = '<div class="ai-head">🤖 AI 回答</div><p class="ai-text ai-safe">' +
        '你提到了让自己或他人受伤的内容，我们非常重视。请立即联系：①辅导员或班主任；②学校心理健康教育与咨询中心（预约方式见学生手册）；③全国24小时心理援助热线 <b>12356</b>。你并不孤单。</p>';
    } else if (state === 'fail') {
      aiCard.innerHTML = '<div class="ai-head">🤖 AI 回答</div><p class="ai-text">AI 服务暂不可用，已为您展示本地结果。</p>';
    } else if (state === 'success') {
      var answer = payload.answer || '';
      var spots = payload.spots || [];
      var campus = payload.campus;
      var lines = answer.split('\n');
      var long = lines.length > 3;
      var spotBtns = spots.map(function (sp) {
        return '<button class="chip ai-spot" data-loc="' + sp.id + '">📍 ' + esc(sp.name) + '</button>';
      }).join('');
      if (!spots.length && campus) {
        spotBtns = '<button class="chip ai-spot" data-campus="' + campus + '">查看' + esc(campus) + '全部点位</button>';
      }
      aiCard.innerHTML = '<div class="ai-head">🤖 AI 回答' + (payload.mid ? '<span class="ai-mid-tag">已启用安全回答模式</span>' : '') + '</div>' +
        '<div class="ai-text' + (long ? ' ai-fold' : '') + '" id="aiAnswerText">' + esc(answer).replace(/\n/g, '<br>') + '</div>' +
        (long ? '<button class="ai-expand" id="aiExpand">展开全部 ▾</button>' : '') +
        (spotBtns ? '<div class="ai-spot-row">' + spotBtns + '</div>' : '') +
        (payload.localEmpty ? '<p class="ai-note">本地知识库无匹配，已为您咨询 AI</p>' : '');
      var exp = document.getElementById('aiExpand');
      if (exp) exp.addEventListener('click', function () {
        document.getElementById('aiAnswerText').classList.toggle('ai-fold');
        exp.textContent = document.getElementById('aiAnswerText').classList.contains('ai-fold') ? '展开全部 ▾' : '收起 ▴';
      });
      /* V7.1 逐字输出：Accent 蓝竖线光标，约 480ms 打完，完成后光标淡出（reduced-motion 下直接显示全文） */
      var txtEl = document.getElementById('aiAnswerText');
      if (txtEl && !RM && answer.length) {
        var full = answer, stepN = Math.max(1, Math.ceil(full.length / 40)), ti = 0;
        txtEl.innerHTML = '<span class="ai-caret"></span>';
        var typeTimer = setInterval(function () {
          ti += stepN;
          if (ti >= full.length) {
            clearInterval(typeTimer);
            txtEl.innerHTML = esc(full).replace(/\n/g, '<br>') + '<span class="ai-caret done"></span>';
            setTimeout(function () { var c = txtEl.querySelector('.ai-caret'); if (c) c.remove(); }, 220);
          } else {
            txtEl.innerHTML = esc(full.slice(0, ti)).replace(/\n/g, '<br>') + '<span class="ai-caret"></span>';
          }
        }, 12);
      }
    }
    /* 保持卡片堆叠顺序：🤖 AI 回答 → 相关指南卡片 → 本地结果 */
    var anchor = document.getElementById('relatedWrap') || resultBox;
    anchor.parentNode.insertBefore(aiCard, anchor);
  }

  /* ---------- 点位按钮：断网检测 + 图层勾选 + 跳转定位 ---------- */
  aiCard.addEventListener('click', function (e) {
    var btn = e.target.closest('.ai-spot');
    if (!btn) return;
    if (!navigator.onLine) { toast('网络连接不可用，无法加载地图'); return; }
    var spotId = btn.getAttribute('data-loc');
    var campus = btn.getAttribute('data-campus');
    if (spotId) {
      var sp = null;
      (window.spots || []).concat(window.surroundingSpots || []).forEach(function (s) { if (s.id === spotId) sp = s; });
      /* 自动勾选对应图层 */
      var isSur = !!(window.surroundingSpots || []).find(function (s) { return s.id === spotId; });
      var cb = document.getElementById(isSur ? 'layerSur' : 'layerCampus');
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
      setTimeout(function () { window.MapModule.locate(spotId); }, isSur ? 350 : 120);
      if (!sp) return;
    } else if (campus) {
      var cb2 = document.getElementById('layerCampus');
      if (cb2 && !cb2.checked) { cb2.checked = true; cb2.dispatchEvent(new Event('change')); }
      window.switchView('map');
      setTimeout(function () { window.MapModule.centerCampus(campus); }, 150);
    }
  });

  /* ---------- 触发：监听结果列表 DOM 变化（覆盖所有搜索入口），防抖500ms ---------- */
  var aiTimer = null, lastQuery = '';
  function scheduleAI() {
    clearTimeout(aiTimer);
    aiTimer = setTimeout(runAI, 500);
  }
  function runAI() {
    var q = (searchInput.value || '').trim();
    if (q.length < 2 || q === lastQuery) return;
    lastQuery = q;
    /* 高危词：完全阻断，不调 AI */
    if (AI.hitHighRisk(q)) { aiState('blocked'); return; }
    var cfg = window.AI_CONFIG || {};
    if (!cfg.API_KEY && !cfg.PROXY_URL) { aiState('unconfigured'); return; }
    /* 频率限制：10秒内最多3次 */
    if (AI.rateLimited()) { toast('请求过于频繁，请稍后再试'); return; }
    aiState('loading');
    var mid = AI.hitMidRisk(q);
    AI.callAI(q).then(function (answer) {
      var matched = AI.parseSpotsFromAnswer(answer);
      var campus = matched.length ? null : AI.parseCampusFromAnswer(answer);
      var localEmpty = !resultBox.querySelector('.result-item');
      aiState('success', { answer: answer, spots: matched, campus: campus, localEmpty: localEmpty, mid: !!mid });
    }).catch(function () {
      aiState('fail');
    });
  }
  var observer = new MutationObserver(function () { scheduleAI(); });
  observer.observe(resultBox, { childList: true, subtree: false });

  /* ---------- 继续追问 ---------- */
  var bar = document.getElementById('aiContextBar');
  function refreshBar() {
    bar.hidden = !(AI.loadHistory().length);
  }
  document.getElementById('aiContextGo').addEventListener('click', function () {
    searchInput.placeholder = '继续上次的对话…';
    searchInput.focus();
  });
  document.getElementById('aiContextClear').addEventListener('click', function () {
    AI.clearHistory();
    searchInput.placeholder = '输入你的问题，如：补办学生证 / 医保报销 / 食堂';
    refreshBar();
    toast('对话历史已清除');
  });
  refreshBar();
  /* 每次 AI 成功调用后刷新提示条 */
  var origSave = AI.saveHistory;
  AI.saveHistory = function (h) { origSave(h); refreshBar(); };
})();

/* ============================================================
   V6.7 增量：搜索 × 指南融合模块
   - 分组搜索建议（高频问题/办事流程/医保指南）+ 相似度去重
   - 搜索结果页"相关办事流程/医保政策"卡片
   - 指南页内搜索过滤（切标签保留过滤词）
   - 高频问题 ↔ 办事流程联动按钮
   ============================================================ */
(function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var dice = (window.AIService && window.AIService._dice) || function (a, b) { return a === b ? 1 : 0; };
  var allFlows = (window.workflows || []).concat(window.extraWorkflows || []);
  var allMeds = (window.insuranceGuide || []).map(function (m, i) { return { q: m.q, a: m.a, idx: i, stop: false }; })
    .concat((window.insuranceStopGuide || []).map(function (m, i) { return { q: m.q, a: m.a, idx: i, stop: true }; }));

  /* 相似去重：互为子串 / Dice>0.6 / 最长公共子串占短串≥0.6 均视为同一条 */
  function longestCommon(a, b) {
    var m = a.length, n = b.length, prev = new Array(n + 1).fill(0), cur, best = 0;
    for (var i = 1; i <= m; i++) {
      cur = new Array(n + 1).fill(0);
      for (var j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
      }
      prev = cur;
    }
    return best;
  }
  function isDupOfWorkflow(question) {
    for (var i = 0; i < allFlows.length; i++) {
      var t = allFlows[i].title;
      /* 去掉标题括号补充（如受理时间、校区说明）后与问题比对 */
      var core = t.replace(/[（(].*?[)）]/g, '');
      if (question.indexOf(t) !== -1 || t.indexOf(question) !== -1 ||
          question.indexOf(core) !== -1 || core.indexOf(question) !== -1) return true;
      if (dice(question, t) > 0.6 || dice(question, core) > 0.6) return true;
      var short = Math.min(question.length, core.length);
      if (short >= 4 && longestCommon(question, core) / short >= 0.6) return true;
    }
    return false;
  }
  function matchFlows(q) {
    return allFlows.filter(function (w) {
      if (w.title.indexOf(q) !== -1) return true;
      return w.steps.some(function (st) { return st.text && st.text.indexOf(q) !== -1; });
    });
  }
  function matchMeds(q) {
    return allMeds.filter(function (m) { return m.q.indexOf(q) !== -1 || m.a.indexOf(q) !== -1; });
  }

  /* ---------- 指南跳转工具 ---------- */
  function activateGuideTab(name) {
    document.querySelectorAll('#view-guide .tab').forEach(function (x) {
      x.classList.toggle('active', x.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('#view-guide .tab-panel').forEach(function (x) {
      x.classList.toggle('active', x.id === 'tab-' + name);
    });
    if (window.__applyGuideFilter) window.__applyGuideFilter();
  }
  function flash(el) {
    if (!el) return;
    el.classList.remove('highlight-flash');
    void el.offsetWidth;   /* 重置动画 */
    el.classList.add('highlight-flash');
    setTimeout(function () { el.classList.remove('highlight-flash'); }, 1500);
  }
  window.__gotoWorkflow = function (wfId) {
    window.switchView('guide');
    activateGuideTab('flows');
    setTimeout(function () {
      var card = document.querySelector('#guideFlows .flow-card[data-wf="' + wfId + '"]');
      if (card) { card.classList.remove('collapsed'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(card); }
    }, 120);
  };
  window.__gotoMedical = function (idx) {
    window.switchView('guide');
    activateGuideTab('medical');
    setTimeout(function () {
      var card = document.querySelector('#guideMedical .med-card[data-idx="' + idx + '"]');
      if (card) { card.classList.remove('collapsed'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); flash(card); }
    }, 120);
  };

  /* ---------- 一、分组搜索建议 ---------- */
  var suggestBox = document.getElementById('suggestBox');
  window.__renderSuggest = function () {
    var q = document.getElementById('searchInput').value.trim();
    if (!q) { suggestBox.hidden = true; return; }
    var hots = (window.hotQuestions || []).filter(function (h) {
      return !isDupOfWorkflow(h.question) &&
        (h.question.indexOf(q) !== -1 || h.category.indexOf(q) !== -1 || h.tags.join(' ').indexOf(q) !== -1);
    }).slice(0, 5);
    var flows = matchFlows(q).slice(0, 4);
    var meds = matchMeds(q).slice(0, 4);
    if (!hots.length && !flows.length && !meds.length) { suggestBox.hidden = true; return; }
    var html = '';
    if (hots.length) {
      html += '<div class="suggest-group"><div class="suggest-group-title">🔍 高频问题</div>' +
        hots.map(function (h) {
          return '<div class="suggest-item" data-type="hot" data-qid="' + h.id + '">' +
            (h.campusScope === 'cross' ? '🔀 ' : '') + esc(h.question) + '</div>';
        }).join('') + '</div>';
    }
    if (flows.length) {
      html += '<div class="suggest-group"><div class="suggest-group-title">📋 办事流程</div>' +
        flows.map(function (w) {
          return '<div class="suggest-item" data-type="flow" data-wf="' + w.id + '">' +
            (w.campusScope === 'cross' ? '🔀 ' : '') + esc(w.title) +
            '<span class="suggest-cat">约' + w.estimatedMinutes + '分钟</span></div>';
        }).join('') + '</div>';
    }
    if (meds.length) {
      html += '<div class="suggest-group"><div class="suggest-group-title">💊 医保指南</div>' +
        meds.map(function (m) {
          return '<div class="suggest-item" data-type="med" data-idx="' + m.idx + '">📋 ' + esc(m.q) +
            (m.stop ? '<span class="suggest-cat">停保</span>' : '') + '</div>';
        }).join('') + '</div>';
    }
    suggestBox.innerHTML = html;
    suggestBox.hidden = false;
  };
  window.__suggestClick = function (e) {
    var it = e.target.closest('.suggest-item');
    if (!it) return;
    var type = it.getAttribute('data-type');
    suggestBox.hidden = true;
    if (type === 'hot') {
      var qid = it.getAttribute('data-qid');
      var item = (window.hotQuestions || []).find(function (x) { return x.id === qid; });
      if (item) { document.getElementById('searchInput').value = item.question; }
      if (window.__runSearchByVal) window.__runSearchByVal(item ? item.question : '');
    } else if (type === 'flow') {
      window.__gotoWorkflow(it.getAttribute('data-wf'));
    } else if (type === 'med') {
      window.__gotoMedical(it.getAttribute('data-idx'));
    }
  };
  /* 建议"高频问题"点击后复用主搜索（保持原展开+计数逻辑） */
  window.__runSearchByVal = function (v) {
    var btn = document.getElementById('searchBtn');
    document.getElementById('searchInput').value = v;
    btn.click();
  };

  /* ---------- 二、搜索结果页"相关指南"卡片 ---------- */
  window.__renderRelatedCards = function (q) {
    var old = document.getElementById('relatedWrap');
    if (old) old.parentNode.removeChild(old);
    var flows = matchFlows(q).slice(0, 2);
    var meds = matchMeds(q).slice(0, 2);
    if (!flows.length && !meds.length) return;
    var wrap = document.createElement('div');
    wrap.id = 'relatedWrap';
    wrap.innerHTML =
      flows.map(function (w) {
        return '<div class="card related-card related-flow">' +
          '<div class="related-head">📋 相关办事流程</div>' +
          '<div class="related-body"><b>' + (w.campusScope === 'cross' ? '🔀 ' : '') + esc(w.title) + '</b>' +
          '<span class="related-meta">预计全程 ' + w.estimatedMinutes + ' 分钟 · ' + w.steps.length + ' 步</span></div>' +
          '<button class="btn btn-primary related-btn" data-wf="' + w.id + '">查看详情</button></div>';
      }).join('') +
      meds.map(function (m) {
        return '<div class="card related-card related-med">' +
          '<div class="related-head">💊 相关医保政策' + (m.stop ? '<span class="suggest-cat">毕业生停保</span>' : '') + '</div>' +
          '<div class="related-body"><b>Q：' + esc(m.q) + '</b>' +
          '<p class="related-snippet">' + esc(m.a.slice(0, 80)) + (m.a.length > 80 ? '…' : '') + '</p></div>' +
          '<button class="btn btn-primary related-btn" data-idx="' + m.idx + '">查看完整指南</button></div>';
      }).join('');
    var resultBox = document.getElementById('resultList');
    resultBox.parentNode.insertBefore(wrap, resultBox);
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('.related-btn');
      if (!b) return;
      if (b.getAttribute('data-wf')) window.__gotoWorkflow(b.getAttribute('data-wf'));
      else if (b.getAttribute('data-idx') !== null) window.__gotoMedical(b.getAttribute('data-idx'));
    });
  };

  /* ---------- 三、指南页内搜索过滤 ---------- */
  ['tab-flows', 'tab-medical'].forEach(function (pid) {
    var panel = document.getElementById(pid);
    if (!panel) return;
    var empty = document.createElement('p');
    empty.className = 'empty-tip guide-filter-empty';
    empty.hidden = true;
    empty.textContent = '无匹配内容，建议回搜索页问 AI';
    panel.appendChild(empty);
  });
  var guideKw = '';
  window.__applyGuideFilter = function () {
    var activeTab = document.querySelector('#view-guide .tab.active');
    var tabName = activeTab ? activeTab.getAttribute('data-tab') : 'flows';
    /* 校历不过滤：清空隐藏态即可 */
    if (tabName === 'calendar') return;
    var scope = tabName === 'flows' ? '#guideFlows .flow-card' : '#guideMedical .med-card';
    var cards = document.querySelectorAll(scope);
    var visible = 0;
    cards.forEach(function (c) {
      var hit = !guideKw || c.textContent.indexOf(guideKw) !== -1;
      c.style.display = hit ? '' : 'none';
      if (hit) visible++;
    });
    var panel = document.getElementById('tab-' + tabName);
    var emptyEl = panel ? panel.querySelector('.guide-filter-empty') : null;
    if (emptyEl) emptyEl.hidden = !(guideKw && visible === 0);
  };
  (function initGuideSearch() {
    var input = document.getElementById('guideSearch');
    var clearBtn = document.getElementById('guideSearchClear');
    if (!input) return;
    input.addEventListener('input', function () {
      guideKw = input.value.trim();
      clearBtn.hidden = !guideKw;
      window.__applyGuideFilter();   /* 仅 CSS display 切换，不改变卡片内部状态 */
    });
    clearBtn.addEventListener('click', function () {
      input.value = ''; guideKw = ''; clearBtn.hidden = true;
      window.__applyGuideFilter();
    });
  })();

  /* ---------- 四、高频问题 ↔ 办事流程联动按钮 ---------- */
  var WORKFLOW_LINK = { q7: 'wf-card', q8: 'wf-loss', q9: 'wf-score', q11: 'wf-fuxiu', q14: 'wf-card', q33: 'wf-visitor' };
  window.__wfLinkButton = function (qid) {
    var wfId = WORKFLOW_LINK[qid];
    if (!wfId) return '';
    var wf = allFlows.find(function (w) { return w.id === wfId; });
    if (!wf) return '';
    return '<div class="detail-wflink"><button class="btn btn-ghost related-btn" data-wfgoto="' + wfId + '">📋 查看完整办事流程：' + esc(wf.title) + '</button></div>';
  };
})();

/* ============================================================
   V6.9 增量：问卷真实数据渲染 / 彩蛋 / 深色预检 / 数字孪生 / AI知识自迭代
   localStorage 键：zxsj66_easter / zxsj66_aikb / zxsj66_pending
   / zxsj66_twin_demo / zxsj66_dark_ok
   z-index 层级表：地图 100 < 孪生 200 < AI对话/搜索联想 300 < 彩蛋 400
   ============================================================ */
(function () {
  'use strict';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  var dice9 = (window.AIService && window.AIService._dice) || function (a, b) { return a === b ? 1 : 0; };

  /* ================= 模块四（先做）：深色预检 ================= */
  (function darkInit() {
    var KEY = 'zxsj66_dark_ok';
    window.__darkOk = false;
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved !== null) {
      if (saved === '1') { document.documentElement.classList.add('dark'); window.__darkOk = true; }
      return;
    }
    var ok = '0';
    try {
      if (window.MAP_DARK_STYLE !== false && typeof AMap !== 'undefined') {
        var div = document.createElement('div');
        div.style.cssText = 'position:fixed;left:-99999px;top:0;width:20px;height:20px;pointer-events:none;';
        document.body.appendChild(div);
        var m = new AMap.Map(div, { zoom: 3, center: [116.39, 39.91] });
        if (m.setMapStyle) { m.setMapStyle('amap://styles/dark'); ok = '1'; }
        setTimeout(function () { try { m.destroy(); } catch (e) {} try { div.remove(); } catch (e) {} }, 600);
      }
    } catch (err) {
      ok = '0';
      console.warn('[dark] 深色预检失败，已回滚浅色主题：', err);
    }
    try { localStorage.setItem(KEY, ok); } catch (e) {}
    if (ok === '1') { document.documentElement.classList.add('dark'); window.__darkOk = true; }
  })();

  /* ================= 模块五-3：彩蛋（搜索"蛟湖"拦截 + logo 连点 5 次） ================= */
  var EasterModule = (function () {
    var overlay = document.createElement('div');
    overlay.id = 'easterOverlay';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="easter-card">' +
      '<button class="card-x" id="easterClose">✕</button>' +
      '<div class="easter-emoji">🌊</div>' +
      '<h3>蛟湖彩蛋</h3>' +
      '<p>你发现了藏在"智行江畔"里的小秘密——蛟湖，江财人心里的那片湖。</p>' +
      '<p class="easter-tip">据说在这里许下新学期愿望的人，期末都不会挂科。</p>' +
      '<p class="easter-sign">—— 智行江畔团队 敬上</p></div>';
    document.body.appendChild(overlay);
    function open(source) {
      /* 彩蛋（400）高于孪生层（200）：打开时自动隐藏孪生，关闭后恢复 */
      if (window.__twinPauseForOverlay) window.__twinPauseForOverlay();
      overlay.hidden = false;
      try { localStorage.setItem('zxsj66_easter', JSON.stringify({ opened: true, source: source || 'logo', ts: Date.now() })); } catch (e) {}
    }
    function close() {
      overlay.hidden = true;
      if (window.__twinResumeFromOverlay) window.__twinResumeFromOverlay();
    }
    overlay.addEventListener('click', function (e) { if (e.target === overlay || e.target.id === 'easterClose') close(); });
    /* logo 连点 5 次触发 */
    var clicks = 0, timer = null;
    var logo = document.querySelector('.navbar .logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', function () {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(function () { clicks = 0; }, 6000);
        if (clicks >= 5) { clicks = 0; open('logo5x'); }
      });
    }
    return { open: open, close: close };
  })();
  window.EasterModule = EasterModule;

  /* ================= 模块一：问卷面板（N=29 真实数据） ================= */
  window.__initSurvey = function () {
    var panel = document.getElementById('surveyPanel');
    var body = document.getElementById('surveyBody');
    if (!panel || !body || typeof surveyData === 'undefined') return;
    var SD = surveyData, N = SD.meta.n;
    body.innerHTML =
      '<p class="survey-note">' + esc(SD.meta.note) + '</p><div class="survey-grid">' +
      SD.questions.map(function (q) {
        var topIdx = 0;
        q.options.forEach(function (op, i) { if (op.count > q.options[topIdx].count) topIdx = i; });
        return '<div class="survey-item"><span class="survey-top-tag">🔥 ' + esc(q.options[topIdx].label.slice(0, 6)) + '</span><h4>' + esc(q.q) + '</h4>' +
          (q.note ? '<p class="survey-item-note">' + esc(q.note) + '</p>' : '') +
          '<div class="survey-chart" id="chart-' + q.id + '"></div></div>';
      }).join('') + '</div>' +
      /* 洞察文案：79.3% 由 sq2 多选（23/29）与 sq3 单选（23/29）双佐证，答辩引用须同时注明两数据点 */
      '<div class="survey-insight">💡 ' + N + ' 人中 <b>23 人（79.3%）</b> 不知道各部门办公室在哪、电话多少' +
      '（sq2 多选"找不到校内办公地点/部门" 与 sq3 单选"各部门办公室位置与电话" 双佐证）——这正是"智行江畔"立项的第一依据。</div>' +
      /* sq11 开放题：默认收起 */
      '<div class="survey-openended" id="soPanel">' +
      '<div class="so-header" id="soHeader"><span>' + esc(SD.openEnded.q) + '</span><span id="soArrow">▸</span></div>' +
      '<div class="so-body" id="soBody" hidden><p class="empty-tip">原始回答请在问卷平台查看。</p>' +
      '<p class="survey-item-note">' + esc(SD.openEnded.note) + '</p></div></div>';
    var charts = [];
    function pct(c) { return (c / N * 100).toFixed(1) + '%'; }
    function renderCharts() {
      if (typeof echarts === 'undefined') return;
      var ACC = cssVar('--accent') || '#0A84FF';
      var TXT = cssVar('--text-primary') || cssVar('--text') || '#1D1D1F';
      charts.forEach(function (c) { c.dispose(); }); charts = [];
      SD.questions.forEach(function (q) {
        var el = document.getElementById('chart-' + q.id);
        if (!el) return;
        var topIdx = 0;
        q.options.forEach(function (op, i) { if (op.count > q.options[topIdx].count) topIdx = i; });
        var fmt = function (i) { return q.options[i].count + '/' + N + ' · ' + pct(q.options[i].count); };
        var chart = echarts.init(el);
        if (q.chart === 'pie') {
          chart.setOption({
            tooltip: { trigger: 'item', formatter: function (p) { return p.name + '：' + fmt(p.dataIndex); } },
            legend: { bottom: 0, textStyle: { fontSize: 11, color: TXT } },
            series: [{
              type: 'pie', radius: ['30%', '56%'], center: ['50%', '44%'],
              label: { fontSize: 10, color: TXT, formatter: function (p) { return p.name + '\n' + fmt(p.dataIndex); } },
              data: q.options.map(function (op, i) {
                return {
                  name: op.label, value: op.count,
                  itemStyle: i === topIdx ? { color: ACC } : { color: ACC, opacity: 0.55 }
                };
              })
            }]
          });
        } else {
          /* 多选横向条形图：占比按 N=29 独立计算，禁止归一化 */
          chart.setOption({
            tooltip: { trigger: 'item', formatter: function (p) { return q.options[p.dataIndex].label + '：' + fmt(p.dataIndex); } },
            grid: { left: 8, right: 90, top: 8, bottom: 8, containLabel: true },
            xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: cssVar('--twin-grid') || '#E5DFD5' } }, axisLabel: { color: TXT } },
            yAxis: { type: 'category', inverse: true, data: q.options.map(function (op) { return op.label; }), axisLabel: { fontSize: 10, color: TXT } },
            series: [{
              type: 'bar', barWidth: 14,
              label: { show: true, position: 'right', fontSize: 10, color: TXT, formatter: function (p) { return fmt(p.dataIndex); } },
              data: q.options.map(function (op, i) {
                return {
                  value: op.count,
                  itemStyle: i === topIdx
                    ? { color: ACC, borderRadius: [0, 6, 6, 0] }
                    : { color: ACC, opacity: 0.55, borderRadius: [0, 6, 6, 0] }
                };
              })
            }]
          });
        }
        charts.push(chart);
      });
    }
    document.getElementById('surveyHeader').addEventListener('click', function () {
      var open = panel.classList.toggle('open');
      document.getElementById('surveyArrow').textContent = open ? '▾' : '▸';
      if (open) setTimeout(renderCharts, 60);
    });
    document.getElementById('soHeader').addEventListener('click', function () {
      var bodyEl = document.getElementById('soBody');
      bodyEl.hidden = !bodyEl.hidden;
      document.getElementById('soArrow').textContent = bodyEl.hidden ? '▸' : '▾';
    });
  };

  /* ================= 模块三：AI 知识自迭代（沉淀 + 待补充池） ================= */
  var KB_KEY = 'zxsj66_aikb', PEND_KEY = 'zxsj66_pending';
  function kbList() { return lsGet(KB_KEY, []); }
  /* V7.0 首次访问种子：KB_DEMO_MODE 开启且本地无知识库时，注入演示数据（来源标注"演示种子"） */
  var KB_SEED_IDS = ['q15', 'q16', 'q20', 'q7', 'q17', 'q19', 'q21', 'q12', 'q2', 'q8']; /* 食堂/图书馆/补办/校医院/快递等高频 */
  function kbSeed() {
    if (window.KB_DEMO_MODE === false) return;
    var raw = null;
    try { raw = localStorage.getItem(KB_KEY); } catch (e) {}
    if (raw !== null) return;                       /* 已有知识库（含空数组）不再注入 */
    var hq = window.hotQuestions || [], DAY = 86400000, now = Date.now(), list = [];
    var daysAgo = [6, 6, 5, 4, 4, 3, 2, 2, 1, 0], hitSeed = [3, 0, 2, 1, 0, 1, 2, 0, 1, 4];
    KB_SEED_IDS.forEach(function (id, i) {
      var q = null;
      for (var j = 0; j < hq.length; j++) if (hq[j].id === id) q = hq[j];
      if (!q) return;
      list.push({ q: q.question, a: q.answer, ts: now - daysAgo[i] * DAY - (i % 5) * 3600000, hits: hitSeed[i], src: '演示种子' });
    });
    lsSet(KB_KEY, list);
    try { localStorage.setItem('zxsj66_kb_demo', '1'); } catch (e) {}
    /* 演示待补充池（2 条），让"待补充"数字在演示态下不为 0 */
    lsSet(PEND_KEY, { '四级报名什么时候截止？': 1, '奖学金评定标准是什么？': 2 });
  }
  kbSeed();
  /* V7.0 成长卡片渲染：沉淀/命中/待补充 + 近 7 天新增柱状图（纯 CSS 柱，免测量） */
  window.__renderKbGrowth = function () {
    var countEl = document.getElementById('kbCount'), panel = document.getElementById('kbPanel');
    if (!countEl || !panel) return;
    var list = kbList(), pend = lsGet(PEND_KEY, {});
    var hits = 0, today = new Date(); today.setHours(0, 0, 0, 0);
    var days = [0, 0, 0, 0, 0, 0, 0];               /* 索引 0 = 6 天前 … 6 = 今天 */
    list.forEach(function (it) {
      hits += (it.hits || 0);
      var d = it.ts ? new Date(it.ts) : new Date();  /* 无时间戳的存量知识计为今日新增 */
      var idx = 6 - Math.round((today - new Date(d.setHours(0, 0, 0, 0))) / 86400000);
      if (idx >= 0 && idx < 7) days[idx]++;
    });
    countEl.textContent = list.length;
    document.getElementById('kbHits').textContent = hits;
    document.getElementById('kbPend').textContent = Object.keys(pend).length;
    /* 演示数据角标：种子注入过且演示开关开启时显示 */
    var demoFlag = false;
    try { demoFlag = localStorage.getItem('zxsj66_kb_demo') === '1'; } catch (e) {}
    document.getElementById('kbBadge').hidden = !(window.KB_DEMO_MODE !== false && demoFlag);
    var max = Math.max.apply(null, days.concat([1]));
    var labels = [];
    for (var i = 0; i < 7; i++) { var d2 = new Date(today.getTime() - (6 - i) * 86400000); labels.push((d2.getMonth() + 1) + '/' + d2.getDate()); }
    document.getElementById('kbChart').innerHTML = days.map(function (n, i) {
      return '<div class="kb-col" title="' + labels[i] + ' 新增 ' + n + ' 条">' +
        '<span class="kb-col-n">' + n + '</span>' +
        '<i style="height:' + Math.round(n / max * 100) + '%"></i>' +
        '<span class="kb-col-d">' + (i === 6 ? '今' : labels[i].split('/')[1]) + '</span></div>';
    }).join('');
  };
  window.__renderKbGrowth();
  function kbFind(q) {
    var list = kbList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].q === q || dice9(list[i].q, q) > 0.85) return list[i];
    }
    return null;
  }
  function kbSave(q, a) {
    /* 高敏感词与医疗兜底文本不进入沉淀 */
    if (window.AIService.hitHighRisk(q)) return;
    if (a.indexOf('该问题涉及专业医疗') !== -1) return;
    var list = kbList();
    var hit = null;
    for (var i = 0; i < list.length; i++) if (list[i].q === q) hit = list[i];
    if (hit) { hit.a = a; hit.ts = Date.now(); }
    else { list.push({ q: q, a: a, ts: Date.now(), hits: 0 }); }
    lsSet(KB_KEY, list.slice(-50));
    if (window.__renderKbGrowth) window.__renderKbGrowth();
  }
  function kbTouch(q) {
    var list = kbList();
    for (var i = 0; i < list.length; i++) if (list[i].q === q) { list[i].hits = (list[i].hits || 0) + 1; lsSet(KB_KEY, list); if (window.__renderKbGrowth) window.__renderKbGrowth(); return; }
  }
  function pendMiss(q) {
    var map = lsGet(PEND_KEY, {});
    map[q] = (map[q] || 0) + 1; lsSet(PEND_KEY, map);
    return map[q];
  }
  /* 包装 callAI：命中知识库优先本地回答并标注来源；未命中累计待补充池 */
  (function wrapAI() {
    if (!window.AIService || !window.AIService.callAI) return;
    var _call = window.AIService.callAI;
    window.AIService.callAI = function (q) {
      var kb = kbFind(q);
      if (kb) {
        kbTouch(kb.q);
        return Promise.resolve(kb.a + '\n\n——📚 本地知识沉淀（已命中 ' + ((kb.hits || 0) + 1) + ' 次，优先复用）');
      }
      var missCount = pendMiss(q);
      return _call(q).then(function (ans) {
        kbSave(q, ans);
        if (missCount >= 3) ans = '（该问题已记录，将尽快补充进本地知识库）\n' + ans;
        return ans;
      });
    };
  })();

  /* ================= 模块二：数字孪生独立视图 ================= */
  var Twin = (function () {
    var overlay, listEl, svg, clockEl, demoCb, segEl, segInd, fadeTimer = null, timer = null, openFlag = false, pausedByOverlay = false;
    var demo = false, tier = 0, virtualT = 6 * 60 + 55;   /* tier：0=现在 30=+30分钟 60=+60分钟（iOS 分段控件） */
    var rows = [];                               /* {sp, nEl, barEl, dotEl, haloEl} */
    var cardsEl, miniRegistry = [], cardIO = null, svgBuilt = false, miniDocBound = false;
    var MINI_KEY_MAP = { '蛟桥北': 'jq_north', '蛟桥南': 'jq_south', '麦庐北': 'ml_north', '麦庐南': 'ml_south' };
    var LOWEND = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    var REDUCED = false;
    try { REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var LEVEL_TXT = { green: '畅通', yellow: '较拥挤', red: '拥挤' };
    function gauss(t, mu, sig) { var d = (t - mu) / sig; return Math.exp(-d * d / 2); }
    function isExamWeek(date) {
      try {
        var nodes = (window.calendarData && window.calendarData.nodes) || [];
        var now = date.getTime();
        for (var i = 0; i < nodes.length; i++) {
          if (!/考试|院考|校考/.test(nodes[i].title)) continue;
          var t0 = new Date(nodes[i].date).getTime();
          if (Math.abs(now - t0) < 14 * 86400000) return true;
        }
      } catch (e) {}
      return false;
    }
    function kindOf(sp) {
      var t = sp.type || '', n = sp.name || '', tags = (sp.tags || []).join('');
      if (t === '食堂') return 'canteen';
      if (/图书馆|图文/.test(n)) return 'library';
      if (/快递/.test(n + tags)) return 'express';
      if (t === '医疗') return 'clinic';
      return 'gym';
    }
    function statusOf(sp, date, t) {
      var day = date.getDay(), weekend = (day === 0 || day === 6), kind = kindOf(sp);
      var p = 0.2, cap = 100;
      if (kind === 'canteen') {
        cap = 150 + ((sp.tags && sp.tags.length) || 2) * 30;
        p = 0.55 * gauss(t, 7.5, 1) + 1 * gauss(t, 12, 1.1) + 0.8 * gauss(t, 17.5, 1.1);
        if (t < 6 || t > 21) p = 0.02;
      } else if (kind === 'library') {
        cap = 800;
        p = (t < 8 || t > 22.5) ? 0.02 : (0.35 + 0.5 * gauss(t, 19, 3));
        if (isExamWeek(date)) p = Math.min(1, p * 1.4);   /* 考试周加成 40% */
        if (t >= 22.5) p = 0;                              /* 22:30 闭馆归零 */
      } else if (kind === 'express') {
        cap = 300;
        p = 0.9 * gauss(t, 17, 1.6);
        if (weekend) p = Math.min(1, p * 1.25);
        if (t < 9 || t > 20) p = 0.03;
      } else if (kind === 'clinic') {
        cap = 80;
        p = 0.5 * gauss(t, 10, 2) + 0.6 * gauss(t, 15.5, 2);
        if (t < 8 || t > 17.5) p = 0.03;
      } else {
        cap = 200;
        p = (t < 7 || t > 21) ? 0.05 : (0.3 + 0.45 * gauss(t, 18, 2.5));
      }
      p = Math.max(0.02, Math.min(1, p));
      return { p: p, n: Math.round(p * cap), cap: cap, level: p <= 0.6 ? 'green' : (p <= 0.85 ? 'yellow' : 'red'), kind: kind };
    }
    /* V7.0 闭馆判定（与 statusOf 的小时规则一致，用于预测强制归零） */
    function isClosed(kind, t) {
      if (kind === 'canteen') return t < 6 || t > 21;
      if (kind === 'library') return t >= 22.5;
      if (kind === 'express') return t < 9 || t > 20;
      if (kind === 'clinic') return t < 8 || t > 17.5;
      return t < 7 || t > 21;
    }
    /* V7.0 差分预测：预测值 = 当前值 + (当前值 - N分钟前值)，闭馆后强制为 0（V7.1 支持 30/60 两档） */
    function predictOf(sp, date, t, aheadH) {
      var cur = statusOf(sp, date, t), prev = statusOf(sp, date, t - aheadH), kind = cur.kind;
      if (isClosed(kind, t) || isClosed(kind, t + aheadH)) return { p: 0, n: 0, cap: cur.cap, level: 'green', kind: kind, closed: true };
      var p = Math.max(0, Math.min(1, cur.p + (cur.p - prev.p)));
      return { p: p, n: Math.round(p * cur.cap), cap: cur.cap, level: p <= 0.6 ? 'green' : (p <= 0.85 ? 'yellow' : 'red'), kind: kind, closed: false };
    }
    /* V7.0 行动建议三档（写死文案，末尾标注"（模拟预测）"） */
    function adviceOf(p) { return (p <= 0.6 ? '现在去' : (p <= 0.85 ? '建议错峰' : '别去')) + '（模拟预测）'; }
    function levelColor(level) { return cssVar('--twin-' + level) || (level === 'green' ? '#2E7D32' : level === 'yellow' ? '#C9A227' : '#D32F2F'); }
    function fmtTime(min) { var h = Math.floor(min / 60) % 24, m = Math.floor(min % 60); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
    function nowVirtual() { return demo ? virtualT : (new Date().getHours() * 60 + new Date().getMinutes()); }

    function buildDom() {
      overlay = document.createElement('div');
      overlay.id = 'twinOverlay';
      overlay.className = 'twin-overlay';
      overlay.hidden = true;
      overlay.innerHTML =
        '<div class="twin-content">' +
        '<div class="twin-topbar"><span class="twin-title">数字孪生</span>' +
        '<span class="twin-clock" id="twinClock">--:--</span>' +
        '<div class="twin-seg" id="twinSeg"><span class="twin-seg-ind" id="twinSegInd"></span>' +
        '<button type="button" data-tier="0" class="on">现在</button>' +
        '<button type="button" data-tier="30">+30</button>' +
        '<button type="button" data-tier="60">+60</button></div>' +
        '<label class="twin-demo"><input type="checkbox" id="twinDemo"> 演示模式 600×</label>' +
        '<button class="twin-close" id="twinClose">✕ 返回地图</button></div>' +
        '<div class="twin-main"><div class="twin-list" id="twinList"></div>' +
        '<div class="twin-mapwrap">' +
        '<div class="twin-cards" id="twinCards" hidden>' +
        '<div class="twin-card" data-q="蛟桥北"><span class="twin-card-title">蛟桥北</span><span class="twin-card-hint">地图待加载 · 滚入视口后显示</span><div class="twin-cardmap"></div></div>' +
        '<div class="twin-card" data-q="麦庐北"><span class="twin-card-title">麦庐北</span><span class="twin-card-hint">地图待加载 · 滚入视口后显示</span><div class="twin-cardmap"></div></div>' +
        '<div class="twin-card" data-q="蛟桥南"><span class="twin-card-title">蛟桥南</span><span class="twin-card-hint">地图待加载 · 滚入视口后显示</span><div class="twin-cardmap"></div></div>' +
        '<div class="twin-card" data-q="麦庐南"><span class="twin-card-title">麦庐南</span><span class="twin-card-hint">地图待加载 · 滚入视口后显示</span><div class="twin-cardmap"></div></div>' +
        '</div>' +
        '<svg id="twinSvg" viewBox="0 0 760 560" preserveAspectRatio="xMidYMid meet"></svg></div></div></div>';
      document.body.appendChild(overlay);
      listEl = document.getElementById('twinList');
      svg = document.getElementById('twinSvg');
      cardsEl = document.getElementById('twinCards');
      clockEl = document.getElementById('twinClock');
      demoCb = document.getElementById('twinDemo');
      segEl = document.getElementById('twinSeg');
      segInd = document.getElementById('twinSegInd');
      demoCb.checked = lsGet('zxsj66_twin_demo', false);
      demo = demoCb.checked;
      demoCb.addEventListener('change', function () {
        demo = demoCb.checked;
        lsSet('zxsj66_twin_demo', demo);
        tick(true);
      });
      document.getElementById('twinClose').addEventListener('click', close);
      /* V7.2-beta 圆点/标签/光晕直连 3D：委托绑定在 svg 上，与列表「3D」按钮同入口 */
      svg.addEventListener('click', function (e) {
        var t = e.target.closest('.twin-dot, .twin-label, .twin-halo');
        if (!t) return;
        var sid = t.getAttribute('data-sid');
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].sp.id === sid) { open3DForRow(rows[i], t); return; }
        }
      });
      /* V7.1 iOS 分段控件：现在 / +30 / +60，切换时整视图 300ms 交叉淡化 */
      segEl.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-tier]');
        if (!b) return;
        var nt = +b.getAttribute('data-tier');
        if (nt === tier) return;
        tier = nt;
        segInd.style.transform = 'translateX(' + (nt / 30 * 100) + '%)';
        segEl.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', +x.getAttribute('data-tier') === tier); });
        if (REDUCED) { tick(true); return; }
        overlay.classList.add('twin-fading');
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function () {
          tick(true);
          overlay.classList.remove('twin-fading');
        }, 300);
      });
      /* 问AI：经统一 AI 通道（含知识库沉淀），不绕过 */
      listEl.addEventListener('click', function (e) {
        /* V7.2 3D 查看器入口（V7.2-beta：与圆点点击共用 open3DForRow） */
        var b3 = e.target.closest('.twin-3d');
        if (b3) {
          var r3 = rows[+b3.getAttribute('data-i')];
          if (r3) open3DForRow(r3, b3);
          return;
        }
        var btn = e.target.closest('.twin-askai');
        if (!btn) return;
        var r = rows[+btn.getAttribute('data-i')];
        if (!r) return;
        var prefix = demo ? '（模拟时刻 ' + fmtTime(virtualT) + '）' : '';
        var q = r.sp.name + '当前人数约 ' + r.last.n + ' 人，拥挤度 ' + Math.round(r.last.p * 100) + '%（' + LEVEL_TXT[r.last.level] + '）' +
          prefix + '，现在去合适吗？有什么建议？';
        close();
        window.switchView('search');
        setTimeout(function () { if (window.__runSearchByVal) window.__runSearchByVal(q); }, 120);
      });
    }
    function pickSpots() {
      return (window.spots || []).filter(function (s) {
        var t = s.type || '', n = s.name || '', tags = (s.tags || []).join('');
        return t === '食堂' || /图书馆|图文/.test(n) || /快递/.test(n + tags) || t === '医疗' || t === '体育' || t === '场馆';
      }).slice(0, 14);
    }
    function quadrant(sp) {
      var campus = sp.campus === '麦庐园' ? '麦庐' : '蛟桥';
      var area = sp.area === '北区' ? '北' : '南';
      return campus + area;
    }
    var CELLS = { '蛟桥北': [20, 20], '蛟桥南': [20, 290], '麦庐北': [390, 20], '麦庐南': [390, 290] };
    function buildList(spots) {
      listEl.innerHTML = spots.map(function (sp, i) {
        return '<div class="twin-row" data-i="' + i + '">' +
          '<div class="twin-row-head"><b>' + esc(sp.name) + '</b><span class="twin-kind">' + esc(sp.type || '') + '</span></div>' +
          '<div class="twin-nums"><span class="twin-n" id="twinN' + i + '">--</span>' +
          '<div class="twin-bar"><i id="twinBar' + i + '"></i></div></div>' +
          '<div class="twin-advice" id="twinAdv' + i + '" hidden></div>' +
          '<div class="twin-btns"><button class="twin-askai" data-i="' + i + '">问AI</button>' +
          '<button class="twin-3d off" data-i="' + i + '" title="当前设备不支持 3D 查看">3D</button></div></div>';
      }).join('');
      rows = spots.map(function (sp, i) {
        return { sp: sp, nEl: document.getElementById('twinN' + i), barEl: document.getElementById('twinBar' + i), advEl: document.getElementById('twinAdv' + i), btn3d: document.getElementById('twin3d' + i), dotEl: null, last: { n: 0, p: 0, level: 'green' } };
      });
      rows.forEach(function (r, i) { r.btn3d = listEl.querySelector('.twin-3d[data-i="' + i + '"]'); });
      apply3dAvail();
    }
    /* V7.2 3D 模型类别映射（与状态引擎 kindOf 解耦：状态曲线不变，仅决定建模函数） */
    function modelKindOf(sp) {
      var t = sp.type || '', n = sp.name || '', tags = (sp.tags || []).join('');
      if (t === '食堂') return 'canteen';
      if (/图书馆|图文/.test(n)) return 'library';
      if (/快递/.test(n + tags)) return 'express';
      if (t === '医疗') return 'hospital';
      if (t === '体育' || t === '场馆' || /运动场|操场|球馆/.test(n)) return 'stadium';
      return 'fallback';
    }
    /* V7.2 3D 查看器可用性：由 js/twin3d.js 模块加载后回调开启 */
    function apply3dAvail() {
      var avail = !!(window.Twin3D && window.Twin3D.available());
      rows.forEach(function (r) {
        if (!r.btn3d) return;
        r.btn3d.classList.toggle('off', !avail);
        r.btn3d.title = avail ? '3D 查看' : '当前设备不支持 3D 查看';
      });
    }
    window.__setTwin3dAvail = apply3dAvail;
    function buildSvg(spots) {
      var GRID = cssVar('--twin-grid') || '#E5DFD5', AREA = cssVar('--twin-area') || '#F5F1E8', TXT = cssVar('--text-primary') || '#2B2B33';
      var html = '';
      Object.keys(CELLS).forEach(function (q) {
        var c = CELLS[q];
        html += '<rect x="' + c[0] + '" y="' + c[1] + '" width="350" height="250" rx="14" fill="' + AREA + '" stroke="' + GRID + '" stroke-width="1.5"/>' +
          '<text x="' + (c[0] + 16) + '" y="' + (c[1] + 28) + '" font-size="15" font-weight="700" fill="' + TXT + '">' + q + '</text>';
      });
      /* 每片区按坐标相对位置布点；V7.1：外圈呼吸光晕 + 标签类名 + 扩散点亮延迟 */
      var spawnIdx = 0;
      Object.keys(CELLS).forEach(function (q) {
        var group = spots.filter(function (s) { return quadrant(s) === q; });
        if (!group.length) return;
        var c = CELLS[q];
        var lons = group.map(function (s) { return s.lng; }), lats = group.map(function (s) { return s.lat; });
        var minX = Math.min.apply(null, lons), maxX = Math.max.apply(null, lons);
        var minY = Math.min.apply(null, lats), maxY = Math.max.apply(null, lats);
        group.forEach(function (s) {
          var x = c[0] + 40 + (maxX > minX ? (s.lng - minX) / (maxX - minX) : 0.5) * 270;
          var y = c[1] + 60 + (maxY > minY ? (maxY - s.lat) / (maxY - minY) : 0.5) * 165;
          var delay = ' style="animation-delay:' + (spawnIdx * 36) + 'ms"';
          html += '<circle class="twin-halo" data-sid="' + s.id + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="15" fill="transparent"' + delay + '/>' +
            '<circle class="twin-dot" data-sid="' + s.id + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7"' + delay + '/>' +
            '<text class="twin-label" data-sid="' + s.id + '" x="' + x.toFixed(1) + '" y="' + (y + 20).toFixed(1) + '" font-size="10" text-anchor="middle" fill="' + TXT + '"' + delay + '>' + esc(s.name.slice(0, 6)) + '</text>';
          spawnIdx++;
        });
      });
      svg.innerHTML = html;
      rows.forEach(function (r) {
        r.dotEl = svg.querySelector('.twin-dot[data-sid="' + r.sp.id + '"]');
        r.haloEl = svg.querySelector('.twin-halo[data-sid="' + r.sp.id + '"]');
      });
    }
    function tick(force) {
      if (!openFlag) return;
      var date = new Date();
      if (demo) { virtualT = (virtualT + 10) % (24 * 60); }  /* 600×：1 秒 = 10 分钟 */
      var t = nowVirtual() / 60, timeTxt = fmtTime(nowVirtual());
      clockEl.textContent = demo ? '模拟时刻 ' + timeTxt + ' · 600×' : ('实时 ' + timeTxt);
      clockEl.classList.toggle('demo', demo);
      rows.forEach(function (r) {
        var st = statusOf(r.sp, date, t);
        r.last = st;
        /* V7.2 正式版：状态同步事件接口（3D 查看器等消费方监听 twin:status-update） */
        try { window.dispatchEvent(new CustomEvent('twin:status-update', { detail: { id: r.sp.id, crowdLevel: st.level, color: levelColor(st.level) } })); } catch (e) {}
        var prefix = demo ? '（模拟时刻 ' + timeTxt + '）' : '';
        if (tier > 0) {
          /* V7.1 预测态：按所选档位（+30/+60）差分推断；圆点半透明区分 */
          var pd = predictOf(r.sp, date, t, tier / 60);
          var curPct = Math.round(st.p * 100), predPct = Math.round(pd.p * 100);
          r.nEl.textContent = prefix + ' ' + st.n + ' 人 · ' + curPct + '% → 预计 ' + predPct + '%';
          r.nEl.style.color = levelColor(pd.level);
          r.barEl.style.width = predPct + '%';
          r.barEl.style.background = levelColor(pd.level);
          if (r.advEl) {
            r.advEl.hidden = false;
            r.advEl.textContent = '建议：' + (pd.closed ? '已闭馆（模拟预测）' : adviceOf(pd.p));
            r.advEl.className = 'twin-advice ' + pd.level;
          }
          if (r.dotEl) { r.dotEl.style.fill = levelColor(pd.level); r.dotEl.style.color = levelColor(pd.level); r.dotEl.style.opacity = '0.45'; }
          if (r.haloEl) { r.haloEl.style.fill = levelColor(pd.level); r.haloEl.style.opacity = ''; }
        } else {
          r.nEl.textContent = prefix + ' ' + st.n + ' 人 · ' + Math.round(st.p * 100) + '%';
          r.nEl.style.color = levelColor(st.level);
          r.barEl.style.width = Math.round(st.p * 100) + '%';
          r.barEl.style.background = levelColor(st.level);
          if (r.advEl) r.advEl.hidden = true;
          if (r.dotEl) { r.dotEl.style.fill = levelColor(st.level); r.dotEl.style.color = levelColor(st.level); r.dotEl.style.opacity = '1'; }
          if (r.haloEl) { r.haloEl.style.fill = levelColor(st.level); r.haloEl.style.opacity = ''; }
        }
      });
      updateMiniDots();   /* V7.2-beta：小地图圆点颜色零重建同步 */
    }
    function startTimer() { stopTimer(); timer = setInterval(tick, demo ? 1000 : 30000); }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

    /* ================= V7.2-beta 校区卡片小地图（核心改动） =================
       懒加载 + 实例复用红线：IntersectionObserver 进入视口才初始化；同时最多存活 2 个实例；
       滚出视口 60s 销毁；关闭孪生全部销毁。深色样式强制 dark（产品决策，不走高德 Key 预检：
       Key 不支持 dark 时整体降级为 Canvas 圆点模式并 console.warn）。 */
    /* V7.2-beta 统一 3D 入口（Twin IIFE 级，供列表按钮/Canvas 圆点/小地图 Marker 三处调用）：
       fallback 类型原地提示，其余与列表按钮等效打开查看器 */
    function open3DForRow(r, anchorEl) {
      var kind = modelKindOf(r.sp);
      if (kind === 'fallback') { show3dTip(anchorEl); return; }
      if (!window.Twin3D || !window.Twin3D.available()) {
        if (window.__toast) window.__toast('当前设备不支持 3D 查看');
        return;
      }
      window.Twin3D.open({
        name: r.sp.name, type: r.sp.type || '', kind: kind, id: r.sp.id,
        getState: function () { return r.last; },         /* 复用状态引擎引用，实时同步，不新增定时器 */
        demoPrefix: demo ? '（模拟时刻 ' + fmtTime(virtualT) + '）' : ''
      });
    }
    /* 无 3D 模型点位：锚点旁浮动提示 1.5s 自动消失，不改变圆点颜色 */
    function show3dTip(anchorEl) {
      var tip = document.createElement('div');
      tip.className = 'twin-3d-tip';
      tip.textContent = '该点位暂无3D模型';
      document.body.appendChild(tip);
      var rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
      var x = Math.min(Math.max(8, rect.left + rect.width / 2 - tip.offsetWidth / 2), innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + 'px';
      tip.style.top = Math.max(8, rect.top - tip.offsetHeight - 10) + 'px';
      setTimeout(function () { tip.classList.add('fade'); }, 1200);
      setTimeout(function () { tip.remove(); }, 1550);
    }
    function canUseMiniMaps() {
      if (typeof AMap === 'undefined') { console.warn('[twin-mini] AMap 未加载，校区卡片降级为 Canvas 圆点模式'); return false; }
      try {
        if (localStorage.getItem('zxsj66_dark_ok') !== '1') {
          console.warn('[twin-mini] 当前 Key 不支持深色自定义样式，校区卡片降级为 Canvas 圆点模式');
          return false;
        }
      } catch (e) {}
      return true;
    }
    function setupCards() {
      if (!cardsEl) cardsEl = document.getElementById('twinCards');
      if (!cardsEl) return;
      cardsEl.hidden = false;
      svg.hidden = true;
      destroyMiniMaps(true);
      /* 文档捕获阶段委托：高德 Marker 内部事件层不保证触发 DOM 监听器，此处做确定性兜底入口 */
      if (!miniDocBound) {
        miniDocBound = true;
        document.addEventListener('click', function (ev) {
          var t = ev.target && ev.target.closest ? ev.target.closest('.tmini') : null;
          if (!t) return;
          for (var i = 0; i < miniRegistry.length; i++) {
            var cs = miniRegistry[i];
            if (cs.dead) continue;
            for (var j = 0; j < cs.refs.length; j++) {
              if (cs.refs[j].dotEl.parentNode === t) {
                ev.stopPropagation();
                open3DForRow(cs.refs[j].row, cs.refs[j].dotEl);
                return;
              }
            }
          }
        }, true);
      }
      cardIO = new IntersectionObserver(function (entries) {
        /* 先统一刷新本批次的可见标记，再决策：桌面四卡同屏时全部在视口 → 放开到 4 张
           （静态小地图、无交互，资源可控）；存在滚动离屏卡片时仍执行 ≤2 回收红线 */
        entries.forEach(function (en) { en.target._inView = !!en.isIntersecting; });
        var cards = cardsEl.children, allInView = true;
        for (var k = 0; k < cards.length; k++) { if (!cards[k]._inView) { allInView = false; break; } }
        var maxLive = allInView ? 4 : 2;
        entries.forEach(function (en) {
          var card = en.target, cs = card._cs;
          if (en.isIntersecting) {
            if (cs && cs.dead) cs = card._cs = null;
            if (!cs) {
              var live = miniRegistry.filter(function (x) { return !x.dead; });
              if (live.length >= maxLive) {
                var victim = live.filter(function (x) { return !x.card._inView; })[0];
                if (victim) destroyCardMap(victim); else { card.classList.add('no-map'); return; }
              }
              initMiniMap(card);
            } else if (cs.hideTimer) { clearTimeout(cs.hideTimer); cs.hideTimer = null; }
          } else if (cs && !cs.dead && !cs.hideTimer) {
            cs.hideTimer = setTimeout(function () { destroyCardMap(cs); }, 60000);
          }
        });
      }, { threshold: 0.15 });
      Array.prototype.forEach.call(cardsEl.children, function (card) { cardIO.observe(card); });
    }
    function initMiniMap(card) {
      var q = card.getAttribute('data-q');
      var cfg = (window.TWIN_MINI_MAP || {})[MINI_KEY_MAP[q]];
      var box = card.querySelector('.twin-cardmap');
      if (!cfg || typeof AMap === 'undefined' || !box) return null;
      var map;
      box.style.display = '';   /* 复用容器时恢复显示 */
      try {
        map = new AMap.Map(box, {
          center: cfg.center, zoom: cfg.zoom, viewMode: '2D',
          dragEnable: false, zoomEnable: false, doubleClickZoom: false,
          scrollWheel: false, touchZoom: false, keyboardEnable: false,
          resizeEnable: false, rotateEnable: false, pitchEnable: false,   /* 纯展示，禁用一切交互 */
          mapStyle: 'amap://styles/dark',
          features: LOWEND ? ['bg', 'road'] : ['bg', 'road', 'building']   /* 低端机关楼块；隐藏 POI 文字层 */
        });
      } catch (e) {
        console.warn('[twin-mini] 小地图初始化失败，卡片降级：', q, e);
        return null;
      }
      var cs = { card: card, q: q, map: map, refs: [], dead: false, hideTimer: null };
      rows.filter(function (r) { return quadrant(r.sp) === q; }).forEach(function (r) {
        var dot = document.createElement('div');
        dot.className = 'tmini';
        dot.innerHTML = '<i class="tmini-dot"></i><span class="tmini-label">' + esc(r.sp.name.slice(0, 6)) + '</span>';
        var dotEl = dot.querySelector('.tmini-dot');
        var mk = new AMap.Marker({
          content: dot, position: [r.sp.lng, r.sp.lat],
          offset: new AMap.Pixel(-7, -7), map: map, zIndex: 120   /* 自有 DivIcon 是唯一信息层 */
        });
        /* DOM 直绑 click（确定性入口）：stopPropagation 防冒泡到卡片级；click 而非 touchstart 防误触 */
        dot.addEventListener('click', function (ev) {
          ev.stopPropagation();
          open3DForRow(r, dotEl);
        });
        cs.refs.push({ row: r, dotEl: dotEl });       /* 保存圆点 DOM 引用，刷新时直改颜色，零重建 */
      });
      miniRegistry.push(cs);
      card._cs = cs;
      card.classList.remove('no-map');
      return cs;
    }
    function destroyCardMap(cs) {
      if (!cs || cs.dead) return;
      cs.dead = true;
      if (cs.hideTimer) { clearTimeout(cs.hideTimer); cs.hideTimer = null; }
      cs.refs = [];                                    /* 从状态刷新列表注销该卡所有 Marker */
      try { cs.map.destroy(); } catch (e) {}
      var box = cs.card.querySelector('.twin-cardmap');
      if (box) { box.innerHTML = ''; box.style.display = 'none'; }   /* 销毁后回到深色蒙版占位 */
      cs.card.classList.add('no-map');
      cs.card._cs = null;
      var i = miniRegistry.indexOf(cs);
      if (i !== -1) miniRegistry.splice(i, 1);
    }
    function destroyMiniMaps(keepIO) {
      miniRegistry.slice().forEach(destroyCardMap);
      if (!keepIO && cardIO) { cardIO.disconnect(); cardIO = null; }
    }
    /* 状态引擎每次刷新：直改各存活小地图圆点颜色（DOM 零变动，CSS 呼吸动画不中断、无闪烁） */
    function updateMiniDots() {
      for (var i = 0; i < miniRegistry.length; i++) {
        var cs = miniRegistry[i];
        if (cs.dead) continue;                         /* 防御：已销毁实例跳过 */
        for (var j = 0; j < cs.refs.length; j++) {
          var ref = cs.refs[j], c = levelColor(ref.row.last.level);
          ref.dotEl.style.color = c;
          ref.dotEl.style.background = 'radial-gradient(circle, ' + c + ' 0%, ' + c + '66 45%, transparent 72%)';
        }
      }
    }
    function open() {
      if (!overlay) buildDom();
      if (!rows.length) {
        var spots = pickSpots();
        buildList(spots);
      }
      apply3dAvail();   /* V7.2 3D 按钮可用性刷新（模块可能晚于首次构建加载完成） */
      document.body.classList.add('twin-open');   /* V7.2-beta 隐藏高德原生控件 */
      overlay.hidden = false;
      openFlag = true;
      /* V7.2-beta：校区卡片优先内嵌高德小地图；不支持则降级 Canvas 圆点（SVG） */
      if (canUseMiniMaps()) {
        setupCards();
      } else {
        if (cardsEl) cardsEl.hidden = true;
        svg.hidden = false;
        if (!svgBuilt) { buildSvg((window.spots || []).filter(function (s) { return rows.some(function (r) { return r.sp === s; }); })); svgBuilt = true; }
        /* V7.1 扩散点亮动画：每次进入播一次（reduced-motion 下 CSS 已全局关闭） */
        svg.classList.remove('twin-spawn');
        void svg.getBoundingClientRect();
        svg.classList.add('twin-spawn');
      }
      tick(true);
      startTimer();
    }
    function close() {
      openFlag = false;
      stopTimer();
      destroyMiniMaps(false);                        /* 关闭孪生：销毁全部小地图实例 */
      if (cardsEl) cardsEl.hidden = true;
      document.body.classList.remove('twin-open');   /* V7.2-beta 恢复高德原生控件 */
      if (overlay) overlay.hidden = true;
      if (svg) svg.classList.remove('twin-spawn');
    }
    window.__twinPauseForOverlay = function () { if (openFlag) { pausedByOverlay = true; overlay.hidden = true; } };
    window.__twinResumeFromOverlay = function () { if (pausedByOverlay) { pausedByOverlay = false; overlay.hidden = false; } };
    return { open: open, close: close, isOpen: function () { return openFlag; } };
  })();
  window.TwinModule = Twin;
  /* 生命周期：离开地图视图自动关闭孪生并暂停引擎；返回不自动恢复 */
  (function wrapSwitch() {
    var _sv = window.switchView;
    window.switchView = function (v) {
      if (v !== 'map' && Twin.isOpen()) Twin.close();
      _sv(v);
    };
  })();
  /* 启动段早于本 IIFE 执行，问卷初始化在此补调 */
  window.__initSurvey();
  /* 数字孪生入口按钮：初始化即注入图层面板（勿等 open 才创建） */
  (function injectTwinEntry() {
    var layers = document.querySelector('.map-layers');
    if (!layers || document.getElementById('twinEntry')) return;
    layers.insertAdjacentHTML('beforeend', '<button id="twinEntry" class="twin-entry">🛰️ 数字孪生</button>');
    document.getElementById('twinEntry').addEventListener('click', Twin.open);
  })();
  /* 深色预检通过：地图初始化完成后套用高德深色瓦片 */
  (function darkMapWrap() {
    if (!window.__darkOk || !window.MapModule) return;
    var _enter = window.MapModule.enter;
    window.MapModule.enter = function () {
      _enter();
      setTimeout(function () { window.MapModule.setDark(); }, 500);
    };
  })();
})();
