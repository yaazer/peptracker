"""
Shared test fixtures.

Uses an in-memory SQLite database per test session.
Auth is bypassed by overriding `get_current_user`.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.dependencies import get_current_user
from app.models import User
from app.main import app

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def admin_user(db):
    user = User(
        email="admin@test.com",
        hashed_password="x",
        name="Admin",
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def member_user(db):
    user = User(
        email="member@test.com",
        hashed_password="x",
        name="Member",
        role="member",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_client(db_session, current_user: User) -> TestClient:
    def _override_db():
        yield db_session

    def _override_user():
        return current_user

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = _override_user
    client = TestClient(app, raise_server_exceptions=True)
    return client


@pytest.fixture()
def admin_client(db, admin_user):
    client = _make_client(db, admin_user)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture()
def member_client(db, member_user):
    client = _make_client(db, member_user)
    yield client
    app.dependency_overrides.clear()
