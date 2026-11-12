"use client";

/**
 * Records the original audio of each case (one clip per case) so a doubtful
 * transcription can be replayed later. The mic stream is opened once per
 * logging session; a new MediaRecorder is started for each case. Each clip
 * owns its chunk buffer, so finishing one clip and starting the next
 * immediately (hands-free "حفظ") can't mix their audio.
 */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function isRecordingSupported(): boolean {
  return typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
}

interface Clip {
  rec: MediaRecorder;
  chunks: Blob[];
}

export class CaseRecorder {
  private stream: MediaStream | null = null;
  private clip: Clip | null = null;
  private mime = "";

  private async ensureStream(): Promise<MediaStream> {
    if (this.stream && this.stream.getTracks().some((t) => t.readyState === "live")) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.mime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    return this.stream;
  }

  /** Start a fresh clip (discarding any clip in progress). */
  async begin(): Promise<void> {
    this.discard();
    const stream = await this.ensureStream();
    const rec = new MediaRecorder(stream, this.mime ? { mimeType: this.mime, audioBitsPerSecond: 32_000 } : undefined);
    const clip: Clip = { rec, chunks: [] };
    rec.ondataavailable = (e) => {
      if (e.data.size) clip.chunks.push(e.data);
    };
    rec.start(1000);
    this.clip = clip;
  }

  /** The live mic stream (for the level meter), once recording has started. */
  get liveStream(): MediaStream | null {
    return this.stream;
  }

  get active(): boolean {
    return !!this.clip && this.clip.rec.state !== "inactive";
  }

  pause(): void {
    if (this.clip?.rec.state === "recording") this.clip.rec.pause();
  }

  resume(): void {
    if (this.clip?.rec.state === "paused") this.clip.rec.resume();
  }

  /** Stop the current clip and return it (null if nothing was recorded). */
  finish(): Promise<Blob | null> {
    const clip = this.clip;
    this.clip = null;
    if (!clip || clip.rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      clip.rec.onstop = () => {
        const blob = new Blob(clip.chunks, { type: clip.rec.mimeType || this.mime || "audio/webm" });
        resolve(blob.size > 0 ? blob : null);
      };
      clip.rec.stop();
    });
  }

  discard(): void {
    const clip = this.clip;
    this.clip = null;
    if (clip && clip.rec.state !== "inactive") {
      clip.rec.ondataavailable = null;
      clip.rec.onstop = null;
      clip.rec.stop();
    }
  }

  /** Release the microphone. */
  release(): void {
    this.discard();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
