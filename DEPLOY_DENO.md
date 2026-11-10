# Deno Deploy 配置

此分支把游戏文件放在仓库根目录，用于 Deno Deploy 的免费、免绑卡部署。

## 部署设置

- GitHub 仓库：`Mikasa237/sanpi-poker-online`
- 分支：`codex/deno-deploy`
- Framework preset：`No Preset`
- Runtime：`Dynamic`
- Install command：`npm ci`
- Build command：留空
- Dynamic entrypoint：`server.js`
- 环境变量：`SESSION_SECRET` 设置为随机长字符串

Deno Deploy 在无访问时会休眠，收到新请求后自动唤醒。活跃房间保存在进程内存中；实例重启后需要重新开房，但固定域名和永久房主页仍然有效。

上线后验证：

```text
https://<应用名>.<组织名>.deno.net/api/health
```
