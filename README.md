# FirstOn CRM

Modern CRM built on microservices — runs locally with Docker, deploys to AWS ECS.

## Quick start

> **Requirement:** [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running.

```bash
bash start.sh
```

That's it. On first run this creates `.env`, builds all images (~2 min), starts 13 containers, waits for each one to be healthy, then prints all URLs.

---

## All commands

| Command | What it does |
|---|---|
| `bash start.sh` | Start everything |
| `bash start.sh --build` | Force rebuild all Docker images |
| `bash start.sh --fresh` | Wipe all data + restart clean |
| `bash stop.sh` | Stop containers, keep data |
| `bash reset.sh` | Wipe all data + restart |
| `bash status.sh` | Live health dashboard |
| `bash smoke-test.sh` | Full API test suite |

---

## What runs

| Container | Port | AWS equivalent |
|---|---|---|
| MySQL 8.0 | 3306 | RDS MySQL 8.0 |
| Redis 7 | 6379 | ElastiCache |
| LocalStack | 4566 | S3 + KMS + Secrets Manager + SQS |
| Mailhog | 8025 | SES (all emails captured locally) |
| **Nginx gateway** | **8080** | API Gateway |
| auth-service | 3001 | ECS Fargate |
| contact-service | 3002 | ECS Fargate |
| calendar-service | 3003 | ECS Fargate |
| pipeline-service | 3004 | ECS Fargate |
| contract-service | 3005 | ECS Fargate |
| messaging-service | 3006 | ECS Fargate |
| sentiment-service | 3007 | ECS Fargate |
| billing-service | 3008 | ECS Fargate |
| notification-service | 3009 | ECS Fargate |

---

## Dev login

```bash
curl -s -X POST http://localhost:3001/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@firston.com.br"}' | python3 -m json.tool
```

Returns a JWT `accessToken`. Use it as `Authorization: Bearer <token>` on all API calls.
Demo data (contacts, opportunities, events, messages) is seeded automatically.

---

## Project layout

```
repo-root/                      ← your existing repo lives here
├── docker-compose.yml          ← all 13 containers defined here
├── start.sh                    ← start everything
├── stop.sh                     ← stop everything
├── reset.sh                    ← wipe data + restart
├── status.sh                   ← health dashboard
├── smoke-test.sh               ← API test suite
├── .env                        ← created on first run (gitignored)
├── .gitignore
│
├── crm/                        ← all CRM source code
│   ├── .env.example            ← template copied to root .env
│   ├── services/
│   │   ├── auth/src/           ← OAuth2 + JWT
│   │   ├── contact/src/        ← contacts + PII encryption
│   │   ├── calendar/src/       ← events + agenda
│   │   ├── pipeline/src/       ← Kanban + win odds
│   │   ├── contract/src/       ← PDF contracts
│   │   ├── messaging/src/      ← WhatsApp + email history
│   │   ├── sentiment/src/      ← PT-BR stress analysis
│   │   ├── billing/src/        ← PIX + subscriptions
│   │   └── notification/src/   ← email via Mailhog/SES
│   └── infra/
│       ├── mysql/              ← schema + seed data
│       ├── redis/              ← redis.conf
│       ├── nginx/              ← API gateway routing
│       └── localstack/         ← creates S3, KMS, Secrets, SQS
│
└── (your legacy code here)     ← untouched
```

---

## Frontend

React 18 + Vite SPA served at **http://localhost:3000** (proxied through Nginx on port 8080).

| Library | Purpose |
|---|---|
| React Router DOM 6 | Client-side routing |
| TanStack React Query 5 | Server state, caching, mutations |
| Recharts | Dashboard charts |
| Lucide React | Icon set |
| i18next + react-i18next | Internationalisation |
| date-fns | Date formatting (PT-BR locale) |

### Pages

| Route | Page |
|---|---|
| `/login` | OAuth + dev login |
| `/dashboard` | KPI cards, pipeline chart, upcoming events, recent contacts |
| `/contacts` | Contact list with expandable detail, photo upload, Google Maps autocomplete |
| `/calendar` | Monthly calendar with event management |
| `/pipeline` | Kanban board with drag-and-drop, configurable columns |
| `/messages` | WhatsApp-style chat with PT-BR sentiment / stress gauge |
| `/contracts` | Contract list with status transitions |
| `/billing` | PIX subscription management |
| `/settings` | Configuration menu (see below) |

---

## Settings

The settings page is a vertical-sidebar tab menu. Each tab is independent and can be extended over time.

| Tab | Icon | Description |
|---|---|---|
| **Account** | User | User profile card and sign-out button |
| **Pipeline** | Kanban | Rename, reorder, recolor and toggle visibility of Kanban columns |
| **Languages** | Globe | Switch application language; add new languages (see i18n section) |
| **Security** | Shield | Encryption, hashing and LGPD compliance details |
| **Notifications** | Bell | Configured notification triggers (events, payments, stress alerts) |
| **Local Env** | Database | Dev environment URLs (API, MySQL, LocalStack, Mailhog) |
| **Interface** | Palette | Active theme, fonts and current language |

---

## Internationalisation (i18n)

Built with **i18next** and **react-i18next**.

### How it works

- Default language: **Português (Brasil)**
- Fallback language: **English** — any key missing in the active locale automatically falls back to English
- The selected language is persisted in `localStorage` under the key `i18n_lang`
- Language can be switched at any time from **Settings → Languages** without a page reload

### Translation files

```
crm/frontend/src/
├── i18n.js                 ← i18next initialisation (reads localStorage, registers locales)
└── locales/
    ├── en.json             ← English (fallback)
    └── pt-BR.json          ← Português (Brasil) — default
```

Both files share the same key structure. All UI text is looked up via `t('namespace.key')`.

### Key namespaces

| Namespace | Covers |
|---|---|
| `common` | Shared strings: Save, Cancel, Loading, Error, Edit, Upload… |
| `nav` | Sidebar navigation labels |
| `settings` | Settings page — tab labels and all tab content |
| `dashboard` | KPI cards, charts, event and contact tables |
| `contacts` | Contact list, modal fields, validation messages, detail panel |
| `pipeline` | Kanban board and opportunity modal |
| `calendar` | Calendar grid and event modal |
| `contracts` | Contract list and creation modal |
| `messages` | Chat panel, stress gauge labels |
| `billing` | Subscription status, PIX flow, feature list |
| `login` | Login page copy |

### Adding a new language

1. Duplicate `src/locales/en.json` and rename it (e.g. `es.json`)
2. Translate the values — keep all keys identical
3. Register the new locale in `src/i18n.js`:
   ```js
   import es from './locales/es.json'

   i18n.init({
     resources: {
       en:     { translation: en },
       'pt-BR': { translation: ptBR },
       es:     { translation: es },   // ← add this
     },
     ...
   })
   ```
4. Add the language to the `LANGUAGES` array in `src/pages/Settings.jsx`:
   ```js
   { code: 'es', name: 'Español', flag: '🇪🇸' }
   ```

The language will then appear in **Settings → Languages** and can be selected by users.
