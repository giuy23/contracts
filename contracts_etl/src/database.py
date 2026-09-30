"""
Módulo de base de datos para SEACE ETL.
Provee conexión mediante SQLAlchemy, verificación de salud y ejecución de scripts DDL.
"""

from pathlib import Path
from typing import Optional, Dict, List
import logging
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine

from src.config import DATABASE_URL, DDL_DIR, MODULE_CONFIG, MODULE_ORDER

logger = logging.getLogger(__name__)


def get_engine(database_url: Optional[str] = None) -> Engine:
    """
    Crea y retorna un motor de SQLAlchemy optimizado con connection pooling.
    """
    url = database_url or DATABASE_URL
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=3600,
        pool_size=5,
        max_overflow=10
    )


def test_connection(engine: Optional[Engine] = None) -> bool:
    """
    Verifica si la conexión a la base de datos es exitosa.
    """
    eng = engine or get_engine()
    try:
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Error al verificar conexión a la base de datos: {e}")
        return False


def execute_ddl(engine: Optional[Engine] = None, ddl_dir: Optional[Path] = None) -> None:
    """
    Ejecuta los scripts DDL en orden estricto de precedencia relacional.
    """
    eng = engine or get_engine()
    directory = ddl_dir or DDL_DIR

    logger.info("Iniciando ejecución de scripts DDL...")

    # Ejecutar en orden: convocatorias -> ofertantes -> adjudicaciones -> contratos
    for module_key in MODULE_ORDER:
        ddl_file_name = MODULE_CONFIG[module_key]["ddl_file"]
        ddl_path = directory / ddl_file_name

        if not ddl_path.exists():
            raise FileNotFoundError(f"Script DDL no encontrado: {ddl_path}")

        logger.info(f"Ejecutando script DDL: {ddl_file_name}")
        with open(ddl_path, "r", encoding="utf-8") as f:
            sql_content = f.read()

        # Separar sentencias por punto y coma si hubiera múltiples
        statements = [stmt.strip() for stmt in sql_content.split(";") if stmt.strip()]

        with eng.begin() as conn:
            for statement in statements:
                conn.execute(text(statement))

    logger.info("Scripts DDL ejecutados exitosamente.")


def check_tables_exist(engine: Optional[Engine] = None) -> Dict[str, bool]:
    """
    Inspecciona y verifica si las tablas maestras existen en la base de datos.
    """
    eng = engine or get_engine()
    inspector = inspect(eng)
    existing_tables = set(inspector.get_table_names())

    result = {}
    for module_key, config in MODULE_CONFIG.items():
        tbl_name = config["table_name"]
        result[tbl_name] = tbl_name in existing_tables

    return result

