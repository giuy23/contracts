# Ficha Técnica Maestra (Blueprint E2E): Ingesta Incremental de Consorcios (`contracts_etl`), Normalización 3FN en Base de Datos (`contrataciones`) y Prorrateo Equitativo ($1/N$) en Consultas y Reportes

| Metadato | Detalle Técnico |
| :--- | :--- |
| **Código de Documento** | `ARCH-CONSORCIOS-001` (Blueprint Maestro Autocontenido para ETL + DB + Backend) |
| **Proyecto** | OECE / RONIN.SEACE — Cockpit Forense de Contrataciones del Estado |
| **Ámbito del Documento** | Documento autocontenido diseñado para ser utilizado directamente como contexto técnico en:<br/>1. El proyecto **`contracts_etl/`** (Ingesta incremental Python + Pandas + SQLAlchemy).<br/>2. El motor de **Base de Datos MySQL (`contrataciones`)** (Normalización 3FN y Tabla Puente).<br/>3. El servidor **Backend/Frontend (`frontend/`)** (Consultas SQL y Exportador Excel). |
| **Periodo de Datos** | Ejercicios Fiscales `2022`, `2023`, `2024`, `2025` y `2026` |
| **Directorio de Excels Nuevos** | `contracts_etl/data/raw/05_consorcios/` |
| **Motor de Base de Datos** | MySQL 8.0+ en WSL (`127.0.0.1:3306`, BD: `contrataciones`, Usuario: `etl_user`) |
| **Estado** | **Especificación Definitiva y Acuerdos Confirmados — Lista para Ejecución** |

---

## 0. Acuerdos de Arquitectura Confirmados (Reglas Inquebrantables)

> [!IMPORTANT]
> Cualquier agente, desarrollador o proceso automatizado que intervenga en `contracts_etl`, en la base de datos `contrataciones` o en `frontend` **DEBE** cumplir estrictamente estas 4 directrices:
>
> 1. **Carpeta Oficial de Ingesta (`05_consorcios`):**
>    - El usuario depositará los archivos Excel de consorcios (2022 al 2026) descargados del portal CONOSCE («Proveedores y Consorcios») dentro de **`contracts_etl/data/raw/05_consorcios/`**.
>    - El pipeline ETL **SOLO debe procesar `05_consorcios`**, utilizando `logs/etl_progress.json` para rastrear qué archivos de `05_consorcios` ya se subieron y cuáles faltan.
>    - **PROHIBIDO** reprocesar, alterar o ejecutar los viejos DDLs de `01_convocatorias`, `02_ofertantes`, `03_adjudicaciones` o `04_contratos`, ya que esos datos ya fueron migrados y normalizados en la base de datos actual.
> 2. **Cero Consorcios como Sujeto Final (Ocultamiento Estricto):**
>    - Jurídica y contablemente un consorcio no es una empresa real, sino una agrupación temporal de empresas para una licitación.
>    - En el buscador, en los Rankings Top 10 del Cockpit y en los perfiles de auditoría **SOLO deben aparecer empresas reales** (Personas Jurídicas o Naturales con RUC formal).
>    - Si existiera algún consorcio antiguo o huérfano en la BD que no tenga desglose de empresas miembros en los Excels del 2022–2026, **se debe ocultar** de todas las vistas de empresas y rankings para que jamás aparezca un `"CONSORCIO X"` listado como empresa.
> 3. **Regla de Prorrateo Equitativo ($1/N$) como Valor Adjudicado Oficial:**
>    - Cuando un consorcio conformado por $N$ empresas gana una contratación o ítem, el monto se divide **equitativamente en partes iguales ($\text{Monto} / N$)** entre las $N$ empresas que conforman el consorcio.
>    - Ese **monto dividido ($\text{ROUND}(\text{Monto} / N, 2)$)** es el **valor adjudicado oficial a la empresa** en todos los KPIs, sumatorias, gráficos de clientes, territorio, línea de tiempo, rankings Top 10 y sumatoria contable del Excel.
> 4. **Visualización Dual en Grilla de Contratos y Excel Forense:**
>    - Tanto en la tabla de contratos del perfil del contratista como en el archivo `.xlsx` exportado se mostrarán **ambos importes**:
>      1. **Monto Total del Contrato (`monto_contratado_item`)**: El valor íntegro suscrito por el consorcio.
>      2. **Monto Atribuido $1/N$ a la Empresa (`monto_atribuido_empresa`)**: El valor dividido equitativamente que le corresponde a la empresa auditada, acompañado de la etiqueta **`"EN CONSORCIO (1/N)"`** (ej. `"EN CONSORCIO (1/3)"`) y el nombre del consorcio.

---

## 1. Fundamento Funcional y Matemático (Punto 1)

### 1.1. El Problema Forense Actual
En los archivos planos de SEACE (`convocatorias`, `ofertantes`, `adjudicaciones`, `contratos`), cuando un grupo de empresas postula en consorcio, el SEACE no coloca los RUCs de las empresas socias, sino que crea un registro ficticio con un código interno de 6 a 7 dígitos (ej. `585890` para `CONSORCIO INNOVA`) y `tipo_proveedor = 'Consorcio'`.

Actualmente en la tabla `organizaciones` de la base de datos `contrataciones`:
```text
+------------------------+----------+
| tipo_proveedor         | COUNT(*) |
+------------------------+----------+
| NULL                   |   124775 |
| Consorcio              |    51157 |  <-- 51,157 consorcios tratados como si fueran empresas
| Persona Juridica       |    30517 |
| Persona Natural        |    19277 |
| Persona No Domiciliada |     3802 |
+------------------------+----------+
```

Esto genera dos distorsiones graves para las auditorías:
1. **En el Ranking Top 10 y Buscador:** Aparecen nombres como `"CONSORCIO VIAL SUR"` con código `1482391` (que no es un RUC de SUNAT) en lugar de mostrar a las empresas constructoras reales que recibieron el dinero.
2. **En el Expediente de cada Empresa Real:** Si una empresa con RUC `20546959181` ganó 1 contrato sola y 10 contratos formando parte de distintos consorcios, hoy su perfil muestra solo 1 contrato, ocultando el 90% de su actividad real con el Estado.

---

### 1.2. Modelo Matemático de División Equitativa ($1/N$)

Para un contrato (o adjudicación) $c$ con monto original $M_c$:

1. **Caso 1 — Contratación Individual ($N = 1$):**
   - La empresa contratista es una Persona Jurídica, Persona Natural o No Domiciliada.
   - Número de integrantes: $N = 1$.
   - Factor equitativo: $F = 1.000000$.
   - Modalidad: `'INDIVIDUAL'`.
   - Etiqueta visual: `'INDIVIDUAL (100%)'`.
   - Monto Total Contrato: $M_c$.
   - **Monto Adjudicado a la Empresa:** $M_c \times 1 = M_c$.

2. **Caso 2 — Contratación en Consorcio ($N \ge 2$):**
   - El contratista registrado en `contratos.id_contratista` es un Consorcio $C$ integrado por $N$ empresas distintas $\{E_1, E_2, \dots, E_N\}$ según los Excels de `05_consorcios`.
   - Número de integrantes: $N = \text{COUNT(DISTINCT id\_empresa\_miembro)}$.
   - Factor equitativo para cada empresa miembro $E_k$:
     $$F_C = \text{ROUND}\left(\frac{1}{N}, 6\right)$$
   - Porcentaje equitativo:
     $$P_C = \text{ROUND}\left(\frac{100}{N}, 2\right)\%$$
   - Etiqueta visual:
     $$\text{Etiqueta} = \text{CONCAT}(\text{'EN CONSORCIO (1/'}, N, \text{')'})$$
   - Monto Total Contrato: $M_c$.
   - **Monto Adjudicado / Atribuido a cada Empresa Miembro $E_k$:**
     $$M_{c, E_k} = \text{ROUND}\left(\frac{M_c}{N}, 2\right)$$

---

## 2. Estado Exacto Actual de la Base de Datos `contrataciones` (Contexto Crítico para el ETL y la BD)

> [!WARNING]
> **ATENCIÓN PARA EL AGENTE DEL ETL (`contracts_etl`):**
> Los archivos antiguos en `contracts_etl/sql/ddl/01_create_convocatorias.sql` al `04_create_contratos.sql` y `contracts_etl/config/schemas/*.json` pertenecen a la **Fase 1 (Desnormalizada)**.
> Posteriormente, la base de datos `contrataciones` en MySQL **fue normalizada en 3FN**.
> Por lo tanto, el estado real vigente en MySQL (`127.0.0.1:3306/contrataciones`) es el que se documenta a continuación. **Bajo ninguna circunstancia se deben ejecutar los DDLs 01 al 04 antiguos ni modificar las tablas base existentes.**

### 2.1. Inventario de Tablas y Vistas Existentes en MySQL `contrataciones`

| Objeto en MySQL | Tipo | Filas Actuales | Rol en el Modelo 3FN Actual |
| :--- | :---: | :---: | :--- |
| `organizaciones` | `BASE TABLE` | `229,528` | Maestro único de Entidades, Proveedores y Consorcios (`id_organizacion` PK, `numero_documento` UNIQUE). |
| `procesos` | `BASE TABLE` | `~260,000` | Cabecera de convocatorias (`codigo_convocatoria` PK, `id_entidad` FK $\rightarrow$ `organizaciones`). |
| `convocatoria_items` | `BASE TABLE` | `~266,503` | Ítems convocados (`(codigo_convocatoria, numero_item)` PK, `id_ubigeo` FK $\rightarrow$ `ubigeo`). |
| `ofertantes` | `BASE TABLE` | `866,176` | Postores por ítem (`(codigo_convocatoria, numero_item, id_postor)` PK, `id_postor` FK $\rightarrow$ `organizaciones`). |
| `adjudicaciones` | `BASE TABLE` | `~268,138` | Buena pro por ítem (`(codigo_convocatoria, numero_item, id_proveedor)` PK, `id_proveedor` FK $\rightarrow$ `organizaciones`). |
| `contratos` | `BASE TABLE` | `28,216` | Contratos suscritos (`(codigo_contrato, numero_item)` PK, `id_contratista` FK $\rightarrow$ `organizaciones`). |
| `monedas` | `BASE TABLE` | `8` | Catálogo normalizado de monedas (`id_moneda` PK). |
| `ubigeo` | `BASE TABLE` | `1,894` | Catálogo geográfico (`id_ubigeo` PK: departamento, provincia, distrito). |
| `convocatorias` | **`VIEW`** | — | Vista desnormalizada de compatibilidad que une `convocatoria_items`, `procesos`, `organizaciones`, `monedas` y `ubigeo`. |

### 2.2. DDL Exacto Vigente en MySQL (`SHOW CREATE TABLE` Actual)

```sql
-- 1. Tabla Maestra: organizaciones
CREATE TABLE `organizaciones` (
  `id_organizacion` int NOT NULL AUTO_INCREMENT,
  `numero_documento` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `razon_social` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo_actor` enum('ENTIDAD','PROVEEDOR','AMBOS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `tipo_proveedor` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `codigo_entidad` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo_entidad` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sector_nivel_gobierno` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departamento_sede` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id_organizacion`),
  UNIQUE KEY `uk_numero_documento` (`numero_documento`),
  KEY `idx_tipo_actor` (`tipo_actor`),
  KEY `idx_org_tipo_proveedor` (`tipo_proveedor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabla de Contratos: contratos
CREATE TABLE `contratos` (
  `codigo_convocatoria` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_contrato_sistema` bigint NOT NULL,
  `codigo_contrato` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numero_contrato` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `numero_item` int NOT NULL,
  `monto_contratado_total` decimal(16,2) DEFAULT NULL,
  `monto_contratado_item` decimal(16,2) DEFAULT NULL,
  `monto_adicional` decimal(16,2) DEFAULT NULL,
  `monto_reduccion` decimal(16,2) DEFAULT NULL,
  `monto_prorroga` decimal(16,2) DEFAULT NULL,
  `monto_complementario` decimal(16,2) DEFAULT NULL,
  `tiene_resolucion` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `url_contrato` text COLLATE utf8mb4_unicode_ci,
  `es_publicado` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_publicacion_contrato` date DEFAULT NULL,
  `fecha_suscripcion_contrato` date DEFAULT NULL,
  `fecha_vigencia_inicial` date DEFAULT NULL,
  `fecha_vigencia_final` date DEFAULT NULL,
  `fecha_vigencia_fin_actualizada` date DEFAULT NULL,
  `id_contratista` int NOT NULL,
  `id_destinatario_pago` int DEFAULT NULL,
  `id_moneda` int DEFAULT NULL,
  PRIMARY KEY (`codigo_contrato`,`numero_item`),
  KEY `fk_contratos_item` (`codigo_convocatoria`,`numero_item`),
  KEY `fk_contratos_destinatario` (`id_destinatario_pago`),
  KEY `fk_contratos_moneda` (`id_moneda`),
  KEY `idx_contratos_fecha_sub` (`fecha_suscripcion_contrato`),
  KEY `idx_contratos_contratista_monto` (`id_contratista`,`monto_contratado_item`),
  CONSTRAINT `fk_contratos_contratista` FOREIGN KEY (`id_contratista`) REFERENCES `organizaciones` (`id_organizacion`),
  CONSTRAINT `fk_contratos_destinatario` FOREIGN KEY (`id_destinatario_pago`) REFERENCES `organizaciones` (`id_organizacion`),
  CONSTRAINT `fk_contratos_item` FOREIGN KEY (`codigo_convocatoria`, `numero_item`) REFERENCES `convocatoria_items` (`codigo_convocatoria`, `numero_item`) ON UPDATE CASCADE,
  CONSTRAINT `fk_contratos_moneda` FOREIGN KEY (`id_moneda`) REFERENCES `monedas` (`id_moneda`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Adjudicaciones: adjudicaciones
CREATE TABLE `adjudicaciones` (
  `codigo_convocatoria` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numero_item` int NOT NULL,
  `cantidad_adjudicado_item` decimal(12,2) DEFAULT NULL,
  `monto_adjudicado_item_soles` decimal(16,2) DEFAULT NULL,
  `fecha_buena_pro` date DEFAULT NULL,
  `fecha_consentimiento_bp` date DEFAULT NULL,
  `id_proveedor` int NOT NULL,
  PRIMARY KEY (`codigo_convocatoria`,`numero_item`,`id_proveedor`),
  KEY `fk_adjudicaciones_proveedor` (`id_proveedor`),
  CONSTRAINT `fk_adjudicaciones_item` FOREIGN KEY (`codigo_convocatoria`, `numero_item`) REFERENCES `convocatoria_items` (`codigo_convocatoria`, `numero_item`) ON UPDATE CASCADE,
  CONSTRAINT `fk_adjudicaciones_proveedor` FOREIGN KEY (`id_proveedor`) REFERENCES `organizaciones` (`id_organizacion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de Ofertantes: ofertantes
CREATE TABLE `ofertantes` (
  `codigo_convocatoria` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `numero_item` int NOT NULL,
  `fecha_presentacion_propuesta` datetime DEFAULT NULL,
  `id_postor` int NOT NULL,
  PRIMARY KEY (`codigo_convocatoria`,`numero_item`,`id_postor`),
  KEY `fk_ofertantes_postor` (`id_postor`),
  CONSTRAINT `fk_ofertantes_item` FOREIGN KEY (`codigo_convocatoria`, `numero_item`) REFERENCES `convocatoria_items` (`codigo_convocatoria`, `numero_item`) ON UPDATE CASCADE,
  CONSTRAINT `fk_ofertantes_postor` FOREIGN KEY (`id_postor`) REFERENCES `organizaciones` (`id_organizacion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Vista de Compatibilidad: convocatorias
CREATE VIEW `convocatorias` AS
SELECT
  `ci`.`codigo_convocatoria` AS `codigo_convocatoria`,
  `ci`.`numero_item` AS `numero_item`,
  `ent`.`numero_documento` AS `ruc_entidad`,
  `ent`.`razon_social` AS `nombre_entidad`,
  `p`.`tipo_compra` AS `tipo_compra`,
  `p`.`objeto_contractual` AS `objeto_contractual`,
  `p`.`tipo_proceso_seleccion` AS `tipo_proceso_seleccion`,
  `ci`.`descripcion_item` AS `descripcion_item`,
  `ci`.`estado_item` AS `estado_item`,
  `ci`.`monto_referencial_item` AS `monto_referencial_item`,
  COALESCE(`m`.`codigo_iso`, `m`.`nombre_moneda`, 'SOLES') AS `moneda`,
  `u`.`departamento` AS `departamento_item`,
  `u`.`provincia` AS `provincia_item`,
  `u`.`distrito` AS `distrito_item`,
  `p`.`fecha_convocatoria` AS `fecha_convocatoria`
FROM `convocatoria_items` `ci`
JOIN `procesos` `p` ON (`ci`.`codigo_convocatoria` = `p`.`codigo_convocatoria`)
JOIN `organizaciones` `ent` ON (`p`.`id_entidad` = `ent`.`id_organizacion`)
LEFT JOIN `monedas` `m` ON (`p`.`id_moneda` = `m`.`id_moneda`)
LEFT JOIN `ubigeo` `u` ON (`ci`.`id_ubigeo` = `u`.`id_ubigeo`);
```

---

## 3. Especificación de Ingeniería para `contracts_etl` (Punto 2)

### 3.1. Por qué debemos blindar `contracts_etl` antes de correr los nuevos Excels
En el código actual de `contracts_etl` existen 3 trampas que debemos corregir para que solo cargue `05_consorcios` sin tocar nada más:
1. **Trampa 1 en `src/database.py` (`check_tables_exist`):**
   - Actualmente usa `inspector.get_table_names()`, que solo detecta `BASE TABLE` y **no detecta `VIEW`s**. Como `convocatorias` ahora es una `VIEW`, `check_tables_exist()` cree que `convocatorias` no existe y dispara `execute_ddl()`, el cual intenta correr `01_create_convocatorias.sql` sobre la vista y falla.
   - **Solución:** En `check_tables_exist()` unir `set(inspector.get_table_names()) | set(inspector.get_view_names())`, y en `execute_ddl()` ejecutar **únicamente** el DDL de las tablas que realmente falten (en nuestro caso, `05_create_consorcios.sql`).
2. **Trampa 2 en `main.py` (`run_pipeline`):**
   - Si se ejecuta con `resume_mode=False`, intenta volver a procesar las carpetas `01_convocatorias` a `04_contratos`, cuyos Excels siguen en `data/raw/`.
   - **Solución:** Agregar el parámetro `target_modules: Optional[List[str]] = None` (por defecto `["05_consorcios"]` o respetando `etl_progress.json` con `resume_mode=True`) para que **nunca** toque `01`–`04` (que ya están `COMPLETED` en `logs/etl_progress.json`).
3. **Trampa 3 en `src/transformer.py` (Nombres de columnas en Excels de CONOSCE):**
   - En los archivos Excel de CONOSCE, una columna puede llamarse `ruc_consorcio`, `codigo_consorcio` o `ruc_proveedor`, y la del miembro puede llamarse `ruc_miembro`, `ruc_integrante` o `numero_documento_miembro`.
   - **Solución:** Soportar en `schema_consorcios.json` una lista de alias (`"excel_aliases": [...]`) además de `"excel_column"` para que el transformador detecte automáticamente la columna sin importar la variante del año `2022` al `2026`.

---

### 3.2. Archivos Nuevos y Modificaciones Exactas en `contracts_etl`

#### A. Nuevo Archivo DDL: `contracts_etl/sql/ddl/05_create_consorcios.sql`
Este script crea las 3 tablas nuevas necesarias para el módulo de consorcios sin alterar ninguna tabla previa:
1. `stg_consorcios_raw`: Tabla de aterrizaje directo para el ETL desde los Excels `2022`–`2026`.
2. `consorcio_integrantes`: Tabla normalizada 3FN que vincula `id_consorcio` $\rightarrow$ `id_empresa_miembro` con $N$ (`total_miembros`) y `factor_equitativo` ($1/N$).
3. `puente_actor_empresa`: Tabla materializada indexada de alta velocidad para que el Backend resuelva en `< 10 ms` cualquier contratista/postor hacia empresas reales.

```sql
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
```

---

#### B. Nuevo Esquema JSON: `contracts_etl/config/schemas/schema_consorcios.json`
Define el mapeo declarativo para `05_consorcios` incluyendo alias exhaustivos de las columnas oficiales de CONOSCE («Proveedores y Consorcios»):

```json
{
  "table_name": "stg_consorcios_raw",
  "primary_key": ["codigo_consorcio", "ruc_miembro"],
  "foreign_keys": [],
  "columns": [
    {
      "excel_column": "ruc_consorcio",
      "excel_aliases": [
        "ruc_consorcio",
        "codigo_consorcio",
        "cod_consorcio",
        "ruc_codigo_consorcio",
        "rucconsorcio",
        "codigoconsorcio",
        "ruc_proveedor",
        "codigo_postor"
      ],
      "sql_column": "codigo_consorcio",
      "sql_type": "VARCHAR(20)",
      "python_type": "str",
      "nullable": false
    },
    {
      "excel_column": "consorcio",
      "excel_aliases": [
        "consorcio",
        "nombre_consorcio",
        "razon_social_consorcio",
        "nombreconsorcio",
        "proveedor",
        "postor"
      ],
      "sql_column": "nombre_consorcio",
      "sql_type": "VARCHAR(255)",
      "python_type": "str",
      "nullable": true
    },
    {
      "excel_column": "ruc_miembro",
      "excel_aliases": [
        "ruc_miembro",
        "ruc_integrante",
        "ruc_consorciado",
        "numero_documento_miembro",
        "num_doc_miembro",
        "rucmiembro",
        "rucintegrante",
        "codigo_integrante",
        "ruc_socio"
      ],
      "sql_column": "ruc_miembro",
      "sql_type": "VARCHAR(20)",
      "python_type": "str",
      "nullable": false
    },
    {
      "excel_column": "nombre_miembro",
      "excel_aliases": [
        "nombre_miembro",
        "miembro",
        "integrante",
        "nombre_integrante",
        "razon_social_miembro",
        "razon_social_integrante",
        "consorciado",
        "nombremiembro",
        "socio"
      ],
      "sql_column": "nombre_miembro",
      "sql_type": "VARCHAR(255)",
      "python_type": "str",
      "nullable": false
    },
    {
      "excel_column": "codigoconvocatoria",
      "excel_aliases": [
        "codigoconvocatoria",
        "codigo_convocatoria",
        "cod_convocatoria"
      ],
      "sql_column": "codigo_convocatoria",
      "sql_type": "VARCHAR(20)",
      "python_type": "str",
      "nullable": true
    },
    {
      "excel_column": "n_item",
      "excel_aliases": [
        "n_item",
        "num_item",
        "numero_item",
        "item"
      ],
      "sql_column": "numero_item",
      "sql_type": "INT",
      "python_type": "int",
      "nullable": true
    },
    {
      "excel_column": "porcentaje_participacion",
      "excel_aliases": [
        "porcentaje_participacion",
        "participacion",
        "pct_participacion",
        "porcentaje",
        "porcentaje_obligacion"
      ],
      "sql_column": "porcentaje_declarado",
      "sql_type": "DECIMAL(6,2)",
      "python_type": "float",
      "nullable": true
    }
  ]
}
```

---

#### C. Actualización de `contracts_etl/src/config.py`
Añadir `"05_consorcios"` a `MODULE_ORDER` y `MODULE_CONFIG`:

```python
# En contracts_etl/src/config.py:
MODULE_ORDER: List[str] = [
    "01_convocatorias",
    "02_ofertantes",
    "03_adjudicaciones",
    "04_contratos",
    "05_consorcios"
]

MODULE_CONFIG: Dict[str, Dict[str, str]] = {
    "01_convocatorias": {
        "table_name": "convocatorias",
        "schema_file": "schema_convocatorias.json",
        "ddl_file": "01_create_convocatorias.sql"
    },
    "02_ofertantes": {
        "table_name": "ofertantes",
        "schema_file": "schema_ofertantes.json",
        "ddl_file": "02_create_ofertantes.sql"
    },
    "03_adjudicaciones": {
        "table_name": "adjudicaciones",
        "schema_file": "schema_adjudicaciones.json",
        "ddl_file": "03_create_adjudicaciones.sql"
    },
    "04_contratos": {
        "table_name": "contratos",
        "schema_file": "schema_contratos.json",
        "ddl_file": "04_create_contratos.sql"
    },
    "05_consorcios": {
        "table_name": "stg_consorcios_raw",
        "schema_file": "schema_consorcios.json",
        "ddl_file": "05_create_consorcios.sql"
    }
}
```

---

#### D. Actualización de `contracts_etl/src/transformer.py` (Soporte de Alias de Columnas y Limpieza de RUCs)
En `clean_and_transform()`, permitir que cada columna busque primero por `"excel_column"` y, si no está, busque cualquiera de los nombres en `"excel_aliases"`. Además, limpiar sufijos `.0` que Excel a veces añade a códigos numéricos:

```python
# En contracts_etl/src/transformer.py:
def _normalize_doc_code(val: Any) -> Optional[str]:
    """
    Normaliza códigos de documento (RUC o código de consorcio),
    eliminando '.0' de lecturas flotantes de Excel y espacios.
    """
    s = _normalize_string(val)
    if s is None:
        return None
    if s.endswith(".0"):
        s = s[:-2]
    return s.strip()

# Dentro de clean_and_transform() al buscar la columna en excel_cols_map:
    for col_def in columns_config:
        excel_col_name = col_def["excel_column"]
        aliases = col_def.get("excel_aliases", [excel_col_name])
        sql_col_name = col_def["sql_column"]
        python_type = col_def.get("python_type", "str")

        matched_key = excel_cols_map.get(excel_col_name.lower())
        if matched_key is None:
            for alias in aliases:
                if alias.lower() in excel_cols_map:
                    matched_key = excel_cols_map[alias.lower()]
                    break
```

---

#### E. Actualización de `contracts_etl/src/database.py` (Protección de Vistas y DDLs Existentes)
Modificar `check_tables_exist` y `execute_ddl` para que reconozca vistas (`convocatorias`) y **solo ejecute el DDL de la tabla faltante (`05_create_consorcios.sql`)**:

```python
# En contracts_etl/src/database.py:
def check_tables_exist(engine: Optional[Engine] = None) -> Dict[str, bool]:
    """
    Inspecciona y verifica si las tablas o vistas maestras existen en la base de datos.
    Incluye tanto BASE TABLES como VIEWS (ej. vista 'convocatorias' en BD 3FN).
    """
    eng = engine or get_engine()
    inspector = inspect(eng)
    existing_objects = set(inspector.get_table_names()) | set(inspector.get_view_names())

    result = {}
    for module_key, config in MODULE_CONFIG.items():
        tbl_name = config["table_name"]
        result[tbl_name] = tbl_name in existing_objects

    return result


def execute_ddl(
    engine: Optional[Engine] = None,
    ddl_dir: Optional[Path] = None,
    only_missing: bool = True
) -> None:
    """
    Ejecuta únicamente los scripts DDL de las tablas que aún no existen en la BD,
    protegiendo las tablas y vistas ya normalizadas en 3FN.
    """
    eng = engine or get_engine()
    directory = ddl_dir or DDL_DIR
    existing_status = check_tables_exist(eng) if only_missing else {}

    for module_key in MODULE_ORDER:
        tbl_name = MODULE_CONFIG[module_key]["table_name"]
        if only_missing and existing_status.get(tbl_name, False):
            logger.info(f"Omitiendo DDL de '{module_key}': '{tbl_name}' ya existe en la BD.")
            continue

        ddl_file_name = MODULE_CONFIG[module_key]["ddl_file"]
        ddl_path = directory / ddl_file_name
        if not ddl_path.exists():
            raise FileNotFoundError(f"Script DDL no encontrado: {ddl_path}")

        logger.info(f"Ejecutando script DDL: {ddl_file_name}")
        with open(ddl_path, "r", encoding="utf-8") as f:
            sql_content = f.read()

        statements = [stmt.strip() for stmt in sql_content.split(";") if stmt.strip()]
        with eng.begin() as conn:
            for statement in statements:
                conn.execute(text(statement))
```

---

## 4. Script Maestro de Normalización en Base de Datos (`contrataciones`) (Punto 3)

Una vez que el ETL haya cargado los archivos Excel de `data/raw/05_consorcios/` (`2022` al `2026`) hacia `stg_consorcios_raw` y marcado su estado como `COMPLETED` en `logs/etl_progress.json`, se ejecuta el siguiente script SQL en la base de datos `contrataciones` (puede invocarse automáticamente al final del ETL de `05_consorcios` o directamente en MySQL/WSL).

### 4.1. Archivo SQL: `contracts_etl/sql/queries/05_normalize_consorcios.sql`

```sql
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
    TRIM(s.ruc_miembro) AS numero_documento,
    MAX(TRIM(s.nombre_miembro)) AS razon_social,
    'PROVEEDOR' AS tipo_actor,
    CASE 
        WHEN TRIM(s.ruc_miembro) LIKE '20%' AND CHAR_LENGTH(TRIM(s.ruc_miembro)) = 11 THEN 'Persona Juridica'
        WHEN (TRIM(s.ruc_miembro) LIKE '10%' OR TRIM(s.ruc_miembro) LIKE '15%' OR TRIM(s.ruc_miembro) LIKE '17%')
             AND CHAR_LENGTH(TRIM(s.ruc_miembro)) = 11 THEN 'Persona Natural'
        ELSE 'Persona Juridica'
    END AS tipo_proveedor
FROM stg_consorcios_raw s
WHERE CHAR_LENGTH(TRIM(s.ruc_miembro)) >= 8
  AND UPPER(TRIM(s.nombre_miembro)) NOT LIKE 'CONSORCIO %'
GROUP BY TRIM(s.ruc_miembro)
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
    TRIM(s.codigo_consorcio) AS numero_documento,
    COALESCE(MAX(TRIM(s.nombre_consorcio)), CONCAT('CONSORCIO ', TRIM(s.codigo_consorcio))) AS razon_social,
    'PROVEEDOR' AS tipo_actor,
    'Consorcio' AS tipo_proveedor
FROM stg_consorcios_raw s
GROUP BY TRIM(s.codigo_consorcio)
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
```

---

## 5. Catálogo Completo de Consultas SQL Refactorizadas para Backend y Reportes

A continuación se documentan **todas las consultas SQL exactas** que deben actualizarse en [`src/cockpit/cockpit.service.ts`](file:///d:/UTP/II%20CICLO/SOFTWARE%20I/PROJECT/contracts/frontend/src/cockpit/cockpit.service.ts) y [`src/contratistas/contratistas.service.ts`](file:///d:/UTP/II%20CICLO/SOFTWARE%20I/PROJECT/contracts/frontend/src/contratistas/contratistas.service.ts) una vez creada y poblada la tabla `puente_actor_empresa`.

### 5.1. Consultas de Pantalla Principal (`src/cockpit/cockpit.service.ts`)

#### A. `SQL_KPIS` (Tarjetas Superiores del Cockpit)
- `total_contratos` y `monto_total_soles` del Estado miden el presupuesto global contratado.
- `contratistas_activos` ahora cuenta exclusivamente **empresas reales distintas** (`COUNT(DISTINCT pae.id_empresa_real)`), descontando consorcios ficticios.

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
        COUNT(DISTINCT cf.codigo_contrato, cf.numero_item) AS total_contratos,
        COALESCE(SUM(cf.monto_contratado_item), 0.00) AS monto_total_soles,
        (
            SELECT COUNT(DISTINCT pae.id_empresa_real)
            FROM contratos_filtrados cf2
            INNER JOIN puente_actor_empresa pae 
                ON cf2.id_contratista = pae.id_actor_original
        ) AS contratistas_activos
    FROM contratos_filtrados cf
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

#### B. `SQL_TOP10_CANTIDAD` y `SQL_TOP10_MONTO` (Rankings Principales de Empresas)
- Ya **nunca** aparece un consorcio en el Top 10.
- `monto_total_soles` suma exactamente el **valor adjudicado equitativo ($\text{Monto} / N$)** (`ROUND(c.monto_contratado_item * pae.factor_equitativo, 2)`).

```sql
-- SQL_TOP10_CANTIDAD (y análogo para SQL_TOP10_MONTO cambiando el ORDER BY)
SELECT 
    emp.numero_documento AS ruc,
    emp.razon_social AS proveedor,
    'INDIVIDUAL' AS tipo_proveedor,
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos,
    COALESCE(SUM(ROUND(c.monto_contratado_item * pae.factor_equitativo, 2)), 0.00) AS monto_total_soles
FROM contratos c
INNER JOIN puente_actor_empresa pae 
    ON c.id_contratista = pae.id_actor_original
INNER JOIN organizaciones emp 
    ON pae.id_empresa_real = emp.id_organizacion
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
GROUP BY emp.id_organizacion, emp.numero_documento, emp.razon_social
ORDER BY total_contratos DESC, monto_total_soles DESC
LIMIT 10;
```

---

### 5.2. Consultas de Auditoría Forense de Contratista (`src/contratistas/contratistas.service.ts`)

#### A. `search(query)` (Buscador Predictivo Libre de Consorcios)
- Busca exclusivamente sobre empresas reales presentes en `puente_actor_empresa` o `organizaciones` (excluyendo cualquier consorcio).
- Cuenta todos los contratos de la empresa (individuales + consorciados).

```sql
SELECT 
    emp.numero_documento AS ruc,
    emp.razon_social,
    'INDIVIDUAL' AS tipo_proveedor,
    COUNT(DISTINCT c.codigo_contrato, c.numero_item) AS total_contratos
FROM organizaciones emp
LEFT JOIN puente_actor_empresa pae 
    ON emp.id_organizacion = pae.id_empresa_real
LEFT JOIN contratos c 
    ON pae.id_actor_original = c.id_contratista
WHERE emp.tipo_actor IN ('PROVEEDOR', 'AMBOS')
  AND COALESCE(emp.tipo_proveedor, 'INDIVIDUAL') != 'Consorcio'
  AND emp.razon_social NOT LIKE 'CONSORCIO %'
  AND emp.razon_social NOT LIKE '%CONSORCIO%'
  AND (${isRuc ? 'emp.numero_documento LIKE ?' : 'emp.numero_documento LIKE ? OR emp.razon_social LIKE ?'})
GROUP BY emp.id_organizacion, emp.numero_documento, emp.razon_social
ORDER BY total_contratos DESC, emp.razon_social ASC
LIMIT 10;
```

#### B. `getSummary(ruc, year)` (Ficha de Identidad y 5 KPIs con Monto Dividido $1/N$)
- Suma el monto adjudicado dividido equitativamente (`ROUND(c.monto_contratado_item * pae.factor_equitativo, 2)`).
- Cuenta sus contratos y postulaciones tanto individuales como en consorcio.

```sql
WITH info_empresa AS (
    SELECT 
        o.id_organizacion,
        o.numero_documento AS ruc,
        o.razon_social,
        'EMPRESA' AS tipo_proveedor,
        COALESCE(o.departamento_sede, 'NO REGISTRADO') AS departamento_sede
    FROM organizaciones o
    WHERE o.numero_documento = ?
      AND COALESCE(o.tipo_proveedor, 'INDIVIDUAL') != 'Consorcio'
    LIMIT 1
),
actores_empresa AS (
    SELECT 
        pae.id_actor_original,
        pae.es_consorcio,
        pae.factor_equitativo
    FROM info_empresa ie
    INNER JOIN puente_actor_empresa pae 
        ON ie.id_organizacion = pae.id_empresa_real
),
contratos_empresa AS (
    SELECT 
        c.codigo_contrato,
        c.numero_item,
        c.codigo_convocatoria,
        -- Si la misma empresa figurara dos veces en el mismo contrato, se consolida:
        SUM(ROUND(c.monto_contratado_item * ae.factor_equitativo, 2)) AS monto_atribuido_item,
        conv.ruc_entidad,
        (
            SELECT COUNT(DISTINCT ofe.id_postor) 
            FROM ofertantes ofe 
            WHERE ofe.codigo_convocatoria = c.codigo_convocatoria 
              AND ofe.numero_item = c.numero_item
        ) AS cant_postores
    FROM contratos c
    INNER JOIN actores_empresa ae 
        ON c.id_contratista = ae.id_actor_original
    LEFT JOIN convocatorias conv 
        ON c.codigo_convocatoria = conv.codigo_convocatoria 
       AND c.numero_item = conv.numero_item
    WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
    GROUP BY c.codigo_contrato, c.numero_item, c.codigo_convocatoria, conv.ruc_entidad
),
postulaciones_empresa AS (
    SELECT 
        COUNT(DISTINCT ofe.codigo_convocatoria, ofe.numero_item) AS total_postulaciones
    FROM ofertantes ofe
    INNER JOIN actores_empresa ae 
        ON ofe.id_postor = ae.id_actor_original
    WHERE (? IS NULL OR YEAR(ofe.fecha_presentacion_propuesta) = ?)
)
SELECT 
    ie.ruc,
    ie.razon_social,
    ie.tipo_proveedor,
    ie.departamento_sede,
    COUNT(DISTINCT ce.codigo_contrato, ce.numero_item) AS total_contratos,
    COALESCE(SUM(ce.monto_atribuido_item), 0.00) AS monto_total_soles,
    COUNT(DISTINCT ce.ruc_entidad) AS entidades_distintas,
    ROUND(
        COALESCE(
            (SUM(CASE WHEN ce.cant_postores = 1 THEN 1 ELSE 0 END) * 100.0) / 
            NULLIF(COUNT(DISTINCT ce.codigo_contrato, ce.numero_item), 0),
            0.00
        ), 1
    ) AS tasa_postor_unico_pct,
    COALESCE(pe.total_postulaciones, 0) AS total_postulaciones,
    ROUND(
        COALESCE(
            (COUNT(DISTINCT ce.codigo_contrato, ce.numero_item) * 100.0) / 
            NULLIF(pe.total_postulaciones, 0),
            0.00
        ), 1
    ) AS win_rate_pct
FROM info_empresa ie
LEFT JOIN contratos_empresa ce ON 1=1
LEFT JOIN postulaciones_empresa pe ON 1=1
GROUP BY ie.ruc, ie.razon_social, ie.tipo_proveedor, ie.departamento_sede, pe.total_postulaciones;
```

#### C. `getClientes(ruc, year)`, `getTerritorio(ruc, year)` y `getTimeline(ruc)`
Las 3 consultas reemplazan `JOIN empresa_base eb ON c.id_contratista = eb.id_organizacion` por el puente `puente_actor_empresa` y suman el **monto adjudicado equitativo ($1/N$)**:

```sql
-- Patrón común de CTE para getClientes, getTerritorio y getTimeline:
WITH empresa_base AS (
    SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
),
actores_empresa AS (
    SELECT pae.id_actor_original, pae.factor_equitativo
    FROM empresa_base eb
    INNER JOIN puente_actor_empresa pae ON eb.id_organizacion = pae.id_empresa_real
),
contratos_empresa AS (
    SELECT 
        c.codigo_contrato,
        c.numero_item,
        c.codigo_convocatoria,
        c.fecha_suscripcion_contrato,
        ROUND(c.monto_contratado_item * ae.factor_equitativo, 2) AS monto_contratado_item,
        conv.ruc_entidad,
        conv.nombre_entidad,
        conv.departamento_item
    FROM contratos c
    INNER JOIN actores_empresa ae ON c.id_contratista = ae.id_actor_original
    LEFT JOIN convocatorias conv 
        ON c.codigo_convocatoria = conv.codigo_convocatoria 
       AND c.numero_item = conv.numero_item
    WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
)
-- A partir de aquí getClientes, getTerritorio y getTimeline agrupan sobre `contratos_empresa`
```

#### D. `getCompetidores(ruc, year)` (Red Forense de Rivales entre Empresas Reales)
- Traduce tanto los postores como los ganadores a **empresas reales** vía `puente_actor_empresa`.
- **Excluye a los socios del mismo consorcio en ese proceso** (`o_rival.id_postor != o_emp.id_postor`) para no confundir a un compañero de consorcio con un rival competidor.

```sql
WITH empresa_base AS (
    SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
),
actores_empresa AS (
    SELECT pae.id_actor_original
    FROM empresa_base eb
    INNER JOIN puente_actor_empresa pae ON eb.id_organizacion = pae.id_empresa_real
),
items_empresa AS (
    SELECT DISTINCT
        o.codigo_convocatoria, 
        o.numero_item,
        o.id_postor AS id_postor_propio
    FROM ofertantes o
    INNER JOIN actores_empresa ae ON o.id_postor = ae.id_actor_original
    WHERE (? IS NULL OR YEAR(o.fecha_presentacion_propuesta) = ?)
),
rivales_reales AS (
    SELECT DISTINCT
        pae_rival.id_empresa_real AS id_rival_real,
        ie.codigo_convocatoria,
        ie.numero_item
    FROM items_empresa ie
    INNER JOIN ofertantes o_rival 
        ON ie.codigo_convocatoria = o_rival.codigo_convocatoria 
       AND ie.numero_item = o_rival.numero_item
       AND o_rival.id_postor != ie.id_postor_propio -- No es el mismo consorcio
    INNER JOIN puente_actor_empresa pae_rival 
        ON o_rival.id_postor = pae_rival.id_actor_original
    INNER JOIN empresa_base eb 
        ON pae_rival.id_empresa_real != eb.id_organizacion
),
ganadores_reales AS (
    SELECT DISTINCT
        adj.codigo_convocatoria,
        adj.numero_item,
        pae_gan.id_empresa_real AS id_ganador_real
    FROM adjudicaciones adj
    INNER JOIN (SELECT DISTINCT codigo_convocatoria, numero_item FROM items_empresa) ie
        ON adj.codigo_convocatoria = ie.codigo_convocatoria 
       AND adj.numero_item = ie.numero_item
    INNER JOIN puente_actor_empresa pae_gan
        ON adj.id_proveedor = pae_gan.id_actor_original
)
SELECT 
    org.numero_documento AS ruc_rival,
    org.razon_social AS rival,
    COUNT(DISTINCT r.codigo_convocatoria, r.numero_item) AS procesos_competidos,
    COUNT(DISTINCT CASE WHEN g.id_ganador_real = eb.id_organizacion THEN CONCAT(r.codigo_convocatoria, '-', r.numero_item) END) AS victorias_empresa_consultada,
    COUNT(DISTINCT CASE WHEN g.id_ganador_real = r.id_rival_real THEN CONCAT(r.codigo_convocatoria, '-', r.numero_item) END) AS victorias_rival
FROM rivales_reales r
CROSS JOIN empresa_base eb
INNER JOIN organizaciones org ON r.id_rival_real = org.id_organizacion
LEFT JOIN ganadores_reales g 
    ON r.codigo_convocatoria = g.codigo_convocatoria 
   AND r.numero_item = g.numero_item
GROUP BY org.id_organizacion, org.numero_documento, org.razon_social, eb.id_organizacion
ORDER BY procesos_competidos DESC
LIMIT 10;
```

#### E. `getContratos(ruc, year, limit, offset)` y `exportarExcel(ruc, year)` (Acuerdo 2: Doble Monto + Etiqueta `"EN CONSORCIO (1/N)"`)
Devuelve para cada contrato:
- `es_consorcio`: `true` / `false`
- `etiqueta_modalidad`: `'INDIVIDUAL'` o `'EN CONSORCIO (1/3)'`
- `nombre_consorcio`: Nombre del consorcio (si fue en consorcio)
- `total_miembros`: $N$
- `monto_total_contrato`: El monto total original del contrato (`c.monto_contratado_item`)
- `monto_contratado_item` (Valor Adjudicado a la Empresa): El **monto dividido equitativamente ($\text{ROUND}(c.\text{monto\_contratado\_item} \times \text{pae.factor\_equitativo}, 2)$)**

```sql
WITH empresa_base AS (
    SELECT id_organizacion FROM organizaciones WHERE numero_documento = ? LIMIT 1
)
SELECT 
    c.codigo_contrato,
    c.numero_contrato,
    c.codigo_convocatoria,
    c.numero_item,
    conv.ruc_entidad,
    conv.nombre_entidad,
    conv.objeto_contractual,
    conv.tipo_proceso_seleccion,
    conv.descripcion_item,
    COALESCE(conv.departamento_item, 'NO REGISTRADO') AS departamento_item,
    COALESCE(conv.provincia_item, 'NO REGISTRADO') AS provincia_item,
    c.fecha_suscripcion_contrato,
    -- Monto Total Original de la Contratación:
    c.monto_contratado_item AS monto_total_contrato,
    -- Valor Adjudicado Oficial a la Empresa (Dividido equitativamente 1/N):
    ROUND(c.monto_contratado_item * pae.factor_equitativo, 2) AS monto_contratado_item,
    pae.es_consorcio,
    pae.etiqueta_modalidad,
    pae.nombre_consorcio,
    pae.total_miembros,
    pae.porcentaje_equitativo,
    (
        SELECT COUNT(DISTINCT o.id_postor)
        FROM ofertantes o
        WHERE o.codigo_convocatoria = c.codigo_convocatoria
          AND o.numero_item = c.numero_item
    ) AS cantidad_postores,
    CASE 
        WHEN (
            SELECT COUNT(DISTINCT o.id_postor)
            FROM ofertantes o
            WHERE o.codigo_convocatoria = c.codigo_convocatoria
              AND o.numero_item = c.numero_item
        ) = 1 THEN 1 
        ELSE 0 
    END AS es_postor_unico,
    COALESCE(c.tiene_resolucion, 'NO') AS tiene_resolucion,
    c.url_contrato
FROM contratos c
INNER JOIN puente_actor_empresa pae 
    ON c.id_contratista = pae.id_actor_original
INNER JOIN empresa_base eb 
    ON pae.id_empresa_real = eb.id_organizacion
LEFT JOIN convocatorias conv 
    ON c.codigo_convocatoria = conv.codigo_convocatoria 
   AND c.numero_item = conv.numero_item
WHERE (? IS NULL OR YEAR(c.fecha_suscripcion_contrato) = ?)
ORDER BY c.fecha_suscripcion_contrato DESC, monto_contratado_item DESC
LIMIT ? OFFSET ?;
```

---

## 6. Consultas de Verificación Post-Ejecución (Checklist para Base de Datos)

Una vez ejecutado el ETL y el script `05_normalize_consorcios.sql`, el agente de Base de Datos debe correr estas 3 consultas de control en WSL (`mysql -u etl_user -petl_password contrataciones`):

```sql
-- 1. Verificar cuántos consorcios e integrantes se cargaron y normalizaron:
SELECT 
    (SELECT COUNT(*) FROM stg_consorcios_raw) AS filas_staging_excel,
    (SELECT COUNT(DISTINCT id_consorcio) FROM consorcio_integrantes) AS consorcios_desagregados,
    (SELECT COUNT(*) FROM consorcio_integrantes) AS vinculos_consorcio_empresa,
    (SELECT COUNT(*) FROM puente_actor_empresa WHERE es_consorcio = 0) AS empresas_individuales_puente,
    (SELECT COUNT(*) FROM puente_actor_empresa WHERE es_consorcio = 1) AS miembros_consorcio_puente;

-- 2. Verificar que haya CERO consorcios infiltrados como empresa real en puente_actor_empresa:
SELECT COUNT(*) AS consorcios_infiltrados_debe_ser_cero
FROM puente_actor_empresa pae
INNER JOIN organizaciones emp ON pae.id_empresa_real = emp.id_organizacion
WHERE emp.tipo_proveedor = 'Consorcio' OR emp.razon_social LIKE 'CONSORCIO %';

-- 3. Ejemplo de auditoría: Ver un contrato en consorcio desagregado entre sus N empresas con su monto 1/N:
SELECT 
    c.numero_contrato,
    pae.nombre_consorcio,
    emp.numero_documento AS ruc_empresa_miembro,
    emp.razon_social AS empresa_miembro,
    pae.etiqueta_modalidad,
    c.monto_contratado_item AS monto_total_contrato,
    ROUND(c.monto_contratado_item * pae.factor_equitativo, 2) AS monto_adjudicado_empresa
FROM contratos c
INNER JOIN puente_actor_empresa pae ON c.id_contratista = pae.id_actor_original
INNER JOIN organizaciones emp ON pae.id_empresa_real = emp.id_organizacion
WHERE pae.es_consorcio = 1
LIMIT 10;
```
