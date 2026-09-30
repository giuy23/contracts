# Spec Delta

## Purpose
Proporciona una infraestructura robusta y determinista de ingesta de datos para el análisis de contrataciones estatales, garantizando la detección heurística de periodos fiscales, transformación normalizada, segregación de anomalías y persistencia idempotente en MySQL.

## ADDED Requirements

### Requirement: Detección heurística de periodos y particiones de archivos Excel
El sistema SHALL escanear las carpetas fuente de datos de cada módulo (`data/raw/01_convocatorias/`, `data/raw/02_ofertantes/`, `data/raw/03_adjudicaciones/`, `data/raw/04_contratos/`) e inferir automáticamente el año fiscal correspondiente mediante expresiones regulares (`19\d\d|20\d\d`), agrupando las particiones secuenciales de un mismo año sin colisiones.

#### Scenario: Nombre de archivo con sufijo de partición
- **WHEN** se encuentra un archivo denominado `CONOSCE_CONVOCATORIAS2018_0.xlsx` o `CONVOCATORIAS_2019_part1.xlsx`
- **THEN** el sistema extrae el año `2018` o `2019` respectivamente y asigna el orden de procesamiento secuencial

### Requirement: Interfaz de control y selección de ejecución interactiva
El sistema SHALL ofrecer un menú interactivo en consola y admitir parámetros de ejecución para seleccionar: [1] Procesar un año específico, [2] Procesar todos los años disponibles, [3] Reanudar archivos pendientes o fallidos, y [4] Salir.

#### Scenario: Selección de año fiscal específico
- **WHEN** el usuario selecciona la opción 1 e ingresa el año 2018
- **THEN** el pipeline procesa únicamente los datasets pertenecientes al año 2018 en estricto orden relacional

#### Scenario: Modo reanudación de pendientes
- **WHEN** el usuario selecciona la opción 3
- **THEN** el pipeline consulta el estado de auditoría y omite los archivos con estado `COMPLETED`, procesando únicamente `PENDING` o `FAILED`

### Requirement: Auditoría y trazabilidad del pipeline en etl_progress.json
El sistema SHALL registrar y persistir el estado granular de cada archivo procesado en `logs/etl_progress.json`, almacenando métricas de filas leídas, insertadas, rechazadas, marcas de tiempo y mensajes de error ante excepciones.

#### Scenario: Registro de ejecución exitosa
- **WHEN** un archivo concluye su procesamiento sin excepciones críticas
- **THEN** su estado se actualiza a `COMPLETED` con el conteo verificado de filas insertadas y rechazadas

#### Scenario: Manejo y registro de error
- **WHEN** ocurre un fallo operativo durante la carga de un archivo
- **THEN** su estado se actualiza a `FAILED` en `etl_progress.json` registrando la descripción del error

### Requirement: Limpieza, validación de tipos y segregación de rechazados
El sistema SHALL aplicar las reglas declarativas de esquemas JSON, descartando registros que tengan valores nulos o inválidos en campos obligatorios (`nullable: false`) o en llaves primarias (`primary_key`), exportándolos con motivo de descarte a archivos CSV en `data/rejected/`.

#### Scenario: Fila con llave primaria nula
- **WHEN** un registro entrante contiene un código de convocatoria o ítem nulo o vacío
- **THEN** el sistema aísla la fila en `data/rejected/rejected_{tabla}_{archivo}.csv` y continúa la carga de las filas válidas

### Requirement: Persistencia relacional idempotente en MySQL
El sistema SHALL insertar los lotes en la base de datos `contrataciones` en MySQL empleando `INSERT IGNORE` sobre las llaves primarias compuestas y respetando la secuencia estricta: `convocatorias` -> `ofertantes` -> `adjudicaciones` -> `contratos`.

#### Scenario: Inserción de lote con registros duplicados
- **WHEN** se procesa un bloque que contiene claves primarias ya existentes en la base de datos
- **THEN** la base de datos ignora las claves duplicadas sin generar errores ni detener el pipeline

