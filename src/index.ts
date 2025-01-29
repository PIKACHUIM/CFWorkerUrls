import {Context, Hono} from 'hono'
import {KVNamespace} from '@cloudflare/workers-types';
import {serveStatic} from 'hono/cloudflare-workers'
import {basicAuth} from 'hono/basic-auth'// @ts-ignore
import {handleRequest} from './proxy'// @ts-ignore
import manifest from '__STATIC_CONTENT_MANIFEST'
import {update} from "hono/dist/types/jsx/dom/render";

// 全局设置 ############################################################################################################
type Bindings = {
    DATABASE: KVNamespace,
    FULL_URL: string
    EDIT_SUB: boolean
    EDIT_LEN: string
}
const app = new Hono<{ Bindings: Bindings }>();
app.use("*", serveStatic({manifest: manifest, root: "./"}));

// 主页展示 ############################################################################################################
app.get('/', async (c) => {
    return redirect(c, "/index.html");
})

// 生成页面 ############################################################################################################
app.get('/a/', async (c) => {
    return redirect(c, "/index.html");
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

// 验证方法 ############################################################################################################
app.use(
    '/b/:suffix/*',
    basicAuth({
        verifyUser: async (username, password, c) => {
            let suffix: string = <string>c.req.param('suffix');
            let result: string = <string>await c.env.DATABASE.get(suffix);
            let detail = JSON.parse(result);
            console.log(detail);
            return (
                password === detail["guests"]
            )
        },
    })
)
// 验证链接 ############################################################################################################
app.get('/b/:suffix/*', async (c) => {
    let suffix: string = <string>c.req.param('suffix');
    let result: string = <string>await c.env.DATABASE.get(suffix);
    let detail = JSON.parse(result);
    await newTime(c, suffix);
    return parser(c, detail);
})


// 链接跳转 ############################################################################################################
app.get('/s/:suffix/*', async (c) => {
    let suffix: string = <string>c.req.param('suffix')
    let result: string = <string>await c.env.DATABASE.get(suffix);
    let detail = JSON.parse(result);
    // 判断是否有效 =============================================
    if (detail["record"] != null) {
        // 验证身份 ========================================================================
        if (detail["guests"] != "") {
            let route: string[] = c.req.url.split('/'); // 获取完整请求路径
            let extra: string = "/" + route.slice(5).join('/'); // 剩余路径
            return c.redirect("/b/" + suffix + extra, 302);
        } else {
            await newTime(c, suffix);
            return parser(c, detail);
        }
    } else return c.notFound()
})

// 链接跳转 ############################################################################################################
async function parser(c: Context, detail: any) {
    let record: string = detail["record"];
    let typing: string = detail["typing"];
    // 处理子路径 ===================================================================================================
    let route: string[] = c.req.url.split('/'); // 获取完整请求路径
    let extra: string = "/" + route.slice(5).join('/'); // 剩余路径
    console.log(`Extra path: ${extra}`);
    // 处理跳转逻辑 =================================================================================================
    // if (typing == "iframe") return c.html('<iframe width="100%" height="100%" src=' + record + '></iframe>');
    if (typing == "iframe") return c.html('<frameset rows="100%"> <frame src="' + record + extra + '"> </frameset>');
    if (typing == "direct") return c.redirect(record + extra, 302);
    if (typing == "proxys") return c.redirect("https://proxyz.opkg.us.kg/" + record + extra, 302);
    if (typing == "hidden") {
        // 返回响应给客户端
        const result = await handleRequest(c.env.FULL_URL + record + extra);
        // 由于直接返回fetch得到的response可能会出现"TypeError: Can't modify immutable headers"错误，
        // 因此需要重新封装response
        return new Response(result.body, {
            status: result.status,
            statusText: result.statusText,
            headers: Object.fromEntries(result.headers.entries())
        });
    }
    return c.notFound()
}

// 查询链接 ############################################################################################################
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
    let guests: string = <string>c.req.query('guests');
    let record: string = <string>c.req.query('record');
    let expire: string = <string>c.req.query('expire');
    let typing: string = <string>c.req.query('typing');
    let update: string = <string>c.req.query('update');
    let module: boolean = false // false-新增 true-修改
    if (suffix != "") {
        console.log(update, update === null);
        // 有suffix但是没有update，新增自定义链接 =======================
        if (update === undefined
            || update === null
            || update?.length === 0) {
            if (!c.env.EDIT_SUB)
                return c.html("<script>alert('未启用自定后缀')</script>")
            if (suffix.length < Number(c.env.EDIT_LEN)) {
                let h = "后缀太短，要求长度>=" + c.env.EDIT_LEN
                return c.html("<script>alert('设置" + h + "')</script>")
            }

            let query: string = <string>await c.env.DATABASE.get(suffix)
            if (query !== null && query.length > 0)
                return c.html("<script>alert('此后缀已经存在')</script>")
            tokens = <string>newUUID(16);
        }
        // 有update，则为更新链接 =======================================
        else {
            suffix = suffix.replace(c.env.FULL_URL, "");
            suffix = suffix.replace("s/", "");
            module = true;
        }
    }
    // 都没有，生成新的 =================================================
    else {
        suffix = <string>newUUID(8);
        tokens = <string>newUUID(16);
    }
    // 输出过期时间 =================================================
    let now_is: Date = new Date();
    let exp_is: number = now_is.setHours(
        now_is.getHours() + 24 * Number(expire))

    // 判断不包含协议 ===============================================
    if (!record.includes("http://") && !record.includes("https://"))
        record = "http://" + record
    record = record.replace(/\/+$/, '');
    // 写入数据 =====================================================
    let timers: number = <number>(new Date()).getTime();
    let result: Dict = {
        suffix: suffix, expire: expire, record: record, guests: guests,
        typing: typing, tokens: tokens, timers: timers.toString()
    }
    if (module) {
        // 判断原始密码是否相同 --------------------------------------
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
        "&guests=" + guests +
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

// 更新时间 ############################################################################################################
async function newTime(c: Context, suffix: any) {
    let result: string = <string>await c.env.DATABASE.get(suffix);
    let detail = JSON.parse(result);
    // 写入新的键值对的信息 ------------------------------------
    detail["timers"] = <number>(new Date()).getTime();
    await c.env.DATABASE.delete(suffix);
    await c.env.DATABASE.put(suffix, JSON.stringify(detail));
    return c.text(JSON.stringify({}));
}

// 数据模板 ############################################################################################################
interface Dict {
    [key: string]: string;
}

app.fire()
// export default app
export default {
    async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
        return app.fetch(request, env, ctx);
    },
    async scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
        console.log('Cron job processed');
        try {
            const keys = await env.DATABASE.list();
            for (const key of keys.keys) {
                const value = await env.DATABASE.get(key.name);
                console.log(key.name, value);
                if (value) {
                    const detail = JSON.parse(value);
                    const timers = detail.timers;
                    if (!timers) {
                        await env.DATABASE.delete(key.name);
                        console.log("Delete Invalid", key.name, value);
                        continue;
                    }
                    // 将 timers 转换为日期对象
                    const oldDate = new Date(Number(timers));
                    const nowDate = new Date();
                    // 计算时间差（天数）
                    const diffTime: number = nowDate.getTime() - oldDate.getTime();
                    const expsTime: number = Number(detail["expire"]) * 1000 * 60 * 60 * 24
                    console.log(
                        "\nName Records: " + key.name,
                        "\nLast Updated: " + oldDate,
                        "\nCurrent Time: " + nowDate,
                        "\nWaiting Hour: " + Math.ceil(diffTime / 1000 / 3600),
                        "\nConfigs Hour: " + Math.ceil(diffTime / 1000 / 3600));
                    // 如果时间差大于等于 expireDays，则删除该键值对
                    if (diffTime >= expsTime) {
                        await env.DATABASE.delete(key.name);
                        console.log(`Deleted key: ${key.name}`);
                    }
                }
            }
        } catch (error) {
            console.error('Error processing cron job:', error);
        }
    },
};