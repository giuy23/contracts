# Pipeline ETL: Contrataciones Estatales SEACE (Fase 1)

Sistema de ingesta dinámica de datos con detección heurística de años, control de flujo por consola, auditoría en JSON y persistencia relacional idempotente en MySQL.

## Arquitectura y Flujo de Datos

El pipeline procesa los conjuntos de datos en estricto orden de precedencia relacional:
1. `convocatorias` (Tabla padre)
2. `ofertantes` (Tabla hija)
3. `adjudicaciones` (Tabla hija)
4. `contratos` (Tabla hija)

## Configuración del Entorno

1. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```

2. Configurar variables de entorno en `.env`:
   ```ini
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=etl_user
   DB_PASSWORD=etl_password
   DB_NAME=contrataciones
   DB_CHARSET=utf8mb4
   CHUNK_SIZE=3000
   ```

## Modos de Ejecución

### 1. Menú CLI Interactivo
```bash
python main.py
```
Despliega el menú oficial de 4 opciones:
- `[1]` Procesar un año en específico (ej. `2022`).
- `[2]` Procesar todos los años detectados en `data/raw/`.
- `[3]` Modo Reanudar / Completar pendientes (omite archivos en estado `COMPLETED`).
- `[4]` Salir.

### 2. Argumentos de Línea de Comandos
- Procesar un año específico:
  ```bash
  python main.py --year 2022
  ```
- Procesar todos los años:
  ```bash
  python main.py --all
  ```
- Reanudar pendientes:
  ```bash
  python main.py --resume
  ```
- Inicializar tablas DDL:
  ```bash
  python main.py --init-db
  ```

## Pruebas Automatizadas
Para ejecutar la suite de pruebas unitarias y de integración end-to-end:
```bash
python -m pytest -v
```

## OpenSpec y Especificaciones
El proyecto utiliza OpenSpec con integración para Gemini CLI y Antigravity.
- Ver especificaciones activas:
  ```bash
  openspec list --specs
  ```
- Ver especificación del pipeline:
  ```bash
  openspec show etl-pipeline --type spec
  ```

