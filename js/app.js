/* ============================================================
   智学江畔——交互逻辑
   依赖 js/data.js 中定义的 KB / KB_FALLBACK / PLANS / GPA_ADVICE
   / GRADE_START_INDEX / hourAdvice
   包含：单页导航、数字滚动、规划规则引擎、聊天问答（打字动画）
   ============================================================ */

/* ================= 一、单页应用导航 ================= */
const navLinks = document.querySelectorAll('.nav-links a');
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navLinks');

/**
 * 切换显示的视图
 * @param {string} id 视图标识：home / planner / courses / about
 */
function showView(id) {
  // 隐藏全部视图，只显示目标视图
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  // 同步导航高亮
  navLinks.forEach(a => a.classList.toggle('active', a.dataset.view === id));
  // 关闭移动端菜单
  navMenu.classList.remove('open');
  // 回到页面顶部
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 导航链接点击
navLinks.forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    showView(a.dataset.view);
  });
});

// 首页按钮 / 功能卡片跳转（data-goto 指定视图，data-tab 可指定课程中心的子标签）
document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', () => {
    showView(el.dataset.goto);
    if (el.dataset.tab) switchTab(el.dataset.tab);
  });
});

// 移动端汉堡菜单
navToggle.addEventListener('click', () => navMenu.classList.toggle('open'));

/* ================= 二、首页数据统计条（数字滚动） ================= */
function animateStats() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = +el.dataset.target;
    const suffix = el.dataset.suffix || '';
    const duration = 1200;          // 动画总时长（毫秒）
    const start = performance.now();
    function step(now) {
      const ratio = Math.min((now - start) / duration, 1);
      el.textContent = Math.round(target * ratio) + suffix;
      if (ratio < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
animateStats();

/* ================= 三、AI 学习规划助手 ================= */
/* 表单状态：记录三个选项组的选中值 */
const formState = { grade: null, goal: null, gpa: null };
const hoursInput = document.getElementById('hoursInput');
const formError = document.getElementById('formError');
const planResult = document.getElementById('planResult');

/* 为每个选项组绑定"单选"行为 */
[['groupGrade', 'grade'], ['groupGoal', 'goal'], ['groupGpa', 'gpa']].forEach(([groupId, key]) => {
  const group = document.getElementById(groupId);
  group.querySelectorAll('.option').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      formState[key] = btn.dataset.value;
      formError.hidden = true;
    });
  });
});

/* 提交表单：校验 -> 规则引擎生成 -> 渲染时间线 */
document.getElementById('planForm').addEventListener('submit', e => {
  e.preventDefault();
  const hours = parseInt(hoursInput.value, 10);
  // 校验四项是否齐全
  if (!formState.grade || !formState.goal || !formState.gpa || !hours || hours < 1 || hours > 80) {
    formError.hidden = false;
    return;
  }
  renderPlan(formState.grade, formState.goal, formState.gpa, hours);
});

/**
 * 规划规则引擎：根据用户画像组装个性化规划
 * @param {string} grade 年级
 * @param {string} goal 目标键（baoyan/kaoyan/chuguo/jiuye）
 * @param {string} gpa GPA 档位
 * @param {number} hours 每周学习小时数
 */
function renderPlan(grade, goal, gpa, hours) {
  const plan = PLANS[goal];
  // 只保留"当前学期及之后"的时间线
  const startIndex = GRADE_START_INDEX[grade];
  const semesters = plan.semesters.slice(startIndex);

  const goalLabel = plan.name;
  const today = new Date().toLocaleDateString('zh-CN');

  // 组装 HTML
  let html = '';

  /* 卡片 1：用户画像 */
  html += `
    <div class="card profile-card">
      <div class="profile-tags">
        <span class="profile-tag">${grade}</span>
        <span class="profile-tag">目标：${goalLabel}</span>
        <span class="profile-tag">GPA ${gpa}</span>
        <span class="profile-tag">每周 ${hours} 小时</span>
      </div>
      <h3>你的专属「${goalLabel}」成长路线</h3>
      <p>共 ${semesters.length} 个学期 · 生成时间：${today}</p>
    </div>`;

  /* 卡片 2：GPA 诊断 */
  const advice = GPA_ADVICE[gpa];
  html += `
    <div class="card tl-card" style="margin-bottom:20px;">
      <span class="tl-term">个性化诊断</span>
      <h4>${advice.title}</h4>
      <p style="font-size:14.5px;color:var(--muted);">${advice.text}</p>
    </div>`;

  /* 卡片 3-N：按学期排列的时间线 */
  html += '<div class="timeline">';
  semesters.forEach(s => {
    html += `
      <div class="tl-item">
        <div class="card tl-card">
          <span class="tl-term">${s.term}</span>
          <h4>${s.title}</h4>
          <ul>${s.tasks.map(t => `<li>${t}</li>`).join('')}</ul>
        </div>
      </div>`;
  });
  html += '</div>';

  /* 卡片末：每周时间节奏建议 */
  const ha = hourAdvice(hours);
  html += `
    <div class="card tl-card">
      <span class="tl-term">执行建议</span>
      <h4>${ha.title}</h4>
      <p style="font-size:14.5px;color:var(--muted);">${ha.text}</p>
    </div>`;

  /* 底部：重新生成按钮 + 政策说明 */
  html += `
    <div class="plan-actions">
      <button class="btn btn-primary" id="planAgain">重新生成</button>
      <button class="btn btn-ghost" id="planBackTop">返回表单修改条件</button>
    </div>
    <p class="plan-note">本规划基于江财推免政策（2024修订版）生成，仅供学习参考，请以学校官方文件为准。</p>`;

  planResult.innerHTML = html;
  planResult.hidden = false;

  /* 绑定结果区按钮 */
  document.getElementById('planAgain').addEventListener('click', () => {
    // 直接按当前条件重新生成（重跑引擎的效果）
    renderPlan(formState.grade, formState.goal, formState.gpa, hours);
    planResult.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('planBackTop').addEventListener('click', () => {
    document.getElementById('planForm').scrollIntoView({ behavior: 'smooth' });
  });

  // 展示结果并定位
  planResult.scrollIntoView({ behavior: 'smooth' });
}

/* ================= 四、课程中心：子标签页 ================= */
const tabs = document.querySelectorAll('.tab');
function switchTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
}
tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

/* ================= 五、课程智能问答（聊天） ================= */
const chatBody = document.getElementById('chatBody');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const chatChips = document.getElementById('chatChips');
let aiTyping = false;   // AI 回复中标志，防止消息插队

/* 快捷提问按钮 */
const QUICK_QUESTIONS = ['高数怎么学', '保研需要什么条件', '四六级什么时候报名', '考研怎么准备'];
QUICK_QUESTIONS.forEach(q => {
  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.textContent = q;
  chip.addEventListener('click', () => { chatInput.value = q; sendMessage(); });
  chatChips.appendChild(chip);
});

/* 追加一条消息到聊天窗口 */
function addMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = 'msg ' + role;
  msg.innerHTML = `
    <div class="msg-avatar">${role === 'ai' ? '智' : '我'}</div>
    <div class="bubble">${text}</div>`;
  chatBody.appendChild(msg);
  chatBody.scrollTop = chatBody.scrollHeight;
  return msg.querySelector('.bubble');
}

/**
 * 知识库关键词匹配
 * 评分规则：命中关键词数最多者胜出；得分为 0 返回 null（走兜底话术）
 */
function matchKB(input) {
  const text = input.toLowerCase();
  let best = null, bestScore = 0;
  for (const item of KB) {
    let score = 0;
    for (const kw of item.keywords) {
      if (text.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return best;
}

/* 发送消息主流程 */
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || aiTyping) return;

  // 1. 显示用户气泡
  addMessage('user', text);
  chatInput.value = '';
  aiTyping = true;

  // 2. 规则引擎查找答案
  const hit = matchKB(text);
  const answer = hit ? hit.answer : KB_FALLBACK;

  // 3. 延迟 400ms 后先展示"正在输入"占位，再逐字打出回答（打字动画）
  setTimeout(() => {
    const bubble = addMessage('ai', '');
    bubble.classList.add('typing');
    let i = 0;
    const timer = setInterval(() => {
      bubble.textContent = answer.slice(0, ++i);
      chatBody.scrollTop = chatBody.scrollHeight;
      if (i >= answer.length) {
        clearInterval(timer);
        bubble.classList.remove('typing');
        aiTyping = false;
      }
    }, 24);   // 每 24ms 打出一个字符
  }, 400);
}

chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

/* 清空对话：恢复到初始欢迎语 */
document.getElementById('chatClear').addEventListener('click', () => {
  if (aiTyping) return;
  chatBody.innerHTML = '';
  greet();
});

/* 初始欢迎语 */
function greet() {
  addMessage('ai', '同学你好！我是智学江畔 AI 助教，掌握高数、线代、C++ 等课程的学习方法，也熟悉保研、考研、竞赛等规划问题。点击下方快捷提问，或直接输入你的问题～');
}
greet();

/* ============================================================
   增量新增：生活通模块逻辑
   包含：医保问答聊天（复用课程问答同款打字动画交互）、
        校园办事卡片展开/收起、部门指引列表渲染
   视图切换 showView 与子标签切换 switchTab 为通用逻辑，
   导航 data-view="life" 与 .tab[data-tab] 已自动生效，无需改动原有代码。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 1. 医保问答聊天 ---------- */
  var lifeBody = document.getElementById('lifeChatBody');
  var lifeInput = document.getElementById('lifeChatInput');
  var lifeTyping = false;

  /* 关键词匹配（命中数最多者胜出；0 命中返回 null） */
  function matchLifeKB(input) {
    var text = input.toLowerCase();
    var best = null, bestScore = 0;
    for (var i = 0; i < lifeKnowledge.length; i++) {
      var item = lifeKnowledge[i];
      var score = 0;
      for (var j = 0; j < item.keywords.length; j++) {
        if (text.indexOf(item.keywords[j].toLowerCase()) !== -1) score++;
      }
      if (score > bestScore) { bestScore = score; best = item; }
    }
    return best;
  }

  function lifeAddMessage(role, text) {
    var msg = document.createElement('div');
    msg.className = 'msg ' + role;
    msg.innerHTML =
      '<div class="msg-avatar">' + (role === 'ai' ? '医' : '我') + '</div>' +
      '<div class="bubble">' + text + '</div>';
    lifeBody.appendChild(msg);
    lifeBody.scrollTop = lifeBody.scrollHeight;
    return msg.querySelector('.bubble');
  }

  function lifeSend() {
    var text = lifeInput.value.trim();
    if (!text || lifeTyping) return;
    lifeAddMessage('user', text);
    lifeInput.value = '';
    lifeTyping = true;

    var hit = matchLifeKB(text);
    var answer = hit ? hit.answer : lifeFallback;

    setTimeout(function () {
      var bubble = lifeAddMessage('ai', '');
      bubble.classList.add('typing');
      var i = 0;
      var timer = setInterval(function () {
        bubble.textContent = answer.slice(0, ++i);
        lifeBody.scrollTop = lifeBody.scrollHeight;
        if (i >= answer.length) {
          clearInterval(timer);
          bubble.classList.remove('typing');
          lifeTyping = false;
        }
      }, 18);
    }, 400);
  }

  document.getElementById('lifeChatSend').addEventListener('click', lifeSend);
  lifeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') lifeSend(); });
  document.getElementById('lifeChatClear').addEventListener('click', function () {
    if (lifeTyping) return;
    lifeBody.innerHTML = '';
    lifeGreet();
  });

  function lifeGreet() {
    lifeAddMessage('ai', '你好，我是江财医保助手～\n知识库整理自校医保办历年正式文件（2009-2020）。\n不同年份政策有变化的，我会并列说明并标注【需人工核实时效】。\n可以问我：异地住院怎么报销、门诊需要什么材料、医保卡丢了怎么办、意外事故怎么认定。');
  }

  /* 快捷提问 chips */
  lifeChips.forEach(function (q) {
    var chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = q;
    chip.addEventListener('click', function () { lifeInput.value = q; lifeSend(); });
    document.getElementById('lifeChatChips').appendChild(chip);
  });
  lifeGreet();

  /* ---------- 2. 校园办事卡片：点击展开/收起 ---------- */
  document.querySelectorAll('.life-card').forEach(function (card) {
    card.addEventListener('click', function () {
      card.classList.toggle('open');
    });
  });

  /* ---------- 3. 部门指引列表渲染 ---------- */
  var deptList = document.getElementById('deptList');
  deptList.innerHTML = deptInfo.map(function (d, i) {
    var tagClass = i % 2 === 0 ? '' : ' blue';
    var tagText = d.name.indexOf('南昌') !== -1 ? '市级部门' : (d.name.indexOf('待补充') !== -1 ? '待补充' : '校内部门');
    return '' +
      '<div class="card dept-item">' +
        '<div class="dept-item-head"><h4>' + d.name + '</h4><span class="dept-tag' + tagClass + '">' + tagText + '</span></div>' +
        '<div class="dept-rows">' +
          '<div class="dept-row"><span class="dept-label">办公地点</span><span class="dept-value">' + d.place + '</span></div>' +
          '<div class="dept-row"><span class="dept-label">咨询电话</span><span class="dept-value">' + d.phone + '</span></div>' +
          '<div class="dept-row" style="grid-column:1/-1;"><span class="dept-label">主要职能</span><span class="dept-value">' + d.duty + '</span></div>' +
        '</div>' +
      '</div>';
  }).join('');
})();

/* ============================================================
   增量新增：学情分析引擎逻辑
   流程：录入周数据 -> 规则引擎评分 -> 渲染结果 + 近4周柱状图
        -> 联动AI规划助手（自动回填建议学习小时数）
   视图切换（showView）与子标签切换（switchTab）复用现有通用逻辑，
   首页卡片 data-goto="courses" data-tab="analytics" 已自动生效。
   ============================================================ */
(function () {
  'use strict';

  var anaForm = document.getElementById('anaForm');
  if (!anaForm) return;   // 页面无此模块时静默退出

  var anaHours = document.getElementById('anaHours');
  var anaCourses = document.getElementById('anaCourses');
  var anaAccuracy = document.getElementById('anaAccuracy');
  var anaConfused = document.getElementById('anaConfused');
  var anaError = document.getElementById('anaError');
  var anaResult = document.getElementById('anaResult');

  /* 提交：校验 -> 评分 -> 渲染 */
  anaForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var hours = parseFloat(anaHours.value);
    var courses = parseInt(anaCourses.value, 10);
    var acc = parseFloat(anaAccuracy.value);
    if (isNaN(hours) || hours < 0 || hours > 80 ||
        isNaN(courses) || courses < 0 || courses > 30 ||
        isNaN(acc) || acc < 0 || acc > 100) {
      anaError.hidden = false;
      return;
    }
    anaError.hidden = true;
    renderAnalysis(hours, courses, acc, anaConfused.value.trim());
    anaResult.scrollIntoView({ behavior: 'smooth' });
  });

  /* 规则引擎：计算投入度 / 效率 / 薄弱科目 / 建议 */
  function evaluate(hours, courses, acc, confused) {
    // 投入度评分（小时占60%权重、课程数占40%，映射到0-100）
    var effortScore = Math.min(100, Math.round(hours / 20 * 60 + courses / 6 * 40));
    var effort = effortScore >= 70 ? 'high' : (effortScore >= 40 ? 'mid' : 'low');
    var effortLabel = { high: '高', mid: '中', low: '低' }[effort];

    // 效率评估
    var eff = acc >= 85 ? 'excellent' : (acc >= 60 ? 'good' : 'poor');
    var effLabel = { excellent: '优秀', good: '良好', poor: '待提升' }[eff];

    // 薄弱科目提取（按关键词匹配）
    var weakSubjects = [];
    var lower = confused.toLowerCase();
    analyticsData.subjectKeywords.forEach(function (s) {
      for (var i = 0; i < s.keys.length; i++) {
        if (lower.indexOf(s.keys[i].toLowerCase()) !== -1) { weakSubjects.push(s); break; }
      }
    });

    // 下周建议（3条：投入1条 + 效率1条 + 科目/通用1条）
    var weekNo = analyticsData.weeklyInputs.length;
    var picks = [
      analyticsData.suggestions[effort + 'Effort'][weekNo % analyticsData.suggestions[effort + 'Effort'].length],
      analyticsData.efficiencySuggestions[eff][weekNo % analyticsData.efficiencySuggestions[eff].length]
    ];
    if (weakSubjects.length) {
      picks.push('针对【' + weakSubjects.map(function (s) { return s.name; }).join('、') + '】：' + weakSubjects[0].advice);
    } else if (confused) {
      picks.push('困惑点未匹配到内置科目库，建议先定位到具体课程章节，再套用对应学习方法');
    } else if (eff === 'poor') {
      picks.push('本周未填写困惑点：建议周日做一次限时自测，找出正确率低的章节重点攻克');
    } else {
      picks.push('本周无明确困惑点：建议做一次全面复盘，把本周所学用思维导图串一遍');
    }

    // 给规划助手的小时数建议
    var suggestedHours = hours;
    if (effort === 'low') suggestedHours = hours + 5;
    else if (effort === 'mid') suggestedHours = hours + 2;
    if (eff === 'poor') suggestedHours += 1;
    suggestedHours = Math.max(1, Math.min(80, Math.round(suggestedHours)));

    return { effortScore: effortScore, effort: effort, effortLabel: effortLabel, eff: eff, effLabel: effLabel, weakSubjects: weakSubjects, picks: picks, suggestedHours: suggestedHours };
  }

  /* 渲染结果 + 趋势图 + 联动按钮 */
  function renderAnalysis(hours, courses, acc, confused) {
    var r = evaluate(hours, courses, acc, confused);

    // 记录本周数据（保留最近 maxKeep 周）
    analyticsData.weeklyInputs.push({ label: '第' + (analyticsData.weeklyInputs.length + 1) + '周', hours: hours, courses: courses, accuracy: acc });
    if (analyticsData.weeklyInputs.length > analyticsData.maxKeep) analyticsData.weeklyInputs.shift();

    // 近4周柱状图
    var weeks = analyticsData.weeklyInputs.slice(-4);
    var maxH = Math.max.apply(null, weeks.map(function (w) { return w.hours; }).concat([analyticsData.weeklyGoalHours]));
    var barsHtml = weeks.map(function (w, i) {
      var isCurrent = i === weeks.length - 1;
      var h = Math.max(4, Math.round(w.hours / maxH * 130));
      return '' +
        '<div class="ana-bar-group">' +
          '<div class="ana-bar-value">' + w.hours + 'h</div>' +
          '<div class="ana-bar' + (isCurrent ? ' current' : '') + '" style="height:' + h + 'px"></div>' +
          '<div class="ana-bar-label">' + w.label + (isCurrent ? '（本周）' : '') + '</div>' +
        '</div>';
    }).join('');

    var goalPercent = Math.min(100, Math.round(hours / analyticsData.weeklyGoalHours * 100));

    // 薄弱点展示
    var weakHtml;
    if (r.weakSubjects.length) {
      weakHtml = '<div class="ana-weak-list">' +
        r.weakSubjects.map(function (s) { return '<span class="ana-weak-item">' + s.name + '</span>'; }).join('') +
        '</div>';
    } else if (confused) {
      weakHtml = '<p class="ana-weak-empty">未匹配到内置科目库，你填写的是：“' + confused + '”</p>';
    } else {
      weakHtml = '<p class="ana-weak-empty">本周未填写困惑知识点，建议下周开始记录，分析会更精准。</p>';
    }

    anaResult.innerHTML = '' +
      /* 评分卡片 */
      '<div class="ana-score-grid">' +
        '<div class="card ana-score-card">' +
          '<div class="ana-score-label">学习投入度</div>' +
          '<div class="ana-score-value ' + (r.effort === 'high' ? 'ana-level-high' : r.effort === 'mid' ? 'ana-level-mid' : 'ana-level-low') + '">' + r.effortLabel + '</div>' +
          '<div class="ana-score-sub">综合评分 ' + r.effortScore + ' 分（' + hours + ' 小时 / ' + courses + ' 门课）</div>' +
        '</div>' +
        '<div class="card ana-score-card">' +
          '<div class="ana-score-label">学习效率评估</div>' +
          '<div class="ana-score-value ' + (r.eff === 'excellent' ? 'ana-level-high' : r.eff === 'good' ? 'ana-level-mid' : 'ana-level-low') + '">' + r.effLabel + '</div>' +
          '<div class="ana-score-sub">自测正确率 ' + acc + '%</div>' +
        '</div>' +
        '<div class="card ana-score-card">' +
          '<div class="ana-score-label">知识薄弱点</div>' +
          '<div class="ana-score-value" style="font-size:18px">' + (r.weakSubjects.length ? r.weakSubjects.length + ' 个科目' : '未识别') + '</div>' +
          '<div class="ana-score-sub">基于困惑知识点提取</div>' +
        '</div>' +
      '</div>' +
      /* 薄弱点明细 */
      '<div class="card ana-detail-card"><h4>知识薄弱点识别</h4>' + weakHtml + '</div>' +
      /* 下周建议 */
      '<div class="card ana-detail-card"><h4>下周学习建议<span class="ana-tag">AI 规则引擎生成</span></h4>' +
        '<ul class="ana-suggest-list">' + r.picks.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>' +
      '</div>' +
      /* 近4周趋势 + 完成度 */
      '<div class="card ana-chart-card"><h4>近 ' + weeks.length + ' 周学习时长趋势</h4>' +
        '<div class="ana-chart">' + barsHtml + '</div>' +
        '<div class="ana-chart-axis"></div>' +
        '<div class="ana-goal">' +
          '<div class="ana-goal-head"><span>本周目标完成度（目标 ' + analyticsData.weeklyGoalHours + ' 小时/周）</span><strong>' + goalPercent + '%</strong></div>' +
          '<div class="ana-progress"><div class="ana-progress-inner" style="width:' + goalPercent + '%"></div></div>' +
        '</div>' +
      '</div>' +
      /* 与AI规划助手联动 */
      '<div class="ana-actions">' +
        '<button class="btn btn-primary" id="anaToPlanner">根据分析结果调整学习规划</button>' +
      '</div>' +
      '<p class="ana-note">将跳转到 AI 学习规划助手，并自动回填建议学习小时数：每周 ' + r.suggestedHours + ' 小时</p>';

    anaResult.hidden = false;

    /* 联动按钮：跳规划助手 + 回填小时数 */
    document.getElementById('anaToPlanner').addEventListener('click', function () {
      showView('planner');
      var hInput = document.getElementById('hoursInput');
      hInput.value = r.suggestedHours;
      document.getElementById('planForm').scrollIntoView({ behavior: 'smooth' });
    });
  }
})();
