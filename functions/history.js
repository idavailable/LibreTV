export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  try {
    if (method === "GET") {
      const objects = await env.MY_BUCKET.list({ prefix: "history/", include: ['customMetadata'] });
      const list = objects.objects.map(obj => ({
        chatId: obj.key.replace("history/", "").replace(".json", ""),
        title: obj.customMetadata?.title || "旧对话",
        time: obj.uploaded
      })).sort((a, b) => new Date(b.time) - new Date(a.time));
      return new Response(JSON.stringify(list), { headers: { "Content-Type": "application/json" } });
    }

    if (method === "POST") {
      const { chatId } = await request.json();
      const obj = await env.MY_BUCKET.get(`history/${chatId}.json`);
      if (!obj) return new Response("Not Found", { status: 404 });
      return new Response(obj.body, { headers: { "Content-Type": "application/json" } });
    }

    if (method === "DELETE") {
      const { chatId } = await request.json();
      await env.MY_BUCKET.delete(`history/${chatId}.json`);
      return new Response(JSON.stringify({ success: true }));
    }
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
