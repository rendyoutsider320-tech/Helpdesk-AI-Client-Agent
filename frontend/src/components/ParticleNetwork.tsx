'use client'

import { useEffect, useRef } from 'react'

interface ParticleNetworkProps {
  className?: string
}

export default function ParticleNetwork({ className = '' }: ParticleNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const particles: Particle[] = []
    const maxParticles = 60
    const connectionDistance = 120

    class Particle {
      x: number
      y: number
      vx: number
      vy: number
      radius: number

      constructor() {
        this.x = Math.random() * width
        this.y = Math.random() * height
        // Slow particles for a very smooth and subtle effect
        this.vx = (Math.random() - 0.5) * 0.3
        this.vy = (Math.random() - 0.5) * 0.3
        this.radius = Math.random() * 1.5 + 1
      }

      update() {
        this.x += this.vx
        this.y += this.vy

        // Bounce back from boundaries
        if (this.x < 0 || this.x > width) this.vx = -this.vx
        if (this.y < 0 || this.y > height) this.vy = -this.vy
      }

      draw(c: CanvasRenderingContext2D, isDark: boolean) {
        c.beginPath()
        c.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        // Redup blue/dark blue color with 70% opacity
        c.fillStyle = isDark ? 'rgba(56, 189, 248, 0.7)' : 'rgba(15, 23, 42, 0.7)'
        c.fill()
      }
    }

    // Initialize particles
    for (let i = 0; i < maxParticles; i++) {
      particles.push(new Particle())
    }

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }

    window.addEventListener('resize', handleResize)

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      
      const isDark = !document.documentElement.classList.contains('light')

      // Update and draw particles
      particles.forEach((p) => {
        p.update()
        p.draw(ctx, isDark)
      })

      // Draw connections
      ctx.lineWidth = 0.8
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < connectionDistance) {
            const alpha = (1 - dist / connectionDistance) * 0.7 // max 70% opacity
            ctx.strokeStyle = isDark 
              ? `rgba(56, 189, 248, ${alpha})` 
              : `rgba(15, 23, 42, ${alpha})`
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
    />
  )
}
