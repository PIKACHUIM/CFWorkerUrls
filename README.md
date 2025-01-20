# Cloudflare Worker Short URL Server 短链接服务

利用Cloudflare Worker搭建一个无需服务器的短链接服务，支持：
1. 缩短您的网址URL，使它更容易书写或者点击访问
2. STUN服务器NAT端口转发，您无需公网IP即可使用
3. 支持API自动更新链接，支持到期自动删除


Build a server free short link service using Cloudflare Worker, supporting:
1. Shorten your website URL to make it easier to write or click to access
2. STUN server NAT port forwarding, you don't need a public IP to use it
3. Support API automatic link update and automatic link deletion upon expiration

Demo: https://1web.us.kg/

## Usages / 部署方式

### Clones / 克隆代码
```
git clone https://github.com/PIKACHUIM/CFWorkerUrls.git
cd CFWorkerUrls
npm install
cp wrangler.toml.example wrangler.toml
```

### Config / 修改配置
修改`wrangler.toml`的内容
```
account_id = "******************************"
FULL_URL= "https://*********/"
id = "*****************************"
```

### Deploy / 部署云端
```
wrangler deploy
```

### Lucky Webhook
 - 请求类型：POST
 - 请求地址：`https://1web.us.kg/p/`
```json
{
  "suffix": "网站后缀",
  "tokens": "更新密码",
  "typing": "http",
  "ipaddr": "{ip}",
  "porter": "{port}"
}

```