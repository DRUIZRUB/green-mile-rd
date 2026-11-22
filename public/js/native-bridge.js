/* Green Mile RD — Puente Nativo (Capacitor 8 Android/iOS + GPS en Segundo Plano + Wake Lock + PWA) */
(function (global) {
  'use strict';

  let wakeLockSentinel = null;
  let wakeLockDesired = false;
  let activeStopFn = null;
  let deferredInstallPrompt = null;

  function getCapacitor() {
    return global.Capacitor || null;
  }

  function isNativeApp() {
    const cap = getCapacitor();
    try {
      return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
    } catch (_) {
      return false;
    }
  }

  function getPlatform() {
    const cap = getCapacitor();
    if (cap && typeof cap.getPlatform === 'function') {
      try { return cap.getPlatform(); } catch (_) {}
    }
    const ua = (navigator.userAgent || '').toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios-web';
    if (/android/.test(ua)) return 'android-web';
    return 'web';
  }

  function getPlugin(name) {
    const cap = getCapacitor();
    if (!cap) return null;
    if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name];
    if (typeof cap.registerPlugin === 'function' && isNativeApp()) {
      try { return cap.registerPlugin(name); } catch (_) {}
    }
    return null;
  }

  function getEnvironmentInfo() {
    const native = isNativeApp();
    const bgPlugin = native ? getPlugin('BackgroundGeolocation') : null;
    return {
      isNative: native,
      platform: getPlatform(),
      supportsBackgroundGps: Boolean(native && bgPlugin),
      supportsWakeLock: Boolean(navigator && 'wakeLock' in navigator),
      isStandalonePwa: Boolean(
        (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) ||
        navigator.standalone === true
      )
    };
  }

  async function initNativeChrome() {
    if (!isNativeApp()) return;
    try {
      const StatusBar = getPlugin('StatusBar');
      if (StatusBar) {
        if (typeof StatusBar.setStyle === 'function') {
          await StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
        }
        if (typeof StatusBar.setBackgroundColor === 'function') {
          await StatusBar.setBackgroundColor({ color: '#0D223A' }).catch(() => {});
        }
      }
    } catch (_) {}
    try {
      const SplashScreen = getPlugin('SplashScreen');
      if (SplashScreen && typeof SplashScreen.hide === 'function') {
        setTimeout(() => { SplashScreen.hide().catch(() => {}); }, 350);
      }
    } catch (_) {}
  }

  async function requestWakeLock() {
    wakeLockDesired = true;
    if (!navigator || !('wakeLock' in navigator)) return false;
    try {
      if (wakeLockSentinel) return true;
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null;
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function releaseWakeLock() {
    wakeLockDesired = false;
    if (!wakeLockSentinel) return;
    try {
      await wakeLockSentinel.release();
    } catch (_) {}
    wakeLockSentinel = null;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && wakeLockDesired && !wakeLockSentinel) {
        requestWakeLock().catch(() => {});
      }
    });
  }

  /**
   * Normalizes a native or browser GPS reading into a single consistent shape.
   */
  function normalizePosition(raw, source) {
    if (!raw) return null;
    const coords = raw.coords || raw;
    const lat = Number(coords.latitude ?? coords.lat);
    const lng = Number(coords.longitude ?? coords.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const rawSpeed = Number(coords.speed);
    // Geolocation API reports speed in m/s; convert to km/h when valid
    const speedKmh = Number.isFinite(rawSpeed) && rawSpeed >= 0
      ? Math.round(rawSpeed * 3.6 * 10) / 10
      : null;

    const rawHeading = Number(coords.bearing ?? coords.heading);
    const heading = Number.isFinite(rawHeading) && rawHeading >= 0 ? rawHeading : null;
    const accuracy = Number.isFinite(Number(coords.accuracy)) ? Math.round(Number(coords.accuracy)) : null;

    return {
      lat,
      lng,
      speedKmh,
      heading,
      accuracy,
      timestamp: Number(raw.time || raw.timestamp || Date.now()),
      source
    };
  }

  /**
   * Starts high-precision live GPS tracking.
   * - Inside Capacitor native app: uses @capgo/background-geolocation (foreground service on Android + background location on iOS)
   *   so tracking stays active even with screen locked or Waze/Google Maps open.
   * - In browser / PWA: uses navigator.geolocation.watchPosition + Screen Wake Lock API.
   */
  async function startLiveGps(opts) {
    await stopLiveGps();

    const onPosition = opts && typeof opts.onPosition === 'function' ? opts.onPosition : () => {};
    const onError = opts && typeof opts.onError === 'function' ? opts.onError : () => {};
    const title = (opts && opts.title) || 'Green Mile RD — Recorrido en Vivo';
    const message = (opts && opts.message) || 'Transmitiendo ubicación hacia la obra. El cliente ve tu llegada en tiempo real.';

    // 1. Native Capacitor Background Geolocation (Android/iOS)
    if (isNativeApp()) {
      const BgGeo = getPlugin('BackgroundGeolocation');
      if (BgGeo && typeof BgGeo.start === 'function') {
        try {
          if (typeof BgGeo.requestPermissions === 'function') {
            await BgGeo.requestPermissions({ permissions: ['location', 'notification', 'backgroundLocation'] }).catch(() => {});
          }
          await BgGeo.start(
            {
              backgroundTitle: title,
              backgroundMessage: message,
              requestPermissions: true,
              stale: false,
              distanceFilter: 8,
              minIntervalMs: 3000,
              networkFallback: true
            },
            (location, error) => {
              if (error) {
                onError(error.message || error.code || 'Error de GPS nativo');
                return;
              }
              const pos = normalizePosition(location, 'native-background');
              if (pos) onPosition(pos);
            }
          );
          activeStopFn = async () => {
            try { await BgGeo.stop(); } catch (_) {}
          };
          return { mode: 'native-background', wakeLock: false };
        } catch (err) {
          console.warn('[Green Mile Native] BackgroundGeolocation fallback:', err);
        }
      }

      // 2. Native Capacitor Foreground Geolocation fallback
      const CapGeo = getPlugin('Geolocation');
      if (CapGeo && typeof CapGeo.watchPosition === 'function') {
        try {
          if (typeof CapGeo.requestPermissions === 'function') {
            await CapGeo.requestPermissions().catch(() => {});
          }
          const watchId = await CapGeo.watchPosition(
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
            (position, err) => {
              if (err) {
                onError(err.message || 'Error de GPS');
                return;
              }
              const pos = normalizePosition(position, 'native-foreground');
              if (pos) onPosition(pos);
            }
          );
          activeStopFn = async () => {
            try { await CapGeo.clearWatch({ id: watchId }); } catch (_) {}
          };
          return { mode: 'native-foreground', wakeLock: false };
        } catch (err) {
          console.warn('[Green Mile Native] CapGeolocation fallback:', err);
        }
      }
    }

    // 3. Browser / PWA Geolocation + Screen Wake Lock
    if (!navigator || !navigator.geolocation) {
      throw new Error('Este dispositivo no soporta geolocalización GPS.');
    }

    const wakeOk = await requestWakeLock();
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const pos = normalizePosition(position, 'web-gps');
        if (pos) onPosition(pos);
      },
      (err) => {
        const msgs = {
          1: 'Permiso de ubicación denegado. Habilita el GPS para transmitir el recorrido.',
          2: 'Señal GPS no disponible en este momento. Verificando satélites…',
          3: 'Tiempo de espera GPS agotado. Reintentando…'
        };
        onError(msgs[err && err.code] || (err && err.message) || 'No se pudo leer tu ubicación GPS.');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000
      }
    );

    activeStopFn = async () => {
      try { navigator.geolocation.clearWatch(watchId); } catch (_) {}
      await releaseWakeLock();
    };

    return { mode: 'web-gps', wakeLock: wakeOk };
  }

  async function stopLiveGps() {
    if (activeStopFn) {
      const fn = activeStopFn;
      activeStopFn = null;
      await fn();
    } else {
      await releaseWakeLock();
    }
  }

  async function openLocationSettings() {
    if (!isNativeApp()) return false;
    const BgGeo = getPlugin('BackgroundGeolocation');
    if (BgGeo && typeof BgGeo.openSettings === 'function') {
      try {
        await BgGeo.openSettings();
        return true;
      } catch (_) {}
    }
    return false;
  }

  function registerServiceWorker() {
    if (isNativeApp()) return;
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/i.test(global.location.protocol)) return;

    const basePrefix = (global.GM_PAGE && global.GM_PAGE.basePrefix) || './';
    const swUrl = basePrefix + 'sw.js';
    global.addEventListener('load', () => {
      navigator.serviceWorker.register(swUrl).catch(() => {});
    });
  }

  global.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferredInstallPrompt = ev;
    global.dispatchEvent(new CustomEvent('gm-pwa-install-ready'));
  });

  async function promptInstallPwa() {
    if (!deferredInstallPrompt) return false;
    try {
      deferredInstallPrompt.prompt();
      const res = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return Boolean(res && res.outcome === 'accepted');
    } catch (_) {
      return false;
    }
  }

  function canInstallPwa() {
    return Boolean(deferredInstallPrompt) && !getEnvironmentInfo().isStandalonePwa && !isNativeApp();
  }

  // Boot native styling + PWA service worker automatically
  initNativeChrome();
  registerServiceWorker();

  global.GM_NATIVE = {
    isNativeApp,
    getPlatform,
    getEnvironmentInfo,
    startLiveGps,
    stopLiveGps,
    requestWakeLock,
    releaseWakeLock,
    openLocationSettings,
    canInstallPwa,
    promptInstallPwa
  };
})(window);
