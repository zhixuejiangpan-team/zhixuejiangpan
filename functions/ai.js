/* 智行江畔 —— Kimi API 代理（Cloudflare Pages Function，挂载于 /ai）
 * 机密变量（Pages 项目 Settings → Variables and Secrets）：
 *   MOONSHOT_KEY —— Kimi API Key
 *   APP_SECRET   —— 前端请求头 X-App-Key 的校验值 */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Key',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Key'
  };
  if (!env.APP_SECRET || request.headers.get('X-App-Key') !== env.APP_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
  const up = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.MOONSHOT_KEY },
    body: request.body
  });
  return new Response(up.body, {
    status: up.status,
    headers: { ...cors, 'Content-Type': up.headers.get('content-type') || 'application/json' }
  });
}
