# Betriebshandbuch

Für alle, die Ringo betreiben: für ein einzelnes Paar auf dem eigenen Server oder als Dienst für viele Paare.

---

## 1. Systemvoraussetzungen

| | Minimum | Empfohlen |
|---|---|---|
| Laufzeit | Node.js 22.13 | Node.js 22 LTS oder Docker |
| CPU / RAM | 1 vCPU / 512 MB | 2 vCPU / 1 GB |
| Speicher | 2 GB | 20 GB+. Eine Hochzeit belegt je nach Videoanteil 1–10 GB |
| Netz | HTTPS mit eigener Domain | |

Die Datenbank ist **SQLite** über das in Node eingebaute `node:sqlite`. Es gibt keinen Datenbankserver und keine nativen Module. Fotos, Videos und Sprachnachrichten liegen als Dateien im Datenverzeichnis.

## 2. Installation

### Variante A: Docker Compose mit automatischem HTTPS (empfohlen)

```bash
cp .env.example .env          # BASE_URL und DOMAIN eintragen, Rest nach Bedarf
docker compose up -d --build
```

- **Caddy** holt automatisch ein Let's-Encrypt-Zertifikat für `DOMAIN`. Die Ports 80 und 443 müssen erreichbar sein, und die DNS-A-Records müssen auf den Server zeigen.
- Daten liegen im Docker-Volume `ringo-data`.
- Healthcheck: `GET /api/health`.

### Variante B: Direkt mit Node

```bash
npm ci --omit=dev
BASE_URL=https://hochzeit.example.de DATA_DIR=/var/lib/ringo TZ=Europe/Berlin npm start
```

Davor gehört ein Reverse Proxy mit HTTPS (siehe Abschnitt 4). Als Dienst einrichten, z. B. mit systemd:

```ini
[Unit]
Description=Ringo
After=network.target

[Service]
WorkingDirectory=/opt/ringo
EnvironmentFile=/opt/ringo/.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/index.js
Restart=always
User=ringo

[Install]
WantedBy=multi-user.target
```

### Lokal ausprobieren

```bash
npm install && npm run demo && npm start
```

## 3. Konfiguration

Alle Einstellungen kommen aus Umgebungsvariablen (Vorlage: `.env.example`).

| Variable | Standard | Bedeutung |
|---|---|---|
| `BASE_URL` | `http://localhost:PORT` | **Öffentliche Adresse.** Steckt in allen Einladungslinks und QR-Codes. Muss vor dem Druck der Tischkarten stimmen |
| `PORT` | `3000` | |
| `DATA_DIR` | `./data` | Datenbank (`ringo.db`) und Medien (`media/<id>/`) |
| `TZ` | System | **Auf `Europe/Berlin` setzen.** Termine werden als lokale Zeit gespeichert, der Live-Ablauf rechnet damit |
| `DEFAULT_PLAN` | `premium` | Paket für neue Hochzeiten. `premium` für Selbsthoster, `free` für Freemium-Betrieb |
| `OPERATOR_PASSWORD` | leer | Passwort für `/betreiber`. Leer bedeutet: Konsole deaktiviert |
| `SECURE_COOKIES` | automatisch | `true`, wenn `BASE_URL` mit `https://` beginnt |
| `TRUST_PROXY` | `1` | Hinter einem Reverse Proxy so lassen, ohne Proxy `false` |
| `MAX_PHOTO_MB` / `MAX_VIDEO_MB` | 15 / 80 | Maximale Dateigröße. Fotos werden im Browser auf 2400 px verkleinert und sind meist unter 1 MB |
| `FREE_PLAN_PHOTOS` / `FREE_PLAN_GUESTS` | 100 / 60 | Grenzen des Basis-Pakets |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | leer | Optional: E-Mail-Versand von Einladungen und Nachrichten. Ohne SMTP laufen Einladungen über WhatsApp, das Mailprogramm oder einen kopierten Link |
| `ANTHROPIC_API_KEY` | leer | Optional: KI-Assistent für Gästefragen und Rede-Helfer (Claude API). Ohne Schlüssel nutzt die App die FAQ-Suche bzw. eine Redegliederung |
| `AI_MODEL` | `claude-opus-5-5` | Modell für die KI-Funktionen |

## 4. Reverse Proxy & HTTPS

HTTPS ist **Pflicht**. Kamera, Mikrofon und „Zum Startbildschirm hinzufügen“ funktionieren im Browser nur über HTTPS (oder auf `localhost`).

Wichtig für jeden Proxy:

1. **Server-Sent Events nicht puffern.** Live-Ablauf und Fotowand nutzen `/api/g/stream` und `/api/wand/*/stream`. Der Server sendet `X-Accel-Buffering: no`.
2. **Große Uploads erlauben:** mindestens `MAX_VIDEO_MB` + 10 MB.
3. Die Header `X-Forwarded-For` und `X-Forwarded-Proto` weiterreichen.

**Caddy:** Siehe `Caddyfile`, die Einstellungen sind dort schon enthalten.

**nginx:**

```nginx
server {
  server_name hochzeit.example.de;
  client_max_body_size 100m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;              # für Live-Ablauf und Fotowand
    proxy_read_timeout 1h;
  }
}
```

## 5. Backup & Wiederherstellung

```bash
npm run backup                 # → DATA_DIR/backups/ringo-<Zeitstempel>/
npm run backup -- /mnt/backup  # anderes Ziel
# Docker:
docker compose exec app npm run backup -- /data/backups
```

- Die Datenbank wird im laufenden Betrieb konsistent gesichert (`VACUUM INTO`), die Medien werden kopiert.
- **Wiederherstellen:** Server stoppen, `ringo.db` und `media/` aus dem Backup nach `DATA_DIR` kopieren, Server starten.
- Empfehlung: Backup täglich per Cron und zusätzlich außerhalb des Servers ablegen, z. B. mit restic oder rclone. Besonders wichtig in der Woche nach einer Hochzeit.

## 6. Updates

```bash
git pull                       # bzw. neue Version einspielen
npm ci --omit=dev              # oder: docker compose up -d --build
```

Das Datenbankschema wird beim Start automatisch angelegt (`CREATE TABLE IF NOT EXISTS`). Vor jedem Update ein Backup ziehen.

## 7. Betreiber-Konsole & Pakete

- **Zugang:** `OPERATOR_PASSWORD` setzen und `/betreiber` öffnen.
- **Was die Konsole zeigt:** alle Hochzeiten mit Konto, Gästezahl, Fotos und Speicherverbrauch, außerdem offene „Premium anfragen“-Wünsche der Paare.
- **Freischalten:** Ein Klick auf **Premium freischalten** schaltet die Premium-Funktionen sofort frei, z. B. nach Zahlungseingang.

| Funktion | Basis | Premium |
|---|---|---|
| Einladungen | bis `FREE_PLAN_GUESTS` | unbegrenzt |
| Fotos | bis `FREE_PLAN_PHOTOS` | unbegrenzt, inkl. Videos |
| Termine, Zusagen, Ablauf, Infos, FAQ, Nachrichten, Geschenke, Text-Gästebuch, Tischkarten, Export | ✓ | ✓ |
| Live-Fotowand, Video-/Sprach-Gästebuch, „Finde meine Fotos“, Sitzplan-Assistent, Fotobuch | – | ✓ |
| KI-Assistent & Rede-Helfer | – | ✓ (wenn `ANTHROPIC_API_KEY` gesetzt) |

> **Zahlungsabwicklung** ist bewusst nicht eingebaut. Für einen kommerziellen Betrieb lässt sich z. B. Stripe Checkout anbinden. Ein Webhook setzt dann `weddings.plan = 'premium'`, also dasselbe wie der Knopf in der Konsole.

## 8. Datenschutz-Checkliste für den Livebetrieb

- [ ] `/datenschutz` (`public/datenschutz.html`) mit eigenen Angaben ausfüllen (Verantwortlicher, Hoster, Speicherdauer) und rechtlich prüfen lassen. Ein Impressum ergänzen.
- [ ] Hosting in der EU, AV-Vertrag mit dem Hoster.
- [ ] Wenn KI aktiv ist: AV-Vertrag und Drittlandübermittlung (Anthropic) prüfen und in der Datenschutzerklärung beschreiben. Übermittelt werden nur die Gästefrage bzw. die Anekdoten und die Hochzeitsinfos, keine Fotos.
- [ ] **Gesichtserkennung** („Finde meine Fotos“):
  - Die Erkennung läuft im Browser. Es werden nur 128-stellige Merkmalsvektoren gespeichert, keine Gesichtsbilder.
  - Das Selfie des Gastes wird nie hochgeladen.
  - Rechtlich sind es biometrische Daten (Art. 9 DSGVO). Die Funktion ist deshalb standardmäßig aus, wird vom Brautpaar aktiviert und von Gästen freiwillig genutzt. Gespeicherte Selfie-Merkmale lassen sich in der App löschen.
- [ ] **Löschkonzept** festlegen, z. B. Paare nach 12 Monaten erinnern. Das Brautpaar kann seine Hochzeit vollständig löschen. Dabei werden Datenbankeinträge und Mediendateien entfernt.
- [ ] Datensparsamkeit: keine Tracker, keine externen Schriften oder CDNs. Alle Schriften und die Gesichtserkennungs-Modelle werden lokal ausgeliefert.

## 9. Sicherheit

- **Passwörter:** scrypt mit Salt. Sitzungen laufen über zufällige Tokens in HttpOnly-Cookies mit `SameSite=Lax` (bei HTTPS zusätzlich `Secure`).
- **CSRF:** Alle schreibenden API-Aufrufe brauchen den Header `X-Requested-With: ringo`.
- **Strikte Content-Security-Policy:** keine Inline-Skripte, keine Fremd-Domains. Dazu `X-Content-Type-Options`, `Referrer-Policy` und `frame-ancestors 'none'`.
- **Rate-Limits** gegen Durchprobieren und Missbrauch: Login, Registrierung, Uploads, Fragen, Rede-Helfer.
- **Zugriff auf Medien:** Nur das Brautpaar, Gäste der jeweiligen Hochzeit oder Besitzer des Fotowand-Links dürfen Fotos sehen. Der Tisch-QR-Code erlaubt nur das Hochladen (und das Titelbild).
- **Uploads:** Erlaubt sind nur Bild-, Video- und Audio-Typen. Dateinamen werden zufällig vergeben, Pfadangaben aus Anfragen werden verworfen.
- **Gästelinks:** Sie sind 16 Zeichen lang und zufällig. Das Paar kann jeden Link einzeln neu erzeugen, der alte ist dann ungültig.

## 10. Überwachung & Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| Live-Ablauf aktualisiert nicht, Fotowand zeigt neue Fotos erst nach Neuladen | Der Proxy puffert Server-Sent Events, siehe Abschnitt 4 |
| Kamera/Mikrofon gehen nicht | Seite läuft nicht über HTTPS, oder die Berechtigung wurde im Browser verweigert |
| QR-Codes führen auf `localhost` | `BASE_URL` war beim Druck falsch. Korrigieren, Tischkarten neu drucken |
| „Falsche Uhrzeit“ im Live-Ablauf | `TZ=Europe/Berlin` setzen |
| Upload „Datei zu groß“ | `MAX_VIDEO_MB` und die Proxy-Grenze (`client_max_body_size` bzw. `request_body`) anheben |
| KI antwortet nicht | `ANTHROPIC_API_KEY` prüfen. Fehler stehen im Server-Log, die App fällt automatisch auf die FAQ-Suche zurück |
| E-Mails kommen nicht an | SMTP-Daten prüfen. Absenderadresse mit SPF/DKIM der Domain versehen |

- Logs gehen nach stdout/stderr (`docker compose logs -f app`).
- Health-Endpunkt: `GET /api/health`.

## 11. Tests

```bash
npm test                 # API-Tests mit isolierter Temp-Datenbank
npm run demo && npm start
npm run test:e2e         # alle Seiten in Chrome inkl. aller PDF-Exporte (CHROME_PATH setzen, falls nicht gefunden)
npm run test:browser     # Bildverarbeitung, Gesichtserkennung, Video-/Sprachaufnahme
npm run docs:screens     # Screenshots für Handbuch und Broschüre neu erzeugen
```
