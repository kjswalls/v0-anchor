'use client';

import { useState, useEffect } from 'react';

export interface SunTimes {
  /** "HH:mm" 24h local time */
  sunrise: string | null;
  /** "HH:mm" 24h local time */
  sunset: string | null;
  /** True once between sunset and the next sunrise (falls back to 06:00/18:00) */
  isAfterSunset: boolean;
}

const FALLBACK_SUNRISE = '06:00';
const FALLBACK_SUNSET = '18:00';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatLocal(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Sunrise/sunset for the user's location via api.sunrise-sunset.org,
 * with graceful fallbacks when geolocation or the API is unavailable.
 * Extracted from top-nav; decorates the calendar/Today button (sun/moon badge)
 * and later feeds the current-bucket ambience.
 */
export function useSunTimes(): SunTimes {
  const [sunrise, setSunrise] = useState<string | null>(null);
  const [sunset, setSunset] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fallback = () => {
      if (cancelled) return;
      setSunrise(FALLBACK_SUNRISE);
      setSunset(FALLBACK_SUNSET);
    };

    if (!navigator.geolocation) {
      fallback();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `https://api.sunrise-sunset.org/json?lat=${latitude}&lng=${longitude}&formatted=0`
          );
          const data = await response.json();
          if (cancelled) return;
          if (data.results?.sunrise) setSunrise(formatLocal(new Date(data.results.sunrise)));
          if (data.results?.sunset) setSunset(formatLocal(new Date(data.results.sunset)));
          if (!data.results?.sunrise && !data.results?.sunset) fallback();
        } catch {
          fallback();
        }
      },
      fallback
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const sunsetMins = sunset ? toMinutes(sunset) : toMinutes(FALLBACK_SUNSET);
  const sunriseMins = sunrise ? toMinutes(sunrise) : toMinutes(FALLBACK_SUNRISE);
  const isAfterSunset = currentMinutes >= sunsetMins || currentMinutes < sunriseMins;

  return { sunrise, sunset, isAfterSunset };
}
