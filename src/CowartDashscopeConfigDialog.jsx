import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const DASHSCOPE_CONFIG_ENDPOINT = '/api/dashscope-config'
const DEFAULT_DASHSCOPE_BASE_URL = 'https://<workspace-id>.cn-beijing.maas.aliyuncs.com/api/v1'
const DEFAULT_DASHSCOPE_MODEL = 'wan2.7-image-pro'

function emptyDashscopeConfig() {
  return {
    apiKey: '',
    baseUrl: '',
    model: DEFAULT_DASHSCOPE_MODEL,
    configured: false,
    apiKeyPreview: ''
  }
}

function stopInputEvent(event) {
  event.stopPropagation()
}

export function CowartDashscopeConfigDialog({ onClose }) {
  const [config, setConfig] = useState(emptyDashscopeConfig)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    let isCancelled = false

    async function loadConfig() {
      try {
        const response = await fetch(DASHSCOPE_CONFIG_ENDPOINT)
        if (!response.ok) return
        const payload = await response.json()
        if (isCancelled) return
        const nextConfig = {
          ...emptyDashscopeConfig(),
          ...payload.config
        }
        setConfig(nextConfig)
      } catch {
        if (!isCancelled) setMessage('读取配置失败')
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    }

    loadConfig()

    return () => {
      isCancelled = true
    }
  }, [])

  function updateConfig(field, value) {
    setConfig((current) => ({ ...current, [field]: value }))
  }

  function stopDialogEvent(event) {
    event.stopPropagation()
  }

  async function saveConfig(event) {
    event.preventDefault()
    setIsSaving(true)
    setMessage('')

    const apiKey = apiKeyInput.trim()
    if (!apiKey && !config.configured) {
      setMessage('请填写 DASHSCOPE_API_KEY')
      setIsSaving(false)
      return
    }

    if (!config.baseUrl.trim()) {
      setMessage('请填写 DASHSCOPE_BASE_URL')
      setIsSaving(false)
      return
    }

    try {
      const response = await fetch(DASHSCOPE_CONFIG_ENDPOINT, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          baseUrl: config.baseUrl,
          model: config.model || DEFAULT_DASHSCOPE_MODEL
        })
      })
      const payload = await response.json()
      if (!response.ok) {
        setMessage(payload?.error || '保存失败')
        return
      }
      setConfig({ ...emptyDashscopeConfig(), ...payload.config })
      setApiKeyInput('')
      setToast('已保存')
      window.setTimeout(onClose, 700)
    } catch {
      setMessage('保存失败')
    } finally {
      setIsSaving(false)
    }
  }

  const dialog = (
    <div className="cowart-config-backdrop" role="presentation" onMouseDown={onClose}>
      {toast && <div className="cowart-config-toast">{toast}</div>}
      <form
        aria-label="配置阿里千问"
        className="cowart-config-dialog"
        onClick={stopDialogEvent}
        onKeyDown={stopDialogEvent}
        onMouseDown={(event) => event.stopPropagation()}
        onMouseDownCapture={stopDialogEvent}
        onPointerDown={stopDialogEvent}
        onPointerDownCapture={stopDialogEvent}
        onPointerMove={stopDialogEvent}
        onPointerMoveCapture={stopDialogEvent}
        onPointerUp={stopDialogEvent}
        onPointerUpCapture={stopDialogEvent}
        onSubmit={saveConfig}
        onWheel={stopDialogEvent}
        onWheelCapture={stopDialogEvent}
      >
        <div className="cowart-config-dialog-header">
          <h2>配置阿里千问</h2>
          <button
            aria-label="关闭"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            onPointerDown={stopInputEvent}
            type="button"
          >
            ×
          </button>
        </div>

        <label className="cowart-config-field">
          <span>DASHSCOPE_API_KEY</span>
          <input
            autoComplete="off"
            disabled={isLoading || isSaving}
            onChange={(event) => setApiKeyInput(event.target.value)}
            onClick={stopInputEvent}
            onKeyDown={stopInputEvent}
            onPointerDown={stopInputEvent}
            placeholder={config.configured ? config.apiKeyPreview : 'sk-...'}
            type="password"
            value={apiKeyInput}
          />
        </label>

        <label className="cowart-config-field">
          <span>DASHSCOPE_BASE_URL</span>
          <input
            disabled={isLoading || isSaving}
            onChange={(event) => updateConfig('baseUrl', event.target.value)}
            onClick={stopInputEvent}
            onKeyDown={stopInputEvent}
            onPointerDown={stopInputEvent}
            placeholder={DEFAULT_DASHSCOPE_BASE_URL}
            value={config.baseUrl}
          />
        </label>

        <label className="cowart-config-field">
          <span>模型</span>
          <input
            disabled={isLoading || isSaving}
            onChange={(event) => updateConfig('model', event.target.value)}
            onClick={stopInputEvent}
            onKeyDown={stopInputEvent}
            onPointerDown={stopInputEvent}
            placeholder={DEFAULT_DASHSCOPE_MODEL}
            value={config.model}
          />
        </label>

        <div className="cowart-config-actions">
          <span className="cowart-config-message">{message}</span>
          <button className="cowart-config-cancel" onClick={onClose} type="button">
            取消
          </button>
          <button disabled={isLoading || isSaving} type="submit">
            保存
          </button>
        </div>
      </form>
    </div>
  )

  return createPortal(dialog, document.body)
}
