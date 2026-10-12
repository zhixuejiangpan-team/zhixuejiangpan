/* 智行江畔 V6.6+AI —— Kimi(Moonshot) API 本地跨域代理（<30行核心代码）
 * 用法：node server.js  →  监听 3001 端口
 * 前端把 AI_CONFIG.PROXY_URL 填为 http://localhost:3001/ai
 * 严禁前端直连 api.moonshot.cn（会被 CORS 拦截且暴露 Key）。 */
const http = require('http');
const KEY = process.env.MOONSHOT_KEY || 'PASTE_YOUR_MOONSHOT_API_KEY_HERE';

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'POST' || req.url !== '/ai') { res.statusCode = 404; return res.end('{}'); }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const opts = { hostname: 'api.moonshot.cn', path: '/v1/chat/completions',
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY } };
    const r = http.request(opts, up => { res.statusCode = up.statusCode; up.pipe(res); });
    r.on('error', () => { res.statusCode = 502; res.end('{"error":"upstream"}'); });
    r.end(body);
  });
}).listen(3001, () => console.log('AI proxy on http://localhost:3001/ai'));
