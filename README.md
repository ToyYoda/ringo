# Hochzeits-App

> **Neu (2026): [`web/`](web/README.md) – „Hochzeitsbogen“**, die moderne Neuauflage des Konzepts als Web-Plattform: Einladung mit Zusage, Fotos per QR-Code, Live-Fotowand, Video-Gästebuch, „Finde meine Fotos“, Sitzplan-Assistent, Fotobuch. Gäste brauchen keine App. Handbücher und Kundenbroschüre unter `web/docs/`.
>
> Der folgende Android-Prototyp setzt das ursprüngliche Konzept von 2014 eins zu eins um.


Umsetzung des Konzepts aus dem OneDrive-Ordner „Weddingapp“ (Präsentation, A2-Skizzen,
Papiernotizen vom 13.11.2014; Kopien unter `design/`).

**Stack:** Kotlin, Jetpack Compose (Material 3), Navigation Compose, kotlinx.serialization, Coil.
minSdk 26 (Android 8), targetSdk 35.

## Installieren
`Hochzeits-App.apk` aufs Handy kopieren und öffnen (Installation aus unbekannten Quellen erlauben).

## Bauen
```
set JAVA_HOME=%LOCALAPPDATA%\Java\jdk-17.0.20.1+1
gradlew assembleDebug
```
Ergebnis: `app/build/outputs/apk/debug/app-debug.apk`

## Demo
Startbildschirm → „Demo starten“ (Brautpaar oder Gast). Passwort Brautpaar: `demo`,
Gast-Codes z. B. `ANNA01` (Trauzeugin), `JONAS6` (normaler Gast). In den Einstellungen lässt
sich die Perspektive wechseln.

## Aufbau
- `data/` – Datenmodell, Demo-Daten, `WeddingRepository` (eine JSON-Datei im App-Speicher)
- `ui/AppViewModel.kt` – alle Aktionen + Sichtbarkeitsregeln (Rollen, Überraschungen, Freigaben)
- `ui/components/` – Bogen-Header, gemeinsame Bausteine, Kamera/Galerie-Auswahl
- `ui/screens/` – ein File pro Bereich
- `util/` – Bildspeicher, PDF-Export

## Offene Punkte
- Daten liegen nur lokal auf einem Gerät. Für echtes Multi-User (Brautpaar + Gäste auf eigenen
  Handys) muss `WeddingRepository` an ein Backend (z. B. Firebase) angebunden werden.
- Website-Variante (eigene URL je Paar), Monetarisierung, Facebook-Login: nicht umgesetzt.
- Für einen Play-Store-Release eigenen Signierschlüssel hinterlegen.
