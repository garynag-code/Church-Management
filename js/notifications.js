// ---------------------------------------------------------------------------
// NOTIFICATIONS & REMINDERS  (100% free — uses the browser Notification API)
// ---------------------------------------------------------------------------
// No paid push provider is used. Notifications are shown via the service worker
// / Notification API, which is free on Android and desktop, and on iOS 16.4+
// for installed PWAs. In-app reminders always work regardless of permission.
// ---------------------------------------------------------------------------

export async function initNotifications(interactive = false) {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default" && interactive) {
    try { await Notification.requestPermission(); } catch { /* ignore */ }
  }
  return Notification.permission;
}

export async function notify(title, body) {
  // Always keep an in-app copy (rendered on the "More" screen).
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) reg.showNotification(title, { body, icon: "./icons/icon.svg", badge: "./icons/icon.svg" });
      else new Notification(title, { body, icon: "./icons/icon.svg" });
    }
  } catch { /* non-fatal */ }
}

// Schedule an in-session reminder (e.g., meeting or feedback deadline).
export function scheduleReminder(title, body, whenMs) {
  const delay = whenMs - Date.now();
  if (delay <= 0) { notify(title, body); return; }
  setTimeout(() => notify(title, body), Math.min(delay, 2 ** 31 - 1));
}
