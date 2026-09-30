# Especificación Técnica de Contrato de Datos Frontend - Backend (MySQL)
## Cockpit Forense SEACE / OECE (Arquitectura NestJS + MySQL)

Este documento contiene la definición formal de los endpoints REST implementados con NestJS (`@Controller('kpis')`, `@Controller('graficas')`), filtros globales, estructuras JSON de respuesta (Payloads) y las consultas SQL sugeridas sobre el esquema relacional de la base de datos `contrataciones` en MySQL.

---

## 1. Parámetros Globales de Consulta (Query Params)

Toda petición analítica acepta los siguientes parámetros opcionales de filtrado:
- `year` *(int)*: Año fiscal analizado (ej: `2024`, `2023`, `2018`). Si se omite, el backend debe tomar por defecto el año más reciente registrado en la base de datos (o `2024` / `2018`).
- `limit` *(int, opcional)*: Cantidad máxima de registros para rankings (por defecto `10`).

---

## 2. Ficha Resumen de Requerimientos de Datos

| Componente UI | Endpoint REST | Tablas MySQL Involucradas | Campos Clave Requeridos | Objetivo Analítico |
| :--- | :--- | :--- | :--- | :--- |
| **KPIs de Integridad (Fila Superior)** | `GET /api/kpis?year=YYYY` | `contratos`, `adjudicaciones`, `convocatorias`, `ofertantes` | `monto_contratado_item`, `ruc_contratista`, `fecha_suscripcion_contrato`, `codigo_convocatoria`, `numero_item` | 4 métricas macro: Volumen formalizado, monto PEN, contratistas únicos y tasa de postor único. |
| **Gráfica 1: Top 10 Contratistas por Contratos** | `GET /api/graficas/top-contratistas-contratos?year=YYYY&limit=10` | `contratos`, `adjudicaciones` | `c.ruc_contratista`, `a.nombre_proveedor`, `c.monto_contratado_item` | Identificar contratistas o consorcios con mayor cantidad de adjudicaciones ganadas. |
| **Gráfica 2: Top 10 Contratistas por Monto** | `GET /api/graficas/top-contratistas-monto?year=YYYY&limit=10` | `contratos`, `adjudicaciones` | `c.ruc_contratista`, `a.nombre_proveedor`, `c.monto_contratado_item` | Detectar concentración de capital fiscal en proveedores específicos. |
| **Gráfica 3: Distribución por Objeto** | `GET /api/graficas/distribucion-objeto?year=YYYY` | `contratos`, `convocatorias` (o `adjudicaciones`) | `co.objeto_contractual`, `c.monto_contratado_item` | Desglose porcentual y montos por categoría: Bienes, Obras, Servicios, Consultorías. |

---

## 3. Especificación Detallada de Payloads y Consultas SQL

### 3.1. Selector Global & KPIs Principales
- **Endpoint:** `GET /api/kpis?year=2024`
- **Estructura JSON de Respuesta:**
```json
{
  "year": 2024,
  "kpis": {
    "total_contratos": 98420,
    "monto_total_soles": 48920500120.50,
    "monto_total_formateado": "S/ 48,920 MM",
    "contratistas_activos": 34180,
    "tasa_postor_unico_pct": 38.25,
    "total_adjudicaciones_evaluadas": 45120,
    "total_adjudicaciones_postor_unico": 17260
  }
}
```
- **Lógica SQL Sugerida:**
```sql
-- 1. Métricas de Contratos (Volumen, Monto y RUCs únicos)
SELECT 
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
    COALESCE(SUM(c.monto_contratado_item), 0) AS monto_total_soles,
    COUNT(DISTINCT c.ruc_contratista) AS contratistas_activos
FROM contratos c
WHERE YEAR(c.fecha_suscripcion_contrato) = 2024;

-- 2. Tasa de Postor Único (Procesos con exactamente 1 ofertante registrado)
WITH conteo_ofertantes AS (
    SELECT 
        o.codigo_convocatoria,
        o.numero_item,
        COUNT(DISTINCT o.ruc_postor) AS total_postores
    FROM ofertantes o
    WHERE YEAR(o.fecha_convocatoria) = 2024
    GROUP BY o.codigo_convocatoria, o.numero_item
)
SELECT 
    COUNT(*) AS total_items,
    SUM(CASE WHEN total_postores = 1 THEN 1 ELSE 0 END) AS items_postor_unico,
    ROUND(SUM(CASE WHEN total_postores = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS tasa_postor_unico_pct
FROM conteo_ofertantes;
```

---

### 3.2. Gráfica 1: Top 10 Contratistas con Mayor Cantidad de Contratos Ganados
- **Endpoint:** `GET /api/graficas/top-contratistas-contratos?year=2024&limit=10`
- **Estructura JSON de Respuesta:**
```json
[
  {
    "ruc": "20519384729",
    "proveedor": "DISTRIBUIDORA FARMA PERÚ S.A.C.",
    "tipo_proveedor": "INDIVIDUAL",
    "total_contratos": 84,
    "monto_total_soles": 154200000.00
  },
  {
    "ruc": "20551029482",
    "proveedor": "SERVICIOS INTEGRALES BIOMÉDICOS S.A.",
    "tipo_proveedor": "INDIVIDUAL",
    "total_contratos": 46,
    "monto_total_soles": 245100000.00
  }
]
```
- **Lógica SQL Sugerida:**
```sql
SELECT 
    c.ruc_contratista AS ruc,
    COALESCE(MAX(a.nombre_proveedor), c.ruc_contratista) AS proveedor,
    COALESCE(MAX(a.tipo_proveedor), 'INDIVIDUAL') AS tipo_proveedor,
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
    SUM(c.monto_contratado_item) AS monto_total_soles
FROM contratos c
LEFT JOIN adjudicaciones a 
    ON c.codigo_convocatoria = a.codigo_convocatoria 
    AND c.numero_item = a.numero_item 
    AND c.ruc_contratista = a.ruc_proveedor
WHERE YEAR(c.fecha_suscripcion_contrato) = 2024
GROUP BY c.ruc_contratista
ORDER BY total_contratos DESC
LIMIT 10;
```

---

### 3.3. Gráfica 2: Top 10 Contratistas con Mayor Monto Acumulado Adjudicado
- **Endpoint:** `GET /api/graficas/top-contratistas-monto?year=2024&limit=10`
- **Estructura JSON de Respuesta:**
```json
[
  {
    "ruc": "20601849182",
    "proveedor": "CONSORCIO VIAL DEL SUR",
    "tipo_proveedor": "CONSORCIO",
    "monto_total_soles": 482400000.00,
    "total_contratos": 17
  },
  {
    "ruc": "20492817291",
    "proveedor": "CONSTRUCTORA IMPERIAL ANDINA S.A.C.",
    "tipo_proveedor": "INDIVIDUAL",
    "monto_total_soles": 319800000.00,
    "total_contratos": 16
  }
]
```
- **Lógica SQL Sugerida:**
```sql
SELECT 
    c.ruc_contratista AS ruc,
    COALESCE(MAX(a.nombre_proveedor), c.ruc_contratista) AS proveedor,
    COALESCE(MAX(a.tipo_proveedor), 'INDIVIDUAL') AS tipo_proveedor,
    SUM(c.monto_contratado_item) AS monto_total_soles,
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos
FROM contratos c
LEFT JOIN adjudicaciones a 
    ON c.codigo_convocatoria = a.codigo_convocatoria 
    AND c.numero_item = a.numero_item 
    AND c.ruc_contratista = a.ruc_proveedor
WHERE YEAR(c.fecha_suscripcion_contrato) = 2024
GROUP BY c.ruc_contratista
ORDER BY monto_total_soles DESC
LIMIT 10;
```

---

### 3.4. Gráfica 3: Distribución por Objeto Contractual (Bienes, Servicios, Obras, Consultorías)
- **Endpoint:** `GET /api/graficas/distribucion-objeto?year=2024`
- **Estructura JSON de Respuesta:**
```json
[
  {
    "objeto_contractual": "Bienes",
    "total_contratos": 41336,
    "monto_total_soles": 20546610050.60,
    "porcentaje": 42.0
  },
  {
    "objeto_contractual": "Obras",
    "total_contratos": 32478,
    "monto_total_soles": 16143765039.75,
    "porcentaje": 33.0
  },
  {
    "objeto_contractual": "Servicios",
    "total_contratos": 19684,
    "monto_total_soles": 9784100024.10,
    "porcentaje": 20.0
  },
  {
    "objeto_contractual": "Consultoría de Obras",
    "total_contratos": 4922,
    "monto_total_soles": 2446025006.05,
    "porcentaje": 5.0
  }
]
```
- **Lógica SQL Sugerida:**
```sql
SELECT 
    COALESCE(co.objeto_contractual, 'NO ESPECIFICADO') AS objeto_contractual,
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
    SUM(c.monto_contratado_item) AS monto_total_soles,
    ROUND(
        SUM(c.monto_contratado_item) * 100.0 / 
        (SELECT SUM(monto_contratado_item) FROM contratos WHERE YEAR(fecha_suscripcion_contrato) = 2024),
        2
    ) AS porcentaje
FROM contratos c
JOIN convocatorias co 
    ON c.codigo_convocatoria = co.codigo_convocatoria 
    AND c.numero_item = co.numero_item
WHERE YEAR(c.fecha_suscripcion_contrato) = 2024
GROUP BY co.objeto_contractual
ORDER BY monto_total_soles DESC;
```
