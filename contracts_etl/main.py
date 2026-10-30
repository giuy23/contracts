"""
Orquestador principal del pipeline ETL SEACE - Fase 1.
Provee menú interactivo por consola y soporte CLI para automatización.
"""

import sys
import argparse
import time
import logging
from typing import List, Optional

from src.config import (
    RAW_DATA_DIR,
    SCHEMAS_DIR,
    REJECTED_DATA_DIR,
    CHUNK_SIZE,
    MODULE_ORDER,
    LOG_FILE
)
from src.database import (
    get_engine,
    test_connection,
    execute_ddl,
    check_tables_exist,
    execute_consorcios_normalization
)
from src.tracker import ProgressTracker
from src.utils import scan_raw_data, get_available_years
from src.loader import SEACELoader

# Configuración de Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("etl_main")


def print_header(available_years: List[int], pending_files_count: int) -> None:
    """
    Imprime el encabezado oficial del sistema de ingesta según R-02.
    """
    years_str = ", ".join(map(str, available_years)) if available_years else "Ninguno detectado"
    print("\n" + "=" * 60)
    print("  SISTEMA DE INGESTA SEACE - FASE 1 (CONTROL DE PROCESOS)")
    print("=" * 60)
    print("Estado actual detectado en disco:")
    print(f" • Años disponibles: {years_str}")
    print(f" • Archivos pendientes en etl_progress.json: {pending_files_count}")
    print("\nSeleccione una modalidad de ejecución:")
    print(" [1] Procesar un año en específico (Solicitará ingresar el año)")
    print(" [2] Procesar todos los años encontrados en data/raw/")
    print(" [3] Modo Reanudar / Completar pendientes (Solo procesa fallidos o no iniciados)")
    print(" [4] Salir")


def run_pipeline(
    target_years: Optional[List[int]] = None,
    resume_mode: bool = False,
    target_modules: Optional[List[str]] = None
) -> None:
    """
    Ejecuta el pipeline ETL. Por acuerdo de arquitectura (ARCH-CONSORCIOS-001),
    por defecto procesa exclusivamente '05_consorcios' protegiendo las tablas 01-04 ya normalizadas.
    """
    start_total_time = time.time()
    engine = get_engine()

    # Verificar conexión a MySQL
    if not test_connection(engine):
        print("\n[ERROR CRITICO] No se pudo establecer conexión con la base de datos MySQL.")
        print("Verifique que el servicio MySQL esté iniciado y las credenciales en .env sean correctas.")
        sys.exit(1)

    # Verificar existencia de tablas maestras (incluyendo vistas 3FN)
    tables_status = check_tables_exist(engine)
    missing_tables = [t for t, exists in tables_status.items() if not exists]
    if missing_tables:
        print(f"\n[AVISO] Se detectaron tablas faltantes en la base de datos: {missing_tables}")
        print("Ejecutando scripts DDL de inicialización únicamente para tablas faltantes...")
        execute_ddl(engine, only_missing=True)

    # Escanear datasets y preparar el tracker
    tracker = ProgressTracker()
    scanned_data = scan_raw_data(RAW_DATA_DIR)
    available_years = get_available_years(scanned_data)

    if not available_years:
        print("\n[AVISO] No se encontraron archivos Excel (.xlsx/.xls) en 'data/raw/'.")
        return

    # Filtrar años y módulos a procesar (Acuerdo 1: solo 05_consorcios por defecto)
    years_to_process = target_years if target_years is not None else available_years
    modules_to_process = target_modules if target_modules is not None else ["05_consorcios"]

    print("\n" + "=" * 60)
    print(f"INICIANDO PIPELINE ETL | Modo: {'Reanudar' if resume_mode else 'Completo'}")
    print(f"Módulos activos: {modules_to_process}")
    print(f"Años seleccionados: {years_to_process}")
    print("=" * 60)

    loader = SEACELoader(
        engine=engine,
        schemas_dir=SCHEMAS_DIR,
        rejected_dir=REJECTED_DATA_DIR,
        chunk_size=CHUNK_SIZE
    )

    grand_total_excel = 0
    grand_total_inserted = 0
    grand_total_rejected = 0
    files_processed_count = 0

    # Iterar sobre los módulos objetivo respetando el orden
    for module_name in MODULE_ORDER:
        if module_name not in modules_to_process:
            continue

        module_files_by_year = scanned_data.get(module_name, {})

        for year in years_to_process:
            files_list = module_files_by_year.get(year, [])
            for file_path in files_list:
                # Si estamos en modo reanudación y el archivo ya está completado, saltar
                if resume_mode and tracker.is_completed(module_name, file_path.name):
                    continue

                files_processed_count += 1
                try:
                    rows_excel, rows_ins, rows_rej = loader.load_file(
                        file_path=file_path,
                        module_name=module_name,
                        tracker=tracker,
                        resume_mode=resume_mode
                    )
                    grand_total_excel += rows_excel
                    grand_total_inserted += rows_ins
                    grand_total_rejected += rows_rej
                except Exception as e:
                    logger.error(f"Fallo en archivo {file_path.name}: {e}")
                    # Continuar con los siguientes archivos registrando la falla

    # Si se procesó 05_consorcios, ejecutar normalización 3FN y construcción de puente_actor_empresa
    if "05_consorcios" in modules_to_process:
        print("\n[NORMALIZACIÓN 3FN] Ejecutando 05_normalize_consorcios.sql (consorcio_integrantes y puente_actor_empresa)...")
        execute_consorcios_normalization(engine)
        print("[NORMALIZACIÓN 3FN] Tablas normalizadas y puente 1/N actualizados correctamente.")

    total_duration = time.time() - start_total_time
    print("\n" + "=" * 60)
    print("           RESUMEN FINAL DE EJECUCIÓN ETL")
    print("=" * 60)
    print(f" Archivos procesados en esta sesión: {files_processed_count}")
    print(f" Registros leídos de Excel:         {grand_total_excel:,}")
    print(f" Registros insertados en MySQL:     {grand_total_inserted:,}")
    print(f" Registros rechazados (en CSV):     {grand_total_rejected:,}")
    print(f" Tiempo total transcurrido:         {total_duration:.2f} segundos")
    print("=" * 60 + "\n")


def interactive_menu() -> None:
    """
    Despliega el menú interactivo CLI.
    """
    tracker = ProgressTracker()
    scanned = scan_raw_data(RAW_DATA_DIR)
    available_years = get_available_years(scanned)
    pending_count = tracker.count_pending_files(scanned)

    while True:
        print_header(available_years, pending_count)
        choice = input("Ingrese una opción [1-4]: ").strip()

        if choice == "1":
            if not available_years:
                print("\n[ALERTA] No hay datasets disponibles en 'data/raw/'.")
                continue

            year_input = input("Ingrese el año fiscal a procesar: ").strip()
            try:
                selected_year = int(year_input)
                if selected_year not in available_years:
                    print(
                        f"\n[ALERTA] El año {selected_year} no tiene archivos en data/raw/. "
                        f"Años disponibles: {available_years}"
                    )
                    continue

                run_pipeline(target_years=[selected_year], resume_mode=False)
                # Actualizar estado de pendientes tras la ejecución
                pending_count = tracker.count_pending_files(scan_raw_data(RAW_DATA_DIR))
            except ValueError:
                print("\n[ALERTA] Ingrese un año numérico válido (ej. 2018).")

        elif choice == "2":
            if not available_years:
                print("\n[ALERTA] No hay datasets disponibles en 'data/raw/'.")
                continue
            run_pipeline(target_years=None, resume_mode=False)
            pending_count = tracker.count_pending_files(scan_raw_data(RAW_DATA_DIR))

        elif choice == "3":
            run_pipeline(target_years=None, resume_mode=True)
            pending_count = tracker.count_pending_files(scan_raw_data(RAW_DATA_DIR))

        elif choice == "4":
            print("\nSaliendo del sistema de ingesta SEACE. ¡Hasta luego!")
            sys.exit(0)

        else:
            print("\n[ALERTA] Opción no válida. Ingrese un número entre 1 y 4.")


def main() -> None:
    """
    Punto de entrada de la aplicación con soporte para banderas CLI o menú interactivo.
    """
    parser = argparse.ArgumentParser(
        description="Pipeline ETL SEACE - Ingesta Dinámica de Contrataciones Estatales"
    )
    parser.add_argument("--year", type=int, help="Procesar un año específico (ej. 2022)")
    parser.add_argument("--all", action="store_true", help="Procesar todos los años disponibles")
    parser.add_argument("--resume", action="store_true", help="Modo reanudación de pendientes/fallidos")
    parser.add_argument("--module", type=str, default="05_consorcios", help="Módulo a procesar (por defecto: 05_consorcios)")
    parser.add_argument("--init-db", action="store_true", help="Inicializar esquema relacional faltante en MySQL")
    parser.add_argument("--normalize-consorcios", action="store_true", help="Ejecutar normalización 3FN de consorcios")

    args = parser.parse_args()

    if args.init_db:
        print("Inicializando tablas faltantes en base de datos MySQL con scripts DDL...")
        execute_ddl(only_missing=True)
        print("Inicialización completada.")
        if not (args.year or args.all or args.resume or args.normalize_consorcios):
            return

    if args.normalize_consorcios and not (args.year or args.all or args.resume):
        print("Ejecutando normalización 3FN de consorcios y tabla puente...")
        execute_consorcios_normalization()
        print("Normalización completada.")
        return

    target_mods = [args.module] if args.module else ["05_consorcios"]

    if args.year:
        run_pipeline(target_years=[args.year], resume_mode=args.resume, target_modules=target_mods)
    elif args.all:
        run_pipeline(target_years=None, resume_mode=args.resume, target_modules=target_mods)
    elif args.resume:
        run_pipeline(target_years=None, resume_mode=True, target_modules=target_mods)
    else:
        interactive_menu()


if __name__ == "__main__":
    main()

