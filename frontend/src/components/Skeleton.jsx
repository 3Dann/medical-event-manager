export function SkeletonLine({ w = 'full', h = 4 }) {
  return (
    <div
      className={`w-${w} h-${h} bg-slate-200 rounded animate-pulse`}
      role="presentation"
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3" aria-busy="true" aria-label="טוען...">
      <SkeletonLine w="1/2" h={5} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} w={i === lines - 1 ? '3/4' : 'full'} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="טוען נתונים...">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} h={5} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} w={c === cols - 1 ? '3/4' : 'full'} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Skeleton({ type = 'card', ...props }) {
  if (type === 'table') return <SkeletonTable {...props} />
  return <SkeletonCard {...props} />
}
