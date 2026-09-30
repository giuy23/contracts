# Frontend & REST API: Cockpit Forense SEACE / OECE

Sistema fullstack para auditoría, análisis forense y visualización de contrataciones públicas del Estado Peruano (SEACE). Construido con **NestJS 11** en el backend y una interfaz de usuario modular en **Vanilla JavaScript (ES Modules)** estilizada con **Tailwind CSS**.

---

## 🏛️ Arquitectura del Sistema

El proyecto implementa una arquitectura desacoplada respetando principios **SOLID** y separación estricta de responsabilidades:

```
frontend/
├── src/                          # Backend NestJS (TypeScript)
│   ├── cockpit/                  # Módulo de analítica general (KPIs macro, rankings, objeto contractual)
│   ├── contratistas/             # Módulo forense por contratista (historial, duelos, concentración, Excel)
│   ├── filtros/                  # Módulo de metadatos dinámicos (años fiscales, departamentos, tipos)
│   ├── database/                 # Pool de conexiones MySQL 2 (Promise-based)
│   ├── app.module.ts             # Ensamblador de módulos y servidor estático
│   └── main.ts                   # Bootstrap de la aplicación
├── public/                       # Frontend Web (Cliente ligero sin frameworks pesados)
│   ├── css/                      # Tailwind CSS (input.css -> output.css minificado)
│   ├── js/
│   │   ├── main.js               # Lógica del Cockpit General (Pantalla Principal)
│   │   └── contratista/          # Módulos ES6 del Perfil Forense de Contratista
│   │       ├── api.service.js    # Cliente HTTP para endpoints de contratistas
│   │       ├── state.js          # Gestor de estado reactivo (Patrón Observer)
│   │       ├── kpi-sidebar.js    # Sidebar fijo con 5 KPIs verticales e indicadores de riesgo
│   │       ├── donut-chart.js    # Gráfico Donut SVG nativo interactivo con tooltip central
│   │       ├── timeline-events.js# Línea de tiempo cronológica con hitos y deltas interanuales
│   │       ├── clients-panel.js  # Top 10 entidades compradoras y análisis de captura
│   │       ├── rivals-panel.js   # Duelos directos / detección de colusión (Bid Rigging)
│   │       ├── contracts-table.js# Tabla de contratos adjudicados con acordeón de postores
│   │       ├── search-bar.js     # Buscador predictivo por RUC o Razón Social (Debounce)
│   │       └── app.js            # Orquestador del ciclo de vida y eventos DOM
│   ├── index.html                # Vista Principal: Cockpit Ejecutivo Macroeconómico
│   └── contratista.html          # Vista Secundaria: Expediente y Auditoría Forense
├── mockups/                      # Diseños de referencia visual y guías de estilo
├── context/                      # Historias de usuario, acuerdos de diseño y requerimientos SQL
├── package.json
└── tsconfig.json
```

---

## 🛠️ Tecnologías y Principios de Diseño

- **Backend:** NestJS 11, TypeScript 5, MySQL2 (Connection Pool), ExcelJS (streaming de auditoría XLSX multi-pestaña).
- **Frontend:** Vanilla JavaScript moderno (ES Modules nativos del navegador), Canvas API (fondo reticular sutil), SVG puro para visualización gráfica.
- **Estética Visual (Bushidō):** Bordes angulares rectos (`rounded-none`), paleta de tinta Sumi (`#0d0f12`), rojo cinabrio Vermilion (`#d32f2f`), pergamino Washi (`#f4efe6`) y tipografías *Cinzel*, *Space Grotesk* y *JetBrains Mono*.

---

## 🚀 Requisitos Previos

- **Node.js:** v18.0.0 o superior (recomendado v20+ o v24).
- **Base de Datos:** MySQL 8.0 con el esquema `contrataciones` poblado mediante el pipeline ETL.

---

## ⚙️ Configuración del Entorno

1. Copiar el archivo de variables de entorno de ejemplo:
   ```bash
   cp .env.example .env
   ```

2. Configurar las credenciales en `.env`:
   ```ini
   PORT=3000
   NODE_ENV=development

   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=etl_user
   DB_PASSWORD=tu_password
   DB_NAME=contrataciones
   DB_CONNECTION_LIMIT=10
   ```

---

## 📦 Instalación y Compilación

1. Instalar dependencias de Node:
   ```bash
   npm install
   ```

2. Compilar los estilos Tailwind CSS:
   ```bash
   npm run build:css
   ```

3. Compilar el backend NestJS:
   ```bash
   npm run build
   ```

---

## 🖥️ Ejecución

### Modo Desarrollo (con recarga automática):
```bash
npm run start:dev
```

### Modo Producción:
```bash
npm run start:prod
```

La aplicación estará disponible en:
- **Cockpit General:** [http://localhost:3000/index.html](http://localhost:3000/index.html)
- **Expediente Forense de Contratista:** [http://localhost:3000/contratista.html](http://localhost:3000/contratista.html)

---

## 📡 Catálogo de Endpoints REST

### 1. Filtros y Metadatos
- `GET /api/filtros/anios` — Lista de años fiscales con registros disponibles.
- `GET /api/filtros/departamentos` — Lista de departamentos de ejecución.
- `GET /api/filtros/tipos-proceso` — Catálogo de tipos de selección.

### 2. Cockpit General
- `GET /api/kpis?year=2026` — 4 KPIs de integridad y volumen macroeconómico.
- `GET /api/graficas/top-contratistas-contratos?year=2026&limit=10` — Ranking por cantidad de adjudicaciones.
- `GET /api/graficas/top-contratistas-monto?year=2026&limit=10` — Ranking por volumen de capital adjudicado.
- `GET /api/graficas/distribucion-objeto?year=2026` — Distribución porcentual (Bienes, Obras, Servicios, Consultorías).

### 3. Perfil Forense de Contratista
- `GET /api/v1/contratistas/search?q=CONSORCIO` — Búsqueda predictiva con autocompletado.
- `GET /api/v1/contratistas/:ruc/summary?year=2026` — Dossier de identidad y los 5 KPIs verticales.
- `GET /api/v1/contratistas/:ruc/clientes?year=2026&limit=10` — Top entidades compradoras.
- `GET /api/v1/contratistas/:ruc/territorio?year=2026` — Distribución porcentual por departamentos.
- `GET /api/v1/contratistas/:ruc/timeline` — Evolución anual multi-año (2022–2026) con deltas.
- `GET /api/v1/contratistas/:ruc/competidores?year=2026&limit=5` — Duelos directos y colusión.
- `GET /api/v1/contratistas/:ruc/contratos?year=2026&page=1&limit=10` — Historial de contratos paginados.
- `GET /api/v1/contratistas/postores-item/:convocatoria/:item` — Postores competidores en un ítem.
- `GET /api/v1/contratistas/:ruc/export-excel?year=2026` — Exportación a Excel multi-hoja con fórmulas y formato de auditoría.
