import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function registerPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  if (import.meta.env.PROD && import.meta.env.VITE_INSTALLABLE !== 'no' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
  }
}

/** Whether the browser offers "install app", and a function to show its prompt. */
export function useInstallPrompt() {
  const [available, setAvailable] = useState(!!deferred);
  useEffect(() => {
    const l = () => setAvailable(!!deferred);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    notify();
  }
  return { available, install };
}
