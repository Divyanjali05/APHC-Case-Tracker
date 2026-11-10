import importlib
import os
from unittest.mock import patch

import pytest

from config.settings.base import (
    build_postgresql_params_config,
    is_local_postgresql_host,
    parse_postgresql_url,
)


class TestPostgresqlUrlParsing:
    """Verify safe PostgreSQL DATABASE_URL parsing and SSL/health defaults."""

    def test_decodes_url_encoded_credentials_and_preserves_options(self):
        synthetic_url = (
            "postgresql://adv%40chamber:p%40ss%3Aw%2Frd%231%252%2B3"
            "@db.synthetic-host.example.com:5432/aphc_test"
            "?sslmode=require&channel_binding=require&connect_timeout=10"
            "&unsupported_param=should_be_ignored"
        )

        cfg = parse_postgresql_url(synthetic_url)

        assert cfg["ENGINE"] == "django.db.backends.postgresql"
        assert cfg["NAME"] == "aphc_test"
        assert cfg["USER"] == "adv@chamber"
        assert cfg["PASSWORD"] == "p@ss:w/rd#1%2+3"
        assert cfg["HOST"] == "db.synthetic-host.example.com"
        assert cfg["PORT"] == 5432
        assert cfg["OPTIONS"] == {
            "sslmode": "require",
            "channel_binding": "require",
            "connect_timeout": 10,
        }
        assert "CONN_MAX_AGE" not in cfg
        assert "CONN_HEALTH_CHECKS" not in cfg

    def test_supports_postgres_scheme_and_enforces_ssl_for_remote_host(self):
        synthetic_url = "postgres://demo_user:demo_pass@remote-pg.example.org/aphc_prod"

        cfg = parse_postgresql_url(synthetic_url)

        assert cfg["NAME"] == "aphc_prod"
        assert cfg["PORT"] == 5432
        assert cfg["OPTIONS"] == {"sslmode": "require"}

    def test_local_host_does_not_force_sslmode_unless_supplied(self):
        assert is_local_postgresql_host("localhost") is True
        assert is_local_postgresql_host("127.0.0.1") is True
        assert is_local_postgresql_host("::1") is True
        assert is_local_postgresql_host("[::1]") is True
        assert is_local_postgresql_host("db.neon.example.com") is False

        local_cfg = parse_postgresql_url("postgresql://localuser:localpass@localhost:5432/localdb")
        assert local_cfg["OPTIONS"] == {}

        explicit_local_cfg = parse_postgresql_url(
            "postgresql://localuser:localpass@127.0.0.1:5432/localdb?sslmode=require"
        )
        assert explicit_local_cfg["OPTIONS"] == {"sslmode": "require"}

    def test_non_zero_conn_max_age_enables_conn_health_checks(self):
        cfg = parse_postgresql_url(
            "postgresql://user:pass@remote.example.com/db?sslmode=require",
            conn_max_age=600,
        )
        assert cfg["CONN_MAX_AGE"] == 600
        assert cfg["CONN_HEALTH_CHECKS"] is True

        params_cfg = build_postgresql_params_config(
            name="db",
            user="user",
            password="pass",
            host="remote.example.com",
            conn_max_age=300,
        )
        assert params_cfg["CONN_MAX_AGE"] == 300
        assert params_cfg["CONN_HEALTH_CHECKS"] is True
        assert params_cfg["OPTIONS"] == {"sslmode": "require"}

    @pytest.mark.parametrize(
        "invalid_url",
        [
            "mysql://user:pass@localhost:3306/mydb",
            "postgresql://user:pass@localhost:5432/",
            "postgresql://user:pass@localhost:5432/mydb?connect_timeout=not_an_int",
        ],
    )
    def test_invalid_urls_raise_value_error(self, invalid_url):
        with pytest.raises(ValueError):
            parse_postgresql_url(invalid_url)


class TestSettingsDatabaseSelection:
    """Verify development and production settings DB selection behavior."""

    def test_development_falls_back_to_sqlite_and_ignores_neon_database_url(self):
        import config.settings.development as dev_settings

        env = {
            "DATABASE_URL": "",
            "DB_NAME": "",
            "NEON_DATABASE_URL": (
                "postgresql://synthetic:synthetic@ep-synthetic.example.com/neondb?sslmode=require"
            ),
        }
        try:
            with patch.dict(os.environ, env, clear=False):
                importlib.reload(dev_settings)
                db = dev_settings.DATABASES["default"]
                assert db["ENGINE"] == "django.db.backends.sqlite3"
                assert str(db["NAME"]).endswith("db.sqlite3")
        finally:
            importlib.reload(dev_settings)

    def test_development_parses_synthetic_database_url(self):
        import config.settings.development as dev_settings

        env = {
            "DATABASE_URL": (
                "postgresql://syn%40user:syn%23pass%21@ep-synthetic.example.com/aphc_db"
                "?sslmode=require&channel_binding=require&connect_timeout=15"
            ),
            "DB_NAME": "",
        }
        try:
            with patch.dict(os.environ, env, clear=False):
                importlib.reload(dev_settings)
                db = dev_settings.DATABASES["default"]
                assert db["ENGINE"] == "django.db.backends.postgresql"
                assert db["USER"] == "syn@user"
                assert db["PASSWORD"] == "syn#pass!"
                assert db["HOST"] == "ep-synthetic.example.com"
                assert db["OPTIONS"] == {
                    "sslmode": "require",
                    "channel_binding": "require",
                    "connect_timeout": 15,
                }
        finally:
            importlib.reload(dev_settings)

    def test_production_sets_ssl_and_conn_health_checks(self):
        env = {
            "DJANGO_SECRET_KEY": "synthetic-production-secret-key-for-unit-test-only-123456",
            "DJANGO_ALLOWED_HOSTS": "api.synthetic.example.com",
            "REDIS_URL": "redis://localhost:6379/0",
            "DATABASE_URL": (
                "postgresql://prod%40user:p%40ss%2Fword@prod-pg.example.com/aphc_prod"
                "?channel_binding=require&connect_timeout=10"
            ),
            "DB_NAME": "",
        }
        with patch.dict(os.environ, env, clear=False):
            import config.settings.production as prod_settings

            importlib.reload(prod_settings)
            db = prod_settings.DATABASES["default"]
            assert db["ENGINE"] == "django.db.backends.postgresql"
            assert db["USER"] == "prod@user"
            assert db["PASSWORD"] == "p@ss/word"
            assert db["CONN_MAX_AGE"] == 600
            assert db["CONN_HEALTH_CHECKS"] is True
            assert db["OPTIONS"] == {
                "channel_binding": "require",
                "connect_timeout": 10,
                "sslmode": "require",
            }

    def test_production_db_name_remote_host_sets_ssl_and_conn_health_checks(self):
        env = {
            "DJANGO_SECRET_KEY": "synthetic-production-secret-key-for-unit-test-only-123456",
            "DJANGO_ALLOWED_HOSTS": "api.synthetic.example.com",
            "REDIS_URL": "redis://localhost:6379/0",
            "DATABASE_URL": "",
            "DB_NAME": "aphc_prod",
            "DB_USER": "prod_user",
            "DB_PASSWORD": "synthetic_password",
            "DB_HOST": "prod-pg.example.com",
            "DB_PORT": "5432",
            "DB_SSLMODE": "",
        }
        with patch.dict(os.environ, env, clear=False):
            import config.settings.production as prod_settings

            importlib.reload(prod_settings)
            db = prod_settings.DATABASES["default"]
            assert db["ENGINE"] == "django.db.backends.postgresql"
            assert db["NAME"] == "aphc_prod"
            assert db["HOST"] == "prod-pg.example.com"
            assert db["CONN_MAX_AGE"] == 600
            assert db["CONN_HEALTH_CHECKS"] is True
            assert db["OPTIONS"] == {"sslmode": "require"}
