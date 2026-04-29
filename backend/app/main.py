from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routers import auth, compounds, dashboard, health, injections, prescriptions, protocols, profile, reference, reminders, users
from app.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="PepTracker v1", lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(compounds.router)
app.include_router(injections.router)
app.include_router(dashboard.router)
app.include_router(protocols.router)
app.include_router(profile.router)
app.include_router(reminders.router)
app.include_router(users.router)
app.include_router(reference.router)
app.include_router(prescriptions.router)
app.include_router(prescriptions.global_router)
