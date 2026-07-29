# 最小运行与未签名分发

本项目当前支持在 macOS 上作为本地开发工具或小范围内测应用运行。此流程**不包含** Apple Developer 签名和公证；不要把未签名产物作为公开下载链接分发。

## 运行前提

- macOS，当前已在 Apple Silicon（arm64）打包态验证。
- 从源码运行时使用 Node `>=22.19.0` 与 Corepack/Pnpm `10.12.4`。
- 打包后的应用已包含经验证的 Kimi Code `0.29.0` 托管运行时，不要求用户全局安装 `kimi`、Node 或 Python。
- 首次使用 Kimi 账号能力时，按应用设置页的 device-code 流程登录；也可以连接已运行的 Bearer 保护 Kimi Server。

## 从源码启动

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

在顶部连接状态中选择“启动托管 Kimi”。应用会验证 Runtime 的 health/meta 后再载入 Workspace 与 Session。

## 生成可运行的 macOS 产物

开发验证可生成未压缩 `.app`：

```bash
pnpm package:dir
```

产物位于 `release/mac-arm64/Moon Code.app`。生成未签名 DMG：

```bash
pnpm package:unsigned:mac
```

产物位于 `release/`，并带有正式应用图标。该命令刻意不配置发布上传、签名或公证。

## 首次打开未签名应用

将 `Moon Code.app` 拖入 Applications 后，在 Finder 中按住 Control 点击应用并选择“打开”，再确认一次即可。不要建议用户关闭 Gatekeeper 或执行不受信任的绕过脚本。

如果系统仍阻止启动，请在“系统设置 → 隐私与安全性”中对本次应用选择“仍要打开”。

## 本地验收

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm package:dir
pnpm smoke:packaged-pty
pnpm smoke:packaged-browser
pnpm smoke:packaged-pet
```

真实 Kimi Runtime 回归是显式 opt-in，避免在普通单元测试中创建用户数据：

```bash
KIMI_RUNTIME_INTEGRATION=1 pnpm vitest run tests/runtime/managedRuntime.integration.test.ts
KIMI_RUNTIME_CONVERSATION_INTEGRATION=1 pnpm vitest run tests/runtime/markdownImage.integration.test.ts
```

## 仍不属于此最小发布流程

- Apple Developer ID 签名、Hardened Runtime、公证与自动更新。
- Theme：按当前产品决定维持 P2。

这些项目不会阻止本机或受控内测运行，但公开 Beta 前必须重新评估。
