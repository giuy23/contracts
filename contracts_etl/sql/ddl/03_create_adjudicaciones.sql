CREATE TABLE IF NOT EXISTS adjudicaciones (
    codigo_entidad VARCHAR(20),
    ruc_entidad VARCHAR(11) NOT NULL,
    nombre_entidad VARCHAR(255),
    tipo_entidad VARCHAR(100),
    entidad_departamento VARCHAR(100),
    codigo_convocatoria VARCHAR(20) NOT NULL,
    objeto_contractual VARCHAR(50),
    tipo_proceso_seleccion VARCHAR(100),
    nomenclatura_proceso VARCHAR(100),
    descripcion_proceso TEXT,
    numero_item INT NOT NULL,
    descripcion_item TEXT,
    estado_item VARCHAR(50),
    cantidad_adjudicado_item DECIMAL(12,2),
    monto_referencial_item_soles DECIMAL(16,2),
    monto_adjudicado_item_soles DECIMAL(16,2),
    departamento_item VARCHAR(100),
    moneda VARCHAR(10),
    unidad_medida VARCHAR(50),
    ruc_proveedor VARCHAR(20) NOT NULL,
    nombre_proveedor VARCHAR(255),
    tipo_proveedor VARCHAR(50),
    fecha_convocatoria DATE,
    fecha_buena_pro DATE,
    fecha_consentimiento_bp DATE,
    CONSTRAINT pk_adjudicaciones PRIMARY KEY (codigo_convocatoria, numero_item, ruc_proveedor),
    CONSTRAINT fk_adjudicacion_convocatoria FOREIGN KEY (codigo_convocatoria, numero_item)
        REFERENCES convocatorias (codigo_convocatoria, numero_item)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;