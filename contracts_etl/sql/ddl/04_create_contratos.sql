CREATE TABLE IF NOT EXISTS contratos (
    codigo_entidad VARCHAR(20),
    codigo_convocatoria VARCHAR(20) NOT NULL,
    descripcion_proceso TEXT,
    id_contrato_sistema BIGINT NOT NULL,
    codigo_contrato VARCHAR(50) NOT NULL,
    numero_contrato VARCHAR(100),
    numero_item INT NOT NULL,
    monto_contratado_total DECIMAL(16,2),
    monto_contratado_item DECIMAL(16,2),
    monto_adicional DECIMAL(16,2),
    monto_reduccion DECIMAL(16,2),
    monto_prorroga DECIMAL(16,2),
    monto_complementario DECIMAL(16,2),
    moneda VARCHAR(10),
    ruc_contratista VARCHAR(20) NOT NULL,
    ruc_destinatario_pago VARCHAR(20),
    tiene_resolucion VARCHAR(10),
    url_contrato TEXT,
    es_publicado VARCHAR(10),
    fecha_publicacion_contrato DATE,
    fecha_suscripcion_contrato DATE,
    fecha_vigencia_inicial DATE,
    fecha_vigencia_final DATE,
    fecha_vigencia_fin_actualizada DATE,
    CONSTRAINT pk_contratos PRIMARY KEY (codigo_contrato, numero_item),
    CONSTRAINT fk_contrato_convocatoria FOREIGN KEY (codigo_convocatoria, numero_item)
        REFERENCES convocatorias (codigo_convocatoria, numero_item)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;