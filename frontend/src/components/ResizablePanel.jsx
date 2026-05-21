import { useState, useRef, useEffect, useCallback } from 'react'

// Safe viewport accessor — returns 0 in SSR / test environments where window is absent.
function viewportDim(dir) {
  if (typeof window === 'undefined') return 0
  return dir === 'vertical' ? window.innerHeight : window.innerWidth
}

// Safe localStorage helpers — private-mode browsers may throw on any storage access.
function lsGet(key) {
  try { return key ? localStorage.getItem(key) : null }
  catch { return null }
}
function lsSet(key, value) {
  try { if (key) localStorage.setItem(key, String(value)) }
  catch { /* storage unavailable — silently ignore */ }
}

/**
 * ResizablePanel — wraps children in a panel whose size can be changed by dragging a handle.
 *
 * direction="vertical"   → handle at top edge, drag up/down to change height
 * direction="horizontal" → handle at left edge (in RTL layouts), drag left/right to change width
 *
 * storageKey — if provided, persists the user's chosen size in localStorage across sessions.
 * maxSize    — if omitted, defaults to 85% of the relevant viewport dimension.
 */
export default function ResizablePanel({
  children,
  direction = 'vertical',
  defaultSize = 380,
  minSize = 180,
  maxSize,
  storageKey,
  className = '',
}) {
  const [size, setSize] = useState(() => {
    const dim = viewportDim(direction)
    const max = maxSize ?? (dim > 0 ? Math.floor(dim * 0.85) : defaultSize * 2)
    const saved = lsGet(storageKey)
    if (saved) {
      const parsed = parseInt(saved, 10)
      if (!isNaN(parsed) && parsed >= minSize && parsed <= max) return parsed
    }
    return defaultSize
  })

  const drag    = useRef({ active: false, startPos: 0, startSize: 0 })
  const sizeRef = useRef(size)
  const minRef  = useRef(minSize)
  const maxRef  = useRef(0)

  // Compute effective max synchronously on every render so drag/keyboard always
  // see an up-to-date ceiling. Using a local variable (not just the ref) ensures
  // aria-valuemax in JSX also reflects the current value.
  const vp         = viewportDim(direction)
  const currentMax = maxSize ?? (vp > 0 ? Math.floor(vp * 0.85) : size * 2)

  // Keep refs in sync — safe to mutate inline (no side-effects, no re-render triggered).
  sizeRef.current = size
  minRef.current  = minSize
  maxRef.current  = currentMax

  const persist = useCallback((value) => {
    lsSet(storageKey, value)
  }, [storageKey])

  const onDragStart = useCallback((e) => {
    drag.current = {
      active:    true,
      startPos:  direction === 'vertical' ? e.clientY : e.clientX,
      startSize: sizeRef.current,
    }
    document.documentElement.style.cursor     = direction === 'vertical' ? 'ns-resize' : 'ew-resize'
    document.documentElement.style.userSelect = 'none'
    e.preventDefault()
  }, [direction])

  // Keyboard resize: Arrow keys ±20px, Shift+Arrow ±80px.
  // persist is called outside the state updater to avoid side-effects inside updaters.
  const onKeyDown = useCallback((e) => {
    const STEP   = e.shiftKey ? 80 : 20
    const grow   = direction === 'vertical' ? 'ArrowUp'   : 'ArrowRight'
    const shrink = direction === 'vertical' ? 'ArrowDown'  : 'ArrowLeft'
    if (e.key !== grow && e.key !== shrink) return
    e.preventDefault()
    const next = e.key === grow
      ? Math.min(maxRef.current, sizeRef.current + STEP)
      : Math.max(minRef.current, sizeRef.current - STEP)
    setSize(next)
    persist(next)
  }, [direction, persist])

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return
      const pos   = direction === 'vertical' ? e.clientY : e.clientX
      const delta = direction === 'vertical'
        ? drag.current.startPos - pos
        : pos - drag.current.startPos
      const next  = Math.max(minRef.current, Math.min(maxRef.current, drag.current.startSize + delta))
      sizeRef.current = next
      setSize(next)
      e.preventDefault()
    }

    const onUp = () => {
      if (!drag.current.active) return
      drag.current.active = false
      document.documentElement.style.cursor     = ''
      document.documentElement.style.userSelect = ''
      persist(sizeRef.current)
    }

    document.addEventListener('mousemove', onMove, { passive: false })
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [direction, persist])

  const isVertical = direction === 'vertical'

  return (
    <div
      className={`flex overflow-hidden ${isVertical ? 'flex-col' : 'flex-row'} ${className}`}
      style={isVertical ? { height: size } : { width: size, minWidth: minSize }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        onKeyDown={onKeyDown}
        role="separator"
        aria-orientation={isVertical ? 'horizontal' : 'vertical'}
        aria-valuenow={size}
        aria-valuemin={minSize}
        aria-valuemax={currentMax}
        aria-label="שינוי גודל — גרור עם העכבר או השתמש במקשי חץ"
        tabIndex={0}
        title="גרור לשינוי גודל (מקשי חץ: ±20px, Shift+חץ: ±80px)"
        className={[
          'flex-shrink-0 flex items-center justify-center',
          'bg-slate-50 hover:bg-blue-50 transition-colors group select-none',
          isVertical
            ? 'h-3 w-full cursor-ns-resize border-t border-slate-200'
            : 'w-3 h-full cursor-ew-resize border-l border-slate-200',
          '[touch-action:none]',
        ].join(' ')}
      >
        <div className={[
          'rounded-full bg-slate-300 group-hover:bg-blue-400 transition-colors',
          isVertical ? 'w-10 h-1' : 'w-1 h-10',
        ].join(' ')} />
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
