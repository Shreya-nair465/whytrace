
import os
from pathlib import Path

import jaydebeapi
from dotenv import load_dotenv

load_dotenv()

DRIVER_PATH = (
    Path(__file__).resolve().parent
    / "ndp-jdbc-driver-2.4.3.1-7eff043-driver.jar"
)
JDBC_URL = "jdbc:zetaris:lightning@localhost:10000"
DRIVER_CLASS = "com.zetaris.lightning.jdbc.LightningDriver"


def main():
    username = os.getenv("ZETARIS_USER")
    password = os.getenv("ZETARIS_PASSWORD")

    if not username or not password:
        raise SystemExit(
            "Missing ZETARIS_USER or ZETARIS_PASSWORD in your .env file."
        )

    if not DRIVER_PATH.exists():
        raise SystemExit(f"JDBC driver not found: {DRIVER_PATH}")

    connection = None

    try:
        connection = jaydebeapi.connect(
            DRIVER_CLASS,
            JDBC_URL,
            [username, password],
            str(DRIVER_PATH),
        )

        cursor = connection.cursor()

        queries = [
            ("SHOW LIGHTNING TABLES NY_TAXI", "List taxi tables"),
            ("SELECT * FROM NY_TAXI.customers LIMIT 3", "Sample customer rows"),
        ]

        for sql, label in queries:
            print(f"\n--- {label} ---")
            try:
                cursor.execute(sql)
                columns = [
                    description[0]
                    for description in (cursor.description or [])
                ]
                print("Columns:", columns)

                for row in cursor.fetchall():
                    print(row)

            except Exception as error:
                print(f"Query failed: {error}")

        cursor.close()

    except Exception as error:
        print("Zetaris connection failed.")
        print(type(error).__name__, str(error))
        raise SystemExit(1)

    finally:
        if connection is not None:
            connection.close()


if __name__ == "__main__":
    main()
