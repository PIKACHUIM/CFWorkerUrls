async function handleRequest(request) {
    try {
        console.log(request);
        const url = new URL(request);

        // 从请求路径中提取目标 URL
        let actualUrlStr = decodeURIComponent(url.pathname.replace("/", ""));

        // 判断用户输入的 URL 是否带有协议
        actualUrlStr = ensureProtocol(actualUrlStr, url.protocol);

        // 保留查询参数
        actualUrlStr += url.search;

        // 创建新 Headers 对象，排除以 'cf-' 开头的请求头
        const newHeaders = filterHeaders(new Headers(), name => !name.startsWith('cf-'));

        // 创建一个新的请求以访问目标 URL
        const modifiedRequest = new Request(actualUrlStr, {
            headers: newHeaders,
            method: "GET",
            redirect: 'manual'
        });

        // 发起对目标 URL 的请求
        // const response = await fetch(modifiedRequest)
        //     .then(res => res.blob())
        //     .then(blob => {
        //         let reader = new FileReader();
        //         reader.onload = function (e) {
        //             let text = reader.result;
        //             console.log(text)
        //         }
        //         reader.readAsText(blob, 'GBK')
        //     })
        // let body = response.body;
        const response = await fetch(modifiedRequest);
        const blob = await response.clone().blob();
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        let body = buffer.toString('utf8');
        // console.log(body);
        // 处理重定向
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            body = response.body;
            // 创建新的 Response 对象以修改 Location 头部
            return handleRedirect(response, body);
        } else if (response.headers.get("Content-Type")?.includes("text/html")) {
            body = await handleHtmlContent(response, url.protocol, url.host, actualUrlStr);
        }

        // 创建修改后的响应对象
        const modifiedResponse = new Response(body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });

        // 添加禁用缓存的头部
        setNoCacheHeaders(modifiedResponse.headers);

        // 添加 CORS 头部，允许跨域访问
        setCorsHeaders(modifiedResponse.headers);

        return modifiedResponse;
    } catch (error) {
        // 如果请求目标地址时出现错误，返回带有错误消息的响应和状态码 500（服务器错误）
        return jsonResponse({
            error: error.message
        }, 500);
    }
}

// 确保 URL 带有协议
function ensureProtocol(url, defaultProtocol) {
    return url.startsWith("http://") || url.startsWith("https://") ? url : defaultProtocol + "//" + url;
}

// 处理重定向
function handleRedirect(response, body) {
    const location = new URL(response.headers.get('location'));
    const modifiedLocation = `/${encodeURIComponent(location.toString())}`;
    return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
            ...response.headers,
            'Location': modifiedLocation
        }
    });
}

// 处理 HTML 内容中的相对路径
async function handleHtmlContent(response, protocol, host, actualUrlStr) {
    const originalText = await response.text();
    return replaceRelativePaths(originalText, protocol, host, new URL(actualUrlStr).origin);
}

// 替换 HTML 内容中的相对路径
function replaceRelativePaths(text, protocol, host, origin) {
    // const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
    let regex = new RegExp('(=["\'])/(?!/)', 'g');
    let newText = text.replace(regex, `="https://proxyz.opkg.us.kg/${origin}/`)
    regex = new RegExp('(url[("\'])/(?!/)', 'g');
    newText = newText.replace(regex, `https://proxyz.opkg.us.kg/${origin}/`)
    return newText;
    // return text.replace(regex, `$1${protocol}//${host}/${origin}/`);
}

// 返回 JSON 格式的响应
function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    });
}

// 过滤请求头
function filterHeaders(headers, filterFunc) {
    return new Headers([...headers].filter(([name]) => filterFunc(name)));
}

// 设置禁用缓存的头部
function setNoCacheHeaders(headers) {
    headers.set('Cache-Control', 'no-store');
}

// 设置 CORS 头部
function setCorsHeaders(headers) {
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    headers.set('Access-Control-Allow-Headers', '*');
}

module.exports = {handleRequest};