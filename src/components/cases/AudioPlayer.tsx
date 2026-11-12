"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";

/** Deterministic bar heights from the case id (the real waveform needs CORS on Storage). */
function bars(seed: string, n = 38): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    const r = ((h >>> 0) % 1000) / 1000;
    const envelope = 0.45 + 0.55 * Math.sin((Math.PI * (i + 1)) / (n + 1));
    return 0.18 + 0.82 * r * envelope;
  });
}

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

export function AudioPlayer({ src, seed }: { src: string; seed: string }) {
  const { t } = useI18n();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const heights = useMemo(() => bars(seed), [seed]);
  const progress = duration > 0 ? time / duration : 0;

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    const onMeta = () => {
      // MediaRecorder webm files report Infinity until fully scanned: seek far to force a duration.
      if (a.duration === Infinity) {
        a.currentTime = 1e9;
        a.addEventListener("timeupdate", function fix() {
          a.removeEventListener("timeupdate", fix);
          setDuration(a.duration);
          a.currentTime = 0;
        });
      } else setDuration(a.duration);
    };
    const onEnd = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("pause", onEnd);
    a.addEventListener("play", onPlay);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("pause", onEnd);
      a.removeEventListener("play", onPlay);
    };
  }, []);

  function seek(e: React.PointerEvent<HTMLDivElement>) {
    const a = audio.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  }

  return (
    <div className="flex items-center gap-3 rounded-full bg-surface-2 p-1.5 pe-4" dir="ltr">
      <audio ref={audio} src={src} preload="metadata" />
      <button
        type="button"
        onClick={() => (playing ? audio.current?.pause() : audio.current?.play())}
        aria-label={playing ? t("case.pause") : t("case.play")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-berry text-on-berry"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="ms-0.5 h-4 w-4" />}
      </button>
      <div
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[2px]"
        onPointerDown={seek}
        role="slider"
        aria-label={t("case.play")}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        tabIndex={0}
        onKeyDown={(e) => {
          const a = audio.current;
          if (!a) return;
          if (e.key === "ArrowRight") a.currentTime = Math.min(duration, a.currentTime + 2);
          if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 2);
        }}
      >
        {heights.map((h, i) => (
          <span
            key={i}
            className={`w-[3px] flex-1 rounded-full transition-colors ${i / heights.length < progress ? "bg-berry" : "bg-berry-soft"}`}
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>
      <span className="shrink-0 text-xs tabular-nums text-ink-3">
        {fmt(time)} / {fmt(duration)}
      </span>
    </div>
  );
}
