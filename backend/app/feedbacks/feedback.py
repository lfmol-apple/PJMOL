import json
import os

def salvar_feedback(grupo, cota, tipo_feedback, mensagem, parcelas_feedback):
    pasta_feedback = os.path.join(os.path.dirname(__file__), "dados")
    os.makedirs(pasta_feedback, exist_ok=True)

    arquivo_feedback = os.path.join(pasta_feedback, f"feedback_{grupo}_{cota}.json")

    dados_feedback = {
        "grupo": grupo,
        "cota": cota,
        "tipo_feedback": tipo_feedback,
        "mensagem": mensagem,
        "parcelas_feedback": parcelas_feedback,
    }

    with open(arquivo_feedback, "w", encoding="utf-8") as f:
        json.dump(dados_feedback, f, ensure_ascii=False, indent=2)

    print(f"✅ Feedback salvo em: {arquivo_feedback}")
    return {"status": "ok", "arquivo": arquivo_feedback}
