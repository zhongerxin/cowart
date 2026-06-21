# Cowart

Cowart 是一个面向 Codex 的本地无限画布插件。它基于 tldraw 提供可视化画布，用于构思、标注、生成图片和根据标注图迭代图片。画布运行在本地网页服务中，数据默认保存到当前用户项目的 `canvas/` 目录，而不是保存到插件仓库里。

English README: [README.en.md](README.en.md)

## 功能

- 在 Codex 中打开一个本地 tldraw 无限画布。
- 在当前项目目录中持久化画布页面和图片资源。
- 在画布中创建 AI image holder，并让 Codex 生成图片填入选中的 holder。
- 上传或提供 Cowart 标注截图，让 Codex 根据标注生成干净的新图并放到原图旁边。
- 通过 Cowart MCP 工具读取选择状态、插入图片，并保存到页面本地资源目录。

## 安装

### 让 Codex 自动安装

把下面这段发给 Codex：

```text
请从 https://github.com/zhongerxin/cowart.git 安装 Cowart Codex 插件。
请 clone 仓库到 ~/plugins/cowart，确认 .codex-plugin/plugin.json 存在，
把插件加入 personal marketplace，先运行 codex plugin marketplace add ~，
再运行 codex plugin add cowart@personal。
安装后请校验插件，并告诉我是否需要开启一个新对话来加载新技能和 MCP 工具。
```

### 手动安装

推荐把插件 clone 到 Codex personal marketplace 默认会引用的位置：

```bash
mkdir -p ~/plugins
git clone https://github.com/zhongerxin/cowart.git ~/plugins/cowart
cd ~/plugins/cowart
npm install
npm run build
```

确保 `~/.agents/plugins/marketplace.json` 中有 Cowart 条目：

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "cowart",
      "source": {
        "source": "local",
        "path": "./plugins/cowart"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

然后先注册 personal marketplace，再安装插件：

```bash
codex plugin marketplace add ~
codex plugin add cowart@personal
```

安装后建议开启一个新的 Codex 对话，让新的 skill 和 MCP 工具完整加载。

## 使用

### 打开画布

在 Codex 中说：

```text
Open the Cowart canvas for this project.
```

Cowart 会启动本地服务，默认地址是：

```text
http://127.0.0.1:43217/
```

画布数据会保存在当前项目目录下：

```text
canvas/pages/<page-id>/cowart-canvas.json
canvas/pages/<page-id>/assets/
```

![在 Codex 中打开 Cowart 画布](assets/open-canvas.png)

### 生成新图

1. 打开 Cowart 画布。
2. 可以在画布里创建并选中一个 AI image holder，用来指定图片尺寸和位置。
3. 在 Codex 中描述要生成的图片，例如：

```text
Generate a new image into the selected Cowart AI image holder.
```

打开空白画布时，Cowart 会自动创建一个 AI image holder，方便第一次生成图片时直接使用。如果画布已有内容，Cowart 不会自动添加新的 holder；你仍然可以在画布里手动创建或选中其他 holder 来指定图片尺寸和位置。选中 holder 时，Codex 会读取它的比例生成图片，并插入到 holder 中。

![使用 Cowart 生成并插入新图](assets/generate-image.png)

### 根据标注图生成新图

1. 在 Cowart 画布中对图片做标注。
2. 截图并把标注截图发给 Codex。
3. 使用提示：

```text
Use my Cowart annotation screenshot to generate a clean revised image beside the original.
```

Codex 会读取截图里的标注和箭头，生成去掉标注痕迹的新图，并把结果放在原图旁边。原图和标注不会被删除或移动。

![根据 Cowart 标注截图生成修订图](assets/annotation-edit.png)

## 技能

- `cowart:cowart-open-canvas`：打开 Cowart 本地画布。
- `cowart:cowart-image-gen`：把生成图片插入选中的 AI image holder。
- `cowart:cowart-image-edit`：根据用户提供的 Cowart 标注截图生成修订图。

## 本地开发

```bash
npm install
npm run dev
npm run build
```

也可以直接启动画布服务，并指定用户项目目录：

```bash
./scripts/start-canvas.sh /path/to/user/project
```

常用环境变量：

- `COWART_PORT`：本地服务端口，默认 `43217`。
- `COWART_PROJECT_DIR`：画布数据所属的用户项目目录。
- `COWART_CANVAS_DIR`：画布数据目录，默认是 `$COWART_PROJECT_DIR/canvas`。

## 开发者

ZHONG XIN  
zhongxin123456@gmail.com  
https://www.jiqiren.ai

## 致谢

Cowart 的画布能力基于 [tldraw/tldraw](https://github.com/tldraw/tldraw) 实现。
