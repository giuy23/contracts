"""
Pruebas unitarias para src/transformer.py.
"""

import pytest
import pandas as pd
from pathlib import Path
from src.transformer import clean_and_transform
from src.utils import load_schema


def test_clean_and_transform_success(tmp_path: Path):
    schema = load_schema("schema_convocatorias.json")

    # Crear dataset simulado con 1 fila válida y 1 fila con PK nula
    raw_data = {
        "entidad_ruc": ["20131312955", "20131312955"],
        "entidad": ["MINISTERIO DE SALUD", "MINISTERIO DE SALUD"],
        "codigoconvocatoria": ["CONV-001", None],  # Segunda fila tiene PK nula
        "n_item": [1, 2],
        "montoreferencial": ["S/. 1,500.50", "3000"],
        "fecha_convocatoria": ["2022-05-10", "2022-05-11"]
    }
    raw_df = pd.DataFrame(raw_data)

    valid_df, rejected_df = clean_and_transform(
        df=raw_df,
        schema_config=schema,
        table_name="convocatorias",
        filename="test_file.xlsx",
        rejected_dir=tmp_path
    )

    assert len(valid_df) == 1
    assert len(rejected_df) == 1

    # Verificar limpieza de la fila válida
    valid_row = valid_df.iloc[0]
    assert valid_row["codigo_convocatoria"] == "CONV-001"
    assert valid_row["num_item"] == 1
    assert valid_row["ruc_entidad"] == "20131312955"
    assert valid_row["monto_referencial_proceso"] == 1500.50

    # Verificar que la fila rechazada contiene motivo y archivo exportado
    assert "motivo_rechazo" in rejected_df.columns
    assert "PK_NULA" in rejected_df.iloc[0]["motivo_rechazo"]

    # Verificar que el CSV se haya creado en tmp_path
    csv_files = list(tmp_path.glob("rejected_convocatorias_*.csv"))
    assert len(csv_files) == 1


def test_nullable_false_rejection(tmp_path: Path):
    schema = load_schema("schema_convocatorias.json")

    # Fila donde ruc_entidad es nulo (campo obligatorio nullable: false)
    raw_data = {
        "entidad_ruc": [None],
        "entidad": ["MINISTERIO DE EDUCACION"],
        "codigoconvocatoria": ["CONV-002"],
        "n_item": [1]
    }
    raw_df = pd.DataFrame(raw_data)

    valid_df, rejected_df = clean_and_transform(
        df=raw_df,
        schema_config=schema,
        table_name="convocatorias",
        filename="test_nullable.xlsx",
        rejected_dir=tmp_path
    )

    assert len(valid_df) == 0
    assert len(rejected_df) == 1
    assert "REQUERIDO_NULO" in rejected_df.iloc[0]["motivo_rechazo"]

