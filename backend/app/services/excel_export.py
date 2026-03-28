"""Geração de arquivos Excel a partir de DataFrames (execução de workflow)."""

import io
import logging
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)


def dataframe_to_xlsx_bytes(
    df: pd.DataFrame,
    sheet_name: str = "Resultado",
) -> bytes:
    """Serializa um DataFrame em bytes .xlsx."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name=sheet_name[:31], index=False)
    buf.seek(0)
    return buf.read()


def safe_sheet_name(name: str) -> str:
    """Excel limita nome da aba a 31 caracteres."""
    n = "".join(c for c in name if c not in r'[]:*?/\\')
    return (n or "Resultado")[:31]
