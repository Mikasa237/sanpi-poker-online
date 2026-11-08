# 三皮牌局

单机模式可以双击 `index.html` 直接开始。联机模式需要启动房间服务。

## 快速玩法

1. 选择 4–7 人牌桌和三档 AI 难度。
2. 每人先下 10 底注，再收到一张暗牌和一张明牌。
3. 明牌最大者先下注；按顺序选择下注、跟注、加注、全下或弃牌。
4. 第一轮结束后暗弃一张牌，存活玩家依次公开摸第三张牌。
5. 第二轮下注结束后开牌：普通牌比较点数和，三皮按等级与目标点数比较。

游戏进度、筹码、设置和累计战绩会自动保存在当前浏览器中。牌桌右上角可切换行动速度、声音与动画。

牌桌采用玩家第一视角：你的底牌、明牌和摸牌固定在近景手牌区，其他玩家的公开牌带有“明/摸”标记；大小王分别使用黑白与彩色 JOKER 插画，赖子使用独立 WILD 牌面。

筹码归零即淘汰，不会自动补充筹码。AI 破产后会退出当前牌桌；你的筹码归零时本局立即失败，可一键重新开局。

## 联机模式

在 `outputs` 目录运行：

```powershell
cd outputs
npm install
npm start
```

然后访问 `http://localhost:3000/online.html`。创建房间后会得到固定链接，例如：

```text
http://localhost:3000/room/AB12CD
```

联机房间支持 2–10 个真人座位，不加入 AI。房主开始第一手后，其他玩家仍可进入旁观；下一手有空位时会按加入顺序补座。昵称可在房间内随时修改，同一房间不允许重名。

联机版采用服务器权威状态：每位玩家只会收到自己的底牌，其他人的底牌和牌堆内容不会提前下发。房间保存在服务器内存中，服务重启后会清空。

### Render 部署

仓库根目录提供 `render.yaml`，Render 会使用 `outputs` 作为服务目录。部署时需要创建一个 Render Web Service，并配置：

- Build Command：`npm install`
- Start Command：`npm start`
- Health Check Path：`/api/health`
- `SESSION_SECRET`：Render Blueprint 会自动生成；手动创建服务时应配置随机长字符串

免费 Node 实例从休眠中唤醒后会丢失内存中的旧房间。

## 文件

- `index.html`：游戏入口和界面结构
- `styles.css`：牌桌、卡牌与响应式布局
- `engine.js`：牌组、下注、三皮评估、边池和 AI 逻辑
- `app.js`：界面渲染、交互、音效和本地存档
- `online.html`、`online.css`、`online.js`：联机大厅、房间与第一视角牌桌
- `server.js`：权威房间服务、HTTP API 和 WebSocket 协议
- `package.json`：Node 服务依赖与启动命令
- `assets/`：彩色 JOKER、黑白 JOKER 与赖子牌插画
