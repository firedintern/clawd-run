import { useEffect, useRef, useCallback, useState } from 'react'
import { Claude } from '@lobehub/icons'
import { FrontPage } from './components/FrontPage'

const GROUND_RATIO = 0.78  // ground line at 78% of canvas height
const GRAVITY = 0.6, JUMP_V = -13
const INIT_SPEED = 5, MAX_SPEED = 14, SPEED_INC = 0.0015

const CLR = {
  bg:       '#F0EAE0',
  bgDark:   '#E8DDD0',
  orange:   '#C8623A',
  orangeDk: '#9B4425',
  charcoal: '#2D1F14',
  mid:      '#8C6A52',
  muted:    '#BDA898',
  error:    '#C0392B',
  green:    '#2E6B3A',
  greenDk:  '#1A3D20',
  greenLt:  '#4A9B5A',
  sand:     '#C8A862',
  bird:     '#5B3A8C',
  birdWing: '#9B6AE8',
}

// ── Web Audio ────────────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null
function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}
function playJump() {
  try {
    const ctx = getAudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination); osc.type = 'square'
    const t = ctx.currentTime
    osc.frequency.setValueAtTime(260, t); osc.frequency.exponentialRampToValueAtTime(520, t+0.08); osc.frequency.exponentialRampToValueAtTime(420, t+0.14)
    gain.gain.setValueAtTime(0.18, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.18)
    osc.start(t); osc.stop(t+0.18)
  } catch {}
}
function playLand() {
  try {
    const ctx = getAudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination); osc.type = 'square'
    const t = ctx.currentTime
    osc.frequency.setValueAtTime(180, t); osc.frequency.exponentialRampToValueAtTime(100, t+0.05)
    gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.06)
    osc.start(t); osc.stop(t+0.06)
  } catch {}
}
function playDie() {
  try {
    const ctx = getAudioCtx()
    const notes = [{f:440,t:0},{f:494,t:0.06},{f:392,t:0.14},{f:330,t:0.24},{f:294,t:0.36},{f:220,t:0.5}]
    notes.forEach(({f,t}) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination); osc.type = 'square'
      const now = ctx.currentTime
      osc.frequency.setValueAtTime(f, now+t); gain.gain.setValueAtTime(0.15, now+t); gain.gain.exponentialRampToValueAtTime(0.001, now+t+0.07)
      osc.start(now+t); osc.stop(now+t+0.1)
    })
  } catch {}
}
function playCoin() {
  try {
    const ctx = getAudioCtx()
    const coinNotes: [number,number][] = [[1046,0],[1318,0.07]]
    coinNotes.forEach(([f,delay]) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination); osc.type = 'square'
      const t = ctx.currentTime + delay
      osc.frequency.setValueAtTime(f, t); gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.08)
      osc.start(t); osc.stop(t+0.09)
    })
  } catch {}
}

type GameState = 'idle' | 'playing' | 'dead'
interface Obstacle { x: number; y: number; w: number; h: number; type: 'cactus' | 'bird'; variant: number }

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r)
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h)
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r)
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath()
}

// ── Pixelated cactus ─────────────────────────────────────────────────────────
// Pixel grid drawn with fillRect — each "pixel" = P units
function drawCactus(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  const P = 5
  ctx.save()

  if (variant === 0) {
    // Single tall cactus
    // trunk
    const trunk = [
      [2,0],[2,1],[2,2],[2,3],[2,4],[2,5],[2,6],[2,7],[2,8],[2,9],[2,10],
      [1,0],[3,0], // top cap
    ]
    // left arm at rows 4-6
    const lArm = [[0,4],[1,4],[0,5],[0,6],[1,6]]
    // right arm at rows 3-5
    const rArm = [[3,3],[4,3],[4,4],[4,5],[3,5]]

    ctx.fillStyle = CLR.green
    ;[...trunk,...lArm,...rArm].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
    // dark shading on right edge of trunk
    ctx.fillStyle = CLR.greenDk
    ;[[3,1],[3,2],[3,3],[3,7],[3,8],[3,9]].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
    // highlight left edge
    ctx.fillStyle = CLR.greenLt
    ;[[2,1],[2,2]].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))

  } else if (variant === 1) {
    // Double cactus cluster
    // left short cactus
    const c1 = [[1,3],[1,4],[1,5],[1,6],[1,7],[1,8],[0,5],[2,5],[0,6],[2,4]]
    // right taller cactus
    const c2 = [[5,1],[5,2],[5,3],[5,4],[5,5],[5,6],[5,7],[5,8],[4,3],[6,3],[4,4],[6,5],[6,6]]
    ctx.fillStyle = CLR.green
    ;[...c1,...c2].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
    ctx.fillStyle = CLR.greenDk
    ;[[2,6],[2,7],[6,4],[6,7]].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))

  } else {
    // Wide fat cactus
    const fat = [
      [2,0],[3,0],
      [1,1],[2,1],[3,1],[4,1],
      [1,2],[2,2],[3,2],[4,2],
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],
      [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],
      [1,5],[2,5],[3,5],[4,5],
      [1,6],[2,6],[3,6],[4,6],
      [1,7],[2,7],[3,7],[4,7],
      [2,8],[3,8],
    ]
    ctx.fillStyle = CLR.green
    fat.forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
    ctx.fillStyle = CLR.greenDk
    ;[[4,1],[4,2],[4,3],[4,4],[3,5],[3,6]].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
    ctx.fillStyle = CLR.greenLt
    ;[[2,1],[1,3],[1,4]].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
  }

  ctx.restore()
}

// ── Pixelated flying creature ─────────────────────────────────────────────────
function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number, frame: number) {
  const P = 4
  const wingUp = Math.floor(frame / 12) % 2 === 0
  ctx.save()

  if (variant === 0) {
    // Classic pterodactyl-style bird
    // body
    const body = [[3,2],[4,2],[5,2],[3,3],[4,3],[5,3],[6,3],[3,4],[4,4]]
    // head + beak
    const head = [[6,2],[7,2],[8,2],[7,3],[8,3],[9,3],[9,2]]
    // tail
    const tail = [[1,3],[2,3],[0,4]]
    // wings up or down
    const wingA = wingUp
      ? [[1,1],[2,1],[3,1],[4,1],[5,0],[6,1],[7,1]]
      : [[0,3],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4]]
    ctx.fillStyle = CLR.bird
    ;[...body,...head,...tail,...wingA].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
    // eye
    ctx.fillStyle = '#fff'
    ctx.fillRect(x+8*P, y+2*P, P, P)
    ctx.fillStyle = CLR.charcoal
    ctx.fillRect(x+8*P+1, y+2*P+1, P-2, P-2)

  } else {
    // Rounder creature (owl-like)
    const owlBody = [[2,1],[3,1],[4,1],[5,1],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[2,4],[3,4],[4,4],[5,4]]
    // ears/horns
    const ears = [[2,0],[5,0]]
    // wings
    const wingsU = wingUp
      ? [[0,1],[1,1],[6,1],[7,1],[0,2],[7,2]]
      : [[0,3],[1,4],[6,4],[7,3]]
    ctx.fillStyle = CLR.bird
    ;[...owlBody,...ears,...wingsU].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
    ctx.fillStyle = CLR.birdWing
    ;[[1,2],[6,2]].forEach(([cx,cy]) => ctx.fillRect(x+cx*P, y+cy*P, P, P))
    // eyes
    ctx.fillStyle = '#FFD700'
    ctx.fillRect(x+2*P, y+2*P, P, P)
    ctx.fillRect(x+5*P, y+2*P, P, P)
    ctx.fillStyle = CLR.charcoal
    ctx.fillRect(x+2*P+1, y+2*P+1, P-2, P-2)
    ctx.fillRect(x+5*P+1, y+2*P+1, P-2, P-2)
  }

  ctx.restore()
}

// ── Mascot ───────────────────────────────────────────────────────────────────
function drawClawd(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number, running: boolean) {
  const S = 4
  const legAnim = running ? Math.floor(frame / 7) % 2 : 0
  const pairA = legAnim === 0 ? S*3 : S*2
  const pairB = legAnim === 0 ? S*2 : S*3
  ctx.save()
  ctx.fillStyle = CLR.orange
  ctx.fillRect(x+S*1, y, S*13, S*6)
  ctx.fillRect(x, y+S*1, S*1, S*2)
  ctx.fillRect(x+S*14, y+S*1, S*1, S*2)
  ctx.fillStyle = CLR.orangeDk
  ctx.fillRect(x+S*1, y+S*5, S*13, S*1)
  ctx.fillStyle = CLR.charcoal
  const blinkOpen = !running || Math.floor(frame/40)%8 !== 0
  if (blinkOpen) {
    ctx.fillRect(x+S*3,  y+S*2, S*1, S*1)
    ctx.fillRect(x+S*11, y+S*2, S*1, S*1)
  } else {
    ctx.fillRect(x+S*3,  y+S*2, S*1, 2)
    ctx.fillRect(x+S*11, y+S*2, S*1, 2)
  }
  ctx.fillStyle = CLR.orange
  ctx.fillRect(x+S*1,  y+S*6, S*2, pairA)
  ctx.fillRect(x+S*4,  y+S*6, S*2, pairB)
  ctx.fillRect(x+S*8,  y+S*6, S*2, pairA)
  ctx.fillRect(x+S*11, y+S*6, S*2, pairB)
  ctx.fillStyle = CLR.orangeDk
  ctx.fillRect(x+S*1,  y+S*6, S*2, S*1)
  ctx.fillRect(x+S*4,  y+S*6, S*2, S*1)
  ctx.fillRect(x+S*8,  y+S*6, S*2, S*1)
  ctx.fillRect(x+S*11, y+S*6, S*2, S*1)
  ctx.restore()
}

function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number, GROUND_Y: number, offset: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  sky.addColorStop(0, '#EDE5D8'); sky.addColorStop(1, '#E4D9C8')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, GROUND_Y)

  ctx.strokeStyle = 'rgba(180,140,110,0.12)'; ctx.lineWidth = 1
  for (let i = -2; i <= 20; i++) {
    const gx = ((i*60 - offset*0.3) % (60*20))
    ctx.beginPath(); ctx.moveTo(gx, GROUND_Y); ctx.lineTo(gx-80, H); ctx.stroke()
  }
  for (let i = 0; i < 5; i++) {
    const gy = GROUND_Y + (i/4)*(H-GROUND_Y)
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
  }

  // Dots
  for (let i = 0; i < 20; i++) {
    const sx = (i * 97) % W, sy = (i * 53) % (GROUND_Y * 0.7)
    const twinkle = (Math.sin(offset*0.015+sx)+1)/2
    ctx.globalAlpha = 0.06 + twinkle*0.1
    ctx.fillStyle = CLR.orangeDk
    ctx.beginPath(); ctx.arc(sx, sy, 2, 0, Math.PI*2); ctx.fill()
  }
  ctx.globalAlpha = 1

  const gg = ctx.createLinearGradient(0, GROUND_Y-2, 0, GROUND_Y+4)
  gg.addColorStop(0, CLR.orange); gg.addColorStop(1, 'transparent')
  ctx.fillStyle = gg; ctx.fillRect(0, GROUND_Y-1, W, 3)

  const gf = ctx.createLinearGradient(0, GROUND_Y, 0, H)
  gf.addColorStop(0, CLR.bgDark); gf.addColorStop(1, '#DDD0C0')
  ctx.fillStyle = gf; ctx.fillRect(0, GROUND_Y+2, W, H-GROUND_Y)

  ctx.strokeStyle = 'rgba(150,110,80,0.1)'; ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    const lineX = ((offset*0.8+i*200) % (W+40)) - 20
    ctx.beginPath(); ctx.moveTo(lineX, GROUND_Y+2); ctx.lineTo(lineX+60, H); ctx.stroke()
  }
}

function drawHUD(ctx: CanvasRenderingContext2D, W: number, score: number, hi: number, speed: number) {
  ctx.save(); ctx.font = 'bold 14px monospace'; ctx.textAlign = 'right'
  ctx.fillStyle = CLR.muted
  ctx.fillText(`HI ${String(hi).padStart(5,'0')}`, W-16, 30)
  ctx.fillStyle = CLR.orange
  ctx.fillText(String(score).padStart(5,'0'), W-16, 50)
  const ratio = Math.min((speed-INIT_SPEED)/(MAX_SPEED-INIT_SPEED), 1)
  const bx = W-96, by = 58, bw = 80, bh = 5
  drawRoundRect(ctx, bx, by, bw, bh, 3); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill()
  if (ratio > 0) {
    const bc = ratio>0.7 ? CLR.error : ratio>0.4 ? CLR.orange : '#5BAD72'
    drawRoundRect(ctx, bx, by, bw*ratio, bh, 3); ctx.fillStyle = bc; ctx.fill()
  }
  ctx.font = '9px monospace'; ctx.fillStyle = CLR.muted; ctx.fillText('SPEED', bx-4, by+6)
  ctx.restore()
}

function drawIdle(ctx: CanvasRenderingContext2D, W: number, H: number, GROUND_Y: number, frame: number) {
  const p = (Math.sin(frame*0.05)+1)/2
  const cx = W/2
  // Card positioned clearly above ground line
  const cardH = 90, cardW = 380, cardY = GROUND_Y - cardH - 60
  ctx.save(); ctx.textAlign = 'center'
  drawRoundRect(ctx, cx-cardW/2, cardY, cardW, cardH, 12)
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill()
  ctx.strokeStyle = 'rgba(200,98,58,0.2)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.font = 'bold 32px monospace'; ctx.fillStyle = CLR.orange
  ctx.fillText('CLAWD RUN', cx, cardY+38)
  ctx.font = '12px monospace'; ctx.fillStyle = CLR.mid
  ctx.fillText('dodge the cacti. survive the rate limits.', cx, cardY+60)
  ctx.font = '11px monospace'
  ctx.fillStyle = `rgba(200,98,58,${0.5+p*0.5})`
  ctx.fillText('[ SPACE ] or [ TAP ] to start', cx, cardY+80)
  ctx.restore()
}

function drawDead(ctx: CanvasRenderingContext2D, W: number, H: number, GROUND_Y: number, score: number, hi: number, frame: number) {
  const p = (Math.sin(frame*0.08)+1)/2
  ctx.save()
  ctx.fillStyle = 'rgba(240,234,224,0.7)'; ctx.fillRect(0, 0, W, H)
  const cardH = 100, cardW = 340, cardY = GROUND_Y - cardH - 50
  drawRoundRect(ctx, W/2-cardW/2, cardY, cardW, cardH, 12)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill()
  ctx.strokeStyle = CLR.error; ctx.lineWidth = 2; ctx.stroke()
  ctx.textAlign = 'center'
  ctx.font = 'bold 24px monospace'; ctx.fillStyle = CLR.error
  ctx.fillText('RATE LIMITED', W/2, cardY+32)
  ctx.font = '12px monospace'; ctx.fillStyle = CLR.charcoal
  ctx.fillText(`score: ${score}  |  best: ${hi}`, W/2, cardY+56)
  ctx.font = '11px monospace'
  ctx.fillStyle = `rgba(200,98,58,${0.5+p*0.5})`
  ctx.fillText('[ SPACE ] or [ TAP ] to retry', W/2, cardY+80)
  ctx.restore()
}

const CLAWD_W = 15*4
const CLAWD_H = 9*4

function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gsView, setGsView] = useState<GameState>('idle')
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const W = dims.w, H = dims.h
  const GROUND_Y = Math.floor(H * GROUND_RATIO)

  const s = useRef({
    gs: 'idle' as GameState, py: 0, vy: 0, ground: true,
    obs: [] as Obstacle[], score: 0, hi: 0, speed: INIT_SPEED,
    frame: 0, bgOff: 0, nextObs: 120, animId: 0,
    wasGround: true, lastMilestone: 0, prevGs: 'idle' as GameState,
  })

  // Sync ground position when dims change
  useEffect(() => {
    const st = s.current
    if (st.gs !== 'playing') st.py = GROUND_Y - CLAWD_H
  }, [GROUND_Y])

  const spawn = useCallback(() => {
    const st = s.current
    const GY = Math.floor(window.innerHeight * GROUND_RATIO)
    if (Math.random() < 0.4) {
      // Bird / flying creature
      const variant = Math.floor(Math.random() * 2)
      const birdH = variant === 0 ? 24 : 28
      const birdW = variant === 0 ? 40 : 36
      const flyH = GY - 55 - Math.random() * 60
      st.obs.push({ x: window.innerWidth+20, y: flyH, w: birdW, h: birdH, type: 'bird', variant })
    } else {
      // Cactus
      const variant = Math.floor(Math.random() * 3)
      const cactusW = variant === 1 ? 40 : variant === 2 ? 35 : 25
      const cactusH = variant === 1 ? 45 : variant === 2 ? 45 : 55
      st.obs.push({ x: window.innerWidth+20, y: GY-cactusH, w: cactusW, h: cactusH, type: 'cactus', variant })
    }
  }, [])

  const reset = useCallback(() => {
    const st = s.current
    const GY = Math.floor(window.innerHeight * GROUND_RATIO)
    st.gs = 'playing'; st.py = GY - CLAWD_H; st.vy = 0; st.ground = true
    st.obs = []; st.score = 0; st.speed = INIT_SPEED; st.frame = 0; st.bgOff = 0
    st.nextObs = 120; st.wasGround = true; st.lastMilestone = 0
  }, [])

  const jump = useCallback(() => {
    const st = s.current
    if (st.gs !== 'playing') { reset(); return }
    if (st.ground) { st.vy = JUMP_V; st.ground = false; playJump() }
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
      const W = canvas.width, H = canvas.height
      const GY = Math.floor(H * GROUND_RATIO)
      const st = s.current
      st.frame++; st.bgOff += st.speed

      if (st.gs === 'playing') {
        st.score = Math.floor(st.frame * 0.12)
        st.speed = Math.min(MAX_SPEED, INIT_SPEED + st.frame * SPEED_INC)
        const milestone = Math.floor(st.score/100)
        if (milestone > st.lastMilestone) { st.lastMilestone = milestone; playCoin() }

        const wasOnGround = st.wasGround
        st.vy += GRAVITY; st.py += st.vy
        const floor = GY - CLAWD_H
        if (st.py >= floor) {
          st.py = floor; st.vy = 0
          if (!wasOnGround) playLand()
          st.ground = true
        } else { st.ground = false }
        st.wasGround = st.ground

        st.nextObs--
        if (st.nextObs <= 0) { spawn(); st.nextObs = Math.floor(80+Math.random()*60+(MAX_SPEED-st.speed)*8) }
        st.obs = st.obs.filter(o => o.x+o.w > -10)
        st.obs.forEach(o => { o.x -= st.speed })

        const px = 80+6, py = st.py+4, pw = CLAWD_W-12, ph = CLAWD_H-6
        for (const o of st.obs) {
          if (px < o.x+o.w-6 && px+pw > o.x+6 && py < o.y+o.h-4 && py+ph > o.y+6) {
            st.gs = 'dead'; if (st.score > st.hi) st.hi = st.score; playDie()
          }
        }
      }

      if (st.gs !== st.prevGs) { st.prevGs = st.gs; setGsView(st.gs) }

      ctx.clearRect(0,0,W,H)
      drawBg(ctx, W, H, GY, st.bgOff)
      st.obs.forEach(o => {
        if (o.type === 'cactus') drawCactus(ctx, o.x, o.y, o.variant)
        else drawBird(ctx, o.x, o.y, o.variant, st.frame)
      })
      drawClawd(ctx, 80, st.py, st.frame, st.gs==='playing')
      if (st.gs !== 'idle') drawHUD(ctx, W, st.score, st.hi, st.speed)
      if (st.gs === 'idle') drawIdle(ctx, W, H, GY, st.frame)
      if (st.gs === 'dead') drawDead(ctx, W, H, GY, st.score, st.hi, st.frame)

      st.animId = requestAnimationFrame(loop)
    }
    s.current.animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(s.current.animId)
  }, [spawn, dims])  // re-init loop when dims change

  // Avatar Y position: above the card (card is at GROUND_Y - cardH - offset)
  const avatarTopPct = ((GROUND_Y - 90 - 60 - 80) / H) * 100

  return (
    <div style={{ position: 'fixed', inset: 0, background: CLR.bg, overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <canvas
          ref={canvasRef} width={W} height={H} onClick={jump}
          style={{ display: 'block', cursor: 'pointer', width: '100%', height: '100%', imageRendering: 'pixelated' }}
        />

        {gsView === 'idle' && (
          <div style={{
            position: 'absolute', left: '50%', top: `${avatarTopPct}%`,
            transform: 'translateX(-50%)', pointerEvents: 'none',
          }}>
            <div style={{ borderRadius: '50%', boxShadow: '0 2px 16px rgba(200,98,58,0.25)', animation: 'clawd-bob 2s ease-in-out infinite' }}>
              <Claude.Avatar size={72} />
            </div>
          </div>
        )}

        {gsView === 'dead' && (
          <div style={{
            position: 'absolute', left: '50%', top: `${avatarTopPct}%`,
            transform: 'translateX(-50%)', pointerEvents: 'none',
          }}>
            <div style={{ borderRadius: '50%', filter: 'grayscale(60%) brightness(0.85)', animation: 'clawd-shake 0.4s ease-in-out 1', boxShadow: '0 2px 12px rgba(192,57,43,0.3)' }}>
              <Claude.Avatar size={72} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes clawd-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes clawd-shake { 0%{transform:rotate(0)} 20%{transform:rotate(-8deg)} 40%{transform:rotate(8deg)} 60%{transform:rotate(-5deg)} 80%{transform:rotate(5deg)} 100%{transform:rotate(0)} }
      `}</style>
    </div>
  )
}

export default function App() {
  const [started, setStarted] = useState(false)
  if (!started) return <FrontPage onPlay={() => setStarted(true)} />
  return <GameCanvas />
}
