"""
Pruebas unitarias para src/utils.py.
"""

import pytest
from pathlib import Path
from src.utils import extract_year_from_filename, extract_part_from_filename, load_schema


def test_extract_year_from_filename():
    assert extract_year_from_filename("CONOSCE_CONVOCATORIAS2018_0.xlsx") == 2018
    assert extract_year_from_filename("CONVOCATORIAS_2019_part1.xlsx") == 2019
    assert extract_year_from_filename("CONOSCE_POSTOR2022_0.xlsx") == 2022
    assert extract_year_from_filename("ADJUDICACIONES_2025.xlsx") == 2025
    assert extract_year_from_filename("dataset_sin_fecha.xlsx") is None


def test_extract_part_from_filename():
    assert extract_part_from_filename("CONOSCE_CONVOCATORIAS2018_0.xlsx") == 0
    assert extract_part_from_filename("CONOSCE_CONVOCATORIAS2018_1.xlsx") == 1
    assert extract_part_from_filename("CONVOCATORIAS_2019_part2.xlsx") == 2
    assert extract_part_from_filename("CONOSCE_CONTRATOS2022.xlsx") == 0


def test_load_schema():
    schema = load_schema("schema_convocatorias.json")
    assert schema["table_name"] == "convocatorias"
    assert "primary_key" in schema
    assert "codigo_convocatoria" in schema["primary_key"]
    assert len(schema["columns"]) > 20

