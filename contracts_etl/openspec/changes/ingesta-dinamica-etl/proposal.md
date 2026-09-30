# Proposal: Ingesta Dinámica de Datasets SEACE (Fase 1)

## Why
El Portal de Datos Abiertos del OECE/SEACE publica anualmente datasets de contrataciones públicas (`.xlsx`) divididos en múltiples archivos y particiones. Se requiere un pipeline ETL automatizado, robusto e idempotente que ingeste estos datos a una base de datos relacional MySQL (`contrataciones`), garantice la integridad referencial de 4 tablas maestras (`convocatorias`, `ofertantes`, `adjudicaciones`, `contratos`), gestione la trazabilidad en `etl_progress.json`, y aísle registros inválidos en `data/rejected/`.

## What Changes
- Implementación de un orquestador ETL interactivo CLI en Python con opciones para procesar por año, todos los años o modo reanudación.
- Detección heurística de años fiscales mediante expresiones regulares para archivos Excel con o sin particiones (`_0`, `_1`).
- Control de estado de ejecución por archivo en `logs/etl_progress.json` con estados `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`.
- Motor de limpieza, validación de esquemas declarativos JSON, control estricto de nulos en Primary Keys y segregación de rechazados a CSV.
- Carga masiva por bloques (`chunksize=3000`) e inserción idempotente (`INSERT IGNORE`) en MySQL respetando la jerarquía relacional: Convocatorias -> Ofertantes -> Adjudicaciones -> Contratos.
- Suite de pruebas unitarias y de integración end-to-end con datasets sintéticos.

## Capabilities

### New Capabilities
- `etl-pipeline`: Pipeline de ingesta dinámica, transformación, auditoría y carga relacional a MySQL para datos de contrataciones estatales.

### Modified Capabilities
<!-- None -->

## Impact
- Base de datos MySQL: Creación e inicialización del esquema relacional `contrataciones` con las 4 tablas principales y llaves foráneas.
- Archivos locales: Creación de `src/`, `logs/etl_progress.json`, `data/rejected/`, `main.py`, `requirements.txt`, `.env`.
- Dependencias: `pandas`, `openpyxl`, `sqlalchemy`, `pymysql`, `python-dotenv`, `pytest`.

