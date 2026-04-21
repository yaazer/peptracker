# peptracker

A personal peptide and medication tracking app.

## Tech Stack

- **Backend**: FastAPI (Python 3.12), SQLAlchemy, SQLite
- **Frontend**: Next.js 14+, TypeScript, Tailwind CSS
- **Infrastructure**: Docker Compose

## Running Locally

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Start

```bash
docker compose up --build
```

| Service  | URL                          |
|----------|------------------------------|
| Frontend | http://localhost:3000        |
| Backend  | http://localhost:8000        |
| API docs | http://localhost:8000/docs   |

### Stop

```bash
docker compose down
```

To also remove the SQLite volume:

```bash
docker compose down -v
```

## Project Structure

```
peptracker/
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI app + CORS
│   │   ├── database.py    # SQLAlchemy engine + session
│   │   ├── models.py      # ORM models
│   │   └── routers/
│   │       └── health.py  # GET /api/health
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   └── page.tsx       # Health check page
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```
