---
name: cowart-image-gen
description: Generate a final AI bitmap into the selected Cowart "AI 图片" holder, including any requested in-image text by default. Use when the user asks Codex to create, fill, replace, or place an AI-generated image inside the currently selected AI image placeholder on a Cowart canvas.
---

# Cowart Image Gen

Use this skill when the selected Cowart canvas shape is an `AI 图片` holder created by the Cowart toolbar.

## Preconditions

The Cowart service should be running for the user's active project, usually at:

```text
http://127.0.0.1:43217
```

New holders are tldraw `frame` shapes with:

```json
{
  "type": "frame",
  "meta": {
    "cowartAiImageHolder": true
  }
}
```

Older canvases may still contain legacy `geo` rectangle holders with the same
meta flag. Support both shapes.

## Workflow

1. Read the selected shape from Cowart:

   ```bash
   curl -s http://127.0.0.1:43217/api/selection
   ```

   You can also use the Cowart MCP `get_cowart_selection` tool if it is available.

2. Continue only when exactly one selected shape has either:

   ```text
   isAiImageHolder: true
   ```

   or:

   ```text
   meta.cowartAiImageHolder: true
   ```

   If not, ask the user to select an `AI 图片` holder.

3. Use the selected holder's `props.w` and `props.h` as the size contract. The generated image should match the holder aspect ratio as closely as possible.

   If the holder `type` is `frame`, insert the generated image as a child of the frame:

   - `parentId`: holder shape id
   - `x`: `0`
   - `y`: `0`
   - `rotation`: `0`
   - `props.w`, `props.h`: same as holder

   This makes the generated image move with the frame.

   If the holder is a legacy `geo` rectangle, keep using the legacy placement contract: same `x`, `y`, `rotation`, `parentId`, `props.w`, and `props.h` as the holder.

4. Record a generation cutoff timestamp before calling the image tool:

   ```bash
   date -u +"%Y-%m-%dT%H:%M:%SZ"
   ```

5. Generate the bitmap with the built-in `imagegen` skill unless the user explicitly requests another image path. If the requested asset needs visible copy, labels, poster text, ad text, UI text, or typography, include that text directly in the image generation prompt and let the image model produce the final bitmap. Do not default to generating a text-free background and then adding text locally unless the user explicitly asks for local typography, deterministic text overlay, SVG/vector output, or another non-imagegen layout step.

6. Resolve the actual generated bitmap file. Do not assume that `$CODEX_HOME/generated_images/...` contains the latest built-in image output; some Codex desktop sessions store the generated PNG directly in the session JSONL as `image_generation_call.result` base64 without writing a new file under `generated_images`.

   First, look for a generated image file modified after the cutoff timestamp:

   ```bash
   find "${CODEX_HOME:-$HOME/.codex}/generated_images" -type f \
     \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' \) \
     -newermt "<cutoff-timestamp>" -print
   ```

   If no new file exists, extract the latest built-in image result from the Codex session JSONL:

   ```bash
   node skills/cowart-image-gen/scripts/extract-latest-imagegen-result.mjs \
     --after "<cutoff-timestamp>" \
     --out /tmp/cowart-imagegen-result.png
   ```

   The helper defaults to the newest session under `${CODEX_HOME:-$HOME/.codex}/sessions`. Pass `--session /path/to/session.jsonl` if the current session is not the newest session file.

7. Inspect the resolved local image before inserting it. Use `view_image` when available, or another direct visual check. Continue only after confirming that the local file matches the user's prompt. Never insert a file selected only by "latest directory" or by an old `generated_images` folder name.

   For project-bound output, copy the verified local generated image into the selected page's asset folder:

   ```text
   canvas/pages/<page-id-without-page-prefix>/assets/
   ```

8. Insert the verified generated image as a new tldraw image shape exactly over the holder:

   - `type`: `image`
   - `parentId`: holder id for frame holders, same as holder parent for legacy geo holders
   - `x`, `y`, `rotation`: `0`, `0`, `0` for frame holders, same as holder for legacy geo holders
   - `props.w`, `props.h`: same as holder
   - `props.assetId`: the new image asset id
   - `meta.cowartGeneratedForAiImageHolder`: holder shape id

9. Do not delete the holder unless the user explicitly asks for replacement. Keeping the holder lets Codex identify the intended slot again later.

10. Save through Cowart's API or edit the page snapshot carefully:

   ```bash
   curl -s http://127.0.0.1:43217/api/canvas
   ```

   Prefer page-local asset URLs in the image asset:

   ```text
   /page-assets/<page-id-without-page-prefix>/<filename>
   ```

11. Refresh or let the browser hot-reload, then confirm the inserted shape id, holder id, final dimensions, and saved asset path.

## Notes

- If the holder is a legacy rotated `geo` rectangle, preserve the same `rotation` on the image. For `frame` holders, the frame owns placement and the child image should stay unrotated inside it.
- If there is already a generated image for the same holder and the user says "替换", remove or update that generated image shape instead of piling another copy on top.
- Never overwrite an existing asset file without an explicit replace request; use a timestamped filename.
