import {Context, Hono} from 'hono'
import {KVNamespace} from '@cloudflare/workers-types';
import {serveStatic} from 'hono/cloudflare-workers'
// import manifestJSON from "__STATIC_CONTENT_MANIFEST";
// const manifest = JSON.parse(manifestJSON);
import manifest from '__STATIC_CONTENT_MANIFEST'
// 全局设置 ############################################################################################################
type Bindings = {
    DATABASE: KVNamespace,
    FULL_URL: string
}
const app = new Hono<{ Bindings: Bindings }>();
app.use("*", serveStatic({manifest: manifest, root: "./"}));

app.get('/', async (c) => {
    // return c.redirect("/index.html", 302);
    return redirect(c, "/index.html");
    // return c.render(getTemp("index.html", c.env.FULL_URL));
})

// 生成页面 ############################################################################################################
app.get('/a/', async (c) => {
    // return c.redirect("/index.html", 302);
    return redirect(c, "/index.html");
    // return c.render(getTemp("index.html", c.env.FULL_URL));
})

// 结果页面 ############################################################################################################
app.get('/i/', async (c) => {
    // return c.redirect("/links.html", 302);
    return redirect(c, "/links.html");
    // return c.html(getTemp("links.html", c.env.FULL_URL));
})

// 页面跳转 ############################################################################################################
function redirect(c: Context, path: string) {
    const url = new URL(c.req.url);
    const searchParams = url.searchParams;

    // 构造新的 URL 并携带原始参数
    const newUrl = new URL(path, c.req.url);
    searchParams.forEach((value, key) => {
        newUrl.searchParams.append(key, value);
    });
    return c.redirect(newUrl, 302);
}


// 链接跳转 ############################################################################################################
app.get('/s/:suffix', async (c) => {
    let suffix: string = <string>c.req.param('suffix')
    let result: string = <string>await c.env.DATABASE.get(suffix);
    let detail = JSON.parse(result);
    // 判断是否有效 =============================================
    if (detail != null) {
        let record: string = detail["record"];
        let typing: string = detail["typing"];
        if (typing == "iframe") return c.html('<iframe width="100%" height="100%" src=' + record + '></iframe>');
        if (typing == "direct") return c.redirect(record, 302);
        if (typing == "proxys") return c.redirect("https://proxyz.opkg.us.kg/" + record, 302);
        return c.notFound()
    } else c.notFound()
})


app.get('/q/:suffix', async (c) => {
    try {
        let suffix: string = c.req.param('suffix');
        // let result: string = <string>await c.env.DATABASE.get(suffix);
        let result: string = <string>await c.env.DATABASE.get(suffix);
        let detail = JSON.parse(result);
        console.log(detail);
        let output: Dict = {
            suffix: detail["suffix"],
            expire: detail["expire"],
            record: detail["record"],
            typing: detail["typing"],
            timers: detail["timers"]
        };
        return c.text(JSON.stringify(output));
    } catch (error) {
        console.log(error);
        return c.notFound()
    }
})


// 新增链接 ############################################################################################################
app.get('/u/', async (c) => {
    let suffix: string = <string>c.req.query('suffix'); // 更新需要
    let tokens: string = <string>c.req.query('tokens'); // 更新需要

    let record: string = <string>c.req.query('record');
    let expire: string = <string>c.req.query('expire');
    let typing: string = <string>c.req.query('typing');
    let module: boolean = false // false-新增 true-修改
    // 有suffix，则为更新链接 ======================================
    if (suffix != "") {
        suffix = suffix.replace(c.env.FULL_URL, "");
        suffix = suffix.replace("s/", "");
        module = true;
    }
    // 否则生成新的 ================================================
    else {
        suffix = <string>newUUID(8);
        tokens = <string>newUUID(16);
    }
    // 输出过期时间 ================================================
    let now_is: Date = new Date();
    let exp_is: number = now_is.setHours(
        now_is.getHours() + 24 * Number(expire))

    // 判断不包含协议 ==============================================
    if (!record.includes("http://") && !record.includes("https://"))
        record = "http://" + record

    // 写入数据 ====================================================
    let timers: number = <number>(new Date()).getTime();
    let result: Dict = {
        suffix: suffix, expire: expire, record: record,
        typing: typing, tokens: tokens, timers: timers.toString()
    }
    if (module) {
        // 判断原始密码是否相同 ------------------------------------
        let query: string = <string>await c.env.DATABASE.get(suffix)
        let start = JSON.parse(<string>query)
        if (tokens != <string>start["tokens"])
            return redirect(c, "/error.html");
        // return c.render(getTemp("error.html", c.env.FULL_URL))
        // 删除原始的键值对数据 ------------------------------------
        await c.env.DATABASE.delete(suffix)
    }
    // 写入新的键值对的信息 ------------------------------------
    await c.env.DATABASE.put(suffix, JSON.stringify(result))
    // 返回数据 ====================================================
    return c.redirect("/i/" +
        "?suffix=" + c.env.FULL_URL + "s/" + suffix +
        "&tokens=" + tokens +
        "&record=" + record +
        "&typing=" + typing +
        "&expire=" + exp_is,
        302);
})

// 自动修改 ############################################################################################################
app.use('/p/', async (c) => {
    // 检查请求方法
    const method = c.req.method;

    // 初始化变量
    let tokens: string | undefined;
    let suffix: string | undefined;
    let typing: string | undefined;
    let ipaddr: string | undefined;
    let porter: string | undefined;
    console.log(method);
    // 如果是 POST 请求，尝试从 JSON 获取数据
    if (method === 'POST') {
        try {
            const body = await c.req.json();
            tokens = body["tokens"];
            suffix = body["suffix"];
            typing = body["typing"];
            ipaddr = body["ipaddr"];
            porter = body["porter"];
        } catch (error) {
            return c.text(JSON.stringify({
                "success": false,
                "message": "Invalid JSON format",
            }), 400); // 返回 400 Bad Request
        }
    }

    // 如果是 GET 请求或 POST 请求中缺少数据，尝试从 URL 参数获取
    if (!tokens || !suffix || !typing || !ipaddr || !porter) {
        tokens = c.req.query("tokens") || tokens;
        suffix = c.req.query("suffix") || suffix;
        typing = c.req.query("typing") || typing;
        ipaddr = c.req.query("ipaddr") || ipaddr;
        porter = c.req.query("porter") || porter;
    }
    suffix = <string>suffix;

    // 判断原始密码是否相同 ------------------------------------
    let query: string = <string>await c.env.DATABASE.get(suffix)
    let start = JSON.parse(<string>query)
    if (tokens != <string>start["tokens"])
        return c.text(JSON.stringify({
            "success": false,
            "message": "Invalid password or suffix",
        }));
    else
        start["record"] = typing + "://" + ipaddr + ":" + porter
    // 删除原始的键值对数据 ------------------------------------
    await c.env.DATABASE.delete(suffix)
    // 写入新的键值对的信息 ------------------------------------
    await c.env.DATABASE.put(suffix, JSON.stringify(start))
    // 返回数据 ================================================
    return c.text(JSON.stringify({
        "success": true,
        "message": "Successfully updated links"
    }))
})

// 生成后缀 ############################################################################################################
function newUUID(length: number = 16): string {
    const charset = 'ABCDEFGHJKLMNPQRSTUWXY0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        result += charset[randomIndex];
    }
    return result;
}


// 读取模板 ############################################################################################################
async function getTemp(module: string, url: string) {
    let full_url: string = url + "static/" + module
    console.log(full_url)
    const response = await fetch(full_url)
    if (!response.ok) {
        throw new Error('Failed to fetch template, url: ' + full_url + ",error:" + response.statusText);
    }
    return await response.text()
}

interface Dict {
    [key: string]: string;
}

app.fire()
export default app
