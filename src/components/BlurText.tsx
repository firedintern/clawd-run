import { useEffect, useRef, useState } from 'react'

interface BlurTextProps {
  text: string
  className?: string
  delay?: number
  animateBy?: 'words' | 'letters'
  direction?: 'top' | 'bottom'
}

export function BlurText({
  text,
  className = '',
  delay = 0,
  animateBy = 'words',
  direction = 'bottom',
}: BlurTextProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  const segments = animateBy === 'words' ? text.split(' ') : text.split('')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const yFrom = direction === 'bottom' ? '18px' : '-18px'

  return (
    <span ref={ref} className={`inline-flex flex-wrap gap-x-[0.25em] ${className}`}>
      {segments.map((seg, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            opacity: visible ? 1 : 0,
            filter: visible ? 'blur(0px)' : 'blur(10px)',
            transform: visible ? 'translateY(0)' : `translateY(${yFrom})`,
            transition: `opacity 0.55s ease ${delay + i * 90}ms, filter 0.55s ease ${delay + i * 90}ms, transform 0.55s ease ${delay + i * 90}ms`,
          }}
        >
          {seg}
        </span>
      ))}
    </span>
  )
}
