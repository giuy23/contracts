"""
Pruebas de conexión e inspección de base de datos MySQL.
"""

import pytest
from src.database import get_engine, test_connection as check_db_connection, check_tables_exist


def test_mysql_connection():
    engine = get_engine()
    assert check_db_connection(engine) is True


def test_tables_exist():
    engine = get_engine()
    tables = check_tables_exist(engine)

    assert "convocatorias" in tables
    assert tables["convocatorias"] is True

    assert "ofertantes" in tables
    assert tables["ofertantes"] is True

    assert "adjudicaciones" in tables
    assert tables["adjudicaciones"] is True

    assert "contratos" in tables
    assert tables["contratos"] is True

    assert "stg_consorcios_raw" in tables
    assert tables["stg_consorcios_raw"] is True


