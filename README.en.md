# Cowart

Cowart is a local infinite-canvas plugin for Codex. It brings a tldraw-powered canvas into Codex for visual thinking, annotation, image generation, and annotation-driven image edits. The canvas runs as a local web service, and its data is saved in the active user project under `canvas/` instead of inside the plugin repository.

中文说明: [README.md](README.md)

## Features

- Open a local tldraw infinite canvas from Codex.
- Persist canvas pages and image assets in the active project directory.
- Create AI image holders on the canvas and ask Codex to generate images into the selected holder.
- Provide Cowart annotation screenshots and let Codex generate clean revised images beside the original.
- Use Cowart MCP tools to read selection state, insert images, and save page-local assets.

## Installation

### Ask Codex To Install It

Send the following message to Codex:

```text
Please install the Cowart Codex plugin from https://github.com/zhongerxin/cowart.git.
Clone the repository into ~/plugins/cowart, verify that .codex-plugin/plugin.json exists,
add the plugin to the personal marketplace, run codex plugin marketplace add ~,
then run codex plugin add cowart@personal.
After installing, validate the plugin and tell me whether I should start a new conversation to load the new skills and MCP tools.
```

### Manual Install

Clone the plugin into the default location referenced by the Codex personal marketplace:

```bash
mkdir -p ~/plugins
git clone https://github.com/zhongerxin/cowart.git ~/plugins/cowart
cd ~/plugins/cowart
npm install
npm run build
```

Make sure `~/.agents/plugins/marketplace.json` contains a Cowart entry:

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

Then register the personal marketplace and install the plugin:

```bash
codex plugin marketplace add ~
codex plugin add cowart@personal
```

After installing, start a new Codex conversation so the new skills and MCP tools are loaded cleanly.

## Usage

### Open The Canvas

Ask Codex:

```text
Open the Cowart canvas for this project.
```

Cowart starts a local service at:

```text
http://127.0.0.1:43217/
```

Canvas data is saved in the active project:

```text
canvas/pages/<page-id>/cowart-canvas.json
canvas/pages/<page-id>/assets/
```

![Open Cowart canvas in Codex](assets/open-canvas.png)

### Generate A New Image

1. Open the Cowart canvas.
2. Optionally create and select an AI image holder on the canvas to define the image size and placement.
3. Describe the image you want Codex to generate, for example:

```text
Generate a new image into the selected Cowart AI image holder.
```

When an empty canvas is opened, Cowart automatically creates one AI image holder so the first image generation has a ready target. If the canvas already has content, Cowart does not add another holder automatically; you can still create or select another holder on the canvas to define the image size and placement. When a holder is selected, Codex reads its aspect ratio, generates the image, and inserts it into the holder.

![Generate and insert a new image with Cowart](assets/generate-image.png)

### Generate From An Annotation Screenshot

1. Annotate an image on the Cowart canvas.
2. Take a screenshot of the annotated image and send it to Codex.
3. Use this prompt:

```text
Use my Cowart annotation screenshot to generate a clean revised image beside the original.
```

Codex reads the notes and arrows in the screenshot, generates a clean revised image without annotation artifacts, and places it beside the original. The original image and annotations are not deleted or moved.

![Generate a revised image from a Cowart annotation screenshot](assets/annotation-edit.png)

## Skills

- `cowart:cowart-open-canvas`: open the local Cowart canvas.
- `cowart:cowart-image-gen`: insert a generated image into the selected AI image holder.
- `cowart:cowart-image-edit`: generate a revised image from a user-provided Cowart annotation screenshot.

## Local Development

```bash
npm install
npm run dev
npm run build
```

You can also start the canvas service directly and pass the active user project directory:

```bash
./scripts/start-canvas.sh /path/to/user/project
```

Useful environment variables:

- `COWART_PORT`: local service port, default `43217`.
- `COWART_PROJECT_DIR`: the user project directory that owns the canvas data.
- `COWART_CANVAS_DIR`: canvas data directory, default `$COWART_PROJECT_DIR/canvas`.

## Developer

ZHONG XIN  
zhongxin123456@gmail.com  
https://www.jiqiren.ai

## Acknowledgements

Cowart's canvas experience is built on top of [tldraw/tldraw](https://github.com/tldraw/tldraw).
