import { useCallback, useEffect, useState } from 'react'
import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  TldrawUiMenuCheckboxItem,
  TldrawUiMenuGroup,
  TldrawUiMenuSubmenu
} from 'tldraw'
import { CowartDashscopeConfigDialog } from './CowartDashscopeConfigDialog.jsx'

const MODEL_PREFERENCES_ENDPOINT = '/api/model-preferences'

const IMAGE_PROVIDER_OPTIONS = [
  { id: 'openai', label: 'Codex 默认', model: 'openai' },
  { id: 'dashscope', label: '阿里千问', model: 'wan2.7-image-pro' }
]

function useCowartImageProvider() {
  const [provider, setProvider] = useState('openai')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let isCancelled = false

    async function loadPreferences() {
      try {
        const response = await fetch(MODEL_PREFERENCES_ENDPOINT)
        if (!response.ok) return
        const payload = await response.json()
        const nextProvider = payload?.preferences?.imageProvider
        if (!isCancelled && IMAGE_PROVIDER_OPTIONS.some((option) => option.id === nextProvider)) {
          setProvider(nextProvider)
        }
      } catch {
        // Keep OpenAI as the UI default when preferences are not available.
      }
    }

    loadPreferences()

    return () => {
      isCancelled = true
    }
  }, [])

  const saveProvider = useCallback(async (nextProvider) => {
    const option = IMAGE_PROVIDER_OPTIONS.find((item) => item.id === nextProvider) ?? IMAGE_PROVIDER_OPTIONS[0]
    setProvider(option.id)
    setIsSaving(true)

    try {
      await fetch(MODEL_PREFERENCES_ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          version: 1,
          imageProvider: option.id,
          imageModel: option.model,
          updatedAt: new Date().toISOString()
        })
      })
    } catch {
      setProvider('openai')
    } finally {
      setIsSaving(false)
    }
  }, [])

  return { provider, isSaving, saveProvider }
}

export function CowartMainMenu(props) {
  const [isDashscopeConfigOpen, setIsDashscopeConfigOpen] = useState(false)

  return (
    <>
      <DefaultMainMenu {...props}>
        <DefaultMainMenuContent />
        <TldrawUiMenuGroup id="cowart-model-provider">
          <CowartImageProviderMenu onConfigureDashscope={() => setIsDashscopeConfigOpen(true)} />
        </TldrawUiMenuGroup>
      </DefaultMainMenu>
      {isDashscopeConfigOpen && (
        <CowartDashscopeConfigDialog onClose={() => setIsDashscopeConfigOpen(false)} />
      )}
    </>
  )
}

function CowartImageProviderMenu({ onConfigureDashscope }) {
  const { provider, isSaving, saveProvider } = useCowartImageProvider()

  return (
    <TldrawUiMenuSubmenu id="cowart-model-provider" label="模型选择">
      <TldrawUiMenuGroup id="cowart-model-provider-options">
        <TldrawUiMenuCheckboxItem
          checked={provider === 'openai'}
          disabled={isSaving}
          id="cowart-model-provider-openai"
          label="Codex 默认"
          onSelect={() => saveProvider('openai')}
          readonlyOk
        />
        <button
          className="tlui-button tlui-button__menu tlui-button__checkbox cowart-provider-menu-item"
          disabled={isSaving}
          onClick={() => saveProvider('dashscope')}
          type="button"
        >
          <span className="cowart-provider-menu-check">{provider === 'dashscope' ? '✓' : ''}</span>
          <span className="tlui-button__label cowart-provider-menu-label">阿里千问</span>
          <span
            className="cowart-provider-menu-config"
            onClick={(event) => {
              event.stopPropagation()
              onConfigureDashscope()
            }}
            role="button"
            tabIndex={0}
          >
            配置
          </span>
        </button>
      </TldrawUiMenuGroup>
    </TldrawUiMenuSubmenu>
  )
}
