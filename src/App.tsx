import { useEffect, useRef, useCallback, useState } from 'react'
import { FrontPage } from './components/FrontPage'

const W = 800, H = 300, GROUND_Y = 240
const GRAVITY = 0.6, JUMP_V = -13
const INIT_SPEED = 5, MAX_SPEED = 14, SPEED_INC = 0.0015

// Claude.ai palette
const CLR = {
  bg:       '#F0EAE0',
  bgDark:   '#E8DDD0',
  orange:   '#C8623A',
  orangeLt: '#E8855A',
  orangeDk: '#9B4425',
  charcoal: '#2D1F14',
  mid:      '#8C6A52',
  muted:    '#BDA898',
  error:    '#C0392B',
  errorBg:  '#FDF0EE',
  purple:   '#7B5EA7',
  purpleLt: '#A688CC',
  teal:     '#2E8B7A',
  tealBg:   '#EAF5F3',
  gold:     '#B8860B',
  goldBg:   '#FDFAE8',
}

// ── Web Audio sound engine ──────────────────────────────────────────────────
let audioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

function playJump() {
  try {
    const ctx = getAudioCtx()
    // Mario-style jump: rapid frequency sweep up
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'square'
    const t = ctx.currentTime
    osc.frequency.setValueAtTime(260, t)
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.08)
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.14)
    gain.gain.setValueAtTime(0.18, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    osc.start(t); osc.stop(t + 0.18)
  } catch {}
}

function playLand() {
  try {
    const ctx = getAudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'square'
    const t = ctx.currentTime
    osc.frequency.setValueAtTime(180, t)
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.05)
    gain.gain.setValueAtTime(0.1, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
    osc.start(t); osc.stop(t + 0.06)
  } catch {}
}

function playDie() {
  try {
    const ctx = getAudioCtx()
    // Mario death: descending tones
    const notes = [
      { f: 440, t: 0 }, { f: 494, t: 0.06 }, { f: 392, t: 0.14 },
      { f: 330, t: 0.24 }, { f: 294, t: 0.36 }, { f: 220, t: 0.5 },
    ]
    notes.forEach(({ f, t }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'square'
      const now = ctx.currentTime
      osc.frequency.setValueAtTime(f, now + t)
      gain.gain.setValueAtTime(0.15, now + t)
      gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.07)
      osc.start(now + t); osc.stop(now + t + 0.1)
    })
  } catch {}
}

function playCoin() {
  try {
    const ctx = getAudioCtx()
    // Mario coin: two quick high tones
    const coinNotes: [number, number][] = [[1046, 0], [1318, 0.07]]
    coinNotes.forEach(([f, delay]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'square'
      const t = ctx.currentTime + delay
      osc.frequency.setValueAtTime(f, t)
      gain.gain.setValueAtTime(0.12, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
      osc.start(t); osc.stop(t + 0.09)
    })
  } catch {}
}

// ── Obstacle labels ─────────────────────────────────────────────────────────
const ERROR_LABELS = [
  { code: '429', msg: 'Rate Limited' },
  { code: '500', msg: 'Server Error' },
  { code: '403', msg: 'Forbidden' },
  { code: '503', msg: 'Unavailable' },
  { code: '408', msg: 'Timeout' },
  { code: '418', msg: "I'm a Teapot" },
  { code: '502', msg: 'Bad Gateway' },
]

const TOKEN_LABELS = ['deprecated()', 'NaN tokens', 'hallucination', 'context overflow', 'null response']

const SPIKE_LABELS = [
  { msg: 'segfault' },
  { msg: 'stack overflow' },
  { msg: 'null pointer' },
  { msg: 'deadlock' },
  { msg: 'memory leak' },
]

const WALL_LABELS = [
  { msg: 'paywall' },
  { msg: 'auth wall' },
  { msg: 'IP blocked' },
  { msg: 'geo-blocked' },
]

type GameState = 'idle' | 'playing' | 'dead'
interface Obstacle {
  x: number; y: number; w: number; h: number
  type: 'ground' | 'air' | 'spike' | 'wall' | 'double'
  label: { code?: string; msg: string }
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

// ── Mascot ──────────────────────────────────────────────────────────────────
// Head is 13 units wide (slightly wider). Eyes are 1×1 units, spaced further apart.
function drawClawd(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, running: boolean) {
  const S = 4
  const legAnim = running ? Math.floor(frame / 7) % 2 : 0
  const pairA = legAnim === 0 ? S * 3 : S * 2
  const pairB = legAnim === 0 ? S * 2 : S * 3

  ctx.save()

  // ── Body (wider: 13 units instead of 11) ──────────────────────────────
  ctx.fillStyle = CLR.orange
  ctx.fillRect(x + S * 1, y,        S * 13, S * 6)   // body 13 wide

  // ── Arms ──────────────────────────────────────────────────────────────
  ctx.fillRect(x,          y + S * 1, S * 1, S * 2)  // left arm (1 unit)
  ctx.fillRect(x + S * 14, y + S * 1, S * 1, S * 2)  // right arm (1 unit)

  // ── Bottom shading ─────────────────────────────────────────────────────
  ctx.fillStyle = CLR.orangeDk
  ctx.fillRect(x + S * 1, y + S * 5, S * 13, S * 1)

  // ── Eyes: smaller (1×1), further apart ────────────────────────────────
  // Body spans cols 1-13. Eyes at cols 3 and 11 (far apart, 1 unit each)
  ctx.fillStyle = CLR.charcoal
  const blinkOpen = !running || Math.floor(frame / 40) % 8 !== 0
  if (blinkOpen) {
    ctx.fillRect(x + S * 3,  y + S * 2, S * 1, S * 1)   // left eye (small, far left)
    ctx.fillRect(x + S * 11, y + S * 2, S * 1, S * 1)   // right eye (small, far right)
  } else {
    // Blink: just a thin line
    ctx.fillRect(x + S * 3,  y + S * 2, S * 1, 2)
    ctx.fillRect(x + S * 11, y + S * 2, S * 1, 2)
  }

  // ── Legs (4 evenly spaced under 13-unit body) ──────────────────────────
  ctx.fillStyle = CLR.orange
  ctx.fillRect(x + S * 1,  y + S * 6, S * 2, pairA)   // leg 1
  ctx.fillRect(x + S * 4,  y + S * 6, S * 2, pairB)   // leg 2
  ctx.fillRect(x + S * 8,  y + S * 6, S * 2, pairA)   // leg 3
  ctx.fillRect(x + S * 11, y + S * 6, S * 2, pairB)   // leg 4

  // Leg top shading
  ctx.fillStyle = CLR.orangeDk
  ctx.fillRect(x + S * 1,  y + S * 6, S * 2, S * 1)
  ctx.fillRect(x + S * 4,  y + S * 6, S * 2, S * 1)
  ctx.fillRect(x + S * 8,  y + S * 6, S * 2, S * 1)
  ctx.fillRect(x + S * 11, y + S * 6, S * 2, S * 1)

  ctx.restore()
}

// ── Obstacle renderers ───────────────────────────────────────────────────────

function drawGroundObs(ctx: CanvasRenderingContext2D, o: Obstacle) {
  ctx.save()
  // Post
  ctx.fillStyle = CLR.muted
  ctx.fillRect(o.x + o.w / 2 - 3, o.y + o.h, 6, 20)
  // Card
  drawRoundRect(ctx, o.x, o.y, o.w, o.h, 6)
  ctx.fillStyle = CLR.errorBg; ctx.fill()
  ctx.strokeStyle = CLR.error; ctx.lineWidth = 2; ctx.stroke()
  ctx.fillStyle = CLR.error; ctx.font = 'bold 13px Lora, Georgia, serif'; ctx.textAlign = 'center'
  ctx.fillText(o.label.code || '', o.x + o.w / 2, o.y + 20)
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

// Spike trap: jagged teeth rising from the ground
function drawSpikeObs(ctx: CanvasRenderingContext2D, o: Obstacle) {
  ctx.save()
  const spikeW = 14
  const count = Math.floor(o.w / spikeW)
  ctx.fillStyle = CLR.charcoal
  for (let i = 0; i < count; i++) {
    const sx = o.x + i * spikeW
    ctx.beginPath()
    ctx.moveTo(sx, o.y + o.h)
    ctx.lineTo(sx + spikeW / 2, o.y)
    ctx.lineTo(sx + spikeW, o.y + o.h)
    ctx.closePath()
    ctx.fill()
  }
  // Label on a small badge above
  const bx = o.x + o.w / 2, by = o.y - 16
  ctx.fillStyle = 'rgba(45,31,20,0.85)'
  drawRoundRect(ctx, bx - 28, by - 10, 56, 14, 4)
  ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px Lora, Georgia, serif'; ctx.textAlign = 'center'
  ctx.fillText(o.label.msg, bx, by + 1)
  ctx.restore()
}

// Wall: a tall brick-style barrier you must jump over
function drawWallObs(ctx: CanvasRenderingContext2D, o: Obstacle) {
  ctx.save()
  // Main wall body
  const brickH = 12, brickW = 22
  for (let row = 0; row * brickH < o.h; row++) {
    const offset = (row % 2) * (brickW / 2)
    const by2 = o.y + row * brickH
    const rowH = Math.min(brickH, o.y + o.h - by2)
    for (let col = -1; col * brickW < o.w + brickW; col++) {
      const bx = o.x + col * brickW - offset
      ctx.fillStyle = row % 2 === 0 ? '#C0392B' : '#A93226'
      ctx.fillRect(bx + 1, by2 + 1, brickW - 2, rowH - 2)
      ctx.strokeStyle = '#7B241C'; ctx.lineWidth = 1
      ctx.strokeRect(bx + 1, by2 + 1, brickW - 2, rowH - 2)
    }
  }
  // Label banner
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(o.x, o.y + o.h / 2 - 9, o.w, 18)
  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px Lora, Georgia, serif'; ctx.textAlign = 'center'
  ctx.fillText(o.label.msg, o.x + o.w / 2, o.y + o.h / 2 + 4)
  ctx.restore()
}

// Double obstacle: two ground cards spaced apart (step over or squeeze between)
function drawDoubleObs(ctx: CanvasRenderingContext2D, o: Obstacle) {
  // Re-use ground renderer twice using sub-positions encoded in o.w
  const gap = 18
  const cardW = (o.w - gap) / 2
  const h1: Obstacle = { ...o, w: cardW }
  const h2: Obstacle = { ...o, x: o.x + cardW + gap, w: cardW }
  drawGroundObs(ctx, h1)
  drawGroundObs(ctx, h2)
}

function drawBg(ctx: CanvasRenderingContext2D, offset: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  sky.addColorStop(0, '#EDE5D8')
  sky.addColorStop(1, '#E4D9C8')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GROUND_Y)

  ctx.strokeStyle = 'rgba(180,140,110,0.15)'; ctx.lineWidth = 1
  for (let i = -2; i <= 14; i++) {
    const gx = ((i * 60 - offset * 0.3) % (60 * 14))
    ctx.beginPath(); ctx.moveTo(gx, GROUND_Y); ctx.lineTo(gx - 80, H); ctx.stroke()
  }
  for (let i = 0; i < 5; i++) {
    const gy = GROUND_Y + (i / 4) * (H - GROUND_Y)
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
  }

  const dots: number[][] = [[50,30],[120,60],[200,20],[280,50],[360,15],[430,45],[510,25],[590,55],[660,35],[730,18],[100,80],[340,90],[580,75],[720,85]]
  dots.forEach(([sx, sy]) => {
    const twinkle = (Math.sin(offset * 0.015 + sx) + 1) / 2
    ctx.globalAlpha = 0.08 + twinkle * 0.12
    ctx.fillStyle = CLR.orangeDk
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI * 2); ctx.fill()
  })
  ctx.globalAlpha = 1

  const gg = ctx.createLinearGradient(0, GROUND_Y - 2, 0, GROUND_Y + 4)
  gg.addColorStop(0, CLR.orange); gg.addColorStop(1, 'transparent')
  ctx.fillStyle = gg; ctx.fillRect(0, GROUND_Y - 1, W, 3)

  const gf = ctx.createLinearGradient(0, GROUND_Y, 0, H)
  gf.addColorStop(0, CLR.bgDark); gf.addColorStop(1, '#DDD0C0')
  ctx.fillStyle = gf; ctx.fillRect(0, GROUND_Y + 2, W, H - GROUND_Y)

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
  drawRoundRect(ctx, bx, by, bw, bh, 3)
  ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill()
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
  ctx.fillStyle = 'rgba(240,234,224,0.7)'; ctx.fillRect(0, 0, W, H)
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

const CLAWD_W = 15 * 4  // 60px
const CLAWD_H = 9 * 4   // 36px

function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const s = useRef({
    gs: 'idle' as GameState, py: GROUND_Y - CLAWD_H, vy: 0, ground: true,
    obs: [] as Obstacle[], score: 0, hi: 0, speed: INIT_SPEED,
    frame: 0, bgOff: 0, nextObs: 120, animId: 0,
    wasGround: true, lastMilestone: 0,
  })

  const spawn = useCallback(() => {
    const st = s.current
    const roll = Math.random()
    if (roll < 0.22) {
      // Air obstacle (floating token hazard)
      st.obs.push({
        x: W+20,
        y: GROUND_Y - 90 - Math.random()*40,
        w: 90, h: 34, type: 'air',
        label: { msg: TOKEN_LABELS[Math.floor(Math.random() * TOKEN_LABELS.length)] }
      })
    } else if (roll < 0.42) {
      // Spike trap
      const spikeW = 42 + Math.floor(Math.random() * 3) * 14  // 42, 56, or 70px wide
      st.obs.push({
        x: W+20,
        y: GROUND_Y - 24,
        w: spikeW, h: 24, type: 'spike',
        label: SPIKE_LABELS[Math.floor(Math.random() * SPIKE_LABELS.length)]
      })
    } else if (roll < 0.56) {
      // Brick wall — tall, must jump over
      const h = 60 + Math.floor(Math.random() * 3) * 12
      st.obs.push({
        x: W+20,
        y: GROUND_Y - h,
        w: 30, h, type: 'wall',
        label: WALL_LABELS[Math.floor(Math.random() * WALL_LABELS.length)]
      })
    } else if (roll < 0.68) {
      // Double card obstacle
      const h = 50 + Math.floor(Math.random() * 2) * 15
      st.obs.push({
        x: W+20,
        y: GROUND_Y - h,
        w: 160, h, type: 'double',
        label: ERROR_LABELS[Math.floor(Math.random() * ERROR_LABELS.length)]
      })
    } else {
      // Classic ground error card
      const h = 55 + Math.floor(Math.random()*2)*15
      st.obs.push({
        x: W+20,
        y: GROUND_Y - h,
        w: 72, h, type: 'ground',
        label: ERROR_LABELS[Math.floor(Math.random() * ERROR_LABELS.length)]
      })
    }
  }, [])

  const reset = useCallback(() => {
    const st = s.current
    st.gs = 'playing'; st.py = GROUND_Y - CLAWD_H; st.vy = 0; st.ground = true
    st.obs = []; st.score = 0; st.speed = INIT_SPEED; st.frame = 0; st.bgOff = 0
    st.nextObs = 120; st.wasGround = true; st.lastMilestone = 0
  }, [])

  const jump = useCallback(() => {
    const st = s.current
    if (st.gs !== 'playing') { reset(); return }
    if (st.ground) {
      st.vy = JUMP_V
      st.ground = false
      playJump()
    }
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

        // Coin sound every 100 points
        const milestone = Math.floor(st.score / 100)
        if (milestone > st.lastMilestone) { st.lastMilestone = milestone; playCoin() }

        const wasOnGround = st.wasGround
        st.vy += GRAVITY; st.py += st.vy
        const floor = GROUND_Y - CLAWD_H
        if (st.py >= floor) {
          st.py = floor; st.vy = 0
          if (!wasOnGround) playLand()   // just landed
          st.ground = true
        } else {
          st.ground = false
        }
        st.wasGround = st.ground

        st.nextObs--
        if (st.nextObs <= 0) { spawn(); st.nextObs = Math.floor(80 + Math.random()*60 + (MAX_SPEED-st.speed)*8) }
        st.obs = st.obs.filter(o => o.x+o.w > -10)
        st.obs.forEach(o => { o.x -= st.speed })

        const px = 80 + 6, py = st.py + 4, pw = CLAWD_W - 12, ph = CLAWD_H - 6
        for (const o of st.obs) {
          if (px < o.x+o.w-6 && px+pw > o.x+6 && py < o.y+o.h-4 && py+ph > o.y+6) {
            st.gs = 'dead'
            if (st.score > st.hi) st.hi = st.score
            playDie()
          }
        }
      }
      ctx.clearRect(0,0,W,H)
      drawBg(ctx, st.bgOff)
      st.obs.forEach(o => {
        if (o.type === 'ground')  drawGroundObs(ctx, o)
        else if (o.type === 'air') drawAirObs(ctx, o, st.frame)
        else if (o.type === 'spike') drawSpikeObs(ctx, o)
        else if (o.type === 'wall')  drawWallObs(ctx, o)
        else if (o.type === 'double') drawDoubleObs(ctx, o)
      })
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
