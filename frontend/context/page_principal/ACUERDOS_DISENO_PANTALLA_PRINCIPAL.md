# Acuerdos de Arquitectura y Diseño: Pantalla Principal (Visión General)
## Proyecto: Cockpit Forense SEACE / OECE (NestJS + Tailwind + MySQL)

Este documento consolida todos los acuerdos tomados para la composición y funcionamiento de la pantalla principal del frontend.

---

### 1. Navegación entre Pantallas ("Sidebar" Horizontal)
* **Formato:** Barra de navegación horizontal integrada en la cabecera (tal como fue concebida en el mockup original bajo la clase `tab-btn` y contenedor con muescas `corner-bracket`).
* **Estética:** *Bushidō / Sumi & Cinnabar* (fondo carbón `sumi-deep`, borde bermellón `#9E1B1E`, detalles dorados y muescas `✦`).
* **Suite de Pantallas:**
  1. `01. VISIÓN GENERAL` *(Pantalla Principal Activa)*: Métricas macro, filtros globales, ranking de contratistas y gráficas de modalidad y entidades.
  2. `02. FASE 1: COMPETENCIA & BANDERAS ROJAS` *(Página Secundaria)*: Análisis profundo de postores únicos, descalificaciones masivas y embudo de puja.
  3. `03. EXPLORADOR POR ÍTEM & TERRITORIO` *(Página Secundaria)*: Desglose por provincias y distritos para detectar qué regiones concentran contratos y anomalías.
  4. `04. AUDITORÍA FORENSE SHA-256` *(Página Secundaria)*: Buscador de contratistas por RUC, trazabilidad de socios de consorcio y expedientes con huella criptográfica.

---

### 2. Filtros Generales y Cascada Territorial
Todos los selectores se alimentarán de datos reales de la base de datos MySQL mediante endpoints en NestJS:

1. **Año Fiscal:**
   * Generado dinámicamente mediante JavaScript del año `2022` al `2026`.
   * El año actual (`2026`) se selecciona por defecto.
2. **Mes / Periodo:**
   * Selector estrictamente mensual (sin trimestres ni cuartiles):
     * `Todos los meses (Año completo)`
     * `Enero` (01), `Febrero` (02), `Marzo` (03), `Abril` (04), `Mayo` (05), `Junio` (06), `Julio` (07), `Agosto` (08), `Setiembre` (09), `Octubre` (10), `Noviembre` (11), `Diciembre` (12).
3. **Ubicación Territorial en Cascada:**
   * **Departamento:** Carga inicial desde el backend (`SELECT DISTINCT departamento_item...`).
   * **Provincia:** Al seleccionar un departamento, se consulta al backend por las provincias de dicho departamento. Si cambia el departamento, provincia y distrito se reinician a vacío.
   * **Distrito:** Al seleccionar una provincia, se consulta al backend por los distritos correspondientes. Si cambia la provincia, distrito se reinicia a vacío.
4. **Filtros Operativos Adicionales (Desde la DB):**
   * **Modalidad de Contratación / Tipo de Proceso:** Licitación Pública, Concurso Público, Adjudicación Simplificada, Contratación Directa, etc.
   * **Estado del Ítem / Contratación:** Adjudicado, Consentido, etc.
   *(Nota: Se descartaron el filtro de moneda y el input de búsqueda en portada para mantener la barra ligera y sin ruido).*

---

### 3. Las 4 Tarjetas KPI Clave (Cards Superiores)
La fila superior contiene 4 tarjetas densas en información:

1. **KPI 1: Total de Contratos Formalizados:**
   * Muestra la cantidad total de contratos perfeccionados en el ejercicio filtrado.
2. **KPI 2: Monto Total Contratado (PEN S/):**
   * Muestra el volumen económico formalizado en moneda nacional.
3. **KPI 3: Contratistas Activos (RUCs Únicos):**
   * Muestra la cantidad de empresas y personas naturales adjudicadas distintas (diversidad de mercado).
4. **KPI 4: Tasa de Postor Único / Banderas Rojas (%):**
   * Muestra el porcentaje crítico de procedimientos entregados a un solo postor sin competencia en puja.

---

### 4. Gráficas Seleccionadas para la Portada (Regla de 2 a 3)

1. **Gráfica 1 — Ranking Top 10 Contratistas & Consorcios (Con Toggle):**
   * Vista de barras horizontales relativas con selector:
     * *Por Monto Adjudicado (S/)*: Concentración económica de recursos.
     * *Por Cantidad de Contratos*: Proveedores hiper-recurrentes.
2. **Gráfica 2 (Opción B) — Distribución por Tipo de Proceso de Selección (Transparencia / Competencia):**
   * Gráfica que desglosa contratos y montos por modalidad (Licitación Pública vs Adjudicación Simplificada vs Contratación Directa a dedo).
3. **Gráfica 3 (Opción C) — Top 10 Entidades Convocantes con Mayor Presupuesto Asignado:**
   * Ranking de los organismos y ministerios públicos que mayor presupuesto formalizaron (MTC Provías, EsSalud, Ministerios, GOREs).
