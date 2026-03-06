export async function onRequestGet(context) {
  const { env } = context;
  if (!env.MY_BUCKET) return new Response("Bucket not found", { status: 500 });

  try {
    // 列出所有历史文件
    const objects = await env.MY_BUCKET.list({ prefix: "history/", limit: 20 });
    
    // 遍历文件获取详情（为了拿到第一句话做标题）
    const list = await Promise.all(objects.objects.map(async (obj) => {
      const item = await env.MY_BUCKET.get(obj.key);
      const data = await item.json();
      // 找到用户发的第一条消息作为标题
      const firstMsg = data.messages.find(m => m.role === 'user')?.content || "新对话";
      return {
        chatId: data.chatId,
        title: firstMsg.slice(0, 15) + (firstMsg.length > 15 ? "..." : ""),
        uploaded: obj.uploaded
      };
    }));

    // 按时间倒序
    list.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
    return new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}

// 获取具体对话内容
export async function onRequestPost(context) {
  const { request, env } = context;
  const { chatId } = await request.json();
  const object = await env.MY_BUCKET.get(`history/${chatId}.json`);
  if (!object) return new Response("Not Found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": "application/json" } });
}
