import React, { useEffect, useRef, useState } from 'react'

/* ─── Injected styles ─────────────────────────────────────────────────────── */
const CSS = `
.hs-root {
  min-height: 100vh;
  background: linear-gradient(150deg, #162B4A 0%, #1E3A63 45%, #24487A 100%);
  position: relative;
  overflow: hidden;
  font-family: 'Heebo', sans-serif;
  direction: rtl;
}

/* ── Background layers ── */
.hs-mesh {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 70% 55% at 15% 55%, rgba(0,140,255,.20) 0%, transparent 60%),
    radial-gradient(ellipse 55% 70% at 85% 15%, rgba(0,210,255,.12) 0%, transparent 55%),
    radial-gradient(ellipse 45% 45% at 65% 85%, rgba(6,200,220,.10) 0%, transparent 50%);
}
.hs-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(0,100,200,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,100,200,.05) 1px, transparent 1px);
  background-size: 64px 64px;
}
.hs-noise {
  position: absolute; inset: 0; pointer-events: none; opacity: .025;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 256px;
}

/* ── Layout ── */
.hs-inner {
  position: relative; z-index: 1;
  max-width: 1240px; margin: 0 auto;
  padding: 90px 48px 72px;
  display: grid;
  grid-template-columns: 1fr 1.05fr;
  gap: 64px;
  align-items: center;
  min-height: 100vh;
}
@media (max-width: 900px) {
  .hs-inner { grid-template-columns: 1fr; padding: 72px 24px 48px; }
  .hs-illus { height: 380px !important; }
}

/* ── Text side ── */
.hs-text { animation: hs-slideR .9s cubic-bezier(.22,1,.36,1) both; }
@keyframes hs-slideR {
  from { opacity: 0; transform: translateX(-28px); }
  to   { opacity: 1; transform: translateX(0); }
}

.hs-badge {
  display: inline-flex; align-items: center; gap: 8px;
  background: rgba(0,110,220,.14);
  border: 1px solid rgba(0,160,255,.28);
  border-radius: 100px; padding: 6px 18px;
  font-size: 12.5px; color: #70C4FF; font-weight: 700;
  letter-spacing: .06em; margin-bottom: 28px;
}
.hs-badge-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #0099FF;
  box-shadow: 0 0 8px #0099FF;
  animation: hs-pulse-dot 2.2s ease-in-out infinite;
}
@keyframes hs-pulse-dot {
  0%,100% { opacity: 1; transform: scale(1); }
  50%      { opacity: .5; transform: scale(1.6); }
}

.hs-title {
  font-size: clamp(38px, 4.8vw, 66px);
  font-weight: 900; line-height: 1.08;
  color: #EEF4FF; margin-bottom: 22px;
  letter-spacing: -.02em;
}
.hs-title-grad {
  background: linear-gradient(125deg, #38BEFF 0%, #00D8FF 40%, #06FFC8 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hs-sub {
  font-size: 17px; line-height: 1.75;
  color: rgba(180,210,255,.68);
  margin-bottom: 40px; max-width: 460px;
}

.hs-ctas { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 52px; }

.hs-btn-p {
  padding: 15px 36px;
  background: linear-gradient(135deg, #0055CC, #0088EE);
  color: #fff; font-family: 'Heebo',sans-serif;
  font-size: 16px; font-weight: 700;
  border: none; border-radius: 14px; cursor: pointer;
  position: relative; overflow: hidden;
  box-shadow: 0 10px 36px rgba(0,100,220,.38);
  transition: transform .2s, box-shadow .2s;
}
.hs-btn-p::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, transparent 30%, rgba(255,255,255,.18) 50%, transparent 70%);
  transform: translateX(-120%); transition: transform .55s;
}
.hs-btn-p:hover { transform: translateY(-2px); box-shadow: 0 16px 44px rgba(0,100,220,.5); }
.hs-btn-p:hover::before { transform: translateX(120%); }

.hs-btn-s {
  padding: 15px 36px;
  background: transparent; color: rgba(190,220,255,.88);
  font-family: 'Heebo',sans-serif; font-size: 16px; font-weight: 600;
  border: 1px solid rgba(0,120,220,.4); border-radius: 14px; cursor: pointer;
  transition: all .2s;
}
.hs-btn-s:hover {
  background: rgba(0,100,220,.1);
  border-color: rgba(0,160,255,.6);
  color: #fff;
}

/* ── Stats row ── */
.hs-stats { display: flex; gap: 0; align-items: stretch; }
.hs-stat {
  flex: 1; padding: 0 24px 0 0;
  border-left: 1px solid rgba(0,100,200,.25);
}
.hs-stat:last-child { border-left: none; }
.hs-stat:first-child { padding-right: 0; }
.hs-stat-n {
  font-family: 'Syne', sans-serif;
  font-size: 30px; font-weight: 800;
  color: #38BEFF; line-height: 1;
  display: block;
}
.hs-stat-l {
  font-size: 12px; color: rgba(140,175,220,.65);
  font-weight: 500; margin-top: 4px; display: block;
}

/* ── Illustration ── */
.hs-illus {
  position: relative; height: 580px;
  animation: hs-slideL .9s cubic-bezier(.22,1,.36,1) .15s both;
}
@keyframes hs-slideL {
  from { opacity: 0; transform: translateX(28px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ── Floating cards ── */
.hs-card {
  position: absolute;
  background: rgba(5,18,40,.82);
  backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(0,100,200,.22);
  border-radius: 18px; padding: 16px 20px;
  box-shadow: 0 8px 40px rgba(0,0,0,.4);
  min-width: 148px;
}
.hs-card-1 { top: 18px;  right: 4px;  animation: hs-float 4.8s ease-in-out infinite; }
.hs-card-2 { bottom: 80px; left: 8px; animation: hs-float 4.8s ease-in-out 1.6s infinite; }
.hs-card-3 { top: 195px; right: 6px;  animation: hs-float 4.8s ease-in-out .9s infinite; }

@keyframes hs-float {
  0%,100% { transform: translateY(0); }
  50%      { transform: translateY(-9px); }
}

.hs-cl { font-size: 10.5px; color: rgba(140,175,220,.55); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 5px; }
.hs-cv { font-family: 'Syne',sans-serif; font-size: 22px; font-weight: 800; color: #EEF4FF; line-height: 1; }
.hs-cs { font-size: 12px; color: rgba(80,210,150,.85); margin-top: 4px; }
.hs-cbar { height: 3px; background: rgba(0,100,200,.2); border-radius: 2px; margin-top: 11px; overflow: hidden; }
.hs-cfill { height: 100%; border-radius: 2px; animation: hs-fill 1.8s cubic-bezier(.22,1,.36,1) .6s both; }
@keyframes hs-fill { from { width: 0 !important; } }

/* ── SVG animations ── */
.hs-node-ring {
  transform-origin: center;
  animation: hs-ring 3s ease-in-out infinite;
}
@keyframes hs-ring {
  0%,100% { opacity: .35; r: 0; }
  60%      { opacity: 0; }
}
.hs-node-ring-1 { animation-delay: 0s; }
.hs-node-ring-2 { animation-delay: 1s; }
.hs-node-ring-3 { animation-delay: 2s; }

.hs-traveler {
  offset-path: path('M 82 482 C 120 440 128 400 162 372 C 196 344 224 308 256 272 C 290 235 330 192 374 158');
  offset-rotate: 0deg;
  animation: hs-travel 7s linear infinite;
}
.hs-traveler-2 {
  offset-path: path('M 82 482 C 120 440 128 400 162 372 C 196 344 224 308 256 272 C 290 235 330 192 374 158');
  offset-rotate: 0deg;
  animation: hs-travel 7s linear 3.5s infinite;
}
@keyframes hs-travel {
  from { offset-distance: 0%; opacity: 1; }
  90%  { opacity: 1; }
  to   { offset-distance: 100%; opacity: 0; }
}
`

/* ─── SVG Illustration ─────────────────────────────────────────────────────── */
function JourneyIllustration() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 520 580" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Path gradient */}
        <linearGradient id="pathG" x1="82" y1="482" x2="374" y2="158" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#3B82F6"/>
          <stop offset="50%"  stopColor="#06B6D4"/>
          <stop offset="100%" stopColor="#10B981"/>
        </linearGradient>

        {/* Node gradients */}
        <radialGradient id="ng1" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#3B82F6"/>
          <stop offset="100%" stopColor="#1D4ED8"/>
        </radialGradient>
        <radialGradient id="ng2" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#06B6D4"/>
          <stop offset="100%" stopColor="#0E7490"/>
        </radialGradient>
        <radialGradient id="ng3" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#10B981"/>
          <stop offset="100%" stopColor="#065F46"/>
        </radialGradient>

        {/* Ground tile gradient */}
        <linearGradient id="tileG" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#0A2040" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#051020" stopOpacity="0.4"/>
        </linearGradient>

        {/* Glow filter */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow-sm" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="blur-xl">
          <feGaussianBlur stdDeviation="18"/>
        </filter>
      </defs>

      {/* ── Isometric ground tiles (bottom area) ── */}
      {[
        [60,520,80,500,140,520,120,540],
        [140,520,160,500,220,520,200,540],
        [220,520,240,500,300,520,280,540],
        [100,540,120,520,180,540,160,560],
        [180,540,200,520,260,540,240,560],
      ].map(([x1,y1,x2,y2,x3,y3,x4,y4], i) => (
        <polygon key={i}
          points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
          fill="url(#tileG)" stroke="rgba(0,100,200,0.15)" strokeWidth="0.5"
        />
      ))}

      {/* ── Ambient glow blobs ── */}
      <ellipse cx="162" cy="372" rx="55" ry="55" fill="#3B82F6" filter="url(#blur-xl)" opacity="0.25"/>
      <ellipse cx="256" cy="272" rx="50" ry="50" fill="#06B6D4" filter="url(#blur-xl)" opacity="0.22"/>
      <ellipse cx="374" cy="158" rx="50" ry="50" fill="#10B981" filter="url(#blur-xl)" opacity="0.22"/>

      {/* ── Path glow (thick, blurred) ── */}
      <path d="M 82 482 C 120 440 128 400 162 372 C 196 344 224 308 256 272 C 290 235 330 192 374 158"
        stroke="url(#pathG)" strokeWidth="20" strokeLinecap="round" fill="none" opacity="0.12"/>

      {/* ── Dashed path ── */}
      <path d="M 82 482 C 120 440 128 400 162 372 C 196 344 224 308 256 272 C 290 235 330 192 374 158"
        stroke="url(#pathG)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="7 5" fill="none" opacity="0.55"/>

      {/* ── Solid path highlight ── */}
      <path d="M 82 482 C 120 440 128 400 162 372 C 196 344 224 308 256 272 C 290 235 330 192 374 158"
        stroke="url(#pathG)" strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.9"/>

      {/* ── Node 1: Diagnosis (162, 372) ── */}
      <circle cx="162" cy="372" r="0" fill="none" stroke="#3B82F6" strokeWidth="1" className="hs-node-ring hs-node-ring-1">
        <animate attributeName="r" from="22" to="48" dur="3s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.4" to="0" dur="3s" repeatCount="indefinite"/>
      </circle>
      <circle cx="162" cy="372" r="28" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.3)" strokeWidth="1"/>
      <circle cx="162" cy="372" r="22" fill="url(#ng1)" filter="url(#glow-sm)"/>
      {/* Folder icon */}
      <g transform="translate(162,372)">
        <path d="M-9,-7 L-9,8 L9,8 L9,-2 L3,-2 L0,-7 Z" fill="rgba(255,255,255,0.9)" opacity="0.85"/>
        <line x1="-6" y1="1" x2="6" y2="6"  stroke="#BFDBFE" strokeWidth="1.4"/>
        <line x1="-6" y1="6" x2="6" y2="1"  stroke="#BFDBFE" strokeWidth="1.4"/>
      </g>
      {/* Label */}
      <text x="162" y="410" textAnchor="middle" fill="#93C5FD" fontSize="12.5" fontFamily="Heebo" fontWeight="700">אבחון</text>
      {/* Connector dot to card area */}
      <line x1="134" y1="362" x2="95" y2="330" stroke="#3B82F6" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5"/>
      <circle cx="134" cy="362" r="2.5" fill="#3B82F6" opacity="0.6"/>

      {/* ── Node 2: Treatment (256, 272) ── */}
      <circle cx="256" cy="272" r="0" fill="none" stroke="#06B6D4" strokeWidth="1">
        <animate attributeName="r" from="22" to="48" dur="3s" begin="1s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.4" to="0" dur="3s" begin="1s" repeatCount="indefinite"/>
      </circle>
      <circle cx="256" cy="272" r="28" fill="rgba(6,182,212,0.12)" stroke="rgba(6,182,212,0.3)" strokeWidth="1"/>
      <circle cx="256" cy="272" r="22" fill="url(#ng2)" filter="url(#glow-sm)"/>
      {/* Medical cross icon */}
      <g transform="translate(256,272)">
        <rect x="-4" y="-10" width="8" height="20" rx="2.5" fill="rgba(255,255,255,0.9)" opacity="0.9"/>
        <rect x="-10" y="-4" width="20" height="8" rx="2.5" fill="rgba(255,255,255,0.9)" opacity="0.9"/>
      </g>
      <text x="256" y="310" textAnchor="middle" fill="#67E8F9" fontSize="12.5" fontFamily="Heebo" fontWeight="700">טיפול</text>
      <line x1="278" y1="260" x2="318" y2="235" stroke="#06B6D4" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5"/>
      <circle cx="278" cy="260" r="2.5" fill="#06B6D4" opacity="0.6"/>

      {/* ── Node 3: Recovery (374, 158) ── */}
      <circle cx="374" cy="158" r="0" fill="none" stroke="#10B981" strokeWidth="1">
        <animate attributeName="r" from="22" to="48" dur="3s" begin="2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.4" to="0" dur="3s" begin="2s" repeatCount="indefinite"/>
      </circle>
      <circle cx="374" cy="158" r="28" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.3)" strokeWidth="1"/>
      <circle cx="374" cy="158" r="22" fill="url(#ng3)" filter="url(#glow-sm)"/>
      {/* Heart icon */}
      <g transform="translate(374,158)">
        <path d="M0,7 C-9,-1 -13,-8 -7,-11 C-4,-12 0,-9 0,-9 C0,-9 4,-12 7,-11 C13,-8 9,-1 0,7Z"
          fill="rgba(255,255,255,0.92)" opacity="0.9"/>
        {/* Tiny wings suggestion */}
        <path d="M-12,-7 C-16,-9 -18,-5 -14,-4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" fill="none"/>
        <path d="M12,-7 C16,-9 18,-5 14,-4"  stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" fill="none"/>
      </g>
      <text x="374" y="196" textAnchor="middle" fill="#6EE7B7" fontSize="12.5" fontFamily="Heebo" fontWeight="700">החלמה</text>
      <line x1="396" y1="148" x2="430" y2="128" stroke="#10B981" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5"/>
      <circle cx="396" cy="148" r="2.5" fill="#10B981" opacity="0.6"/>

      {/* ── Doctor figure (between nodes 1-2) ── */}
      <g transform="translate(208,320)">
        {/* Body glow */}
        <ellipse cx="0" cy="0" rx="10" ry="20" fill="#1E40AF" opacity="0.3" filter="url(#glow-sm)"/>
        {/* Head */}
        <circle cx="0" cy="-19" r="6" fill="#93C5FD"/>
        {/* Coat */}
        <rect x="-7" y="-12" width="14" height="18" rx="4" fill="#DBEAFE" opacity="0.85"/>
        {/* Stethoscope */}
        <path d="M-3,-4 C-3,2 3,2 3,-4" stroke="#3B82F6" strokeWidth="1.5" fill="none"/>
        <circle cx="0" cy="-4.5" r="2" fill="#3B82F6"/>
        {/* Legs */}
        <rect x="-5" y="7" width="4" height="10" rx="2" fill="#1E3A8A" opacity="0.8"/>
        <rect x="1"  y="7" width="4" height="10" rx="2" fill="#1E3A8A" opacity="0.8"/>
      </g>

      {/* ── Patient figure (next to doctor) ── */}
      <g transform="translate(224,322)">
        <circle cx="0" cy="-18" r="6" fill="#FDE68A"/>
        <rect x="-6" y="-11" width="12" height="17" rx="4" fill="#BAE6FD" opacity="0.85"/>
        <rect x="-4" y="6"  width="3"  height="9"  rx="1.5" fill="#7DD3FC" opacity="0.8"/>
        <rect x="1"  y="6"  width="3"  height="9"  rx="1.5" fill="#7DD3FC" opacity="0.8"/>
      </g>

      {/* ── Floating DNA strand (decorative) ── */}
      <g transform="translate(440,320)" opacity="0.35">
        {[0,1,2,3,4,5].map(i => (
          <g key={i}>
            <line x1={Math.sin(i*1.1)*14} y1={i*14} x2={-Math.sin(i*1.1)*14} y2={i*14}
              stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx={Math.sin(i*1.1)*14} cy={i*14} r="2.5" fill="#06B6D4"/>
            <circle cx={-Math.sin(i*1.1)*14} cy={i*14} r="2.5" fill="#3B82F6"/>
          </g>
        ))}
        <path d={[0,1,2,3,4,5].map(i => `${i===0?'M':'L'} ${Math.sin(i*1.1)*14} ${i*14}`).join(' ')}
          stroke="#06B6D4" strokeWidth="1" fill="none" opacity="0.5"/>
        <path d={[0,1,2,3,4,5].map(i => `${i===0?'M':'L'} ${-Math.sin(i*1.1)*14} ${i*14}`).join(' ')}
          stroke="#3B82F6" strokeWidth="1" fill="none" opacity="0.5"/>
      </g>

      {/* ── Floating chart bars (decorative) ── */}
      <g transform="translate(60,180)" opacity="0.3">
        {[22,34,18,42,30,38].map((h, i) => (
          <rect key={i} x={i*10} y={44-h} width="7" height={h} rx="2"
            fill={`rgba(0,${140+i*15},${200+i*8},0.8)`}/>
        ))}
      </g>

      {/* ── Animated traveler dots on path ── */}
      <circle r="5" fill="#38BEFF" opacity="0.9" className="hs-traveler" filter="url(#glow-sm)"/>
      <circle r="3.5" fill="#06FFC8" opacity="0.7" className="hs-traveler-2" filter="url(#glow-sm)"/>

      {/* ── Step indicators ── */}
      {[{x:162,y:352,n:'01',c:'#3B82F6'},{x:256,y:252,n:'02',c:'#06B6D4'},{x:374,y:138,n:'03',c:'#10B981'}].map(({x,y,n,c})=>(
        <g key={n} transform={`translate(${x-36},${y-8})`}>
          <rect x="0" y="0" width="24" height="14" rx="7"
            fill="none" stroke={c} strokeWidth="0.8" opacity="0.5"/>
          <text x="12" y="10" textAnchor="middle" fill={c} fontSize="8" fontFamily="Syne" fontWeight="800" opacity="0.7">{n}</text>
        </g>
      ))}
    </svg>
  )
}

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function HeroSection({ onLogin, onRegister }) {
  return (
    <div className="hs-root">
      <style>{CSS}</style>
      <div className="hs-mesh"/>
      <div className="hs-grid"/>
      <div className="hs-noise"/>

      <div className="hs-inner">

        {/* ── Text ── */}
        <div className="hs-text">
          <div className="hs-badge">
            <span className="hs-badge-dot"/>
            OrMed
          </div>

          <h1 className="hs-title">
            מלווים כל צעד<br/>
            <span className="hs-title-grad">במסע הרפואי</span>
          </h1>

          <p className="hs-sub">
            פלטפורמה מקצועית לניהול מסע המטופל — מהאבחון ועד ההחלמה.
            ביטוחים, תביעות, תרופות וזרימות עבודה, כולן במקום אחד.
          </p>

          <div className="hs-ctas">
            <button className="hs-btn-p" onClick={onRegister}>
              בקש גישה למערכת
            </button>
            <button className="hs-btn-s" onClick={onLogin}>
              כניסה למערכת
            </button>
          </div>

          <div className="hs-stats">
            <div className="hs-stat">
              <span className="hs-stat-n">500+</span>
              <span className="hs-stat-l">מטופלים מנוהלים</span>
            </div>
            <div className="hs-stat">
              <span className="hs-stat-n">98%</span>
              <span className="hs-stat-l">שביעות רצון</span>
            </div>
            <div className="hs-stat">
              <span className="hs-stat-n">₪2.4M</span>
              <span className="hs-stat-l">תביעות מאושרות</span>
            </div>
          </div>
        </div>

        {/* ── Illustration ── */}
        <div className="hs-illus">
          <JourneyIllustration/>

          {/* Floating card 1 — active patients */}
          <div className="hs-card hs-card-1">
            <div className="hs-cl">מטופלים פעילים</div>
            <div className="hs-cv">847</div>
            <div className="hs-cs">↑ 12% החודש</div>
            <div className="hs-cbar">
              <div className="hs-cfill" style={{width:'72%', background:'linear-gradient(90deg,#0066CC,#00D4FF)'}}/>
            </div>
          </div>

          {/* Floating card 2 — claims */}
          <div className="hs-card hs-card-2">
            <div className="hs-cl">תביעות שאושרו</div>
            <div className="hs-cv">₪2.4M</div>
            <div className="hs-cs">↑ 28% מהשנה שעברה</div>
            <div className="hs-cbar">
              <div className="hs-cfill" style={{width:'85%', background:'linear-gradient(90deg,#06B6D4,#06FFC8)'}}/>
            </div>
          </div>

          {/* Floating card 3 — recovery */}
          <div className="hs-card hs-card-3" style={{minWidth:136}}>
            <div className="hs-cl">שיעור החלמה</div>
            <div className="hs-cv">94%</div>
            <div className="hs-cs">✓ מעל הממוצע</div>
          </div>
        </div>

      </div>
    </div>
  )
}
