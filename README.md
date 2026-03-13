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
