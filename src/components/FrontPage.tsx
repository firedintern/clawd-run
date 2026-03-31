import { useEffect, useRef, useState } from 'react'
import { BlurText } from './BlurText'

interface FrontPageProps {
  onPlay: () => void
}

// Animated canvas background — dark perspective grid with parallax
function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let frame = 0
    let animId: number

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const W = canvas.width, H = canvas.height
      frame++

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#120C06')
      bg.addColorStop(1, '#1E1208')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Perspective vanishing point slightly above center
      const VX = W * 0.5
      const VY = H * 0.38

      // Perspective grid lines — converge to VP
      const numLines = 14
      const spread = W * 0.85
      ctx.lineWidth = 1
      for (let i = 0; i <= numLines; i++) {
        const t = i / numLines
        const bx = W * 0.5 - spread / 2 + t * spread
        const alpha = 0.04 + Math.abs(t - 0.5) * 0.04
        ctx.strokeStyle = `rgba(200,98,58,${alpha})`
        ctx.beginPath()
        ctx.moveTo(VX, VY)
        ctx.lineTo(bx, H)
        ctx.stroke()
      }

      // Horizontal grid lines — scroll with parallax
      const numH = 9
      for (let i = 0; i < numH; i++) {
        const tRaw = (i / numH + (frame * 0.0018)) % 1
        // Perspective mapping: 0 = horizon, 1 = bottom
        const t = Math.pow(tRaw, 1.6)
        const y = VY + (H - VY) * t
        const xLeft  = VX - (spread / 2) * t
        const xRight = VX + (spread / 2) * t
        const alpha = t * 0.14
        ctx.strokeStyle = `rgba(200,98,58,${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(xLeft, y)
        ctx.lineTo(xRight, y)
        ctx.stroke()
      }

      // Floating particles drifting upward
      const PARTICLES = [
        { x: 0.15, y: 0.7, spd: 0.00055, r: 1.5, phase: 0 },
        { x: 0.28, y: 0.4, spd: 0.00042, r: 1.2, phase: 1.2 },
        { x: 0.45, y: 0.6, spd: 0.00060, r: 2.0, phase: 2.4 },
        { x: 0.63, y: 0.3, spd: 0.00038, r: 1.0, phase: 0.7 },
        { x: 0.72, y: 0.5, spd: 0.00050, r: 1.8, phase: 3.1 },
        { x: 0.85, y: 0.75, spd: 0.00044, r: 1.3, phase: 1.9 },
        { x: 0.92, y: 0.2, spd: 0.00058, r: 1.6, phase: 4.0 },
        { x: 0.08, y: 0.55, spd: 0.00048, r: 1.1, phase: 2.2 },
        { x: 0.35, y: 0.85, spd: 0.00035, r: 2.2, phase: 5.1 },
        { x: 0.55, y: 0.15, spd: 0.00065, r: 1.4, phase: 3.8 },
      ]

      PARTICLES.forEach(p => {
        const py = ((p.y - frame * p.spd) % 1 + 1) % 1
        const px = p.x
        const twinkle = (Math.sin(frame * 0.03 + p.phase) + 1) / 2
        ctx.globalAlpha = (0.15 + twinkle * 0.25) * py
        ctx.fillStyle = '#E8855A'
        ctx.beginPath()
        ctx.arc(px * W, py * H, p.r, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1

      // Subtle warm vignette
      const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85)
      vig.addColorStop(0, 'rgba(0,0,0,0)')
      vig.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = vig
      ctx.fillRect(0, 0, W, H)

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
    />
  )
}

export function FrontPage({ onPlay }: FrontPageProps) {
  const [showSubContent, setShowSubContent] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowSubContent(true), 400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="relative h-screen overflow-hidden" style={{ fontFamily: "'Barlow', sans-serif" }}>
      {/* Animated background */}
      <HeroBackground />

      {/* Subtle orange overlay near bottom */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(200,98,58,0.08) 0%, transparent 40%)',
        }}
      />

      {/* All content */}
      <div className="relative z-10 flex flex-col h-full">

        {/* ── Navigation ── */}
        <nav
          className="flex flex-row justify-between items-center px-8 py-6 max-w-7xl mx-auto w-full"
          style={{
            animation: showSubContent ? 'blur-in 0.6s ease forwards' : 'none',
            opacity: showSubContent ? undefined : 0,
          }}
        >
          {/* Logo */}
          <span
            className="text-3xl tracking-tight text-white select-none"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            clawd.run<sup className="text-xs align-super">®</sup>
          </span>

          {/* Nav links — hidden on mobile */}
          <div className="hidden md:flex gap-8 text-sm" style={{ fontFamily: "'Barlow', sans-serif" }}>
            {['Home', 'About', 'GitHub'].map((link, i) => (
              <a
                key={link}
                href={link === 'GitHub' ? 'https://github.com' : '#'}
                className="transition-colors duration-200"
                style={{ color: i === 0 ? 'white' : 'rgba(255,255,255,0.55)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                onMouseLeave={e => (e.currentTarget.style.color = i === 0 ? 'white' : 'rgba(255,255,255,0.55)')}
              >
                {link}
              </a>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={onPlay}
            className="liquid-glass rounded-full px-6 py-2.5 text-sm text-white transition-transform duration-200 hover:scale-105"
          >
            Play Now
          </button>
        </nav>

        {/* ── Hero Content ── */}
        <div className="flex-1 flex flex-col justify-center px-4 md:px-8 lg:px-16 pt-8 max-w-7xl mx-auto w-full">

          {/* Badge */}
          <div
            className="liquid-glass-orange rounded-full w-fit px-4 py-2 mb-8 flex items-center gap-2"
            style={{
              opacity: showSubContent ? 1 : 0,
              transition: 'opacity 0.5s ease 200ms',
            }}
          >
            <span
              className="text-xs font-semibold rounded-full px-2 py-0.5"
              style={{ background: '#C8623A', color: 'white' }}
            >
              New
            </span>
            <span className="text-xs text-white/80" style={{ fontWeight: 300 }}>
              Speed Mode · Season 2 Now Live
            </span>
          </div>

          {/* Headline */}
          <div
            className="text-6xl md:text-7xl lg:text-[5.5rem] mb-6"
            style={{
              fontFamily: "'Lora', Georgia, serif",
              fontWeight: 700,
              letterSpacing: '-2px',
              lineHeight: 0.92,
            }}
          >
            <div className="block text-white">
              <BlurText text="Dodge the Errors." delay={100} direction="bottom" />
            </div>
            <div
              className="block mt-2"
              style={{
                backgroundImage: 'linear-gradient(90deg, #F0A070 0%, #C8623A 60%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              <BlurText text="Survive the Limits." delay={500} direction="bottom" />
            </div>
          </div>

          {/* Subheading */}
          <p
            className="max-w-xl text-sm md:text-base text-white/75 mb-8"
            style={{
              fontWeight: 300,
              lineHeight: 1.7,
              opacity: showSubContent ? 1 : 0,
              filter: showSubContent ? 'blur(0px)' : 'blur(8px)',
              transform: showSubContent ? 'translateY(0)' : 'translateY(16px)',
              transition: 'opacity 0.6s ease 800ms, filter 0.6s ease 800ms, transform 0.6s ease 800ms',
            }}
          >
            An endless runner where you play as Claude — jumping over rate limits, API errors,
            and the occasional hallucination. How far can you get before the context runs out?
          </p>

          {/* CTA Buttons */}
          <div
            className="flex flex-col sm:flex-row items-start sm:items-center gap-5 mt-2"
            style={{
              opacity: showSubContent ? 1 : 0,
              filter: showSubContent ? 'blur(0px)' : 'blur(8px)',
              transform: showSubContent ? 'translateY(0)' : 'translateY(16px)',
              transition: 'opacity 0.6s ease 1100ms, filter 0.6s ease 1100ms, transform 0.6s ease 1100ms',
            }}
          >
            <button
              onClick={onPlay}
              className="liquid-glass-strong rounded-full px-7 py-3 text-sm font-medium text-white flex items-center gap-2 transition-transform duration-200 hover:scale-[1.03]"
            >
              Start Running
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </button>

            <button
              className="flex items-center gap-2.5 text-sm text-white/70 hover:text-white transition-colors duration-200"
              onClick={() => window.open('https://github.com', '_blank')}
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.031 1.531 1.031.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z" />
                </svg>
              </span>
              View Source
            </button>
          </div>
        </div>

        {/* ── Bottom Partners / Credits Bar ── */}
        <div
          className="flex flex-col items-center gap-4 pb-8"
          style={{
            opacity: showSubContent ? 1 : 0,
            transition: 'opacity 0.6s ease 1400ms',
          }}
        >
          <div className="liquid-glass rounded-full px-4 py-1.5">
            <span className="text-xs text-white/50">Built with open web technologies</span>
          </div>

          <div
            className="flex items-center gap-8 text-2xl md:text-3xl tracking-tight text-white/25"
            style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic' }}
          >
            {['React', 'TypeScript', 'Canvas', 'Tailwind', 'Vite'].map(tech => (
              <span key={tech}>{tech}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
