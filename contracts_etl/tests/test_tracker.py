"""
Pruebas unitarias para src/tracker.py.
"""

import pytest
import json
from pathlib import Path
from src.tracker import ProgressTracker


def test_tracker_initialization(tmp_path: Path):
    progress_file = tmp_path / "logs" / "etl_progress.json"
    tracker = ProgressTracker(progress_path=progress_file)

    assert progress_file.exists()
    assert "modules" in tracker.data
    assert "01_convocatorias" in tracker.data["modules"]


def test_tracker_state_transitions(tmp_path: Path):
    progress_file = tmp_path / "logs" / "etl_progress.json"
    tracker = ProgressTracker(progress_path=progress_file)

    module = "01_convocatorias"
    filename = "TEST_CONVOCATORIAS2022_0.xlsx"

    # 1. Start
    tracker.register_start(module, filename, year=2022, part=0)
    status = tracker.get_file_status(module, filename)
    assert status is not None
    assert status["status"] == "IN_PROGRESS"
    assert status["year"] == 2022
    assert not tracker.is_completed(module, filename)

    # 2. Failure
    tracker.register_failure(module, filename, error_message="Simulated connection error")
    status = tracker.get_file_status(module, filename)
    assert status["status"] == "FAILED"
    assert "Simulated" in status["error_message"]
    assert not tracker.is_completed(module, filename)

    # In resume mode, should process failed files
    assert tracker.should_process(module, filename, resume_mode=True) is True

    # 3. Success
    tracker.register_success(module, filename, total_rows_excel=100, rows_inserted=98, rows_rejected=2)
    status = tracker.get_file_status(module, filename)
    assert status["status"] == "COMPLETED"
    assert status["rows_inserted"] == 98
    assert status["rows_rejected"] == 2
    assert tracker.is_completed(module, filename)

    # In resume mode, should skip completed files
    assert tracker.should_process(module, filename, resume_mode=True) is False
    # In regular mode, should process even if completed
    assert tracker.should_process(module, filename, resume_mode=False) is True

