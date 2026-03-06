export async function onRequestGet(context) {
  const { env } = context;

  // 检查 R2 绑定
  if (!env.MY_BUCKET) {
    return new Response(JSON.stringify({ error: "R2 bucket not bound" }), { status: 500 });
  }

  try {
    // 列出 history/ 目录下的所有文件
    const objects = await env.MY_BUCKET.list({ prefix: "history/" });
    
    // 获取每个文件的详细内容（为了拿到时间戳或预览文字，可选）
    // 这里简单处理，只返回文件名列表
    const historyList = objects.objects.map(obj => ({
      key: obj.key,
      chatId: obj.key.replace("history/", "").replace(".json", ""),
      uploaded: obj.uploaded
    }));

    // 按时间倒序排列
    historyList.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

    return new Response(JSON.stringify(historyList), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

// 增加一个读取单个对话内容的逻辑
export async function onRequestPost(context) {
  const { request, env } = context;
  const { chatId } = await request.json();

  const object = await env.MY_BUCKET.get(`history/${chatId}.json`);
  if (!object) return new Response("Not Found", { status: 404 });

  const data = await object.text();
  return new Response(data, {
    headers: { "Content-Type": "application/json" }
  });
}
