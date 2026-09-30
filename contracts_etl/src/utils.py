"""
Módulo de utilidades para escaneo de datos, extracción heurística de años y carga de esquemas.
"""

from pathlib import Path
import re
import json
from typing import Optional, Dict, List, Any
import logging

from src.config import RAW_DATA_DIR, SCHEMAS_DIR, MODULE_ORDER

logger = logging.getLogger(__name__)

# Expresión regular para detectar 4 dígitos continuos entre 1900 y 2099
YEAR_REGEX = re.compile(r"(?:19|20)\d{2}")
# Expresión regular para detectar sufijo de partición (_0, _1, _part1, etc.)
PART_REGEX = re.compile(r"[_](\d+)(?:\.[^.]+)?$|part(\d+)", re.IGNORECASE)


def extract_year_from_filename(filename: str) -> Optional[int]:
    """
    Extrae un año fiscal de 4 dígitos (19xx o 20xx) del nombre del archivo.
    Retorna None si no se detecta ningún año válido.
    """
    match = YEAR_REGEX.search(filename)
    if match:
        return int(match.group(0))
    return None


def extract_part_from_filename(filename: str) -> int:
    """
    Extrae el índice numérico de partición (ej. _0 -> 0, _1 -> 1, _part2 -> 2).
    Por defecto retorna 0 si no se detecta partición explícita.
    """
    name_stem = Path(filename).stem
    match = PART_REGEX.search(name_stem)
    if match:
        part_str = match.group(1) or match.group(2)
        if part_str:
            return int(part_str)
    return 0


def scan_raw_data(raw_dir: Optional[Path] = None) -> Dict[str, Dict[int, List[Path]]]:
    """
    Escanea recursivamente los subdirectorios de cada módulo en data/raw/
    y agrupa los archivos Excel (.xlsx, .xls) ordenados por año y número de partición.

    Retorna:
    {
        "01_convocatorias": {
            2018: [Path("...2018_0.xlsx"), Path("...2018_1.xlsx")],
            2019: [Path("...2019_0.xlsx")]
        },
        ...
    }
    """
    base_raw = raw_dir or RAW_DATA_DIR
    result: Dict[str, Dict[int, List[Path]]] = {module: {} for module in MODULE_ORDER}

    for module in MODULE_ORDER:
        module_path = base_raw / module
        if not module_path.exists():
            module_path.mkdir(parents=True, exist_ok=True)
            continue

        # Buscar archivos Excel
        excel_files = [
            f for f in module_path.iterdir()
            if f.is_file() and f.suffix.lower() in [".xlsx", ".xls"] and not f.name.startswith("~$")
        ]

        for file_path in excel_files:
            year = extract_year_from_filename(file_path.name)
            if year is None:
                logger.warning(
                    f"No se pudo inferir el año del archivo '{file_path.name}' en módulo '{module}'. Se omitirá."
                )
                continue

            if year not in result[module]:
                result[module][year] = []
            result[module][year].append(file_path)

        # Ordenar archivos de cada año por partición y luego por nombre
        for year in result[module]:
            result[module][year].sort(
                key=lambda p: (extract_part_from_filename(p.name), p.name)
            )

    return result


def get_available_years(scanned_data: Dict[str, Dict[int, List[Path]]]) -> List[int]:
    """
    Retorna la lista ordenada y sin duplicados de todos los años disponibles en el dataset escaneado.
    """
    years = set()
    for module_dict in scanned_data.values():
        years.update(module_dict.keys())
    return sorted(list(years))


def load_schema(schema_file_name: str, schemas_dir: Optional[Path] = None) -> Dict[str, Any]:
    """
    Lee y valida un esquema declarativo JSON desde el directorio config/schemas/.
    """
    dir_path = schemas_dir or SCHEMAS_DIR
    full_path = dir_path / schema_file_name
    if not full_path.exists():
        raise FileNotFoundError(f"Esquema JSON no encontrado: {full_path}")

    with open(full_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    return schema

