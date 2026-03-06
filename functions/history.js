export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  // 1. 获取列表 (GET)
  if (method === "GET") {
    const objects = await env.MY_BUCKET.list({ prefix: "history/", limit: 50 });
    const list = await Promise.all(objects.objects.map(async (obj) => {
      try {
        const item = await env.MY_BUCKET.get(obj.key);
        const data = await item.json();
        const userMsg = data.messages.find(m => m.role === 'user')?.content || "新对话";
        return {
          chatId: data.chatId || obj.key.replace("history/", "").replace(".json", ""),
          title: userMsg.trim().slice(0, 15) + (userMsg.length > 15 ? "..." : ""),
          uploaded: obj.uploaded
        };
      } catch (e) { return null; }
    }));
    return new Response(JSON.stringify(list.filter(i => i).sort((a,b) => new Date(b.uploaded) - new Date(a.uploaded))), { headers: { "Content-Type": "application/json" } });
  }

  // 2. 读取详情 (POST)
  if (method === "POST") {
    const { chatId } = await request.json();
    const object = await env.MY_BUCKET.get(`history/${chatId}.json`);
    return new Response(object.body, { headers: { "Content-Type": "application/json" } });
  }

  // 3. 删除记录 (DELETE)
  if (method === "DELETE") {
    const { chatId } = await request.json();
    await env.MY_BUCKET.delete(`history/${chatId}.json`);
    return new Response(JSON.stringify({ success: true }));
  }

  return new Response("Method Not Allowed", { status: 405 });
}
