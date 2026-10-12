/* ============================================================
   智行江畔 V6.6+AI —— 全局配置（外部输入接口集中于此）
   ------------------------------------------------------------
   【高德地图】Key 已由团队申请并填入（Web端JS API）。
     如需更换：将 AMAP_KEY / AMAP_SECURITY_JS_CODE 替换为新值；
     域名白名单填 zhixuejiangpan-team.github.io 主域名（不含子路径）。
     留空时地图视图自动显示申请指引占位层，不白屏不报错。
   【AI】AI_CONFIG.PROXY_URL 已指向线上代理（Render），API Key 由服务端
     环境变量持有，前端无需填写 API_KEY。本地调试可改回
     'http://localhost:3001/ai' 并 `node server.js`。
   ============================================================ */
window.AMAP_KEY = '68c803d0b796714e0613f165678e3f08';
window.AMAP_SECURITY_JS_CODE = '571063ca0b165cfa6b33557071197d98';

window.AI_CONFIG = {
  API_KEY: '',  // Key 由服务端代理持有，前端无需填写
  MODEL: 'kimi-k2.6',             // 可用模型见 GET /v1/models（本账户：kimi-k2.6 / kimi-k2.7-code）
  ENDPOINT: 'https://api.moonshot.cn/v1/chat/completions',
  PROXY_URL: 'https://zhixuejiangpan-ai.onrender.com/ai',   // 线上代理（Render）
  MAX_CONTEXT: 5,
  TIMEOUT: 120000,                 // kimi-k2.6 为推理模型，实测响应约60-70s，120s 兜底
  SYSTEM_PROMPT: '你是"智行江畔"的江财校园生活助手。规则：1.优先基于本地知识库（js/data.js 的 spots/hotQuestions/workflows）回答，准确引用具体点位名和步骤；2.本地知识没有时基于通用知识回答并提示"建议向相关部门确认"；3.回答控制在 200 字内，办事类问题必须给出具体地点和步骤；4.涉及心理/医疗话题时，提供一般性支持信息（如告知校医院位置、心理咨询预约方式），但明确不作医疗诊断，并建议联系专业老师。'
};

window.TEAM_NAME = '智行江畔团队';
window.SITE_VERSION = 'V6.6+AI';
