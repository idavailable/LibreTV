export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  // 1. 获取列表 (GET) - 极速版
  if (method === "GET") {
    const objects = await env.MY_BUCKET.list({ prefix: "history/", limit: 100, include: ['customMetadata'] });
    const list = objects.objects.map(obj => ({
      chatId: obj.key.replace("history/", "").replace(".json", ""),
      title: obj.customMetadata?.title || "旧对话",
      uploaded: obj.uploaded
    }));
    // 按时间倒序
    list.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
    return new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } });
  }

  // 2. 读取内容 (POST)
  if (method === "POST") {
    const { chatId } = await request.json();
    const object = await env.MY_BUCKET.get(`history/${chatId}.json`);
    if (!object) return new Response("Not Found", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": "application/json" } });
  }

  // 3. 删除 (DELETE)
  if (method === "DELETE") {
    const { chatId } = await request.json();
    await env.MY_BUCKET.delete(`history/${chatId}.json`);
    return new Response(JSON.stringify({ success: true }));
  }

  return new Response("Method Not Allowed", { status: 405 });
}
