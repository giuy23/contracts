-- ============================================================================
-- ARCHIVO: contracts_etl/sql/ddl/05_create_consorcios.sql
-- DESCRIPCIÓN: Tablas de Staging, Relación 3FN de Consorcios y Puente Indexado
-- ============================================================================

CREATE TABLE IF NOT EXISTS stg_consorcios_raw (
    codigo_consorcio VARCHAR(20) NOT NULL,
    nombre_consorcio VARCHAR(255) NULL,
    ruc_miembro VARCHAR(20) NOT NULL,
    nombre_miembro VARCHAR(255) NOT NULL,
    codigo_convocatoria VARCHAR(20) NULL,
    numero_item INT NULL,
    porcentaje_declarado DECIMAL(6,2) NULL,
    fecha_registro_consorcio DATE NULL,
    CONSTRAINT pk_stg_consorcios PRIMARY KEY (codigo_consorcio, ruc_miembro),
    INDEX idx_stg_consorcio (codigo_consorcio),
    INDEX idx_stg_miembro (ruc_miembro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consorcio_integrantes (
    id_consorcio INT NOT NULL COMMENT 'FK a organizaciones.id_organizacion (el consorcio)',
    id_empresa_miembro INT NOT NULL COMMENT 'FK a organizaciones.id_organizacion (la empresa real RUC 11 dígitos)',
    total_miembros INT NOT NULL DEFAULT 1 COMMENT 'Cantidad N de empresas que conforman este consorcio',
    factor_equitativo DECIMAL(10,6) NOT NULL DEFAULT 1.000000 COMMENT '1 / N para división equitativa de montos',
    porcentaje_equitativo DECIMAL(6,2) NOT NULL DEFAULT 100.00 COMMENT 'ROUND(100 / N, 2)',
    PRIMARY KEY (id_consorcio, id_empresa_miembro),
    KEY idx_ci_empresa_miembro (id_empresa_miembro, id_consorcio),
    CONSTRAINT fk_ci_consorcio FOREIGN KEY (id_consorcio)
        REFERENCES organizaciones (id_organizacion) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_ci_empresa_miembro FOREIGN KEY (id_empresa_miembro)
        REFERENCES organizaciones (id_organizacion) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS puente_actor_empresa (
    id_actor_original INT NOT NULL COMMENT 'id_organizacion en contratos/adjudicaciones/ofertantes',
    id_empresa_real INT NOT NULL COMMENT 'id_organizacion de la empresa real (nunca un consorcio)',
    es_consorcio TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0 = Individual, 1 = Integrante de Consorcio',
    codigo_consorcio VARCHAR(20) NULL COMMENT 'Código SEACE del consorcio si es_consorcio = 1',
    nombre_consorcio VARCHAR(255) NULL COMMENT 'Razón social del consorcio si es_consorcio = 1',
    total_miembros INT NOT NULL DEFAULT 1 COMMENT '1 si es individual, N si es consorcio',
    factor_equitativo DECIMAL(10,6) NOT NULL DEFAULT 1.000000 COMMENT '1.0 si es individual, 1/N si es consorcio',
    porcentaje_equitativo DECIMAL(6,2) NOT NULL DEFAULT 100.00 COMMENT '100.00 si es individual, 100/N si es consorcio',
    etiqueta_modalidad VARCHAR(40) NOT NULL DEFAULT 'INDIVIDUAL' COMMENT 'INDIVIDUAL o EN CONSORCIO (1/N)',
    PRIMARY KEY (id_actor_original, id_empresa_real),
    KEY idx_pae_empresa_real (id_empresa_real, id_actor_original),
    KEY idx_pae_es_consorcio (es_consorcio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

