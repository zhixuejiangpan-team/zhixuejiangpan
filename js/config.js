/* ============================================================
   智行江畔 V6.6+AI —— 全局配置（外部输入接口集中于此）
   ------------------------------------------------------------
   【高德地图】Key 已由团队申请并填入（Web端JS API）。
     如需更换：将 AMAP_KEY / AMAP_SECURITY_JS_CODE 替换为新值；
     域名白名单填 zhixuejiangpan-team.github.io 主域名（不含子路径）。
     留空时地图视图自动显示申请指引占位层，不白屏不报错。
   【AI】AI_CONFIG.PROXY_URL 已指向线上代理（Cloudflare Pages Function），
     API Key 由服务端机密变量持有，前端无需填写 API_KEY。
     本地调试可改回 'http://localhost:3001/ai' 并 `node server.js`。
   ============================================================ */
window.AMAP_KEY = '68c803d0b796714e0613f165678e3f08';
window.AMAP_SECURITY_JS_CODE = '571063ca0b165cfa6b33557071197d98';
/* V6.9 深色模式：高德自定义样式总开关（false 可全局禁用深色预检） */
window.MAP_DARK_STYLE = true;

window.AI_CONFIG = {
  API_KEY: '',  // Key 由服务端代理持有，前端无需填写
  APP_KEY: 'zhixuejiangpan2026',  // 代理访问校验（与服务端 APP_SECRET 一致）
  MODEL: 'kimi-k2.6',             // 可用模型见 GET /v1/models（本账户：kimi-k2.6 / kimi-k2.7-code）
  ENDPOINT: 'https://api.moonshot.cn/v1/chat/completions',
  PROXY_URL: 'https://zhixuejiangpan.pages.dev/ai',   // 线上代理（Cloudflare Pages Function）
  MAX_CONTEXT: 5,
  TIMEOUT: 120000,                 // kimi-k2.6 为推理模型，实测响应约60-70s，120s 兜底
  SYSTEM_PROMPT: '你是"智行江畔"的江财校园生活助手。规则：1.优先基于本地知识库（js/data.js 的 spots/hotQuestions/workflows）回答，准确引用具体点位名和步骤；2.本地知识没有时基于通用知识回答并提示"建议向相关部门确认"；3.回答控制在 200 字内，办事类问题必须给出具体地点和步骤；4.涉及心理/医疗话题时，提供一般性支持信息（如告知校医院位置、心理咨询预约方式），但明确不作医疗诊断，并建议联系专业老师。'
};

window.TEAM_NAME = '智行江畔团队';
window.SITE_VERSION = 'V7.2-beta';
/* V7.0 知识库演示种子开关：true 时首次访问自动注入 10 条演示知识+7 天演示统计，
   成长卡片显示"演示数据"角标；false 时完全不注入，知识库从空白开始自然沉淀 */
window.KB_DEMO_MODE = true;
/* V7.2-beta 校区卡片小地图视野（开发时人工校准的固定值，禁止运行时动态计算）。
   依据 js/data.js 实测坐标聚合：蛟桥北 n=25 / 蛟桥南 n=10 / 麦庐北 n=4 / 麦庐南 n=28 */
window.TWIN_MINI_MAP = {
  jq_north: { center: [115.85519, 28.74656], zoom: 16 },
  jq_south: { center: [115.85472, 28.74051], zoom: 16 },
  ml_north: { center: [115.81759, 28.73264], zoom: 16 },
  ml_south: { center: [115.81637, 28.72777], zoom: 16 }
};
