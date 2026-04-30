"use client";

import { useEffect, useRef, useState } from "react";

const SOUND_START_THRESHOLD = 0.03;
const MUSIC_BAND_THRESHOLD = 0.018;
const SILENCE_STOP_MS = 5000;

export type MicStatus = "idle" | "listening" | "denied";

type Options = {
  enabled: boolean;
  onSegmentComplete: (durationSec: number) => void;
  /** Increment (e.g. user taps “Allow mic”) to retry getUserMedia without a full page reload. */
  retryNonce?: number;
};

/**
 * Starts/stops practice segments from ambient mic energy with a music/rhythm bias.
 * Rapping, clapping, singing, and instruments should register; plain speech is less likely.
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
  const lastPeakAtRef = useRef<number | null>(null);
  const rhythmicHitsRef = useRef<number[]>([]);
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
    lastPeakAtRef.current = null;
    rhythmicHitsRef.current = [];
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

        const timeBuffer = new Uint8Array(analyser.frequencyBinCount);
        const freqBuffer = new Uint8Array(analyser.frequencyBinCount);

        const detect = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(timeBuffer);
          analyserRef.current.getByteFrequencyData(freqBuffer);

          let sum = 0;
          for (let i = 0; i < timeBuffer.length; i += 1) {
            const normalized = (timeBuffer[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / timeBuffer.length);
          const now = Date.now();
          let musicBand = 0;
          for (let i = 3; i < Math.min(freqBuffer.length, 180); i += 1) {
            musicBand += freqBuffer[i] / 255;
          }
          const musicBandAvg = musicBand / Math.max(1, Math.min(freqBuffer.length, 180) - 3);
          const isPeak = rms > SOUND_START_THRESHOLD * 1.45;
          if (isPeak && (!lastPeakAtRef.current || now - lastPeakAtRef.current > 240)) {
            lastPeakAtRef.current = now;
            rhythmicHitsRef.current = [...rhythmicHitsRef.current.filter((hit) => now - hit < 4200), now];
          }
          const rhythmicEnough = rhythmicHitsRef.current.length >= 3;
          const musicalEnough = musicBandAvg > MUSIC_BAND_THRESHOLD || rhythmicEnough;

          if (rms > SOUND_START_THRESHOLD && musicalEnough) {
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
