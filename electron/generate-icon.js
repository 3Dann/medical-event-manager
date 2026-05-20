/**
 * Generates CareFlow app icons for Mac (.icns) and Windows (.ico)
 * Run: node generate-icon.js
 * Requires: npm install  (jimp is in devDependencies)
 */
const Jimp = require('jimp')
const path = require('path')
const fs   = require('fs')
const { execSync } = require('child_process')

const OUT = path.join(__dirname, 'icons')
fs.mkdirSync(OUT, { recursive: true })

async function generatePNG (size, outPath) {
  const img = new Jimp(size, size, 0x1E3A5FFF)

  // Background gradient: #162B4A → #24487A
  img.scan(0, 0, size, size, function (x, y, idx) {
    const t = y / size
    this.bitmap.data[idx]     = Math.round(0x16 + t * (0x24 - 0x16))
    this.bitmap.data[idx + 1] = Math.round(0x2B + t * (0x48 - 0x2B))
    this.bitmap.data[idx + 2] = Math.round(0x4A + t * (0x7A - 0x4A))
    this.bitmap.data[idx + 3] = 255
  })

  // Rounded corner mask
  const radius = Math.round(size * 0.22)
  img.scan(0, 0, size, size, function (x, y, idx) {
    const cx = size / 2, cy = size / 2
    // Corner check
    const inCorner = (
      (x < radius && y < radius && (x - radius) ** 2 + (y - radius) ** 2 > radius ** 2) ||
      (x > size - radius && y < radius && (x - (size - radius)) ** 2 + (y - radius) ** 2 > radius ** 2) ||
      (x < radius && y > size - radius && (x - radius) ** 2 + (y - (size - radius)) ** 2 > radius ** 2) ||
      (x > size - radius && y > size - radius && (x - (size - radius)) ** 2 + (y - (size - radius)) ** 2 > radius ** 2)
    )
    if (inCorner) this.bitmap.data[idx + 3] = 0
  })

  // Draw "CF" letters using pixel art at large scale, scaled to size
  // Simple block letters — avoids font dependency
  const letterColor = { r: 255, g: 255, b: 255 }
  const cx = size / 2, cy = size / 2
  const lh = Math.round(size * 0.38)   // letter height
  const lw = Math.round(size * 0.18)   // letter width
  const gap = Math.round(size * 0.04)
  const stroke = Math.max(2, Math.round(size * 0.055))

  function drawRect (x1, y1, w, h) {
    for (let py = y1; py < y1 + h; py++) {
      for (let px = x1; px < x1 + w; px++) {
        if (px >= 0 && px < size && py >= 0 && py < size) {
          const idx = (py * size + px) * 4
          img.bitmap.data[idx]     = letterColor.r
          img.bitmap.data[idx + 1] = letterColor.g
          img.bitmap.data[idx + 2] = letterColor.b
          img.bitmap.data[idx + 3] = 240
        }
      }
    }
  }

  // "C" — left of centre
  const cx_c = Math.round(cx - lw - gap * 0.5)
  const ty   = Math.round(cy - lh / 2)
  // top bar
  drawRect(cx_c, ty, lw, stroke)
  // bottom bar
  drawRect(cx_c, ty + lh - stroke, lw, stroke)
  // left side
  drawRect(cx_c, ty, stroke, lh)

  // "F" — right of centre
  const cx_f = Math.round(cx + gap * 0.5)
  // top bar
  drawRect(cx_f, ty, lw, stroke)
  // middle bar
  drawRect(cx_f, Math.round(cy - stroke / 2), Math.round(lw * 0.8), stroke)
  // left side
  drawRect(cx_f, ty, stroke, lh)

  await img.write(outPath)
  console.log(`✅  ${path.basename(outPath)} (${size}×${size})`)
}

async function main () {
  // Generate PNG at multiple sizes
  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
  for (const s of sizes) {
    await generatePNG(s, path.join(OUT, `icon-${s}.png`))
  }
  // Main icon.png (512)
  await generatePNG(512, path.join(OUT, 'icon.png'))

  // Try to build .icns (Mac) using iconutil if available
  if (process.platform === 'darwin') {
    try {
      const iconsetDir = path.join(OUT, 'icon.iconset')
      fs.mkdirSync(iconsetDir, { recursive: true })
      const map = {
        'icon_16x16.png': 16, 'icon_16x16@2x.png': 32,
        'icon_32x32.png': 32, 'icon_32x32@2x.png': 64,
        'icon_128x128.png': 128, 'icon_128x128@2x.png': 256,
        'icon_256x256.png': 256, 'icon_256x256@2x.png': 512,
        'icon_512x512.png': 512, 'icon_512x512@2x.png': 1024,
      }
      for (const [name, s] of Object.entries(map)) {
        const src = path.join(OUT, `icon-${s}.png`)
        fs.copyFileSync(src, path.join(iconsetDir, name))
      }
      execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(OUT, 'icon.icns')}"`)
      fs.rmSync(iconsetDir, { recursive: true })
      console.log('✅  icon.icns')
    } catch (e) {
      console.log('⚠️  icon.icns — iconutil not available:', e.message)
    }
  }

  // Build .ico (Windows) — concatenate PNG sizes
  // electron-builder auto-converts icon.png → .ico on Windows build
  // For manual .ico: use https://icoconvert.com with icon-256.png
  console.log('\n📦  Icons generated in electron/icons/')
  console.log('   On Mac: icon.icns created automatically')
  console.log('   On Windows build: electron-builder converts icon.png → icon.ico')
}

main().catch(console.error)
