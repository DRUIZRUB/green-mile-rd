# Green Mile RD — Envoltorio Nativo (Android / iOS) y Tracking GPS en Vivo

Este proyecto combina **Web + PWA instalable + App Nativa Capacitor 8 (Android & iOS)** con tracking GPS en tiempo real tipo Uber.

## Arquitectura de Tracking GPS

| Entorno | Motor de Ubicación | Segundo plano (pantalla bloqueada / Waze abierto) |
| :--- | :--- | :--- |
| **App Nativa Android (Capacitor)** | `@capgo/background-geolocation` (Foreground Service tipo `location`) | **Sí, 100% activo** con notificación persistente |
| **App Nativa iOS (Capacitor)** | `@capgo/background-geolocation` (`UIBackgroundModes: location`) | **Sí, 100% activo** con permiso *"Siempre"* |
| **Web / PWA (Chrome / Safari)** | `navigator.geolocation.watchPosition` + **Screen Wake Lock API** | Activo con la pestaña abierta (mantiene pantalla encendida) |

La selección del motor es automática mediante [`public/js/native-bridge.js`](public/js/native-bridge.js).

---

## 1. Desplegar reglas de Firestore para tracking en la nube

Las reglas para la colección `tracking/{bookingId}` ya están definidas en [`firestore.rules`](firestore.rules). Para activar la sincronización entre teléfonos distintos en producción, ejecuta:

```bash
npm run deploy:rules
```

O despliega hosting + reglas juntos:

```bash
npm run deploy:all
```

> Mientras no se desplieguen las reglas de Firestore, la app igual sincroniza en tiempo real entre pestañas del mismo navegador vía `BroadcastChannel` y `localStorage` para pruebas inmediatas.

---

## 2. Sincronizar cambios web hacia Android e iOS

Cada vez que modifiques archivos dentro de `public/`:

```bash
npm install
npm run cap:sync
```

Esto regenera las páginas estáticas (`npm run build:pages`) y copia todos los activos actualizados dentro de `android/` e `ios/`.

---

## 3. Compilar App Android (APK / Google Play AAB)

**Requisitos:** Android Studio (con Android SDK 34+ y JDK 21).

```bash
npm run cap:android
```

1. Espera a que Gradle sincronice automáticamente los 4 plugins (`@capacitor/geolocation`, `@capgo/background-geolocation`, `@capacitor/status-bar`, `@capacitor/splash-screen`).
2. Permisos ya configurados en [`android/app/src/main/AndroidManifest.xml`](android/app/src/main/AndroidManifest.xml):
   - `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`
   - `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`
   - `POST_NOTIFICATIONS`, `WAKE_LOCK`
3. Para generar APK de pruebas: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. Para Google Play Store: **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.

---

## 4. Compilar App iOS (TestFlight / App Store)

**Requisitos:** Mac con Xcode 16+ (Swift Package Manager ya está configurado en `ios/App/CapApp-SPM/Package.swift`).

```bash
npm run cap:ios
```

1. En Xcode selecciona el target **App → Signing & Capabilities**.
2. Selecciona tu Apple Developer Team y confirma que la capacidad **Background Modes → Location updates** esté activa (ya declarada en [`ios/App/App/Info.plist`](ios/App/App/Info.plist)).
3. Conecta un iPhone o usa el simulador y presiona **Run (⌘R)**, o **Product → Archive** para subir a TestFlight / App Store.

---

## 5. Probar el Tracking tipo Uber de inmediato

1. Abre `/tracking.html?demo=1&role=operator` (o entra desde **Mi Panel → Demo Operador**).
2. Haz clic en **👁 Abrir Vista Cliente** para abrir el mapa del contratista en otra pestaña.
3. En la consola del operador, pulsa **▶ Simular recorrido** (puedes ajustar velocidad `1x`, `3x`, `8x`) o **🚚 Iniciar Recorrido hacia la Obra** para usar GPS real.
4. Verás la unidad desplazarse suavemente sobre las calles reales, rotar según rumbo, acortar la ruta restante, actualizar ETA y distancia en vivo, y confirmar llegada a obra.
