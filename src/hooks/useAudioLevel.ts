"use client";

import { useEffect } from "react";
import { useMotionValue, useSpring, type MotionValue } from "motion/react";

/**
 * Live microphone loudness (0..1) as a smoothed motion value — drives the
 * mic aura without re-rendering React. Without a stream (audio recording off),
 * call `bump()` on speech events for a gentle pulse instead.
 */
export function useAudioLevel(stream: MediaStream | null, active: boolean): { level: MotionValue<number>; bump: () => void } {
  const raw = useMotionValue(0);
  const level = useSpring(raw, { stiffness: 260, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (!stream || !active) {
      raw.set(0);
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) {
        const x = (v - 128) / 128;
        sum += x * x;
      }
      raw.set(Math.min(1, Math.sqrt(sum / buf.length) * 5));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      void ctx.close();
    };
  }, [stream, active, raw]);

  const bump = () => {
    if (stream) return;
    raw.set(0.7);
    setTimeout(() => raw.set(0.15), 180);
  };
  return { level, bump };
}
