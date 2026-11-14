"use client";

import { useEffect, useRef } from "react";

export interface AmbientLayerProps {
  /** Tension level in [0, 1]; increases lamp flicker rate and adds a faint red tint. */
  tension?: number;
}

interface Particle {
  x: number;
  y: number;
  radius: number;
  vy: number;
  vx: number;
  alpha: number;
  phase: number;
  swayAmp: number;
  swayFreq: number;
  warm: boolean;
}

const PARTICLE_COUNT = 40;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function createParticles(width: number, height: number): Particle[] {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  const particles: Particle[] = [];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const isSmokeWisp = i % 5 === 0;
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      radius: isSmokeWisp ? 2.2 + Math.random() * 2.6 : 0.7 + Math.random() * 1.4,
      vy: isSmokeWisp ? 6 + Math.random() * 6 : 8 + Math.random() * 12,
      vx: (Math.random() - 0.5) * 3,
      alpha: isSmokeWisp ? 0.04 + Math.random() * 0.05 : 0.08 + Math.random() * 0.14,
      phase: Math.random() * Math.PI * 2,
      swayAmp: 3 + Math.random() * 7,
      swayFreq: 0.35 + Math.random() * 0.55,
      warm: i % 3 !== 0,
    });
  }

  return particles;
}

/**
 * Self-contained ambient overlay for the duel stage:
 * - Flickering warm overhead hanging-lamp glow at top center
 * - Faint upward-drifting dust/smoke particles on a 2D canvas
 * - Soft edge vignette with subtle tension-driven red tint
 */
export function AmbientLayer({ tension = 0 }: AmbientLayerProps) {
  const clampedTension = clamp01(tension);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tensionRef = useRef(clampedTension);

  useEffect(() => {
    tensionRef.current = clampedTension;
  }, [clampedTension]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let rafId = 0;
    let lastTime = 0;

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(rect.width));
      const nextHeight = Math.max(1, Math.floor(rect.height));
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);

      if (nextWidth === width && nextHeight === height && nextDpr === dpr) {
        return;
      }

      const prevWidth = width;
      const prevHeight = height;
      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (particles.length === 0) {
        particles = createParticles(width, height);
      } else if (prevWidth > 0 && prevHeight > 0) {
        const scaleX = width / prevWidth;
        const scaleY = height / prevHeight;
        for (const p of particles) {
          p.x *= scaleX;
          p.y *= scaleY;
        }
      }
    };

    const drawParticles = (elapsedSec: number) => {
      ctx.clearRect(0, 0, width, height);
      const t = tensionRef.current;

      for (const p of particles) {
        const swayOffset = Math.sin(elapsedSec * p.swayFreq + p.phase) * p.swayAmp;
        const drawX = p.x + swayOffset;
        const drawY = p.y;

        // Fade softly near top and bottom edges
        const verticalFade =
          Math.min(1, Math.max(0, drawY / (height * 0.14))) *
          Math.min(1, Math.max(0, (height - drawY) / (height * 0.12)));
        const alpha = p.alpha * verticalFade;
        if (alpha <= 0.003) continue;

        ctx.beginPath();
        ctx.arc(drawX, drawY, p.radius, 0, Math.PI * 2);

        if (p.warm) {
          // Warm brass/amber dust (#e5c378 / #c6a15b), subtly shifted toward #e61919 at high tension
          const redShift = Math.round(t * 18);
          const greenShift = Math.round(t * 72);
          const blueShift = Math.round(t * 48);
          ctx.fillStyle = `rgba(${Math.min(255, 229 + redShift)}, ${Math.max(40, 195 - greenShift)}, ${Math.max(25, 120 - blueShift)}, ${alpha.toFixed(3)})`;
        } else {
          // Faint cool-warm smoke mote
          ctx.fillStyle = `rgba(198, 161, 91, ${(alpha * 0.65).toFixed(3)})`;
        }

        ctx.fill();
      }
    };

    const step = (now: number) => {
      if (lastTime === 0) lastTime = now;
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const speedBoost = 1 + tensionRef.current * 0.35;
      for (const p of particles) {
        p.y -= p.vy * speedBoost * dt;
        p.x += p.vx * dt;

        if (p.y < -p.radius * 2) {
          p.y = height + p.radius * 2;
          p.x = Math.random() * width;
        }
        if (p.x < -16) {
          p.x = width + 16;
        } else if (p.x > width + 16) {
          p.x = -16;
        }
      }

      drawParticles(now / 1000);
      rafId = window.requestAnimationFrame(step);
    };

    const startOrRenderStatic = () => {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      lastTime = 0;
      syncSize();

      if (motionQuery.matches) {
        drawParticles(0);
      } else {
        rafId = window.requestAnimationFrame(step);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
      if (motionQuery.matches) {
        drawParticles(0);
      }
    });

    resizeObserver.observe(canvas);
    motionQuery.addEventListener("change", startOrRenderStatic);
    startOrRenderStatic();

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      motionQuery.removeEventListener("change", startOrRenderStatic);
    };
  }, []);

  const flickerDurationSec = (5.6 - clampedTension * 3.8).toFixed(2);
  const redTintAlpha = (clampedTension * clampedTension * 0.16).toFixed(3);
  const redRimAlpha = (clampedTension * 0.24).toFixed(3);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
    >
      <style>{`
        @keyframes ambient-lamp-flicker {
          0% {
            opacity: 0.88;
            transform: translateX(-50%) scale(1);
          }
          14% {
            opacity: 0.98;
            transform: translateX(-50%) scale(1.015);
          }
          29% {
            opacity: 0.81;
            transform: translateX(-50%) scale(0.99);
          }
          43% {
            opacity: 0.95;
            transform: translateX(-50%) scale(1.01);
          }
          58% {
            opacity: 0.84;
            transform: translateX(-50%) scale(0.995);
          }
          74% {
            opacity: 1;
            transform: translateX(-50%) scale(1.02);
          }
          87% {
            opacity: 0.79;
            transform: translateX(-50%) scale(0.985);
          }
          100% {
            opacity: 0.88;
            transform: translateX(-50%) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ambient-lamp-glow {
            animation: none !important;
          }
        }
      `}</style>

      {/* Hanging lamp warm radial pool at top center */}
      <div
        className="ambient-lamp-glow absolute top-[-10%] left-1/2 h-[78%] w-[92%]"
        style={{
          transform: "translateX(-50%)",
          background:
            "radial-gradient(ellipse 56% 64% at 50% 10%, rgba(229, 195, 120, 0.22) 0%, rgba(198, 161, 91, 0.11) 34%, rgba(198, 161, 91, 0.03) 62%, transparent 82%)",
          animation: `ambient-lamp-flicker ${flickerDurationSec}s ease-in-out infinite`,
        }}
      />

      {/* Focused warm filament halo directly beneath the hanging shade */}
      <div
        className="ambient-lamp-glow absolute top-0 left-1/2 h-[34%] w-[46%]"
        style={{
          transform: "translateX(-50%)",
          background:
            "radial-gradient(ellipse 50% 60% at 50% 4%, rgba(229, 195, 120, 0.24) 0%, rgba(198, 161, 91, 0.08) 48%, transparent 78%)",
          animation: `ambient-lamp-flicker ${flickerDurationSec}s ease-in-out infinite`,
        }}
      />

      {/* Faint red tension wash (only visible as tension rises) */}
      {clampedTension > 0.01 && (
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(ellipse 75% 70% at 50% 48%, rgba(230, 25, 25, ${(Number(redTintAlpha) * 0.35).toFixed(3)}) 0%, rgba(230, 25, 25, ${redTintAlpha}) 72%, rgba(230, 25, 25, ${redRimAlpha}) 100%)`,
          }}
        />
      )}

      {/* Drifting dust and smoke particles */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Soft edge vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 72% 68% at 50% 48%, transparent 44%, rgba(7, 6, 5, 0.42) 76%, rgba(4, 3, 3, 0.84) 100%)",
        }}
      />
    </div>
  );
}
