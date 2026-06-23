import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const skillDir = new URL('../skills/cowart-image-gen/', import.meta.url)

async function assertFile(relativePath) {
  await access(new URL(relativePath, skillDir))
}

test('cowart-image-gen is a local fork of imagegen with bundled resources', async () => {
  const skillMarkdown = await readFile(new URL('SKILL.md', skillDir), 'utf8')

  assert.match(skillMarkdown, /name: "cowart-image-gen"/)
  assert.match(skillMarkdown, /local fork of the system `imagegen` skill/)
  assert.match(skillMarkdown, /cowartImageMap/)

  await assertFile('LICENSE.txt')
  await assertFile('agents/openai.yaml')
  await assertFile('assets/imagegen-small.svg')
  await assertFile('assets/imagegen.png')
  await assertFile('references/cli.md')
  await assertFile('references/image-api.md')
  await assertFile('references/image-map.md')
  await assertFile('references/prompting.md')
  await assertFile('references/sample-prompts.md')
  await assertFile('scripts/image_gen.py')
  await assertFile('scripts/remove_chroma_key.py')
})

test('cowart-image-gen references its local CLI helpers', async () => {
  const files = [
    'SKILL.md',
    join('references', 'cli.md'),
    join('references', 'image-api.md'),
    join('references', 'prompting.md'),
    join('references', 'sample-prompts.md'),
  ]

  for (const file of files) {
    const text = await readFile(new URL(file, skillDir), 'utf8')
    assert.doesNotMatch(text, /\$CODEX_HOME\/skills\/\.system\/imagegen/)
    assert.doesNotMatch(text, /\$\{CODEX_HOME:-\$HOME\/\.codex\}\/skills\/\.system\/imagegen/)
  }
})

test('cowart-image-gen requires final-bitmap inventory for object-level regions', async () => {
  const skillMarkdown = await readFile(new URL('SKILL.md', skillDir), 'utf8')
  const imageMapReference = await readFile(new URL('references/image-map.md', skillDir), 'utf8')

  assert.match(skillMarkdown, /visual inventory/)
  assert.match(skillMarkdown, /obvious internal objects/)
  assert.match(skillMarkdown, /vases, plants, buttons, cards, charts/)
  assert.match(skillMarkdown, /do not let that one module substitute/)
  assert.match(imageMapReference, /Prominent internal objects/)
  assert.match(imageMapReference, /vase/)
  assert.match(imageMapReference, /wall art/)
  assert.match(imageMapReference, /table-lamp/)
  assert.match(imageMapReference, /Do not use one `Walnut sideboard and wall art` rectangle/)
})
