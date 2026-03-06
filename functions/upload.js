export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get('file');
    if (!file) return new Response("Missing file", { status: 400 });

    const text = await file.text();
    return new Response(JSON.stringify({
      name: file.name,
      content: text.slice(0, 15000), // 限制字符数防止模型溢出
      isText: true
    }));
  } catch (e) {
    return new Response(e.message, { status: 500 });
  }
}
