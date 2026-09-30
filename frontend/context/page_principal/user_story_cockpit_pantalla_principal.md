# User Story: Cockpit Forense SEACE / OECE - Pantalla Principal de Contrataciones Estatales

| Metadato | Detalle |
| :--- | :--- |
| **ID de Historia** | `US-CONTRATACIONES-001` |
| **Épica** | Plataforma Forense y Analítica de Contrataciones Públicas del Perú |
| **Módulo** | Dashboard Ejecutivo y Cockpit Forense (Pantalla Principal) |
| **Fase** | Fase 1 - Concurrencia, Competencia y Métricas de Cabecera |
| **Prioridad** | Alta (P1) |
| **Versión MySQL** | MySQL 8.0+ (Soporte nativo de CTEs y Window Functions) |
| **Stack Backend / Frontend** | Node.js (`mysql2/promise`) / Next.js - React (ECharts / Recharts / Shadcn UI) |
| **Estado** | Listo para Implementación (Ready for Dev) |
| **Estado de Índices** | **100% Ejecutados y Activos en la BD** (No requiere correr DDLs) |

---

## 1. Narrativa Ágil (User Story Narrative)

> **COMO** Analista de Datos Forenses, Auditor de Contrataciones Estatales y Desarrollador Frontend,  
> **QUIERO** disponer de una pantalla principal tipo Cockpit con filtros temporales y geográficos en cascada, 4 tarjetas KPI consolidadas y 3 gráficas interactivas de concentración, modalidades y entidades,  
> **PARA** monitorear el gasto público en tiempo real, auditar la concentración de mercado e identificar banderas rojas de falta de competencia (postor único) en las compras del Estado peruano.

---

## 2. Criterios de Aceptación (Acceptance Criteria - Gherkin)

### Escenario 1: Filtros Globales y Carga en Cascada
* **DADO QUE** el usuario ingresa a la pantalla principal del Cockpit,
* **CUANDO** interactúa con la barra superior de filtros,
* **ENTONCES** el selector de **Año** (`:year`) es obligatorio (ej. 2024),
* **Y** al seleccionar un **Departamento**, el selector de **Provincia** debe desbloquearse y listar únicamente las provincias pertenecientes a dicho departamento,
* **Y** al seleccionar una **Provincia**, el selector de **Distrito** debe desbloquearse y listar únicamente sus distritos correspondientes,
* **Y** los filtros opcionales de **Moneda**, **Tipo de Proceso** y **Estado de Ítem** deben consultar sus valores únicos descartando nulos o textos vacíos.

### Escenario 2: Cálculo Consolidado de Tarjetas KPI (1 Round-Trip)
* **DADO QUE** se aplican los filtros de búsqueda,
* **CUANDO** el frontend solicita las métricas de cabecera (`GET /api/v1/cockpit/kpis`),
* **ENTONCES** el backend debe resolver en una sola consulta SQL optimizada:
  1. `KPI-01 Total Contratos`: Conteo único de contratos formalizados `(codigo_contrato, numero_item)`.
  2. `KPI-02 Monto Total Soles`: Suma de importes suscritos (`monto_contratado_item`) en PEN.
  3. `KPI-03 Contratistas Activos`: Recuento único de proveedores (`id_contratista`) con al menos un contrato.
  4. `KPI-04 Tasa de Postor Único (%)`: Porcentaje de ítems convocados que registraron exactamente 1 postor en la tabla `ofertantes`.

### Escenario 3: Rankings Top 10 Contratistas (Gráfica 1A y 1B)
* **DADO QUE** el usuario visualiza el panel de contratistas líderes,
* **CUANDO** alterna entre la vista por **Cantidad de Contratos** o por **Monto Acumulado (S/)**,
* **ENTONCES** el backend debe resolver el RUC, la Razón Social y clasificar al actor como `CONSORCIO` o `INDIVIDUAL` directamente desde la relación con `organizaciones`,
* **Y** retornar los 10 primeros registros ordenados en orden descendente.

### Escenario 4: Distribución por Modalidad de Contratación (Gráfica 2)
* **DADO QUE** el analista evalúa la transparencia del procedimiento,
* **CUANDO** se genera la gráfica de distribución por modalidad,
* **ENTONCES** la consulta debe agrupar por `tipo_proceso_seleccion`, calcular el total de contratos, el monto acumulado y la participación porcentual (`%`) sobre el gasto total mediante funciones de ventana analíticas (`SUM(...) OVER()`).

### Escenario 5: Top 10 Entidades Compradoras (Gráfica 3)
* **DADO QUE** se analiza la demanda estatal,
* **CUANDO** se carga la gráfica de entidades,
* **ENTONCES** se deben listar las 10 entidades públicas (`ruc_entidad`, `nombre_entidad`) con mayor monto formalizado en contratos en el periodo seleccionado.

### Escenario 6: Rendimiento y Tiempos de Respuesta
* **DADO QUE** las tablas superan los cientos de miles de registros,
* **CUANDO** se ejecuta el panel completo mediante `Promise.all`,
* **ENTONCES** el tiempo total de respuesta de la base de datos debe ser inferior a **300 ms** gracias a los índices ya compilados y activos.

---

## 3. Estado de la Infraestructura de Base de Datos

> [!NOTE]
> **ÍNDICES YA EJECUTADOS Y ACTIVOS:**  
> Todos los índices de alta velocidad requeridos para optimizar los filtros, agrupaciones y uniones ya han sido ejecutados directamente en la base de datos MySQL por el Administrador de Base de Datos:
> - `idx_contratos_fecha_sub` en `contratos(fecha_suscripcion_contrato)`
> - `idx_contratos_contratista_monto` en `contratos(id_contratista, monto_contratado_item)`
> - `idx_procesos_fecha_conv` en `procesos(fecha_convocatoria)`
> - `idx_procesos_tipo_proceso` en `procesos(tipo_proceso_seleccion)`
> - `idx_items_estado` en `convocatoria_items(estado_item)`
> - `idx_org_tipo_proveedor` en `organizaciones(tipo_proveedor)`
> - Vista de compatibilidad analítica `convocatorias` compilada y en servicio.

---

## 4. Especificación de Consultas SQL de Producción

### 4.1. Consultas para Selectores en Cascada (Filtros Frontend)

#### 1.1. Lista de Departamentos
```sql
SELECT DISTINCT TRIM(departamento) AS departamento
FROM ubigeo
WHERE departamento IS NOT NULL AND TRIM(departamento) != ''
ORDER BY departamento ASC;
```

#### 1.2. Lista de Provincias (Dependiente de Departamento)
```sql
SELECT DISTINCT TRIM(provincia) AS provincia
FROM ubigeo
WHERE departamento = ?
  AND provincia IS NOT NULL AND TRIM(provincia) != ''
ORDER BY provincia ASC;
```

#### 1.3. Lista de Distritos (Dependiente de Departamento y Provincia)
```sql
SELECT DISTINCT TRIM(distrito) AS distrito
FROM ubigeo
WHERE departamento = ?
  AND provincia = ?
  AND distrito IS NOT NULL AND TRIM(distrito) != ''
ORDER BY distrito ASC;
```

#### 1.4. Lista de Monedas
```sql
SELECT DISTINCT TRIM(COALESCE(codigo_iso, nombre_moneda)) AS moneda
FROM monedas
WHERE nombre_moneda IS NOT NULL
ORDER BY moneda ASC;
```

#### 1.5. Lista de Tipos de Proceso de Selección
```sql
SELECT DISTINCT TRIM(tipo_proceso_seleccion) AS tipo_proceso
FROM procesos
WHERE tipo_proceso_seleccion IS NOT NULL AND TRIM(tipo_proceso_seleccion) != ''
ORDER BY tipo_proceso ASC;
```

#### 1.6. Lista de Estados de Contratación
```sql
SELECT DISTINCT TRIM(estado_item) AS estado
FROM convocatoria_items
WHERE estado_item IS NOT NULL AND TRIM(estado_item) != ''
ORDER BY estado ASC;
```

---

### 4.2. Consulta Unificada para las 4 Tarjetas KPI (Fila Superior)

> **Técnica:** Emplea *Common Table Expressions* (CTEs) y `CROSS JOIN` para consolidar en una sola consulta las métricas de contratos y las métricas de concurrencia de ofertantes en **1 solo round-trip**.

```sql
WITH contratos_filtrados AS (
    SELECT 
        c.codigo_contrato,
        c.numero_item,
        c.monto_contratado_item,
        c.id_contratista
    FROM contratos c
    INNER JOIN convocatorias conv 
        ON c.codigo_convocatoria = conv.codigo_convocatoria 
       AND c.numero_item = conv.numero_item
    WHERE YEAR(c.fecha_suscripcion_contrato) = ?
      AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
      AND (? IS NULL OR conv.departamento_item = ?)
      AND (? IS NULL OR conv.provincia_item = ?)
      AND (? IS NULL OR conv.distrito_item = ?)
      AND (? IS NULL OR conv.moneda = ?)
      AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
      AND (? IS NULL OR conv.estado_item = ?)
),
metricas_contratos AS (
    SELECT 
        COUNT(DISTINCT codigo_contrato, numero_item) AS total_contratos,
        COALESCE(SUM(monto_contratado_item), 0.00) AS monto_total_soles,
        COUNT(DISTINCT id_contratista) AS contratistas_activos
    FROM contratos_filtrados
),
items_convocados AS (
    SELECT 
        conv.codigo_convocatoria,
        conv.numero_item
    FROM convocatorias conv
    WHERE YEAR(conv.fecha_convocatoria) = ?
      AND (? IS NULL OR MONTH(conv.fecha_convocatoria) = ?)
      AND (? IS NULL OR conv.departamento_item = ?)
      AND (? IS NULL OR conv.provincia_item = ?)
      AND (? IS NULL OR conv.distrito_item = ?)
      AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
      AND (? IS NULL OR conv.estado_item = ?)
),
concurrencia_items AS (
    SELECT 
        ic.codigo_convocatoria,
        ic.numero_item,
        COUNT(DISTINCT o.id_postor) AS cantidad_postores
    FROM items_convocados ic
    LEFT JOIN ofertantes o 
        ON ic.codigo_convocatoria = o.codigo_convocatoria 
       AND ic.numero_item = o.numero_item
    GROUP BY ic.codigo_convocatoria, ic.numero_item
),
metricas_postor_unico AS (
    SELECT 
        COUNT(*) AS total_items_evaluados,
        SUM(CASE WHEN cantidad_postores = 1 THEN 1 ELSE 0 END) AS items_con_1_postor,
        ROUND(
            COALESCE(
                (SUM(CASE WHEN cantidad_postores = 1 THEN 1 ELSE 0 END) * 100.0) / 
                NULLIF(COUNT(*), 0), 
                0.00
            ), 
            2
        ) AS tasa_postor_unico_pct
    FROM concurrencia_items
)
SELECT 
    mc.total_contratos,
    mc.monto_total_soles,
    mc.contratistas_activos,
    mpu.tasa_postor_unico_pct
FROM metricas_contratos mc
CROSS JOIN metricas_postor_unico mpu;
```

---

### 4.3. Gráfica 1A: Ranking Top 10 Contratistas por Cantidad de Contratos
```sql
SELECT 
    org.numero_documento AS ruc,
    org.razon_social AS proveedor,
    COALESCE(
        CASE 
            WHEN org.tipo_proveedor LIKE '%CONSORCIO%' 
              OR org.razon_social LIKE '%CONSORCIO%' THEN 'CONSORCIO'
            ELSE 'INDIVIDUAL'
        END, 
        'INDIVIDUAL'
    ) AS tipo_proveedor,
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
    COALESCE(SUM(c.monto_contratado_item), 0.00) AS monto_total_soles
FROM contratos c
INNER JOIN organizaciones org 
    ON c.id_contratista = org.id_organizacion
INNER JOIN convocatorias conv 
    ON c.codigo_convocatoria = conv.codigo_convocatoria 
   AND c.numero_item = conv.numero_item
WHERE YEAR(c.fecha_suscripcion_contrato) = ?
  AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
  AND (? IS NULL OR conv.departamento_item = ?)
  AND (? IS NULL OR conv.provincia_item = ?)
  AND (? IS NULL OR conv.distrito_item = ?)
  AND (? IS NULL OR conv.moneda = ?)
  AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
  AND (? IS NULL OR conv.estado_item = ?)
GROUP BY org.id_organizacion, org.numero_documento, org.razon_social, org.tipo_proveedor
ORDER BY total_contratos DESC, monto_total_soles DESC
LIMIT 10;
```

---

### 4.4. Gráfica 1B: Ranking Top 10 Contratistas por Monto Acumulado (PEN S/)
```sql
SELECT 
    org.numero_documento AS ruc,
    org.razon_social AS proveedor,
    COALESCE(
        CASE 
            WHEN org.tipo_proveedor LIKE '%CONSORCIO%' 
              OR org.razon_social LIKE '%CONSORCIO%' THEN 'CONSORCIO'
            ELSE 'INDIVIDUAL'
        END, 
        'INDIVIDUAL'
    ) AS tipo_proveedor,
    COALESCE(SUM(c.monto_contratado_item), 0.00) AS monto_total_soles,
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos
FROM contratos c
INNER JOIN organizaciones org 
    ON c.id_contratista = org.id_organizacion
INNER JOIN convocatorias conv 
    ON c.codigo_convocatoria = conv.codigo_convocatoria 
   AND c.numero_item = conv.numero_item
WHERE YEAR(c.fecha_suscripcion_contrato) = ?
  AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
  AND (? IS NULL OR conv.departamento_item = ?)
  AND (? IS NULL OR conv.provincia_item = ?)
  AND (? IS NULL OR conv.distrito_item = ?)
  AND (? IS NULL OR conv.moneda = ?)
  AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
  AND (? IS NULL OR conv.estado_item = ?)
GROUP BY org.id_organizacion, org.numero_documento, org.razon_social, org.tipo_proveedor
ORDER BY monto_total_soles DESC, total_contratos DESC
LIMIT 10;
```

---

### 4.5. Gráfica 2: Distribución por Tipo de Proceso de Selección
```sql
WITH totales_por_proceso AS (
    SELECT 
        COALESCE(TRIM(conv.tipo_proceso_seleccion), 'NO ESPECIFICADO') AS tipo_proceso,
        COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
        COALESCE(SUM(c.monto_contratado_item), 0.00) AS monto_total_soles
    FROM contratos c
    INNER JOIN convocatorias conv 
        ON c.codigo_convocatoria = conv.codigo_convocatoria 
       AND c.numero_item = conv.numero_item
    WHERE YEAR(c.fecha_suscripcion_contrato) = ?
      AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
      AND (? IS NULL OR conv.departamento_item = ?)
      AND (? IS NULL OR conv.provincia_item = ?)
      AND (? IS NULL OR conv.distrito_item = ?)
      AND (? IS NULL OR conv.moneda = ?)
      AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
      AND (? IS NULL OR conv.estado_item = ?)
    GROUP BY conv.tipo_proceso_seleccion
)
SELECT 
    tipo_proceso,
    total_contratos,
    monto_total_soles,
    ROUND(
        (monto_total_soles * 100.0) / NULLIF(SUM(monto_total_soles) OVER(), 0), 
        2
    ) AS porcentaje
FROM totales_por_proceso
ORDER BY monto_total_soles DESC;
```

---

### 4.6. Gráfica 3: Top 10 Entidades Convocantes con Mayor Presupuesto Asignado
```sql
SELECT 
    conv.ruc_entidad,
    COALESCE(MAX(conv.nombre_entidad), conv.ruc_entidad) AS nombre_entidad,
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
    COALESCE(SUM(c.monto_contratado_item), 0.00) AS monto_total_soles
FROM contratos c
INNER JOIN convocatorias conv 
    ON c.codigo_convocatoria = conv.codigo_convocatoria 
   AND c.numero_item = conv.numero_item
WHERE YEAR(c.fecha_suscripcion_contrato) = ?
  AND (? IS NULL OR MONTH(c.fecha_suscripcion_contrato) = ?)
  AND (? IS NULL OR conv.departamento_item = ?)
  AND (? IS NULL OR conv.provincia_item = ?)
  AND (? IS NULL OR conv.distrito_item = ?)
  AND (? IS NULL OR conv.moneda = ?)
  AND (? IS NULL OR conv.tipo_proceso_seleccion = ?)
  AND (? IS NULL OR conv.estado_item = ?)
GROUP BY conv.ruc_entidad
ORDER BY monto_total_soles DESC, total_contratos DESC
LIMIT 10;
```

---

## 5. Estructura de Payloads JSON (Contratos Frontend-Backend)

### 5.1. Endpoint de KPIs: `GET /api/v1/cockpit/kpis`
```json
{
  "total_contratos": 6006,
  "monto_total_soles": 12555952167.81,
  "contratistas_activos": 4607,
  "tasa_postor_unico_pct": 39.08
}
```

### 5.2. Endpoint de Top Contratistas: `GET /api/v1/cockpit/top-contratistas?criterio=cantidad`
```json
[
  {
    "ruc": "20100041953",
    "proveedor": "RIMAC SEGUROS Y REASEGUROS",
    "tipo_proveedor": "INDIVIDUAL",
    "total_contratos": 31,
    "monto_total_soles": 28338714.08
  },
  {
    "ruc": "20100017491",
    "proveedor": "TELEFONICA DEL PERU SAA",
    "tipo_proveedor": "INDIVIDUAL",
    "total_contratos": 20,
    "monto_total_soles": 28361819.29
  }
]
```

### 5.3. Endpoint de Distribución por Proceso: `GET /api/v1/cockpit/distribucion-procesos`
```json
[
  {
    "tipo_proceso": "Licitación Pública",
    "total_contratos": 615,
    "monto_total_soles": 4829929411.47,
    "porcentaje": 38.47
  },
  {
    "tipo_proceso": "Adjudicación Simplificada",
    "total_contratos": 3124,
    "monto_total_soles": 3191233139.67,
    "porcentaje": 25.42
  },
  {
    "tipo_proceso": "Concurso Público",
    "total_contratos": 517,
    "monto_total_soles": 1332337701.84,
    "porcentaje": 10.61
  }
]
```

### 5.4. Endpoint de Top Entidades: `GET /api/v1/cockpit/top-entidades`
```json
[
  {
    "ruc_entidad": "20100128218",
    "nombre_entidad": "PETROLEOS DEL PERU S.A.",
    "total_contratos": 31,
    "monto_total_soles": 672461132.18
  },
  {
    "ruc_entidad": "20486021692",
    "nombre_entidad": "GOBIERNO REGIONAL DE JUNIN SEDE CENTRAL",
    "total_contratos": 14,
    "monto_total_soles": 592064441.39
  }
]
```

---

## 6. Implementación de Referencia en Node.js (Express + `mysql2/promise`)

```javascript
// controllers/cockpitController.js
const pool = require('../config/database');

/**
 * Controlador principal del Cockpit Forense SEACE
 */
async function getCockpitData(req, res) {
  try {
    const {
      year,
      month = null,
      departamento = null,
      provincia = null,
      distrito = null,
      moneda = null,
      tipo_proceso = null,
      estado = null
    } = req.query;

    if (!year) {
      return res.status(400).json({ 
        success: false, 
        message: 'El parámetro :year es obligatorio para la consulta.' 
      });
    }

    // Parámetros ordenados para cláusulas (? IS NULL OR campo = ?)
    const baseParams = [
      year,
      month, month,
      departamento, departamento,
      provincia, provincia,
      distrito, distrito,
      moneda, moneda,
      tipo_proceso, tipo_proceso,
      estado, estado
    ];

    // Ejecución paralela ultra-rápida vía Promise.all
    const [
      [kpiRows],
      [topCantidadRows],
      [topMontoRows],
      [distribucionRows],
      [topEntidadesRows]
    ] = await Promise.all([
      pool.query(SQL_KPIS_CONSOLIDADOS, [
        ...baseParams,
        // Parámetros para la CTE secundaria de convocatorias
        year, month, month,
        departamento, departamento,
        provincia, provincia,
        distrito, distrito,
        tipo_proceso, tipo_proceso,
        estado, estado
      ]),
      pool.query(SQL_TOP10_CANTIDAD, baseParams),
      pool.query(SQL_TOP10_MONTO, baseParams),
      pool.query(SQL_DISTRIBUCION_PROCESOS, baseParams),
      pool.query(SQL_TOP10_ENTIDADES, baseParams)
    ]);

    return res.json({
      success: true,
      data: {
        kpis: kpiRows[0] || {
          total_contratos: 0,
          monto_total_soles: 0.00,
          contratistas_activos: 0,
          tasa_postor_unico_pct: 0.00
        },
        top_contratistas_cantidad: topCantidadRows,
        top_contratistas_monto: topMontoRows,
        distribucion_tipo_proceso: distribucionRows,
        top_entidades_presupuesto: topEntidadesRows
      }
    });

  } catch (error) {
    console.error('Error en getCockpitData:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error interno en la ejecución de consultas analíticas.' 
    });
  }
}

module.exports = { getCockpitData };
```
