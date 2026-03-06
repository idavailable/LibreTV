// 修改后的拦截逻辑
const protectedPaths = [
    "/chat", "/history", "/upload", 
    "/index.html", "/about.html", "/daohang.html", 
    "/iptv.html", "/m3uplayer.html", "/net.html",
    "/" // 根目录
];

if (password && protectedPaths.some(p => url.pathname.startsWith(p))) {
    // 检查 Cookie 或 Header
    const userPassword = request.headers.get("X-Password") || getCookie(request, "auth_hash");
    const passwordHash = await sha256(password);

    if (userPassword !== passwordHash) {
        // 如果是 HTML 请求，重定向到登录页（假设你有 login.html）
        if (url.pathname.endsWith(".html") || url.pathname === "/") {
            return Response.redirect(new URL("/login.html", request.url), 302);
        }
        // 如果是接口请求，返回 401
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
}
