import { useState, useRef, useEffect, useCallback } from 'react'

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
  const computedMax = maxSize ?? Math.floor(
    (direction === 'vertical' ? window.innerHeight : window.innerWidth) * 0.85
  )

  const [size, setSize] = useState(() => {
    if (storageKey) {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = parseInt(saved, 10)
        if (!isNaN(parsed) && parsed >= minSize && parsed <= computedMax) return parsed
      }
    }
    return defaultSize
  })

  const drag      = useRef({ active: false, startPos: 0, startSize: 0 })
  const sizeRef   = useRef(size)
  const minRef    = useRef(minSize)
  const maxRef    = useRef(computedMax)

  useEffect(() => { minRef.current = minSize }, [minSize])
  useEffect(() => { maxRef.current = computedMax }, [computedMax])
  useEffect(() => { sizeRef.current = size }, [size])

  const persist = useCallback((value) => {
    if (storageKey) localStorage.setItem(storageKey, String(value))
  }, [storageKey])

  const onDragStart = useCallback((e) => {
    drag.current = {
      active: true,
      startPos: direction === 'vertical' ? e.clientY : e.clientX,
      startSize: sizeRef.current,
    }
    document.documentElement.style.cursor = direction === 'vertical' ? 'ns-resize' : 'ew-resize'
    document.documentElement.style.userSelect = 'none'
    e.preventDefault()
  }, [direction])

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return
      const pos = direction === 'vertical' ? e.clientY : e.clientX
      const delta = direction === 'vertical'
        ? drag.current.startPos - pos
        : pos - drag.current.startPos
      const next = Math.max(minRef.current, Math.min(maxRef.current, drag.current.startSize + delta))
      sizeRef.current = next
      setSize(next)
      e.preventDefault()
    }

    const onUp = () => {
      if (!drag.current.active) return
      drag.current.active = false
      document.documentElement.style.cursor = ''
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
        title="גרור לשינוי גודל"
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
