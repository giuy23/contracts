# Design: Ingesta Dinámica de Datasets SEACE (Fase 1)

## Context
Véase `proposal.md` y `specs/etl-pipeline/spec.md`.
El sistema opera sobre los esquemas declarativos JSON en `config/schemas/` y archivos DDL en `sql/ddl/`. La base de datos es MySQL (disponible en WSL accesible vía TCP localhost:3306) con la base de datos `contrataciones`.

## Goals / Non-Goals

**Goals:**
- Implementar la arquitectura modular definida en la especificación: `src/config.py`, `src/database.py`, `src/tracker.py`, `src/utils.py`, `src/transformer.py`, `src/loader.py`, `main.py`.
- Soporte para MySQL usando PyMySQL y SQLAlchemy con inserciones masivas idempotentes `INSERT IGNORE`.
- Trazabilidad y recuperación de fallos mediante `logs/etl_progress.json`.
- Aislamiento de registros inconsistentes a CSVs en `data/rejected/`.
- Soporte para ejecución interactiva y mediante parámetros CLI para automatización y testing.

**Non-Goals:**
- Cálculos analíticos de Fase 2 (análisis presupuestal monetario e inflación).
- Descarga automatizada web scraping directa del portal Pentaho SEACE (los archivos se proveen en `data/raw/`).

## Decisions

- **Decision 1: SQLAlchemy + PyMySQL para conexión a MySQL.**
  - *Razón:* Soporte nativo multiplataforma (Windows y Linux/WSL), compatibilidad con inserción masiva y compilación de sentencias `INSERT IGNORE`.
  - *Alternativa considerada:* MySQLConnector (más pesado y con problemas de compatibilidad en ciertos entornos).

- **Decision 2: Control de Progreso granular basado en archivo (`etl_progress.json`).**
  - *Razón:* Permite reanudar exactamente desde los archivos no completados o fallidos sin re-procesar los que ya fueron cargados con éxito.
  - *Alternativa considerada:* Tabla interna de control en la base de datos (descartada para mantener portabilidad e inspección manual directa).

- **Decision 3: Chunking de 3000 registros con pandas y openpyxl.**
  - *Razón:* Optimiza consumo de memoria para archivos Excel de más de 50,000 filas sin causar problemas de memoria RAM.

## Risks / Trade-offs

- **[Riesgo: Formatos variados de fecha en Excel]** → *Mitigación:* Uso de `pd.to_datetime(errors='coerce')` con estandarización estricta a ISO `YYYY-MM-DD` y `YYYY-MM-DD HH:MM:SS`.
- **[Riesgo: Violaciones de Foreign Key si se insertan tablas hijas antes que el padre]** → *Mitigación:* Orden riguroso de orquestación (`convocatorias` → `ofertantes` → `adjudicaciones` → `contratos`).

