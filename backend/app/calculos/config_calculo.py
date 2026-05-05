from datetime import datetime
from enum import Enum
from typing import Optional


class IndiceCorrecao(str, Enum):
    TJMG = "TJMG"
    IPCA = "IPCA"
    INPC = "INPC"  # ✅ Novo índice incluído


class ConfigCalculo:
    def __init__(
        self,
        estado: str,
        data_sentenca: Optional[datetime] = None,
        aplicar_juros_mora: bool = False,
        data_inicio_juros: Optional[datetime] = None,
        percentual_juros_mora_anual: float = 0.0,
        percentual_honorarios: float = 0.0,
        taxa_administracao_percentual_total: float = 0.0,
        percentual_taxa_adm_devida: float = 0.0,
        outros_custos: float = 0.0,
        total_parcelas_plano: int = 0,
        houve_sentenca: bool = False,
        aplicar_juros: bool = True,
        taxa_juros_mensal_percentual: float = 0.0,
        valor_total_pago_extrato: float = 0.0,
        valor_credito: float = 0.0,  # ✅ NOVO CAMPO AQUI
        indice_corrigido_hoje: IndiceCorrecao = IndiceCorrecao.TJMG,
        indice_corrigido_futuro: IndiceCorrecao = IndiceCorrecao.INPC
    ):
        self.estado = estado
        self.data_sentenca = data_sentenca
        self.aplicar_juros_mora = aplicar_juros_mora
        self.data_inicio_juros = data_inicio_juros
        self.percentual_juros_mora_anual = percentual_juros_mora_anual
        self.percentual_honorarios = percentual_honorarios
        self.taxa_administracao_percentual_total = taxa_administracao_percentual_total
        self.percentual_taxa_adm_devida = percentual_taxa_adm_devida
        self.outros_custos = outros_custos
        self.total_parcelas_plano = total_parcelas_plano
        self.houve_sentenca = houve_sentenca
        self.aplicar_juros = aplicar_juros
        self.taxa_juros_mensal_percentual = taxa_juros_mensal_percentual
        self.valor_total_pago_extrato = valor_total_pago_extrato
        self.valor_credito = valor_credito  # ✅ ATRIBUIÇÃO
        self.indice_corrigido_hoje = indice_corrigido_hoje
        self.indice_corrigido_futuro = indice_corrigido_futuro

    def __repr__(self):
        return (
            f"<ConfigCalculo estado={self.estado} houve_sentenca={self.houve_sentenca} data_sentenca={self.data_sentenca} "
            f"indice_corrigido_hoje={self.indice_corrigido_hoje} indice_corrigido_futuro={self.indice_corrigido_futuro} "
            f"aplicar_juros_mora={self.aplicar_juros_mora} percentual_juros_mora_anual={self.percentual_juros_mora_anual} "
            f"data_inicio_juros={self.data_inicio_juros} aplicar_juros={self.aplicar_juros} "
            f"taxa_juros_mensal_percentual={self.taxa_juros_mensal_percentual} percentual_honorarios={self.percentual_honorarios} "
            f"outros_custos={self.outros_custos} taxa_adm_total={self.taxa_administracao_percentual_total} "
            f"taxa_adm_devida={self.percentual_taxa_adm_devida} total_parcelas_plano={self.total_parcelas_plano} "
            f"valor_total_pago_extrato={self.valor_total_pago_extrato} valor_credito={self.valor_credito}>"
        )
