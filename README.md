# 照影问剑 · 10版待上传源码

版本：v2-close-20261101-10。本目录为唯一待上传目录zhaoying-wenjian-publish-10的源码内容，未推送或公开部署。游戏代码、人物、音效和手机效果与核验通过的10版一致；本次只整理命令、预览工具和说明。

## 安装、构建、检查与预览

需要Node.js 24（自带npm）。在本目录打开终端，按顺序执行：

```sh
npm ci
npm run build
npm run check
npm run preview
```

看到预览地址后，打开 http://127.0.0.1:8090/ 。按Control+C停止。预览服务只在当前电脑监听，不读取.env或任何密钥；它不是公网地址。

四个命令均附带实际工具。另保留`npm run build:public`作为公开构建别名，供已有GitHub Actions使用，结果与`npm run build`相同。没有服务端生成、付费评测或内部测试命令。

构建输出只在`release/pages/`，包含index.html、version.json、现有第三方声明和.nojekyll。代码、图片及音频内嵌，不依赖电脑上的其他工程目录。node_modules和构建输出已加入.gitignore，不需要上传。

## 试玩范围与操作

无需密钥，支持普通模式、浏览器本地学习、习惯反馈、镜剑分享和四套预设试炼。自然语言生成仅在本机完整版提供，此公开版没有生成表单或付费后端。

电脑版：WASD移动，鼠标瞄准，按住左键攻击，空格/Shift冲刺，Esc暂停。先试剑25秒，实际采样训练后继续与镜剑交手。手机横屏，左侧摇杆移动，右侧按住攻击，松开攻击后点闪避；沿用已认可效果。

## 确认后部署GitHub Pages

1. 负责人确定GitHub账号、仓库名，并确认允许推送本目录及公开部署。建议新建独立仓库zhaoying-wenjian，默认分支main。
2. 授权后，将本目录内容作为仓库根目录上传，包含隐藏的.github和.gitignore；不上传外层内部工程、备份、node_modules或本机密钥。
3. 在仓库Settings → Pages中将Source设为GitHub Actions。
4. 推送main或在Actions中手动运行“Build and deploy public game”。工作流安装依赖、公开构建和检查，只上传release/pages，再部署到github-pages环境。不需要DeepSeek Secret。
5. 工作流成功后使用其输出的真实地址，通常为https://账号.github.io/仓库名/，再验证首次进入和分享链接往返。分享基址跟随当前域名及仓库子路径，不写死localhost或局域网地址。

本轮未执行GitHub推送、远端Actions或公开部署；Linux托管环境和真实公网访问要在授权部署后确认。旧的zhaoying-wenjian目录不用于本次上传。

原有第三方声明保留原样，未在本轮调整或扩写来源/许可信息。本目录不含原内部工程历史、服务端、密钥、账本、私人截图或测试资料。产品文档和面试讲述材料不在本次整理范围。
