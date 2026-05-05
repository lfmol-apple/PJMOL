import pytesseract
import fitz  # PyMuPDF
from PIL import Image
import io
import re
import itertools

def ocr_ajuste(caminho_pdf, parcelas_atuais, diferenca):
    print(f"\n🔍 Buscando diferença com OCR avançado... (restante: {diferenca})")
    try:
        doc = fitz.open(caminho_pdf)
        candidatos = []

        for page_num, page in enumerate(doc):
            pix = page.get_pixmap(dpi=300)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            texto = pytesseract.image_to_string(img, lang="por")

            linhas = texto.split("\n")
            for linha in linhas:
                if not re.search(r"\d{2}/\d{2}/\d{4}", linha):
                    continue

                data_match = re.search(r"\d{2}/\d{2}/\d{4}", linha)
                valores = re.findall(r"\d{1,3}(?:\.\d{3})*,\d{2}", linha)

                for val in valores:
                    valor_float = float(val.replace(".", "").replace(",", "."))
                    if valor_float > 0.1:
                        candidatos.append({
                            "data_pagamento": data_match.group(),
                            "valor_pago": round(valor_float, 2),
                            "conf": abs(valor_float - diferenca)
                        })

        # Ordena pela menor diferença em relação à diferença esperada
        candidatos.sort(key=lambda x: x["conf"])

        # Tenta encontrar a combinação que zera a diferença
        valores_unicos = [c for c in candidatos if all(c != p for p in parcelas_atuais)]
        for r in range(1, min(4, len(valores_unicos)) + 1):
            for combinacao in itertools.combinations(valores_unicos, r):
                soma = round(sum(p["valor_pago"] for p in combinacao), 2)
                if abs(soma - diferenca) < 0.01:
                    print("📌 OCR identificou combinação para fechar a diferença:")
                    for p in combinacao:
                        print(f"  → {p['data_pagamento']} — R$ {p['valor_pago']:.2f}")
                        parcelas_atuais.append(p)
                    return combinacao[0]  # retorna um deles só para registro

        if candidatos:
            print("⚠️ OCR tentou, mas nenhuma combinação fechou exatamente a diferença.")

    except Exception as e:
        print(f"❌ Erro no OCR avançado: {e}")

    return None
