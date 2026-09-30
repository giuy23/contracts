CREATE TABLE IF NOT EXISTS ofertantes (
    codigo_convocatoria VARCHAR(20) NOT NULL,
    fecha_convocatoria DATE,
    numero_item INT NOT NULL,
    ruc_postor VARCHAR(20) NOT NULL,
    nombre_postor VARCHAR(255),
    fecha_presentacion_propuesta DATETIME,
    CONSTRAINT pk_ofertantes PRIMARY KEY (codigo_convocatoria, numero_item, ruc_postor),
    CONSTRAINT fk_ofertantes_convocatoria FOREIGN KEY (codigo_convocatoria, numero_item)
        REFERENCES convocatorias (codigo_convocatoria, numero_item)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;