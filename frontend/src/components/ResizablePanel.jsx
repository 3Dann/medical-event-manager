import { useState, useRef, useEffect, useCallback } from 'react'

/**
 * ResizablePanel — wraps children in a panel whose size can be changed by dragging a handle.
 *
 * direction="vertical"   → handle at top edge, drag up/down to change height
 * direction="horizontal" → handle at left edge (in RTL layouts), drag left/right to change width
 */
export default function ResizablePanel({
  children,
  direction = 'vertical',
  defaultSize = 380,
  minSize = 180,
  maxSize = 750,
  className = '',
}) {
  const [size, setSize] = useState(defaultSize)
  const drag = useRef({ active: false, startPos: 0, startSize: 0 })

  const onDragStart = useCallback((e) => {
    drag.current = {
      active: true,
      startPos: direction === 'vertical' ? e.clientY : e.clientX,
      startSize: size,
    }
    // Lock cursor + suppress text selection globally for the duration of the drag
    document.documentElement.style.cursor = direction === 'vertical' ? 'ns-resize' : 'ew-resize'
    document.documentElement.style.userSelect = 'none'
    e.preventDefault()
  }, [size, direction])

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return
      const pos = direction === 'vertical' ? e.clientY : e.clientX
      // vertical:   drag up   → bigger  (startPos > pos → positive delta)
      // horizontal: drag left → smaller, drag right → bigger
      const delta = direction === 'vertical'
        ? drag.current.startPos - pos
        : pos - drag.current.startPos
      setSize(Math.max(minSize, Math.min(maxSize, drag.current.startSize + delta)))
      // Critical: prevent page scroll while resizing
      e.preventDefault()
    }

    const onUp = () => {
      if (!drag.current.active) return
      drag.current.active = false
      document.documentElement.style.cursor = ''
      document.documentElement.style.userSelect = ''
    }

    // passive: false is required so preventDefault() is honoured on scroll-capable targets
    document.addEventListener('mousemove', onMove, { passive: false })
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [direction, minSize, maxSize])

  const isVertical = direction === 'vertical'

  return (
    <div
      className={`flex overflow-hidden ${isVertical ? 'flex-col' : 'flex-row'} ${className}`}
      style={isVertical ? { height: size } : { width: size, minWidth: minSize }}
    >
      {/* Drag handle — top for vertical, right edge for horizontal (RTL: visually left) */}
      <div
        onMouseDown={onDragStart}
        title="גרור לשינוי גודל"
        className={[
          'flex-shrink-0 flex items-center justify-center',
          'bg-slate-50 hover:bg-blue-50 transition-colors group select-none',
          isVertical
            ? 'h-3 w-full cursor-ns-resize border-t border-slate-200'
            : 'w-3 h-full cursor-ew-resize border-l border-slate-200',
          // touch-action none prevents mobile scroll hijack
          '[touch-action:none]',
        ].join(' ')}
      >
        <div className={[
          'rounded-full bg-slate-300 group-hover:bg-blue-400 transition-colors',
          isVertical ? 'w-10 h-1' : 'w-1 h-10',
        ].join(' ')} />
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
