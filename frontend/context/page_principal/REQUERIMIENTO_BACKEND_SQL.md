# Ficha Técnica y Requerimientos de Consultas SQL para la IA del Backend
## Cockpit Forense SEACE / OECE (Pantalla Principal)

> **Instrucción para el usuario:**  
> Puedes copiar y pegar todo este bloque en el chat de la IA encargada del Backend (Base de Datos MySQL) para que genere las consultas SQL optimizadas o procedimientos almacenados con los nombres exactos de tablas y columnas.

---

```text
Actúa como Ingeniero de Base de Datos y Especialista en SQL para MySQL (versión 8.0+).

Necesitamos que construyas las consultas SQL exactas y optimizadas para alimentar la PANTALLA PRINCIPAL de un Cockpit Forense de Contrataciones Estatales del Perú (SEACE).

A continuación tienes el esquema relacional de las 4 tablas involucradas en la base de datos 'contrataciones':

1. 'convocatorias':
   - ruc_entidad (VARCHAR 11), nombre_entidad (VARCHAR 255), codigo_convocatoria (VARCHAR 20),
   - tipo_compra (VARCHAR 100), objeto_contractual (VARCHAR 50), tipo_proceso_seleccion (VARCHAR 100),
   - numero_item (INT), descripcion_item (TEXT), estado_item (VARCHAR 50),
   - monto_referencial_item (DECIMAL 16,2), moneda (VARCHAR 10),
   - departamento_item (VARCHAR 100), provincia_item (VARCHAR 100), distrito_item (VARCHAR 100),
   - fecha_convocatoria (DATE).
   - PK: (codigo_convocatoria, numero_item)

2. 'ofertantes':
   - codigo_convocatoria (VARCHAR 20), fecha_convocatoria (DATE), numero_item (INT),
   - ruc_postor (VARCHAR 20), nombre_postor (VARCHAR 255), fecha_presentacion_propuesta (DATETIME).
   - PK: (codigo_convocatoria, numero_item, ruc_postor)
   - FK: (codigo_convocatoria, numero_item) -> convocatorias

3. 'adjudicaciones':
   - codigo_convocatoria (VARCHAR 20), numero_item (INT), ruc_entidad (VARCHAR 11), nombre_entidad (VARCHAR 255),
   - tipo_proceso_seleccion (VARCHAR 100), objeto_contractual (VARCHAR 50), estado_item (VARCHAR 50),
   - monto_adjudicado_item_soles (DECIMAL 16,2), departamento_item (VARCHAR 100), moneda (VARCHAR 10),
   - ruc_proveedor (VARCHAR 20), nombre_proveedor (VARCHAR 255), tipo_proveedor (VARCHAR 50),
   - fecha_convocatoria (DATE), fecha_buena_pro (DATE).
   - PK: (codigo_convocatoria, numero_item, ruc_proveedor)
   - FK: (codigo_convocatoria, numero_item) -> convocatorias

4. 'contratos':
   - codigo_contrato (VARCHAR 50), numero_contrato (VARCHAR 100), codigo_convocatoria (VARCHAR 20), numero_item (INT),
   - monto_contratado_item (DECIMAL 16,2), monto_contratado_total (DECIMAL 16,2),
   - moneda (VARCHAR 10), ruc_contratista (VARCHAR 20), tiene_resolucion (VARCHAR 10), es_publicado (VARCHAR 10),
   - fecha_publicacion_contrato (DATE), fecha_suscripcion_contrato (DATE), fecha_vigencia_inicial (DATE), fecha_vigencia_final (DATE).
   - PK: (codigo_contrato, numero_item)
   - FK: (codigo_convocatoria, numero_item) -> convocatorias

================================================================================
REQUERIMIENTOS ESPECÍFICOS DE CONSULTAS SQL PARA EL FRONTEND
================================================================================

PARÁMETROS GLOBALES DE FILTRADO QUE RECIBE CADA CONSULTA:
- :year (Obligatorio, ej: 2026, 2024).
- :month (Opcional, 1 al 12 o NULL para todo el año).
- :departamento (Opcional, nombre de departamento o NULL).
- :provincia (Opcional, nombre de provincia o NULL).
- :distrito (Opcional, nombre de distrito o NULL).
- :moneda (Opcional, 'SOLES', 'DOLARES' o NULL).
- :tipo_proceso (Opcional, ej: 'Licitación Pública', 'Adjudicación Simplificada' o NULL).
- :estado (Opcional, ej: 'Adjudicado', 'Consentido' o NULL).

--------------------------------------------------------------------------------
BLOQUE 1: CONSULTAS PARA SELECTORES Y FILTROS EN CASCADA
--------------------------------------------------------------------------------

1.1. Lista de Departamentos:
- Necesito: Obtener todos los departamentos únicos registrados en el sistema, ordenados alfabéticamente y descartando valores nulos o vacíos.
- Formato esperado: Array de strings o [{ "departamento": "LIMA" }, ...]

1.2. Lista de Provincias (dependiente de departamento):
- Necesito: Dado un departamento seleccionado (:departamento), obtener todas las provincias únicas que pertenecen a ese departamento.
- Formato esperado: Array de strings o [{ "provincia": "LIMA" }, ...]

1.3. Lista de Distritos (dependiente de departamento y provincia):
- Necesito: Dado un departamento (:departamento) y una provincia (:provincia), obtener todos los distritos únicos correspondientes.
- Formato esperado: Array de strings o [{ "distrito": "MIRAFLORES" }, ...]

1.4. Lista de Tipos de Moneda:
- Necesito: Obtener los tipos de moneda únicos registrados en los contratos (ej: SOLES, DOLARES).

1.5. Lista de Tipos de Proceso de Selección:
- Necesito: Obtener las distintas modalidades de contratación existentes en las convocatorias (Licitación Pública, Concurso Público, Adjudicación Simplificada, Contratación Directa, etc.).

1.6. Lista de Estados de Contratación:
- Necesito: Obtener los distintos estados de los ítems/procesos registrados en el sistema.

--------------------------------------------------------------------------------
BLOQUE 2: CONSULTAS PARA LAS 4 TARJETAS KPI (FILA SUPERIOR)
--------------------------------------------------------------------------------

2.1. KPI 1: Total de Contratos Formalizados
- Requerimiento: "Quiero saber la cantidad total de contratos formalizados y perfeccionados que existen bajo los filtros aplicados para mostrarlos en la card principal KPI-01."
- Regla: Contar combinaciones únicas de (codigo_contrato, numero_item) suscritas en el periodo seleccionado.

2.2. KPI 2: Monto Total Acumulado Contratado (PEN S/)
- Requerimiento: "Quiero saber la suma total de dinero formalizado en moneda nacional (PEN) bajo los filtros aplicados para mostrar el volumen financiero global en la card KPI-02."
- Regla: Sumar 'monto_contratado_item' de los contratos válidos en el año/filtros seleccionados.

2.3. KPI 3: Contratistas Activos Únicos
- Requerimiento: "Quiero saber la cantidad de contratistas y proveedores únicos (RUCs distintos) que han suscrito al menos un contrato bajo los filtros aplicados para medir la pluralidad del mercado en la card KPI-03."
- Regla: Contar valores distintos de 'ruc_contratista' en la tabla contratos.

2.4. KPI 4: Tasa de Postor Único / Banderas Rojas (%)
- Requerimiento: "Quiero saber el porcentaje de procesos/adjudicaciones que tuvieron exactamente 1 solo postor en puja (sin competencia) frente al total de procesos convocados, para alertar sobre riesgo de direccionamiento o colusión en la card KPI-04."
- Regla:
  * Contar items convocados que tengan exactamente 1 'ruc_postor' en la tabla 'ofertantes'.
  * Calcular el porcentaje sobre el total de items evaluados: (items_con_1_postor * 100.0 / total_items).
- Payload JSON esperado para el bloque KPI:
  {
    "total_contratos": 98420,
    "monto_total_soles": 48920500000.00,
    "contratistas_activos": 34180,
    "tasa_postor_unico_pct": 38.25
  }

--------------------------------------------------------------------------------
BLOQUE 3: CONSULTAS PARA LAS 3 GRÁFICAS SELECCIONADAS
--------------------------------------------------------------------------------

3.1. Gráfica 1A: Ranking Top 10 Contratistas por Cantidad de Contratos
- Requerimiento: "Quiero saber cuáles son los 10 contratistas o consorcios que más contratos han ganado en el periodo, mostrando su RUC, Razón Social, si es Consorcio o Individual, el número de contratos y su monto acumulado."
- Estructura JSON esperada:
  [
    {
      "ruc": "20519384729",
      "proveedor": "DISTRIBUIDORA FARMA PERÚ S.A.C.",
      "tipo_proveedor": "INDIVIDUAL",
      "total_contratos": 84,
      "monto_total_soles": 154200000.00
    },
    ...
  ]

3.2. Gráfica 1B: Ranking Top 10 Contratistas por Monto Acumulado Adjudicado
- Requerimiento: "Quiero saber cuáles son los 10 contratistas o consorcios que concentran mayor cantidad de dinero público en Soles, mostrando su RUC, Razón Social, si es Consorcio o Individual, el monto total en Soles y cuántos contratos suscribieron."
- Estructura JSON esperada:
  [
    {
      "ruc": "20601849182",
      "proveedor": "CONSORCIO VIAL DEL SUR",
      "tipo_proveedor": "CONSORCIO",
      "monto_total_soles": 482400000.00,
      "total_contratos": 17
    },
    ...
  ]

3.3. Gráfica 2: Distribución por Tipo de Proceso de Selección (Nivel de Competencia)
- Requerimiento: "Quiero conocer la distribución del gasto según la modalidad o tipo de proceso de selección (Licitación Pública, Concurso Público, Adjudicación Simplificada, Contratación Directa, etc.), obteniendo la cantidad de contratos, monto total y porcentaje de participación de cada tipo."
- Estructura JSON esperada:
  [
    {
      "tipo_proceso": "Licitación Pública",
      "total_contratos": 14200,
      "monto_total_soles": 22100000000.00,
      "porcentaje": 45.2
    },
    {
      "tipo_proceso": "Adjudicación Simplificada",
      "total_contratos": 42100,
      "monto_total_soles": 15400000000.00,
      "porcentaje": 31.5
    },
    {
      "tipo_proceso": "Contratación Directa",
      "total_contratos": 8900,
      "monto_total_soles": 8500000000.00,
      "porcentaje": 17.4
    },
    {
      "tipo_proceso": "Concurso Público",
      "total_contratos": 3400,
      "monto_total_soles": 2920000000.00,
      "porcentaje": 5.9
    }
  ]

3.4. Gráfica 3: Top 10 Entidades Convocantes con Mayor Presupuesto Asignado
- Requerimiento: "Quiero saber cuáles son las 10 entidades públicas (ministerios, gobiernos regionales, municipalidades, organismos públicos) que formalizaron la mayor cantidad de dinero en contratos, indicando su RUC de entidad, nombre de la entidad, cantidad de contratos y monto total formalizado en Soles."
- Estructura JSON esperada:
  [
    {
      "ruc_entidad": "20504794637",
      "nombre_entidad": "PROVIAS NACIONAL",
      "total_contratos": 320,
      "monto_total_soles": 4850000000.00
    },
    {
      "ruc_entidad": "20131257750",
      "nombre_entidad": "SEGURO SOCIAL DE SALUD - ESSALUD",
      "total_contratos": 1450,
      "monto_total_soles": 3120000000.00
    },
    ...
  ]

Entrega las consultas SQL formateadas con sus cláusulas WHERE correspondientes y parámetros preparados (?).
```
