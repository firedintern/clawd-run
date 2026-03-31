import { useEffect, useRef, useCallback, useState } from 'react'
import { FrontPage } from './components/FrontPage'

const W = 800, H = 300, GROUND_Y = 240
const GRAVITY = 0.6, JUMP_V = -13
const INIT_SPEED = 5, MAX_SPEED = 14, SPEED_INC = 0.0015

// Claude.ai palette
const CLR = {
  bg:       '#F0EAE0',  // warm parchment background
  bgDark:   '#E8DDD0',  // slightly darker cream (ground)
  orange:   '#C8623A',  // claude terracotta orange
  orangeLt: '#E8855A',  // lighter orange
  orangeDk: '#9B4425',  // dark orange / shadow
  charcoal: '#2D1F14',  // dark text / body
  mid:      '#8C6A52',  // mid warm brown
  muted:    '#BDA898',  // muted warm gray
  error:    '#C0392B',  // error red
  errorBg:  '#FDF0EE',  // error card bg
  purple:   '#7B5EA7',  // soft purple for air obstacles
  purpleLt: '#A688CC',
}

const ERROR_LABELS = [
  { code: '429', msg: 'Rate Limited' },
  { code: '500', msg: 'Server Error' },
  { code: '403', msg: 'Forbidden' },
  { code: '503', msg: 'Unavailable' },
  { code: '408', msg: 'Timeout' },
]
const TOKEN_LABELS = ['deprecated()', 'NaN tokens', 'hallucination']

type GameState = 'idle' | 'playing' | 'dead'
interface Obstacle { x: number; y: number; w: number; h: number; type: 'ground' | 'air'; label: { code?: string; msg: string } }

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

function drawClawd(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, running: boolean) {
  // Pixel layout (each unit = S px):
  // Total: 15 units wide, 9 units tall
  // Left arm:  cols  0-1,  rows 1-2
  // Body:      cols  2-12, rows 0-5  (11 units wide)
  // Right arm: cols 13-14, rows 1-2
  // Eyes:      cols  4-5 & 9-10, rows 2-3
  // Legs (2 wide, 1-unit gap between each):
  //   leg1: cols  2-3
  //   leg2: cols  5-6
  //   leg3: cols  8-9
  //   leg4: cols 11-12
  //   (gaps at cols 4, 7, 10)
  const S = 4
  const legAnim = running ? Math.floor(frame / 7) % 2 : 0
  // pair A = legs 1&3, pair B = legs 2&4 — alternate
  const pairA = legAnim === 0 ? S * 3 : S * 2   // longer leg height for pair A
  const pairB = legAnim === 0 ? S * 2 : S * 3

  ctx.save()

  // ── Body ──────────────────────────────────────────────────────────
  ctx.fillStyle = CLR.orange
  ctx.fillRect(x + S * 2, y,        S * 11, S * 6)   // main body (11 wide, 6 tall)

  // ── Arms ──────────────────────────────────────────────────────────
  ctx.fillRect(x,          y + S * 1, S * 2, S * 2)   // left arm
  ctx.fillRect(x + S * 13, y + S * 1, S * 2, S * 2)   // right arm

  // ── Bottom shading ─────────────────────────────────────────────────
  ctx.fillStyle = CLR.orangeDk
  ctx.fillRect(x + S * 2, y + S * 5, S * 11, S * 1)

  // ── Eyes ──────────────────────────────────────────────────────────
  ctx.fillStyle = CLR.charcoal
  const blinkOpen = !running || Math.floor(frame / 40) % 8 !== 0
  if (blinkOpen) {
    ctx.fillRect(x + S * 4, y + S * 2, S * 2, S * 2)   // left eye
    ctx.fillRect(x + S * 9, y + S * 2, S * 2, S * 2)   // right eye
  } else {
    ctx.fillRect(x + S * 4, y + S * 3, S * 2, S * 1)
    ctx.fillRect(x + S * 9, y + S * 3, S * 2, S * 1)
  }

  // ── Legs (4 evenly spaced, alternating pairs) ──────────────────────
  ctx.fillStyle = CLR.orange
  ctx.fillRect(x + S * 2,  y + S * 6, S * 2, pairA)   // leg 1
  ctx.fillRect(x + S * 5,  y + S * 6, S * 2, pairB)   // leg 2
  ctx.fillRect(x + S * 8,  y + S * 6, S * 2, pairA)   // leg 3
  ctx.fillRect(x + S * 11, y + S * 6, S * 2, pairB)   // leg 4

  // Leg top shading
  ctx.fillStyle = CLR.orangeDk
  ctx.fillRect(x + S * 2,  y + S * 6, S * 2, S * 1)
  ctx.fillRect(x + S * 5,  y + S * 6, S * 2, S * 1)
  ctx.fillRect(x + S * 8,  y + S * 6, S * 2, S * 1)
  ctx.fillRect(x + S * 11, y + S * 6, S * 2, S * 1)

  ctx.restore()
}

function drawGroundObs(ctx: CanvasRenderingContext2D, o: Obstacle) {
  ctx.save()
  // Post
  ctx.fillStyle = CLR.muted
  ctx.fillRect(o.x + o.w / 2 - 3, o.y + o.h, 6, 20)
  // Card
  drawRoundRect(ctx, o.x, o.y, o.w, o.h, 6)
  ctx.fillStyle = CLR.errorBg; ctx.fill()
  ctx.strokeStyle = CLR.error; ctx.lineWidth = 2; ctx.stroke()
  // Error code
  ctx.fillStyle = CLR.error; ctx.font = 'bold 13px Lora, Georgia, serif'; ctx.textAlign = 'center'
  ctx.fillText(o.label.code || '', o.x + o.w / 2, o.y + 20)
  // Message
  ctx.fillStyle = CLR.mid; ctx.font = '9px Lora, Georgia, serif'
  ctx.fillText(o.label.msg, o.x + o.w / 2, o.y + 33)
  ctx.restore()
}

function drawAirObs(ctx: CanvasRenderingContext2D, o: Obstacle, frame: number) {
  ctx.save()
  const float = Math.sin(frame * 0.05 + o.x) * 3
  drawRoundRect(ctx, o.x, o.y + float, o.w, o.h, o.h / 2)
  ctx.fillStyle = '#F3EEF8'; ctx.fill()
  ctx.strokeStyle = CLR.purple; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = CLR.purple; ctx.font = 'bold 11px Lora, Georgia, serif'; ctx.textAlign = 'center'
  ctx.fillText('⚠', o.x + o.w / 2, o.y + float + 15)
  ctx.fillStyle = CLR.purpleLt; ctx.font = '8px Lora, Georgia, serif'
  ctx.fillText(o.label.msg, o.x + o.w / 2, o.y + float + 26)
  ctx.restore()
}

function drawBg(ctx: CanvasRenderingContext2D, offset: number) {
  // Sky - warm cream gradient
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  sky.addColorStop(0, '#EDE5D8')
  sky.addColorStop(1, '#E4D9C8')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GROUND_Y)

  // Subtle grid lines - warm tone
  ctx.strokeStyle = 'rgba(180,140,110,0.15)'; ctx.lineWidth = 1
  for (let i = -2; i <= 14; i++) {
    const gx = ((i * 60 - offset * 0.3) % (60 * 14))
    ctx.beginPath(); ctx.moveTo(gx, GROUND_Y); ctx.lineTo(gx - 80, H); ctx.stroke()
  }
  for (let i = 0; i < 5; i++) {
    const gy = GROUND_Y + (i / 4) * (H - GROUND_Y)
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
  }

  // Floating dots (instead of stars) - warm speckle texture
  const dots: number[][] = [[50,30],[120,60],[200,20],[280,50],[360,15],[430,45],[510,25],[590,55],[660,35],[730,18],[100,80],[340,90],[580,75],[720,85]]
  dots.forEach(([sx, sy]) => {
    const twinkle = (Math.sin(offset * 0.015 + sx) + 1) / 2
    ctx.globalAlpha = 0.08 + twinkle * 0.12
    ctx.fillStyle = CLR.orangeDk
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill()
  })
  ctx.globalAlpha = 1

  // Ground line
  const gg = ctx.createLinearGradient(0, GROUND_Y - 2, 0, GROUND_Y + 4)
  gg.addColorStop(0, CLR.orange); gg.addColorStop(1, 'transparent')
  ctx.fillStyle = gg; ctx.fillRect(0, GROUND_Y - 1, W, 3)

  // Ground fill
  const gf = ctx.createLinearGradient(0, GROUND_Y, 0, H)
  gf.addColorStop(0, CLR.bgDark); gf.addColorStop(1, '#DDD0C0')
  ctx.fillStyle = gf; ctx.fillRect(0, GROUND_Y + 2, W, H - GROUND_Y)

  // Ground texture lines
  ctx.strokeStyle = 'rgba(150,110,80,0.1)'; ctx.lineWidth = 1
  for (let i = 0; i < 4; i++) {
    const lineX = ((offset * 0.8 + i * 200) % (W + 40)) - 20
    ctx.beginPath(); ctx.moveTo(lineX, GROUND_Y + 2); ctx.lineTo(lineX + 60, H); ctx.stroke()
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, score: number, hi: number, speed: number) {
  ctx.save(); ctx.font = 'bold 14px Lora, Georgia, serif'; ctx.textAlign = 'right'
  ctx.fillStyle = CLR.muted
  ctx.fillText(`HI ${String(hi).padStart(5,'0')}`, W-16, 30)
  ctx.fillStyle = CLR.orange
  ctx.fillText(String(score).padStart(5,'0'), W-16, 50)

  const ratio = Math.min((speed - INIT_SPEED) / (MAX_SPEED - INIT_SPEED), 1)
  const bx = W-96, by = 58, bw = 80, bh = 5
  // Track
  drawRoundRect(ctx, bx, by, bw, bh, 3)
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill()
  // Fill
  if (ratio > 0) {
    const bc = ratio > 0.7 ? CLR.error : ratio > 0.4 ? CLR.orange : '#5BAD72'
    drawRoundRect(ctx, bx, by, bw * ratio, bh, 3)
    ctx.fillStyle = bc; ctx.fill()
  }
  ctx.font = '9px Lora, Georgia, serif'; ctx.fillStyle = CLR.muted; ctx.fillText('SPEED', bx-4, by+6)
  ctx.restore()
}

function drawIdle(ctx: CanvasRenderingContext2D, frame: number) {
  const p = (Math.sin(frame * 0.05) + 1) / 2
  ctx.save(); ctx.textAlign = 'center'

  // Title card background
  drawRoundRect(ctx, W/2 - 200, 85, 400, 110, 12)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill()
  ctx.strokeStyle = 'rgba(200,98,58,0.2)'; ctx.lineWidth = 1.5; ctx.stroke()

  ctx.font = 'bold 34px Lora, Georgia, serif'; ctx.fillStyle = CLR.orange
  ctx.fillText('CLAWD RUN', W/2, 128)

  ctx.font = '12px Lora, Georgia, serif'; ctx.fillStyle = CLR.mid
  ctx.fillText('dodge the errors. survive the rate limits.', W/2, 152)

  ctx.font = '11px Lora, Georgia, serif'
  ctx.fillStyle = `rgba(200,98,58,${0.5 + p * 0.5})`
  ctx.fillText('[ SPACE ] or [ TAP ] to start', W/2, 178)
  ctx.restore()
}

function drawDead(ctx: CanvasRenderingContext2D, score: number, hi: number, frame: number) {
  const p = (Math.sin(frame * 0.08) + 1) / 2
  ctx.save()
  // Overlay
  ctx.fillStyle = 'rgba(240,234,224,0.7)'; ctx.fillRect(0, 0, W, H)

  // Death card
  drawRoundRect(ctx, W/2-180, 78, 360, 120, 12)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill()
  ctx.strokeStyle = CLR.error; ctx.lineWidth = 2; ctx.stroke()

  ctx.textAlign = 'center'
  ctx.font = 'bold 26px Lora, Georgia, serif'; ctx.fillStyle = CLR.error
  ctx.fillText('RATE LIMITED', W/2, 115)

  ctx.font = '12px Lora, Georgia, serif'; ctx.fillStyle = CLR.charcoal
  ctx.fillText(`score: ${score}  |  best: ${hi}`, W/2, 145)

  ctx.font = '11px Lora, Georgia, serif'
  ctx.fillStyle = `rgba(200,98,58,${0.5 + p * 0.5})`
  ctx.fillText('[ SPACE ] or [ TAP ] to retry', W/2, 175)
  ctx.restore()
}

const CLAWD_W = 15 * 4  // 60px (15 units incl. arms)
const CLAWD_H = 9 * 4   // 36px (6 body + 3 legs max)

function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const s = useRef({
    gs: 'idle' as GameState, py: GROUND_Y - CLAWD_H, vy: 0, ground: true,
    obs: [] as Obstacle[], score: 0, hi: 0, speed: INIT_SPEED,
    frame: 0, bgOff: 0, nextObs: 120, animId: 0,
  })

  const spawn = useCallback(() => {
    const st = s.current
    if (Math.random() < 0.3) {
      st.obs.push({ x: W+20, y: GROUND_Y - 90 - Math.random()*40, w: 90, h: 34, type: 'air', label: { msg: TOKEN_LABELS[Math.floor(Math.random()*3)] } })
    } else {
      const h = 55 + Math.floor(Math.random()*2)*15
      st.obs.push({ x: W+20, y: GROUND_Y-h, w: 72, h, type: 'ground', label: ERROR_LABELS[Math.floor(Math.random()*5)] })
    }
  }, [])

  const reset = useCallback(() => {
    const st = s.current
    st.gs = 'playing'; st.py = GROUND_Y - CLAWD_H; st.vy = 0; st.ground = true
    st.obs = []; st.score = 0; st.speed = INIT_SPEED; st.frame = 0; st.bgOff = 0; st.nextObs = 120
  }, [])

  const jump = useCallback(() => {
    const st = s.current
    if (st.gs !== 'playing') { reset(); return }
    if (st.ground) { st.vy = JUMP_V; st.ground = false }
  }, [reset])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code==='Space'||e.code==='ArrowUp') { e.preventDefault(); jump() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    const loop = () => {
      const st = s.current
      st.frame++; st.bgOff += st.speed
      if (st.gs === 'playing') {
        st.score = Math.floor(st.frame * 0.12)
        st.speed = Math.min(MAX_SPEED, INIT_SPEED + st.frame * SPEED_INC)
        st.vy += GRAVITY; st.py += st.vy
        const floor = GROUND_Y - CLAWD_H
        if (st.py >= floor) { st.py = floor; st.vy = 0; st.ground = true }
        st.nextObs--
        if (st.nextObs <= 0) { spawn(); st.nextObs = Math.floor(80 + Math.random()*60 + (MAX_SPEED-st.speed)*8) }
        st.obs = st.obs.filter(o => o.x+o.w > -10)
        st.obs.forEach(o => { o.x -= st.speed })
        const px = 80 + 6, py = st.py + 4, pw = CLAWD_W - 12, ph = CLAWD_H - 6
        for (const o of st.obs) {
          if (px < o.x+o.w-6 && px+pw > o.x+6 && py < o.y+o.h-4 && py+ph > o.y+6) {
            st.gs = 'dead'; if (st.score > st.hi) st.hi = st.score
          }
        }
      }
      ctx.clearRect(0,0,W,H)
      drawBg(ctx, st.bgOff)
      st.obs.forEach(o => o.type==='ground' ? drawGroundObs(ctx,o) : drawAirObs(ctx,o,st.frame))
      drawClawd(ctx, 80, st.py, st.frame, st.gs==='playing')
      if (st.gs!=='idle') drawHUD(ctx, st.score, st.hi, st.speed)
      if (st.gs==='idle') drawIdle(ctx, st.frame)
      if (st.gs==='dead') drawDead(ctx, st.score, st.hi, st.frame)
      st.animId = requestAnimationFrame(loop)
    }
    s.current.animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(s.current.animId)
  }, [spawn])

  return (
    <div style={{
      minHeight: '100vh',
      background: CLR.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "Lora, Georgia, serif",
    }}>
      <div style={{ color: CLR.muted, fontSize: 11, letterSpacing: 3, marginBottom: 12, textTransform: 'uppercase' }}>
        clawd.run
      </div>
      <canvas
        ref={canvasRef} width={W} height={H} onClick={jump}
        style={{
          display: 'block',
          cursor: 'pointer',
          borderRadius: 10,
          border: `1px solid rgba(200,98,58,0.2)`,
          boxShadow: '0 4px 24px rgba(180,120,80,0.15), 0 1px 4px rgba(0,0,0,0.06)',
          maxWidth: '100%',
          imageRendering: 'pixelated',
        }}
      />
      <div style={{ marginTop: 14, color: CLR.muted, fontSize: 10, letterSpacing: 2 }}>
        SPACE · ↑ · TAP to jump
      </div>
    </div>
  )
}

export default function App() {
  const [started, setStarted] = useState(false)

  if (!started) {
    return <FrontPage onPlay={() => setStarted(true)} />
  }

  return <GameCanvas />
}
