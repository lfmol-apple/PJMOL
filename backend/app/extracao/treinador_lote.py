"""
Batch trainer that processes PDFs stored in extratos/sample, keeps structured
examples, and updates the per-administrator incremental learning metadata.
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Tuple

from app.aprendizado.aprendizado import atualizar_campos_aprendidos
from app.extracao.leitura_pdf import extrair_dados_pdf


ROOT_DIR = Path(__file__).resolve().parents[3]
APP_DIR = Path(__file__).resolve().parents[1]
DEFAULT_SAMPLE_DIR = ROOT_DIR / "extratos" / "sample"
EXEMPLOS_DIR = APP_DIR / "aprendizado" / "exemplos"
ADMIN_JSON_PATH = APP_DIR / "dados" / "administradoras.json"


def _slug(nome: str) -> str:
    base = unicodedata.normalize("NFKD", nome or "")
    ascii_only = base.encode("ascii", "ignore").decode("ascii")
    compact = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_only).strip("_").lower()
    return compact or "desconhecida"


def _default_json(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Objeto nao serializavel: {type(obj)}")


def _carregar_administradoras(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except Exception as exc:
        print(f"[WARN] Nao foi possivel ler {path}: {exc}")
    return {}


def _salvar_administradoras(path: Path, dados: Dict[str, str]) -> None:
    if not dados:
        return
    try:
        ordenado = dict(sorted(dados.items(), key=lambda item: item[0]))
        with open(path, "w", encoding="utf-8") as f:
            json.dump(ordenado, f, ensure_ascii=False, indent=2)
    except Exception as exc:
        print(f"[WARN] Nao foi possivel salvar {path}: {exc}")


def _armazenar_exemplo(destino: Path, arquivo: Path, dados: dict, parcelas: List[dict]) -> str:
    destino.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "arquivo": arquivo.name,
        "administradora": dados.get("administradora"),
        "dados": dados,
        "parcelas": parcelas,
    }
    with open(destino, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, default=_default_json)
    try:
        rel = destino.relative_to(EXEMPLOS_DIR)
        return str(rel)
    except ValueError:
        return destino.name


def _processar_pdf(
    arquivo: Path,
    sobrescrever: bool,
    admin_map: Dict[str, str],
) -> Tuple[str, str]:
    dados, parcelas = extrair_dados_pdf(str(arquivo))
    administradora = (dados.get("administradora") or "DESCONHECIDA").strip()
    slug = _slug(administradora)

    destino = EXEMPLOS_DIR / slug / f"{arquivo.stem}.json"

    if destino.exists() and not sobrescrever:
        return "skip", administradora

    rel_json = _armazenar_exemplo(destino, arquivo, dados, parcelas)

    campos_extraidos = sorted(dados.keys())
    atualizar_campos_aprendidos(
        administradora,
        {
            "ultimo_modelo": arquivo.name,
            "exemplo_salvo": rel_json,
            "campos_extraidos": campos_extraidos,
        },
    )

    cnpj = (dados.get("cnpj_administradora") or "").strip()
    if administradora and cnpj and administradora not in admin_map:
        admin_map[administradora] = cnpj

    return "ok", administradora


def processar_pasta(
    pasta: Path,
    sobrescrever: bool = False,
    limite: int | None = None,
) -> None:
    pasta = pasta.expanduser()
    if not pasta.is_absolute():
        pasta = (Path.cwd() / pasta).resolve()

    if not pasta.exists():
        print(f"[ERRO] Pasta nao encontrada: {pasta}")
        return

    EXEMPLOS_DIR.mkdir(parents=True, exist_ok=True)
    admin_map = _carregar_administradoras(ADMIN_JSON_PATH)

    encontrados = sorted(pasta.glob("*.pdf"))
    if not encontrados:
        print(f"[INFO] Nenhum PDF encontrado em {pasta}")
        return

    total = 0
    pulados = 0
    erros: List[Tuple[str, str]] = []
    novos_modelos: List[str] = []

    for arquivo in encontrados:
        if limite is not None and total >= limite:
            break
        try:
            status, administradora = _processar_pdf(arquivo, sobrescrever, admin_map)
        except Exception as exc:
            erros.append((arquivo.name, str(exc)))
            print(f"[ERRO] {arquivo.name}: {exc}")
            continue

        if status == "ok":
            total += 1
            if administradora not in novos_modelos:
                novos_modelos.append(administradora)
            print(f"[OK] {arquivo.name} -> {administradora}")
        elif status == "skip":
            pulados += 1
            print(f"[SKIP] {arquivo.name} (ja processado)")

    _salvar_administradoras(ADMIN_JSON_PATH, admin_map)

    print("\n=== Resumo do treinamento ===")
    print(f"Processados com sucesso: {total}")
    print(f"Pulados (ja existentes): {pulados}")
    print(f"Erros: {len(erros)}")
    if novos_modelos:
        print("Administradoras cobertas neste lote:")
        for nome in sorted(novos_modelos):
            print(f"  - {nome}")
    if erros:
        print("\nFalhas detalhadas:")
        for nome, msg in erros:
            print(f"  - {nome}: {msg}")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Processa PDFs de extratos em lote e alimenta o aprendizado local.",
    )
    parser.add_argument(
        "--pasta",
        type=Path,
        default=DEFAULT_SAMPLE_DIR,
        help=f"Pasta com PDFs (padrao: {DEFAULT_SAMPLE_DIR})",
    )
    parser.add_argument(
        "--sobrescrever",
        action="store_true",
        help="Reprocessa arquivos mesmo que um exemplo ja exista.",
    )
    parser.add_argument(
        "--limite",
        type=int,
        default=None,
        help="Processa apenas os N primeiros arquivos.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    processar_pasta(
        pasta=args.pasta,
        sobrescrever=args.sobrescrever,
        limite=args.limite,
    )
