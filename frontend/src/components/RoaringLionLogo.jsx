export default function RoaringLionLogo({ size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="שאגת הארי"
    >
      {/* Shield background */}
      <path
        d="M60 8 L108 28 L108 72 Q108 100 60 114 Q12 100 12 72 L12 28 Z"
        fill="#1e3a5f"
        stroke="#c9a227"
        strokeWidth="3"
      />
      {/* Inner shield */}
      <path
        d="M60 16 L100 33 L100 72 Q100 96 60 108 Q20 96 20 72 L20 33 Z"
        fill="#1a3050"
      />

      {/* Lion face — head */}
      <ellipse cx="60" cy="58" rx="22" ry="20" fill="#e8a020" />

      {/* Mane rays */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => {
        const rad = (angle * Math.PI) / 180
        const x1 = 60 + Math.cos(rad) * 22
        const y1 = 58 + Math.sin(rad) * 20
        const x2 = 60 + Math.cos(rad) * 33
        const y2 = 58 + Math.sin(rad) * 31
        return (
          <line
            key={i}
            x1={x1} y1={y1}
            x2={x2} y2={y2}
            stroke="#c9a227"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        )
      })}

      {/* Mane circle */}
      <ellipse cx="60" cy="58" rx="28" ry="26" fill="none" stroke="#c9a227" strokeWidth="2" />

      {/* Eyes */}
      <ellipse cx="53" cy="54" rx="4" ry="3.5" fill="#1a1a1a" />
      <ellipse cx="67" cy="54" rx="4" ry="3.5" fill="#1a1a1a" />
      <circle cx="52" cy="53" r="1.2" fill="white" />
      <circle cx="66" cy="53" r="1.2" fill="white" />

      {/* Nose */}
      <path d="M57 61 Q60 63 63 61 Q61 65 60 66 Q59 65 57 61 Z" fill="#7a3010" />

      {/* Open roaring mouth */}
      <path
        d="M50 67 Q55 75 60 76 Q65 75 70 67 Q65 72 60 73 Q55 72 50 67 Z"
        fill="#7a1010"
        stroke="#5a0a0a"
        strokeWidth="0.5"
      />
      {/* Teeth */}
      <path d="M54 67 L55 71 L56 67 Z" fill="white" />
      <path d="M64 67 L65 71 L66 67 Z" fill="white" />
      <path d="M58 67 L59 70 L60 67 Z" fill="white" />
      <path d="M60 67 L61 70 L62 67 Z" fill="white" />

      {/* Whisker lines */}
      <line x1="38" y1="60" x2="50" y2="62" stroke="#c9a227" strokeWidth="1" strokeLinecap="round" />
      <line x1="38" y1="64" x2="50" y2="64" stroke="#c9a227" strokeWidth="1" strokeLinecap="round" />
      <line x1="70" y1="62" x2="82" y2="60" stroke="#c9a227" strokeWidth="1" strokeLinecap="round" />
      <line x1="70" y1="64" x2="82" y2="64" stroke="#c9a227" strokeWidth="1" strokeLinecap="round" />

      {/* Hebrew text at bottom of shield */}
      <text
        x="60"
        y="106"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fill="#c9a227"
        fontFamily="Arial, sans-serif"
        letterSpacing="1"
      >
        שאגת הארי
      </text>
    </svg>
  )
}
