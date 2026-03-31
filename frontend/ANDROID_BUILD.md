# APK Android

La app Android de Streaming Box se genera con Capacitor.

## Enfoque usado

Esta APK envuelve `https://strbx.com.co` en lugar de depender del bundle local.

Motivo:
- el proyecto usa cookies y sesion con mismo origen
- asi el login sigue funcionando igual que en la web
- no hay que reescribir la autenticacion para un cliente nativo

## Archivos clave

- `capacitor.config.json`
- `android/`
- `package.json`

## Comandos

Instalar dependencias:

```bash
npm install
```

Sincronizar Android:

```bash
npm run android:sync
```

Abrir Android Studio:

```bash
npm run android:open
```

Compilar APK release firmada:

```bash
cd android
gradlew assembleRelease
```

## Generar APK en Android Studio

1. Abre `frontend/android` en Android Studio
2. Espera a que Gradle termine
3. Ve a `Build > Build Bundle(s) / APK(s) > Build APK(s)`
4. El APK quedara en una ruta similar a:

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

La APK release firmada queda en:

```text
frontend/android/app/build/outputs/apk/release/app-release.apk
```

La descarga publica usada por la web queda en:

```text
frontend/public/downloads/streaming-box-android.apk
```

## Requisitos

- Android Studio
- Android SDK
- Java 17 o compatible con tu instalacion de Android Studio

## Nota

Si cambias nombre, icono o dominio, vuelve a ejecutar:

```bash
npm run android:sync
```

## Biometria

La app Android ya incluye desbloqueo biometrico para sesiones activadas dentro de la APK.

- el usuario inicia sesion normalmente
- la app puede ofrecer activar ingreso con huella
- al volver a abrir la APK, la sesion queda protegida por huella o bloqueo del dispositivo
