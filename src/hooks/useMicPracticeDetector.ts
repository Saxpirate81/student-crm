"use client";

import { useEffect, useRef, useState } from "react";

const SOUND_START_THRESHOLD = 0.03;
const SILENCE_STOP_MS = 5000;

export type MicStatus = "idle" | "listening" | "denied";

type Options = {
  enabled: boolean;
  onSegmentComplete: (durationSec: number) => void;
  /** Increment (e.g. user taps “Allow mic”) to retry getUserMedia without a full page reload. */
  retryNonce?: number;
};

/**
 * Starts/stops practice segments from ambient mic energy (music / voice).
 * One instance per app area — avoid running two detectors at once.
 */
export function useMicPracticeDetector({ enabled, onSegmentComplete, retryNonce = 0 }: Options) {
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [activeSessionStartMs, setActiveSessionStartMs] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const activeSessionStartRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onSegmentComplete);

  useEffect(() => {
    onCompleteRef.current = onSegmentComplete;
  }, [onSegmentComplete]);

  const stopStreams = (mic: MicStatus = "idle") => {
    if (animationRef.current) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    analyserRef.current = null;
    activeSessionStartRef.current = null;
    silenceStartRef.current = null;
    setActiveSessionStartMs(null);
    setMicStatus(mic);
  };

  const closeActiveSession = (endMs: number) => {
    const startMs = activeSessionStartRef.current;
    if (!startMs) return;
    const durationSec = Math.max(1, Math.round((endMs - startMs) / 1000));
    activeSessionStartRef.current = null;
    silenceStartRef.current = null;
    setActiveSessionStartMs(null);
    onCompleteRef.current(durationSec);
  };

  useEffect(() => {
    if (!enabled) {
      stopStreams("idle");
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;

        const AudioContextCtor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextCtor) {
          stopStreams("idle");
          return;
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextCtor();
        }

        const context = audioContextRef.current;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        analyserRef.current = analyser;
        setMicStatus("listening");

        const buffer = new Uint8Array(analyser.frequencyBinCount);

        const detect = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(buffer);

          let sum = 0;
          for (let i = 0; i < buffer.length; i += 1) {
            const normalized = (buffer[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const now = Date.now();

          if (rms > SOUND_START_THRESHOLD) {
            silenceStartRef.current = null;
            if (!activeSessionStartRef.current) {
              activeSessionStartRef.current = now;
              setActiveSessionStartMs(now);
            }
          } else if (activeSessionStartRef.current) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = now;
            } else if (now - silenceStartRef.current >= SILENCE_STOP_MS) {
              closeActiveSession(now);
            }
          }

          animationRef.current = window.requestAnimationFrame(detect);
        };

        animationRef.current = window.requestAnimationFrame(detect);
      } catch {
        stopStreams("denied");
      }
    };

    start();

    return () => {
      cancelled = true;
      stopStreams("idle");
    };
  }, [enabled, retryNonce]);

  useEffect(() => {
    if (!activeSessionStartMs) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeSessionStartMs]);

  const activeSeconds = activeSessionStartMs
    ? Math.max(0, Math.round((Date.now() - activeSessionStartMs) / 1000))
    : 0;

  return { micStatus, activeSessionStartMs, activeSeconds };
}
