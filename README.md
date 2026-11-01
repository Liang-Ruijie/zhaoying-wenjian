# 照影问剑

**在线试玩：https://liang-ruijie.github.io/zhaoying-wenjian/**

源码：https://github.com/Liang-Ruijie/zhaoying-wenjian

公开版本：v2-close-20261101-10。电脑与已认可的手机横屏体验，使用GitHub Pages静态托管，无需安装、登录或输入密钥，也不依赖开发者电脑开机。

## 可用范围与操作

普通游戏、浏览器本地学习、习惯反馈、镜剑分享及四套预设试炼。先试剑25秒，浏览器真实采样和训练，再与镜剑交手。镜剑参考部分操作倾向，也受战斗规则影响；习惯统计不等于分身相似度，不保证完整复制动作节奏。

电脑：WASD移动，鼠标瞄准，按住左键攻击，空格/Shift冲刺，Esc暂停。手机：横屏，左摇杆移动，右侧按住攻击，松开攻击后点闪避。

公开版只使用本地预设，不提供自然语言生成表单或付费模型后端；不需要DeepSeek密钥。分享链接携带镜剑配置和模型，使用当前公网域名与仓库子路径。

## 本地安装、构建与预览

需要Node.js 24和npm，在仓库根目录执行：

```sh
npm ci
npm run build
npm run check
npm run preview
```

打开 http://127.0.0.1:8090/ ，Control+C停止预览。这是本机开发入口；公开试玩使用上面的GitHub Pages地址。

`build:public`是`build`的公开构建别名，供工作流使用。产物只在`release/pages/`：游戏HTML、版本信息、现有第三方声明及.nojekyll。图片、音乐和代码内嵌；node_modules及构建输出不需要提交。

## 部署

仓库Pages来源为GitHub Actions，工作流在`.github/workflows/pages.yml`。推送main后自动安装依赖、构建和检查，只上传release/pages并部署，不需要模型Secret。

本仓库仅含整理后的公开源码，没有内部工程历史、密钥、服务端、私人账本或内部测试资料。现有第三方声明及发布时核对的来源记录见[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)，原声明保留。
