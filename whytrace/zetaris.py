from __future__ import annotations

import os
from pathlib import Path

import jaydebeapi
from dotenv import load_dotenv

load_dotenv()


DRIVER_PATH = (
    Path(__file__).resolve().parents[1]
    / "ndp-jdbc-driver-2.4.3.1-7eff043-driver.jar"
)

JDBC_URL = os.getenv(
    "ZETARIS_JDBC_URL",
    "jdbc:zetaris:lightning@localhost:10000",
)


def query_zetaris(sql: str) -> dict:
    """Run a read-only query against the configured Zetaris instance."""
    normalized = sql.strip().lower()

    # Keep this feature read-only.
    if not normalized.startswith(("select ", "show ")):
        raise ValueError("Only SELECT and SHOW queries are allowed.")

    if ";" in normalized.rstrip(";"):
        raise ValueError("Only one SQL statement is allowed.")

    if not DRIVER_PATH.exists():
        raise RuntimeError(
            f"Zetaris JDBC driver not found: {DRIVER_PATH}"
        )

    java_home = os.getenv("JAVA_HOME")
    if not java_home:
        raise RuntimeError(
            "JAVA_HOME is not set. Start the app from a terminal "
            "where Java 17 is configured."
        )

    connection = None
    try:
        connection = jaydebeapi.connect(
            "com.zetaris.lightning.jdbc.LightningDriver",
            JDBC_URL,
            [os.getenv("ZETARIS_USER", ""),
             os.getenv("ZETARIS_PASSWORD", "")],
            str(DRIVER_PATH),
        )

        cursor = connection.cursor()
        try:
            cursor.execute(sql)
            columns = [
                description[0]
                for description in (cursor.description or [])
            ]
            rows = cursor.fetchmany(20)
            return {
                "columns": columns,
                "rows": [list(row) for row in rows],
                "row_limit": 20,
            }
        finally:
            cursor.close()
    finally:
        if connection is not None:
            connection.close()
