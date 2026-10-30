"""
Módulo de transformación y validación de datos para el pipeline ETL SEACE.
Aplica esquemas JSON declarativos, normaliza tipos y segrega registros rechazados.
"""

from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List
from datetime import datetime
import re
import logging
import pandas as pd
import numpy as np

from src.config import REJECTED_DATA_DIR

logger = logging.getLogger(__name__)

# Valores reconocidos como nulos en strings
NULL_STRING_VALUES = {"none", "null", "nan", "nat", "-", "", "undefined"}
CURRENCY_CLEAN_REGEX = re.compile(r"[sS]/\.?|\$|[€]|[,\s]")


def _normalize_string(val: Any) -> Optional[str]:
    """
    Normaliza una cadena de texto eliminando espacios sobrantes
    y convirtiendo variantes de null/nan/vacío en None.
    """
    if val is None or pd.isna(val):
        return None
    s = str(val).strip()
    if s.lower() in NULL_STRING_VALUES:
        return None
    return s


def _normalize_doc_code(val: Any) -> Optional[str]:
    """
    Normaliza códigos de documento (RUC o código de consorcio),
    eliminando '.0' de lecturas flotantes de Excel y espacios.
    """
    s = _normalize_string(val)
    if s is None:
        return None
    if s.endswith(".0"):
        s = s[:-2]
    return s.strip()


def _normalize_int(val: Any) -> Optional[int]:
    """
    Convierte un valor a entero manejando strings con decimales o comas.
    """
    if val is None or pd.isna(val):
        return None
    try:
        s = str(val).strip().replace(",", "")
        if s.lower() in NULL_STRING_VALUES:
            return None
        return int(float(s))
    except (ValueError, TypeError):
        return None


def _normalize_float(val: Any) -> Optional[float]:
    """
    Limpia símbolos monetarios, comas y espacios antes de convertir a float.
    """
    if val is None or pd.isna(val):
        return None
    try:
        s = str(val).strip()
        if s.lower() in NULL_STRING_VALUES:
            return None
        # Remover prefijos de moneda como S/. o $
        s_clean = re.sub(r"^[sS]/\.?|\$", "", s).strip()
        # Remover comas de miles
        s_clean = s_clean.replace(",", "")
        return round(float(s_clean), 2)
    except (ValueError, TypeError):
        return None


def _normalize_date(val: Any) -> Optional[str]:
    """
    Parsea una fecha a formato ISO YYYY-MM-DD.
    """
    if val is None or pd.isna(val):
        return None
    try:
        dt = pd.to_datetime(val, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return None


def _normalize_datetime(val: Any) -> Optional[str]:
    """
    Parsea una marca temporal a formato ISO YYYY-MM-DD HH:MM:SS.
    """
    if val is None or pd.isna(val):
        return None
    try:
        dt = pd.to_datetime(val, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def clean_and_transform(
    df: pd.DataFrame,
    schema_config: Dict[str, Any],
    table_name: str,
    filename: str,
    rejected_dir: Optional[Path] = None
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Transforma un DataFrame crudo según las especificaciones del esquema declarativo JSON.
    Separa las filas válidas de las rechazadas por violación de llaves primarias o campos NOT NULL.
    """
    out_rejected_dir = rejected_dir or REJECTED_DATA_DIR
    out_rejected_dir.mkdir(parents=True, exist_ok=True)

    columns_config = schema_config.get("columns", [])
    primary_key_cols = schema_config.get("primary_key", [])

    # Mapeo insensible a mayúsculas de columnas del Excel
    excel_cols_map = {str(col).strip().lower(): col for col in df.columns}

    transformed_data: Dict[str, List[Any]] = {}

    for col_def in columns_config:
        excel_col_name = col_def["excel_column"]
        aliases = col_def.get("excel_aliases", [excel_col_name])
        sql_col_name = col_def["sql_column"]
        python_type = col_def.get("python_type", "str")

        # Buscar coincidencia en el Excel por columna principal o alias
        matched_key = excel_cols_map.get(excel_col_name.lower())
        if matched_key is None:
            for alias in aliases:
                if alias.lower() in excel_cols_map:
                    matched_key = excel_cols_map[alias.lower()]
                    break

        if matched_key is not None:
            raw_series = df[matched_key]
        else:
            # Si no existe en el Excel, se inicializa como serie de None
            raw_series = pd.Series([None] * len(df))

        # Aplicar transformación de tipo
        if python_type == "int":
            transformed_data[sql_col_name] = [_normalize_int(v) for v in raw_series]
        elif python_type == "float":
            transformed_data[sql_col_name] = [_normalize_float(v) for v in raw_series]
        elif python_type == "date":
            transformed_data[sql_col_name] = [_normalize_date(v) for v in raw_series]
        elif python_type == "datetime":
            transformed_data[sql_col_name] = [_normalize_datetime(v) for v in raw_series]
        elif sql_col_name.startswith("ruc_") or sql_col_name.startswith("codigo_"):
            transformed_data[sql_col_name] = [_normalize_doc_code(v) for v in raw_series]
        else:  # str por defecto
            transformed_data[sql_col_name] = [_normalize_string(v) for v in raw_series]

    trans_df = pd.DataFrame(transformed_data)

    # Identificar columnas que no pueden ser nulas
    not_nullable_cols = [
        c["sql_column"] for c in columns_config if not c.get("nullable", True)
    ]

    rejection_reasons: List[Optional[str]] = []
    is_valid_list: List[bool] = []

    for idx, row in trans_df.iterrows():
        reasons = []

        # 1. Validar Primary Keys
        missing_pk = [
            pk for pk in primary_key_cols
            if row.get(pk) is None or pd.isna(row.get(pk))
        ]
        if missing_pk:
            reasons.append(f"PK_NULA: [{', '.join(missing_pk)}]")

        # 2. Validar campos NOT NULL
        missing_required = [
            col for col in not_nullable_cols
            if col not in missing_pk and (row.get(col) is None or pd.isna(row.get(col)))
        ]
        if missing_required:
            reasons.append(f"REQUERIDO_NULO: [{', '.join(missing_required)}]")

        if reasons:
            is_valid_list.append(False)
            rejection_reasons.append("; ".join(reasons))
        else:
            is_valid_list.append(True)
            rejection_reasons.append(None)

    valid_mask = pd.Series(is_valid_list, index=trans_df.index)
    valid_df = trans_df[valid_mask].copy()

    rejected_df = trans_df[~valid_mask].copy()
    if not rejected_df.empty:
        rejected_df["motivo_rechazo"] = [
            r for r, v in zip(rejection_reasons, is_valid_list) if not v
        ]
        rejected_df["archivo_origen"] = filename
        rejected_df["fecha_rechazo"] = datetime.now().isoformat()

        # Guardar en data/rejected/
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        stem_name = Path(filename).stem
        rejected_file_path = out_rejected_dir / f"rejected_{table_name}_{stem_name}_{timestamp_str}.csv"
        rejected_df.to_csv(rejected_file_path, index=False, encoding="utf-8-sig")
        logger.info(
            f"Se exportaron {len(rejected_df)} filas rechazadas a: {rejected_file_path.name}"
        )

    return valid_df, rejected_df

