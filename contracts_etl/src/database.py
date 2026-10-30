"""
Módulo de base de datos para SEACE ETL.
Provee conexión mediante SQLAlchemy, verificación de salud y ejecución de scripts DDL.
"""

from pathlib import Path
from typing import Optional, Dict, List
import logging
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine

from src.config import DATABASE_URL, DDL_DIR, QUERIES_DIR, MODULE_CONFIG, MODULE_ORDER

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


def check_tables_exist(engine: Optional[Engine] = None) -> Dict[str, bool]:
    """
    Inspecciona y verifica si las tablas o vistas maestras existen en la base de datos.
    Incluye tanto BASE TABLES como VIEWS (ej. vista 'convocatorias' en BD 3FN).
    """
    eng = engine or get_engine()
    inspector = inspect(eng)
    existing_objects = set(inspector.get_table_names()) | set(inspector.get_view_names())

    result = {}
    for module_key, config in MODULE_CONFIG.items():
        tbl_name = config["table_name"]
        result[tbl_name] = tbl_name in existing_objects

    return result


def execute_ddl(
    engine: Optional[Engine] = None,
    ddl_dir: Optional[Path] = None,
    only_missing: bool = True
) -> None:
    """
    Ejecuta únicamente los scripts DDL de las tablas que aún no existen en la BD,
    protegiendo las tablas y vistas ya normalizadas en 3FN.
    """
    eng = engine or get_engine()
    directory = ddl_dir or DDL_DIR
    existing_status = check_tables_exist(eng) if only_missing else {}

    logger.info("Iniciando verificación y ejecución de scripts DDL...")

    for module_key in MODULE_ORDER:
        tbl_name = MODULE_CONFIG[module_key]["table_name"]
        if only_missing and existing_status.get(tbl_name, False):
            logger.info(f"Omitiendo DDL de '{module_key}': '{tbl_name}' ya existe en la BD.")
            continue

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


def execute_consorcios_normalization(
    engine: Optional[Engine] = None,
    sql_path: Optional[Path] = None
) -> None:
    """
    Ejecuta el script maestro de normalización 3FN de consorcios y tabla puente (1/N)
    desde sql/queries/05_normalize_consorcios.sql.
    """
    eng = engine or get_engine()
    script_path = sql_path or (QUERIES_DIR / "05_normalize_consorcios.sql")

    if not script_path.exists():
        raise FileNotFoundError(f"Script de normalización no encontrado: {script_path}")

    logger.info(f"Ejecutando normalización 3FN de consorcios: {script_path.name}")
    with open(script_path, "r", encoding="utf-8") as f:
        sql_content = f.read()

    # Remover líneas de comentarios puros antes de dividir por ';'
    cleaned_lines = [
        line for line in sql_content.splitlines()
        if not line.strip().startswith("--")
    ]
    cleaned_sql = "\n".join(cleaned_lines)
    statements = [
        stmt.strip() for stmt in cleaned_sql.split(";")
        if stmt.strip() and stmt.strip().upper() not in ("START TRANSACTION", "COMMIT")
    ]

    with eng.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))

    logger.info("Normalización 3FN de consorcios y puente_actor_empresa completada exitosamente.")

