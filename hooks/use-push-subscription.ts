'use client';

import { useState, useEffect, useCallback } from 'react';

// VAPID public key — must also be set in Vercel env vars (NEXT_PUBLIC_VAPID_PUBLIC_KEY)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export interface UsePushSubscriptionReturn {
  isSupported: boolean;
  isSubscribed: boolean;
  permissionState: NotificationPermission | 'unknown';
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function usePushSubscription(): UsePushSubscriptionReturn {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unknown'>('unknown');

  // Sync current subscription state on mount
  useEffect(() => {
    if (!isSupported) return;

    setPermissionState(Notification.permission);

    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      setIsSubscribed(!!existing);
    });
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    if (!VAPID_PUBLIC_KEY) {
      console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
      return;
    }

    const permission = await Notification.requestPermission();
    setPermissionState(permission);
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    alert('SW ready!');
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    alert('Push subscribed!');

    const keys = subscription.toJSON().keys as { p256dh: string; auth: string };

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }),
    });

    setIsSubscribed(true);
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;

    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return;

    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });

    await subscription.unsubscribe();
    setIsSubscribed(false);
  }, [isSupported]);

  return { isSupported, isSubscribed, permissionState, subscribe, unsubscribe };
}
