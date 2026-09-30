# Tasks

## 1. Configuración del Entorno y Dependencias

- [x] 1.1 Configurar `requirements.txt` con pandas, openpyxl, sqlalchemy, pymysql, python-dotenv, pytest y verificar instalación en el entorno.
- [x] 1.2 Configurar `.env` y `.env.example` con la cadena de conexión a MySQL para la base de datos `contrataciones` y validar conectividad.

## 2. Inicialización de Esquema en Base de Datos

- [x] 2.1 Ejecutar los scripts DDL en orden de precedencia relacional en MySQL (`convocatorias`, `ofertantes`, `adjudicaciones`, `contratos`) y verificar la creación exitosa de las tablas.

## 3. Implementación de Módulos del Pipeline ETL

- [x] 3.1 Implementar `src/config.py` y `src/database.py` para gestión de configuraciones y conexión con SQLAlchemy/PyMySQL.
- [x] 3.2 Implementar `src/utils.py` con regex de 4 dígitos para años y escaneo heurístico de directorios en `data/raw/`.
- [x] 3.3 Implementar `src/tracker.py` para gestión y persistencia de auditoría en `logs/etl_progress.json`.
- [x] 3.4 Implementar `src/transformer.py` con mapeo de esquemas JSON, normalización de datos y aislamiento de rechazados a CSV.
- [x] 3.5 Implementar `src/loader.py` con carga por bloques (`chunksize=3000`) e inserción idempotente con `INSERT IGNORE` en MySQL.

## 4. Orquestador y Menú CLI

- [x] 4.1 Implementar `main.py` con menú interactivo de opciones [1-4] y soporte para argumentos por línea de comandos para automatización.

## 5. Pruebas Automatizadas y Verificación

- [x] 5.1 Implementar pruebas unitarias en `tests/` para `utils.py`, `tracker.py` y `transformer.py` y verificar con `pytest`.
- [x] 5.2 Implementar pruebas de integración end-to-end con datasets sintéticos en Excel cargados en MySQL y verificar que todos los tests pasen sin fallos.

