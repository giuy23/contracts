"""
Prueba de integración end-to-end del pipeline ETL contra MySQL.
Valida carga relacional, inserción idempotente con INSERT IGNORE y segregación de rechazados.
"""

import pytest
import pandas as pd
from pathlib import Path
from sqlalchemy import text
from src.database import get_engine
from src.loader import SEACELoader
from src.tracker import ProgressTracker


def test_end_to_end_etl_pipeline(tmp_path: Path):
    engine = get_engine()
    tracker_file = tmp_path / "logs" / "etl_progress.json"
    rejected_dir = tmp_path / "rejected"
    tracker = ProgressTracker(progress_path=tracker_file)

    loader = SEACELoader(
        engine=engine,
        rejected_dir=rejected_dir,
        chunk_size=100
    )

    # Identificadores de prueba únicos
    test_conv_id = "CONV-TEST-2022-99"
    test_item = 1
    test_ruc_entidad = "20131312955"
    test_ruc_postor = "20555555551"
    test_contrato_id = "CTR-TEST-99"

    # 1. Crear Excel para Convocatorias (1 válida, 1 duplicada, 1 con PK nula)
    conv_file = tmp_path / "CONOSCE_CONVOCATORIAS2022_0.xlsx"
    df_conv = pd.DataFrame({
        "entidad_ruc": [test_ruc_entidad, test_ruc_entidad, test_ruc_entidad],
        "entidad": ["HOSPITAL NACIONAL", "HOSPITAL NACIONAL", "HOSPITAL NACIONAL"],
        "codigoconvocatoria": [test_conv_id, test_conv_id, None],
        "n_item": [test_item, test_item, 2],
        "montoreferencial": ["S/. 50,000.00", "50000", "1000"],
        "fecha_convocatoria": ["2022-01-15", "2022-01-15", "2022-01-15"]
    })
    df_conv.to_excel(conv_file, index=False)

    # 2. Crear Excel para Ofertantes (1 válida)
    ofert_file = tmp_path / "CONOSCE_POSTOR2022_0.xlsx"
    df_ofert = pd.DataFrame({
        "codigo_convocatoria": [test_conv_id],
        "fechaconvocatoria": ["2022-01-15"],
        "n_item": [test_item],
        "ruc_codigo_postor": [test_ruc_postor],
        "postor": ["PROVEEDOR TEST SAC"],
        "fecha_presentacion_propuesta": ["2022-01-20 10:00:00"]
    })
    df_ofert.to_excel(ofert_file, index=False)

    # 3. Crear Excel para Adjudicaciones (1 válida)
    adj_file = tmp_path / "CONOSCE_ADJUDICACIONES2022_0.xlsx"
    df_adj = pd.DataFrame({
        "entidad_ruc": [test_ruc_entidad],
        "codigoconvocatoria": [test_conv_id],
        "n_item": [test_item],
        "ruc_proveedor": [test_ruc_postor],
        "proveedor": ["PROVEEDOR TEST SAC"],
        "monto_adjudicado_item_soles": ["48,500.00"],
        "fecha_buenapro": ["2022-02-01"]
    })
    df_adj.to_excel(adj_file, index=False)

    # 4. Crear Excel para Contratos (1 válida)
    ctr_file = tmp_path / "CONOSCE_CONTRATOS2022_0.xlsx"
    df_ctr = pd.DataFrame({
        "codigoconvocatoria": [test_conv_id],
        "codigo_contrato": [test_contrato_id],
        "n_cod_contrato": [999001],
        "num_item": [test_item],
        "monto_contratado_item": ["48500.00"],
        "ruc_contratista": [test_ruc_postor],
        "fecha_suscripcion_contrato": ["2022-02-15"]
    })
    df_ctr.to_excel(ctr_file, index=False)

    # EJECUCIÓN EN SECUENCIA RELACIONAL
    # Paso 1: Convocatorias
    total_e, total_ins, total_rej = loader.load_file(conv_file, "01_convocatorias", tracker)
    assert total_e == 3
    assert total_ins == 2  # 2 válidas enviadas al motor con INSERT IGNORE
    assert total_rej == 1  # 1 rechazada por PK nula
    assert tracker.is_completed("01_convocatorias", conv_file.name)

    # Paso 2: Ofertantes
    total_e, total_ins, total_rej = loader.load_file(ofert_file, "02_ofertantes", tracker)
    assert total_ins == 1
    assert tracker.is_completed("02_ofertantes", ofert_file.name)

    # Paso 3: Adjudicaciones
    total_e, total_ins, total_rej = loader.load_file(adj_file, "03_adjudicaciones", tracker)
    assert total_ins == 1
    assert tracker.is_completed("03_adjudicaciones", adj_file.name)

    # Paso 4: Contratos
    total_e, total_ins, total_rej = loader.load_file(ctr_file, "04_contratos", tracker)
    assert total_ins == 1
    assert tracker.is_completed("04_contratos", ctr_file.name)

    # VERIFICACIÓN EN BASE DE DATOS
    with engine.connect() as conn:
        res_conv = conn.execute(
            text("SELECT COUNT(*) FROM convocatorias WHERE codigo_convocatoria = :cid"),
            {"cid": test_conv_id}
        ).scalar()
        assert res_conv == 1  # Solo 1 insertada por primary key única

        res_ofert = conn.execute(
            text("SELECT COUNT(*) FROM ofertantes WHERE codigo_convocatoria = :cid"),
            {"cid": test_conv_id}
        ).scalar()
        assert res_ofert == 1

        res_adj = conn.execute(
            text("SELECT COUNT(*) FROM adjudicaciones WHERE codigo_convocatoria = :cid"),
            {"cid": test_conv_id}
        ).scalar()
        assert res_adj == 1

        res_ctr = conn.execute(
            text("SELECT COUNT(*) FROM contratos WHERE codigo_convocatoria = :cid"),
            {"cid": test_conv_id}
        ).scalar()
        assert res_ctr == 1

    # VERIFICACIÓN DE MODO REANUDAR
    # Al volver a llamar con resume_mode=True, debe saltar los completados
    assert tracker.should_process("01_convocatorias", conv_file.name, resume_mode=True) is False

    # LIMPIEZA DE DATOS DE PRUEBA
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM contratos WHERE codigo_convocatoria = :cid"), {"cid": test_conv_id})
        conn.execute(text("DELETE FROM adjudicaciones WHERE codigo_convocatoria = :cid"), {"cid": test_conv_id})
        conn.execute(text("DELETE FROM ofertantes WHERE codigo_convocatoria = :cid"), {"cid": test_conv_id})
        conn.execute(text("DELETE FROM convocatorias WHERE codigo_convocatoria = :cid"), {"cid": test_conv_id})

