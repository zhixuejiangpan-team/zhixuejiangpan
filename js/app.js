/* ============================================================
   智行江畔 V6.6 —— 交互逻辑
   模块：路由 | 敏感解密 | 搜索 | 力导向图谱 | 地图 | 问卷 | 指南 | 我的
   路由为内存态变量，不使用 URL hash（避免与高德锚点机制冲突）
   ============================================================ */
(function () {
  'use strict';

  /* 全局错误探针：渲染到结果区便于诊断 */
  window.addEventListener('error', function (e) {
    var b = document.getElementById('resultList');
    if (b && !b.innerHTML) b.innerHTML = '<p class="empty-tip" style="color:#9E1B32">JS错误：' + esc(String(e.message)) + '（行' + e.lineno + '）</p>';
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

  var TYPE_COLOR = { '食堂': '#E8862E', '商店': '#2C3E6B', '医疗': '#2E7D32', '教学楼': '#7B5EA7', '宿舍': '#8B6F47', '体育': '#2AA0A8', '行政': '#9E1B32', '饭店': '#E8862E' };

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
    a.addEventListener('click', function (e) { e.preventDefault(); switchView(a.getAttribute('data-nav')); });
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

  /* 实时下拉建议 */
  searchInput.addEventListener('input', function () {
    var q = searchInput.value;
    if (!q.trim()) { suggestBox.hidden = true; return; }
    var list = matchQuestions(q).slice(0, 8);
    if (!list.length) { suggestBox.hidden = true; return; }
    suggestBox.innerHTML = list.map(function (item) {
      return '<div class="suggest-item" data-qid="' + item.id + '">' +
        (item.campusScope === 'cross' ? '🔀 ' : '') + esc(item.question) +
        '<span class="suggest-cat">' + esc(item.category) + '</span></div>';
    }).join('');
    suggestBox.hidden = false;
  });
  suggestBox.addEventListener('click', function (e) {
    var it = e.target.closest('.suggest-item');
    if (!it) return;
    searchInput.value = questionOf(it.getAttribute('data-qid'));
    suggestBox.hidden = true;
    runSearch(searchInput.value);
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
      (spotsHtml ? '<div class="detail-spots">相关点位：' + spotsHtml + '</div>' : '');
    detail.hidden = false;
    card.querySelector('.result-count').textContent = '🔥 ' + getCount(qid);
    renderHot(); GraphModule.refreshSizes();
  });

  /* 搜索历史 */
  function getHist() { return load(LS.hist, []); }
  function pushHist(q) {
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

  /* ================= 三、问卷折叠面板（ECharts） ================= */
  var surveyPanel = document.getElementById('surveyPanel');
  var surveyBody = document.getElementById('surveyBody');
  var surveyCharts = [];
  function surveyRestore() {
    var saved = load(LS.survey, null);
    if (!saved) return;
    surveyData.forEach(function (q) {
      var s = saved.find(function (x) { return x.id === q.id; });
      if (s) q.options.forEach(function (op, i) { op.count = s.options[i] ? s.options[i].count : op.count; });
    });
  }
  function surveyRenderCharts() {
    surveyBody.querySelectorAll('.survey-chart').forEach(function (el) { el.innerHTML = ''; });
    surveyCharts.forEach(function (c) { c.dispose(); }); surveyCharts = [];
    surveyData.forEach(function (q) {
      var titleEl = document.getElementById('sqTitle-' + q.id);
      if (titleEl) titleEl.textContent = q.title;
      var el = document.getElementById('chart-' + q.id);
      if (!el || typeof echarts === 'undefined') return;
      var chart = echarts.init(el);
      chart.setOption(q.chart === 'pie' ? {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, textStyle: { fontSize: 11 } },
        series: [{
          type: 'pie', radius: ['32%', '58%'], center: ['50%', '44%'],
          label: { fontSize: 11 },
          data: q.options.map(function (op) { return { name: op.text, value: op.count }; })
        }]
      } : {
        tooltip: {},
        grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
        xAxis: { type: 'category', data: q.options.map(function (op) { return op.text; }), axisLabel: { fontSize: 10, interval: 0 } },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{ type: 'bar', data: q.options.map(function (op) { return op.count; }), itemStyle: { color: '#9E1B32', borderRadius: [4, 4, 0, 0] } }]
      });
      surveyCharts.push(chart);
    });
  }
  document.getElementById('surveyHeader').addEventListener('click', function () {
    var open = surveyPanel.classList.toggle('open');
    document.getElementById('surveyArrow').textContent = open ? '▾' : '▸';
    if (open) setTimeout(surveyRenderCharts, 60);
  });
  document.getElementById('surveyImport').addEventListener('click', function () {
    var ta = document.getElementById('surveyJson');
    try {
      var data = JSON.parse(ta.value);
      if (!Array.isArray(data)) throw new Error('需为数组');
      data.forEach(function (s) {
        var q = surveyData.find(function (x) { return x.id === s.id; });
        if (q && Array.isArray(s.options)) q.options.forEach(function (op, i) {
          if (s.options[i] && typeof s.options[i].count === 'number') op.count = s.options[i].count;
        });
      });
      save(LS.survey, surveyData);
      surveyRenderCharts();
      document.getElementById('surveyMsg').textContent = '导入成功，已写入本地存储。';
    } catch (err) {
      document.getElementById('surveyMsg').textContent = '导入失败：' + err.message;
    }
  });

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
        .attr('fill', function (d) { return d.item.isSensitive ? '#7C7C88' : '#9E1B32'; })
        .attr('stroke', function (d) { return d.item.campusScope === 'cross' ? '#E8862E' : '#fff'; })
        .attr('stroke-width', function (d) { return d.item.campusScope === 'cross' ? 3 : 1.5; })
        .attr('opacity', function (d) { return opacityOf(d.item); });

      nodeG.append('text').text(function (d) { return truncate(d.item.question); })
        .attr('font-size', 10).attr('fill', '#1B2A4A')
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
        .attr('r', 2.5).attr('fill', '#9E1B32').attr('opacity', 0.7);
      mini.append('rect').attr('id', 'miniRect').attr('x', 2).attr('y', 2)
        .attr('width', W * sc).attr('height', H * sc)
        .attr('fill', 'none').attr('stroke', '#C9A227').attr('stroke-width', 1.5);
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
      var color = TYPE_COLOR[sp.type] || '#1B2A4A';
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
      return '<div class="card flow-card">' +
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
    /* 医保指南：在校生（insuranceGuide）+ 毕业生停保专区（insuranceStopGuide） */
    function medCard(m) { return '<div class="card med-card"><h4>Q：' + esc(m.q) + '</h4><p>' + esc(m.a) + '</p></div>'; }
    document.getElementById('guideMedical').innerHTML =
      (window.insuranceGuide || []).map(medCard).join('') +
      '<h3 class="med-stop-title">🎓 毕业生停保专区</h3>' +
      (window.insuranceStopGuide || []).map(medCard).join('');
    /* 指南子标签 */
    document.querySelectorAll('#view-guide .tab').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('#view-guide .tab').forEach(function (x) { x.classList.remove('active'); });
        document.querySelectorAll('#view-guide .tab-panel').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        document.getElementById('tab-' + t.getAttribute('data-tab')).classList.add('active');
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
  document.getElementById('guideEntry').addEventListener('click', function () { switchView('guide'); });

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

  /* 问卷数据导出 */
  document.getElementById('surveyExport').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(surveyData, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'survey-data.json';
    a.click();
    URL.revokeObjectURL(a.href);
    document.getElementById('surveyMsg').textContent = '已导出 survey-data.json';
  });

  /* ================= 启动 ================= */
  surveyRestore();
  renderHist(); renderHot(); renderMineVotes(); renderMineHist();
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
    }
    /* 保持卡片在结果列表顶部 */
    if (resultBox.parentNode && aiCard.nextSibling !== resultBox) {
      resultBox.parentNode.insertBefore(aiCard, resultBox);
    }
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
