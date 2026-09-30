"""
Módulo de auditoría y trazabilidad del pipeline ETL.
Gestiona el estado persistente en logs/etl_progress.json con soporte para recuperación de fallos.
"""

from pathlib import Path
from typing import Dict, Any, Optional, List
import json
import logging
from datetime import datetime

from src.config import PROGRESS_FILE, MODULE_ORDER

logger = logging.getLogger(__name__)


class ProgressTracker:
    """
    Controlador del estado de procesamiento granular por módulo y archivo.
    """

    def __init__(self, progress_path: Optional[Path] = None):
        self.progress_path = progress_path or PROGRESS_FILE
        self.data: Dict[str, Any] = self._load()

    def _get_empty_structure(self) -> Dict[str, Any]:
        return {
            "last_run": datetime.now().isoformat(),
            "modules": {module: {} for module in MODULE_ORDER}
        }

    def _load(self) -> Dict[str, Any]:
        """
        Carga el archivo de estado o crea una estructura base si no existe.
        """
        if not self.progress_path.exists():
            structure = self._get_empty_structure()
            self._save_data(structure)
            return structure

        try:
            with open(self.progress_path, "r", encoding="utf-8") as f:
                content = json.load(f)
                # Asegurar que todos los módulos existan en la estructura
                if "modules" not in content:
                    content["modules"] = {}
                for module in MODULE_ORDER:
                    if module not in content["modules"]:
                        content["modules"][module] = {}
                return content
        except Exception as e:
            logger.warning(f"Error al leer {self.progress_path}: {e}. Inicializando nueva estructura.")
            structure = self._get_empty_structure()
            self._save_data(structure)
            return structure

    def _save_data(self, data: Dict[str, Any]) -> None:
        """
        Guarda los datos en disco asegurando formato legible y atómico.
        """
        self.progress_path.parent.mkdir(parents=True, exist_ok=True)
        data["last_run"] = datetime.now().isoformat()
        with open(self.progress_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def save(self) -> None:
        """
        Persiste el estado actual en disco.
        """
        self._save_data(self.data)

    def get_file_status(self, module_name: str, filename: str) -> Optional[Dict[str, Any]]:
        """
        Retorna la información registrada para un archivo específico si existe.
        """
        return self.data.get("modules", {}).get(module_name, {}).get(filename)

    def register_start(self, module_name: str, filename: str, year: int, part: int) -> None:
        """
        Registra el inicio de procesamiento de un archivo en estado IN_PROGRESS.
        """
        if module_name not in self.data["modules"]:
            self.data["modules"][module_name] = {}

        self.data["modules"][module_name][filename] = {
            "year": year,
            "part": part,
            "status": "IN_PROGRESS",
            "total_rows_excel": 0,
            "rows_inserted": 0,
            "rows_rejected": 0,
            "start_time": datetime.now().isoformat(),
            "end_time": None,
            "error_message": None
        }
        self.save()

    def register_success(
        self,
        module_name: str,
        filename: str,
        total_rows_excel: int,
        rows_inserted: int,
        rows_rejected: int
    ) -> None:
        """
        Registra la culminación exitosa de un archivo en estado COMPLETED.
        """
        record = self.data["modules"].get(module_name, {}).get(filename, {})
        record["status"] = "COMPLETED"
        record["total_rows_excel"] = total_rows_excel
        record["rows_inserted"] = rows_inserted
        record["rows_rejected"] = rows_rejected
        record["end_time"] = datetime.now().isoformat()
        record["error_message"] = None
        self.data["modules"][module_name][filename] = record
        self.save()

    def register_failure(
        self,
        module_name: str,
        filename: str,
        error_message: str,
        total_rows_excel: int = 0,
        rows_inserted: int = 0,
        rows_rejected: int = 0
    ) -> None:
        """
        Registra la detención por fallo de un archivo en estado FAILED con su mensaje de error.
        """
        record = self.data["modules"].get(module_name, {}).get(filename, {})
        record["status"] = "FAILED"
        record["total_rows_excel"] = total_rows_excel
        record["rows_inserted"] = rows_inserted
        record["rows_rejected"] = rows_rejected
        record["end_time"] = datetime.now().isoformat()
        record["error_message"] = str(error_message)
        self.data["modules"][module_name][filename] = record
        self.save()

    def is_completed(self, module_name: str, filename: str) -> bool:
        """
        Verifica si un archivo ya fue completado exitosamente con anterioridad.
        """
        record = self.get_file_status(module_name, filename)
        return bool(record and record.get("status") == "COMPLETED")

    def should_process(self, module_name: str, filename: str, resume_mode: bool = False) -> bool:
        """
        Determina si un archivo debe procesarse según el modo de ejecución.
        En modo resume_mode=True, solo se procesan archivos PENDING o FAILED.
        """
        if not resume_mode:
            return True
        return not self.is_completed(module_name, filename)

    def count_pending_files(self, scanned_data: Dict[str, Dict[int, List[Path]]]) -> int:
        """
        Calcula el número de archivos disponibles en disco que están pendientes o fallidos.
        """
        pending = 0
        for module_name, years_dict in scanned_data.items():
            for year, files in years_dict.items():
                for file_path in files:
                    if not self.is_completed(module_name, file_path.name):
                        pending += 1
        return pending

    def get_summary_statistics(self) -> Dict[str, Any]:
        """
        Genera un resumen acumulado de métricas de carga en todo el proyecto.
        """
        summary = {
            "total_files": 0,
            "completed": 0,
            "failed": 0,
            "in_progress": 0,
            "total_rows_excel": 0,
            "rows_inserted": 0,
            "rows_rejected": 0
        }
        for module_name, files in self.data.get("modules", {}).items():
            for filename, info in files.items():
                summary["total_files"] += 1
                status = info.get("status")
                if status == "COMPLETED":
                    summary["completed"] += 1
                elif status == "FAILED":
                    summary["failed"] += 1
                elif status == "IN_PROGRESS":
                    summary["in_progress"] += 1

                summary["total_rows_excel"] += info.get("total_rows_excel", 0)
                summary["rows_inserted"] += info.get("rows_inserted", 0)
                summary["rows_rejected"] += info.get("rows_rejected", 0)

        return summary

