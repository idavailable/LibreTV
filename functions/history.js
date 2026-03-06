// 1. 获取历史列表 (GET)
export async function onRequestGet(context) {
  const { env } = context;
  if (!env.MY_BUCKET) return new Response("Bucket not found", { status: 500 });

  try {
    // 列出 history/ 目录下的所有文件
    const objects = await env.MY_BUCKET.list({ prefix: "history/", limit: 50 }); // 调高了上限到50条
    
    const list = await Promise.all(objects.objects.map(async (obj) => {
      try {
        const item = await env.MY_BUCKET.get(obj.key);
        if (!item) return null;
        const data = await item.json();
        
        // 找到用户发的第一条消息作为标题
        const userMsg = data.messages.find(m => m.role === 'user')?.content || "新对话";
        // 去掉多余换行，截取前15个字符
        const cleanTitle = userMsg.replace(/\n/g, " ").trim();
        
        return {
          chatId: data.chatId || obj.key.replace("history/", "").replace(".json", ""),
          title: cleanTitle.slice(0, 15) + (cleanTitle.length > 15 ? "..." : ""),
          uploaded: obj.uploaded
        };
      } catch (e) {
        return null; // 忽略损坏的 JSON 文件
      }
    }));

    // 过滤掉 null 并按时间倒序排列
    const sortedList = list.filter(i => i !== null).sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
    
    return new Response(JSON.stringify(sortedList), { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (e) {
    return new Response("GET Error: " + e.message, { status: 500 });
  }
}

// 2. 获取具体对话内容 (POST)
export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const { chatId } = await request.json();
    if (!chatId) return new Response("Missing chatId", { status: 400 });

    const object = await env.MY_BUCKET.get(`history/${chatId}.json`);
    if (!object) return new Response("Chat history not found", { status: 404 });

    return new Response(object.body, { 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (e) {
    return new Response("POST Error: " + e.message, { status: 500 });
  }
}

// 3. 删除对话内容 (DELETE) —— 这是新加的关键部分
export async function onRequestDelete(context) {
  const { request, env } = context;
  try {
    const { chatId } = await request.json();
    if (!chatId) return new Response("Missing chatId", { status: 400 });

    // 物理删除 R2 存储桶中的文件
    // 注意：路径必须包含 history/ 前缀和 .json 后缀
    await env.MY_BUCKET.delete(`history/${chatId}.json`);

    return new Response(JSON.stringify({ success: true, deleted: chatId }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response("DELETE Error: " + e.message, { status: 500 });
  }
}
