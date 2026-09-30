"""
Módulo de carga de datos por bloques e inserción idempotente en MySQL.
Implementa SEACELoader con INSERT IGNORE y telemetría en terminal.
"""

from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List
import time
import math
import logging
import pandas as pd
import numpy as np
from sqlalchemy.engine import Engine
from sqlalchemy import text

from src.config import SCHEMAS_DIR, REJECTED_DATA_DIR, CHUNK_SIZE, MODULE_CONFIG
from src.utils import load_schema, extract_year_from_filename, extract_part_from_filename
from src.transformer import clean_and_transform
from src.tracker import ProgressTracker

logger = logging.getLogger(__name__)


class SEACELoader:
    """
    Cargador optimizado por lotes para datasets de SEACE.
    """

    def __init__(
        self,
        engine: Engine,
        schemas_dir: Optional[Path] = None,
        rejected_dir: Optional[Path] = None,
        chunk_size: int = CHUNK_SIZE
    ):
        self.engine = engine
        self.schemas_dir = schemas_dir or SCHEMAS_DIR
        self.rejected_dir = rejected_dir or REJECTED_DATA_DIR
        self.chunk_size = chunk_size
        self._schema_cache: Dict[str, Dict[str, Any]] = {}

    def _get_schema(self, module_name: str) -> Dict[str, Any]:
        if module_name not in self._schema_cache:
            schema_file = MODULE_CONFIG[module_name]["schema_file"]
            self._schema_cache[module_name] = load_schema(schema_file, self.schemas_dir)
        return self._schema_cache[module_name]

    def _insert_chunk_ignore(self, table_name: str, df: pd.DataFrame) -> int:
        """
        Ejecuta una inserción masiva idempotente mediante INSERT IGNORE en MySQL.
        Retorna la cantidad de registros enviados a inserción.
        """
        if df.empty:
            return 0

        columns = list(df.columns)
        cols_str = ", ".join([f"`{col}`" for col in columns])
        placeholders = ", ".join([f":{col}" for col in columns])
        sql = f"INSERT IGNORE INTO `{table_name}` ({cols_str}) VALUES ({placeholders})"

        # Convertir NaN / NaT residuales a None para inserción SQL limpia
        records = df.replace({np.nan: None}).to_dict(orient="records")

        with self.engine.begin() as conn:
            conn.execute(text(sql), records)

        return len(records)

    def load_file(
        self,
        file_path: Path,
        module_name: str,
        tracker: ProgressTracker,
        resume_mode: bool = False
    ) -> Tuple[int, int, int]:
        """
        Carga y procesa un archivo Excel individual dividiéndolo en chunks.
        Actualiza el ProgressTracker y genera métricas en consola.
        """
        filename = file_path.name
        year = extract_year_from_filename(filename) or 0
        part = extract_part_from_filename(filename)

        # Verificar si debe procesarse en modo reanudación
        if not tracker.should_process(module_name, filename, resume_mode=resume_mode):
            print(f"  [SALTADO] '{filename}' ya se encuentra completado en etl_progress.json.")
            status_data = tracker.get_file_status(module_name, filename) or {}
            return (
                status_data.get("total_rows_excel", 0),
                status_data.get("rows_inserted", 0),
                status_data.get("rows_rejected", 0)
            )

        print(f"\n============================================================")
        print(f"[{module_name}] {filename} | Año Detectado: {year} (Parte: {part})")
        print(f"============================================================")

        tracker.register_start(module_name, filename, year, part)
        start_time = time.time()

        schema = self._get_schema(module_name)
        table_name = MODULE_CONFIG[module_name]["table_name"]

        total_rows_excel = 0
        total_inserted = 0
        total_rejected = 0

        try:
            # Lectura del Excel como texto plano para evitar pérdida de ceros a la izquierda en RUCs
            raw_df = pd.read_excel(file_path, dtype=str)
            total_rows_excel = len(raw_df)

            if total_rows_excel == 0:
                print("  [AVISO] El archivo Excel se encuentra vacío.")
                tracker.register_success(module_name, filename, 0, 0, 0)
                return 0, 0, 0

            total_chunks = math.ceil(total_rows_excel / self.chunk_size)

            for chunk_idx in range(total_chunks):
                chunk_start = chunk_idx * self.chunk_size
                chunk_end = min(chunk_start + self.chunk_size, total_rows_excel)
                chunk_df = raw_df.iloc[chunk_start:chunk_end].copy()

                # Limpieza y segregación de rechazados
                valid_df, rejected_df = clean_and_transform(
                    chunk_df,
                    schema,
                    table_name=table_name,
                    filename=filename,
                    rejected_dir=self.rejected_dir
                )

                chunk_rejected_count = len(rejected_df)
                total_rejected += chunk_rejected_count

                # Inserción idempotente de válidos
                chunk_inserted_count = 0
                if not valid_df.empty:
                    chunk_inserted_count = self._insert_chunk_ignore(table_name, valid_df)
                    total_inserted += chunk_inserted_count

                pct = ((chunk_idx + 1) / total_chunks) * 100
                print(
                    f"  -> Lote [{chunk_idx + 1}/{total_chunks}] {pct:5.1f}% | "
                    f"Válidos/Insertados: {chunk_inserted_count:5d} | "
                    f"Rechazados: {chunk_rejected_count:3d}"
                )

            elapsed = time.time() - start_time
            print(
                f"\n  [EXITO] Finalizado '{filename}' en {elapsed:.2f}s | "
                f"Total Excel: {total_rows_excel:,} | "
                f"Insertados: {total_inserted:,} | "
                f"Rechazados: {total_rejected:,}"
            )

            tracker.register_success(
                module_name,
                filename,
                total_rows_excel=total_rows_excel,
                rows_inserted=total_inserted,
                rows_rejected=total_rejected
            )
            return total_rows_excel, total_inserted, total_rejected

        except Exception as e:
            elapsed = time.time() - start_time
            err_msg = str(e)
            logger.exception(f"Error procesando {filename}: {err_msg}")
            print(f"\n  [FALLO] Error al procesar '{filename}': {err_msg}")

            tracker.register_failure(
                module_name,
                filename,
                error_message=err_msg,
                total_rows_excel=total_rows_excel,
                rows_inserted=total_inserted,
                rows_rejected=total_rejected
            )
            raise e
