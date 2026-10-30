"""
Módulo de configuración centralizada del pipeline ETL SEACE.
Carga variables de entorno (.env) y define rutas del proyecto y constantes de módulos.
"""

from pathlib import Path
import os
from typing import Dict, Any, List
from dotenv import load_dotenv

# Ruta raíz del proyecto (directorio contracts_etl)
BASE_DIR = Path(__file__).resolve().parent.parent

# Cargar variables de entorno desde .env
load_dotenv(dotenv_path=BASE_DIR / ".env")

# Directorios del proyecto
CONFIG_DIR = BASE_DIR / "config"
SCHEMAS_DIR = CONFIG_DIR / "schemas"
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
REJECTED_DATA_DIR = DATA_DIR / "rejected"
LOGS_DIR = BASE_DIR / "logs"
SQL_DIR = BASE_DIR / "sql"
DDL_DIR = SQL_DIR / "ddl"
QUERIES_DIR = SQL_DIR / "queries"

# Archivos de control y auditoría
PROGRESS_FILE = LOGS_DIR / "etl_progress.json"
LOG_FILE = LOGS_DIR / "execution.log"

# Asegurar existencia de directorios críticos
for directory in [RAW_DATA_DIR, REJECTED_DATA_DIR, LOGS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Configuración de Base de Datos MySQL
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "etl_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "etl_password")
DB_NAME = os.getenv("DB_NAME", "contrataciones")
DB_CHARSET = os.getenv("DB_CHARSET", "utf8mb4")

DEFAULT_DATABASE_URL = (
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset={DB_CHARSET}"
)
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

# Tamaño de bloque de procesamiento
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "3000"))

# Orden estricto de precedencia relacional (Convocatorias -> Ofertantes -> Adjudicaciones -> Contratos -> Consorcios)
MODULE_ORDER: List[str] = [
    "01_convocatorias",
    "02_ofertantes",
    "03_adjudicaciones",
    "04_contratos",
    "05_consorcios"
]

# Mapeo de módulos a sus esquemas y tablas
MODULE_CONFIG: Dict[str, Dict[str, str]] = {
    "01_convocatorias": {
        "table_name": "convocatorias",
        "schema_file": "schema_convocatorias.json",
        "ddl_file": "01_create_convocatorias.sql"
    },
    "02_ofertantes": {
        "table_name": "ofertantes",
        "schema_file": "schema_ofertantes.json",
        "ddl_file": "02_create_ofertantes.sql"
    },
    "03_adjudicaciones": {
        "table_name": "adjudicaciones",
        "schema_file": "schema_adjudicaciones.json",
        "ddl_file": "03_create_adjudicaciones.sql"
    },
    "04_contratos": {
        "table_name": "contratos",
        "schema_file": "schema_contratos.json",
        "ddl_file": "04_create_contratos.sql"
    },
    "05_consorcios": {
        "table_name": "stg_consorcios_raw",
        "schema_file": "schema_consorcios.json",
        "ddl_file": "05_create_consorcios.sql"
    }
}

