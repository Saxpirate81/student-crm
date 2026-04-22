"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppRepository } from "@/lib/data/repository";
import { METRONOME_SOUND_OPTIONS } from "@/lib/data/repository";
import type { MetronomeSound } from "@/lib/domain/types";

export const METRONOME_MIN_BPM = 40;
export const METRONOME_MAX_BPM = 220;

function playMetronomeTick(context: AudioContext, sound: MetronomeSound) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.connect(gain);
  gain.connect(context.destination);

  if (sound === "classic_click") {
    osc.type = "square";
    osc.frequency.value = 950;
    gain.gain.value = 0.07;
  } else if (sound === "bright_beep") {
    osc.type = "sine";
    osc.frequency.value = 1350;
    gain.gain.value = 0.08;
  } else if (sound === "warm_pulse") {
    osc.type = "triangle";
    osc.frequency.value = 740;
    gain.gain.value = 0.1;
  } else if (sound === "digital_blip") {
    osc.type = "sawtooth";
    osc.frequency.value = 1200;
    gain.gain.value = 0.06;
  } else {
    osc.type = "triangle";
    osc.frequency.value = 560;
    gain.gain.value = 0.06;
  }

  osc.start();
  osc.stop(context.currentTime + 0.04);
}

export function useMetronome(repository: AppRepository, userKey: string) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [bpm, setBpm] = useState(90);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [metronomeSound, setMetronomeSound] = useState<MetronomeSound>("classic_click");

  useEffect(() => {
    const prefs = repository.getUserPreferences(userKey);
    setMetronomeSound(prefs.metronomeSound);
  }, [repository, userKey]);

  const ensureContext = useCallback(() => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    return audioContextRef.current;
  }, []);

  useEffect(() => {
    if (!metronomeOn) return undefined;
    const intervalMs = Math.round((60 / bpm) * 1000);
    const timer = window.setInterval(() => {
      const ctx = ensureContext();
      if (ctx) playMetronomeTick(ctx, metronomeSound);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [metronomeOn, bpm, metronomeSound, ensureContext]);

  const setSoundPersist = useCallback(
    (next: MetronomeSound) => {
      setMetronomeSound(next);
      repository.updateUserPreferences(userKey, { metronomeSound: next });
    },
    [repository, userKey],
  );

  return {
    bpm,
    setBpm,
    metronomeOn,
    setMetronomeOn,
    metronomeSound,
    setMetronomeSound: setSoundPersist,
    soundOptions: METRONOME_SOUND_OPTIONS,
    minBpm: METRONOME_MIN_BPM,
    maxBpm: METRONOME_MAX_BPM,
  };
}
