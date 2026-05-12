/**
 * Accessible confirmation dialog — replaces all window.confirm() calls.
 * Usage:
 *   const [confirm, ConfirmUI] = useConfirm()
 *   await confirm({ title: '...', message: '...', danger: true })
 */
import { useState, useCallback } from 'react'

export function useConfirm() {
  const [state, setState] = useState(null)

  const confirm = useCallback(({ title, message, confirmLabel = 'אשר', cancelLabel = 'ביטול', danger = false }) =>
    new Promise(resolve => {
      setState({ title, message, confirmLabel, cancelLabel, danger, resolve })
    }), [])

  const handle = (value) => {
    state?.resolve(value)
    setState(null)
  }

  const ConfirmUI = state ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-msg"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h2 id="confirm-title" className="text-lg font-bold text-slate-800 mb-2">{state.title}</h2>
        {state.message && <p id="confirm-msg" className="text-sm text-slate-600 mb-6 leading-relaxed">{state.message}</p>}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => handle(false)}
            className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg min-h-[44px]"
          >
            {state.cancelLabel}
          </button>
          <button
            autoFocus
            onClick={() => handle(true)}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg min-h-[44px] ${
              state.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return [confirm, ConfirmUI]
}
