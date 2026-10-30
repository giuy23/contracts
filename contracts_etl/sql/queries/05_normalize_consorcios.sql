-- =============================================================================
-- SCRIPT MAESTRO DE NORMALIZACIÓN 3FN DE CONSORCIOS Y TABLA PUENTE (1/N)
-- Base de Datos: contrataciones (MySQL 8.0+)
-- =============================================================================

START TRANSACTION;

-- -----------------------------------------------------------------------------
-- PASO 1: Limpieza de posibles registros inválidos en stg_consorcios_raw
-- (Elimina filas donde el código de consorcio o RUC miembro estén vacíos)
-- -----------------------------------------------------------------------------
DELETE FROM stg_consorcios_raw
WHERE TRIM(COALESCE(codigo_consorcio, '')) = ''
   OR TRIM(COALESCE(ruc_miembro, '')) = '';

-- -----------------------------------------------------------------------------
-- PASO 2: Insertar en `organizaciones` a todas las Empresas Miembro reales
-- que aún no existían en la BD (empresas que solo licitaron en consorcio)
-- -----------------------------------------------------------------------------
INSERT INTO organizaciones (
    numero_documento,
    razon_social,
    tipo_actor,
    tipo_proveedor
)
SELECT 
    s.ruc_clean AS numero_documento,
    MAX(s.nombre_clean) AS razon_social,
    'PROVEEDOR' AS tipo_actor,
    CASE 
        WHEN s.ruc_clean LIKE '20%' AND CHAR_LENGTH(s.ruc_clean) = 11 THEN 'Persona Juridica'
        WHEN (s.ruc_clean LIKE '10%' OR s.ruc_clean LIKE '15%' OR s.ruc_clean LIKE '17%')
             AND CHAR_LENGTH(s.ruc_clean) = 11 THEN 'Persona Natural'
        ELSE 'Persona Juridica'
    END AS tipo_proveedor
FROM (
    SELECT 
        TRIM(ruc_miembro) AS ruc_clean,
        TRIM(nombre_miembro) AS nombre_clean
    FROM stg_consorcios_raw
    WHERE CHAR_LENGTH(TRIM(ruc_miembro)) >= 8
      AND UPPER(TRIM(nombre_miembro)) NOT LIKE 'CONSORCIO %'
) s
GROUP BY s.ruc_clean
ON DUPLICATE KEY UPDATE
    -- Si la empresa ya existía pero tenía tipo_proveedor NULL, lo completamos:
    tipo_proveedor = COALESCE(organizaciones.tipo_proveedor, VALUES(tipo_proveedor));

-- -----------------------------------------------------------------------------
-- PASO 3: Asegurar que los consorcios padre de stg_consorcios_raw existan en
-- `organizaciones` marcados explícitamente con tipo_proveedor = 'Consorcio'
-- -----------------------------------------------------------------------------
INSERT INTO organizaciones (
    numero_documento,
    razon_social,
    tipo_actor,
    tipo_proveedor
)
SELECT 
    s.cod_clean AS numero_documento,
    COALESCE(MAX(s.nom_clean), CONCAT('CONSORCIO ', s.cod_clean)) AS razon_social,
    'PROVEEDOR' AS tipo_actor,
    'Consorcio' AS tipo_proveedor
FROM (
    SELECT 
        TRIM(codigo_consorcio) AS cod_clean,
        NULLIF(TRIM(nombre_consorcio), '') AS nom_clean
    FROM stg_consorcios_raw
) s
GROUP BY s.cod_clean
ON DUPLICATE KEY UPDATE
    tipo_proveedor = 'Consorcio';

-- -----------------------------------------------------------------------------
-- PASO 4: Poblar la tabla normalizada `consorcio_integrantes`
-- Calcula N (total_miembros) por cada consorcio y el factor equitativo (1 / N)
-- -----------------------------------------------------------------------------
TRUNCATE TABLE consorcio_integrantes;

INSERT INTO consorcio_integrantes (
    id_consorcio,
    id_empresa_miembro,
    total_miembros,
    factor_equitativo,
    porcentaje_equitativo
)
WITH pares_consorcio_empresa AS (
    SELECT DISTINCT
        org_consorcio.id_organizacion AS id_consorcio,
        org_miembro.id_organizacion AS id_empresa_miembro
    FROM stg_consorcios_raw s
    INNER JOIN organizaciones org_consorcio
        ON org_consorcio.numero_documento = TRIM(s.codigo_consorcio)
    INNER JOIN organizaciones org_miembro
        ON org_miembro.numero_documento = TRIM(s.ruc_miembro)
    WHERE org_consorcio.id_organizacion != org_miembro.id_organizacion
      -- Garantizar que el miembro sea una empresa real y NO otro consorcio:
      AND COALESCE(org_miembro.tipo_proveedor, '') != 'Consorcio'
      AND org_miembro.razon_social NOT LIKE 'CONSORCIO %'
),
conteo_miembros AS (
    SELECT 
        id_consorcio,
        COUNT(DISTINCT id_empresa_miembro) AS total_miembros
    FROM pares_consorcio_empresa
    GROUP BY id_consorcio
)
SELECT 
    p.id_consorcio,
    p.id_empresa_miembro,
    cm.total_miembros,
    ROUND(1.000000 / cm.total_miembros, 6) AS factor_equitativo,
    ROUND(100.00 / cm.total_miembros, 2) AS porcentaje_equitativo
FROM pares_consorcio_empresa p
INNER JOIN conteo_miembros cm
    ON p.id_consorcio = cm.id_consorcio;

-- -----------------------------------------------------------------------------
-- PASO 5: Construir la Tabla Puente Indexada `puente_actor_empresa`
-- Regla de Negocio (Acuerdo 2 y 3):
--   5.1. Toda empresa real individual (NO consorcio) se mapea a sí misma con:
--        es_consorcio = 0, total_miembros = 1, factor_equitativo = 1.000000,
--        etiqueta_modalidad = 'INDIVIDUAL'.
--   5.2. Todo consorcio que tiene integrantes en `consorcio_integrantes` se
--        expande hacia sus N empresas reales con:
--        es_consorcio = 1, total_miembros = N, factor_equitativo = 1/N,
--        etiqueta_modalidad = 'EN CONSORCIO (1/N)'.
--   5.3. Los consorcios huérfanos (sin empresas miembros) NO se insertan en
--        `puente_actor_empresa`, quedando automáticamente ocultos de todos
--        los rankings y buscadores de empresas.
-- -----------------------------------------------------------------------------
TRUNCATE TABLE puente_actor_empresa;

-- 5.1. Insertar Empresas Reales Individuales (1 a 1)
INSERT INTO puente_actor_empresa (
    id_actor_original,
    id_empresa_real,
    es_consorcio,
    codigo_consorcio,
    nombre_consorcio,
    total_miembros,
    factor_equitativo,
    porcentaje_equitativo,
    etiqueta_modalidad
)
SELECT 
    o.id_organizacion AS id_actor_original,
    o.id_organizacion AS id_empresa_real,
    0 AS es_consorcio,
    NULL AS codigo_consorcio,
    NULL AS nombre_consorcio,
    1 AS total_miembros,
    1.000000 AS factor_equitativo,
    100.00 AS porcentaje_equitativo,
    'INDIVIDUAL' AS etiqueta_modalidad
FROM organizaciones o
WHERE o.tipo_actor IN ('PROVEEDOR', 'AMBOS')
  AND COALESCE(o.tipo_proveedor, 'INDIVIDUAL') != 'Consorcio'
  AND o.razon_social NOT LIKE 'CONSORCIO %'
  AND o.razon_social NOT LIKE '%CONSORCIO%';

-- 5.2. Insertar Consorcios Desagregados hacia sus N Empresas Miembro Reales
INSERT INTO puente_actor_empresa (
    id_actor_original,
    id_empresa_real,
    es_consorcio,
    codigo_consorcio,
    nombre_consorcio,
    total_miembros,
    factor_equitativo,
    porcentaje_equitativo,
    etiqueta_modalidad
)
SELECT 
    ci.id_consorcio AS id_actor_original,
    ci.id_empresa_miembro AS id_empresa_real,
    1 AS es_consorcio,
    org_c.numero_documento AS codigo_consorcio,
    org_c.razon_social AS nombre_consorcio,
    ci.total_miembros,
    ci.factor_equitativo,
    ci.porcentaje_equitativo,
    CONCAT('EN CONSORCIO (1/', ci.total_miembros, ')') AS etiqueta_modalidad
FROM consorcio_integrantes ci
INNER JOIN organizaciones org_c
    ON ci.id_consorcio = org_c.id_organizacion
ON DUPLICATE KEY UPDATE
    es_consorcio = VALUES(es_consorcio),
    codigo_consorcio = VALUES(codigo_consorcio),
    nombre_consorcio = VALUES(nombre_consorcio),
    total_miembros = VALUES(total_miembros),
    factor_equitativo = VALUES(factor_equitativo),
    porcentaje_equitativo = VALUES(porcentaje_equitativo),
    etiqueta_modalidad = VALUES(etiqueta_modalidad);

COMMIT;
