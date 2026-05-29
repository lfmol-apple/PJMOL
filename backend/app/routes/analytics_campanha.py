from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db

router = APIRouter(prefix="/analytics/campanha", tags=["Analytics Campanha"])


@router.get("")
def get_analytics_campanha(db: Session = Depends(get_db)):
    def q(sql: str):
        return [dict(r._mapping) for r in db.execute(text(sql)).fetchall()]

    por_administradora = q("""
        SELECT administradora,
               COUNT(*) as total,
               ROUND(AVG(valor_causa), 0) as avg_causa,
               ROUND(SUM(valor_causa), 0) as sum_causa,
               SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
               ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa_acordo
        FROM extratos
        WHERE administradora IS NOT NULL AND administradora != ''
        GROUP BY administradora
        ORDER BY total DESC
        LIMIT 15
    """)

    por_estado = q("""
        SELECT json_extract(extras, '$.endereco_snapshot.estado') as estado,
               COUNT(*) as total,
               SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
               ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa_acordo,
               ROUND(AVG(valor_causa), 0) as avg_causa,
               ROUND(SUM(valor_causa), 0) as sum_causa
        FROM extratos
        WHERE json_extract(extras, '$.endereco_snapshot.estado') IS NOT NULL
          AND json_extract(extras, '$.endereco_snapshot.estado') != ''
        GROUP BY estado
        ORDER BY total DESC
        LIMIT 20
    """)

    por_cidade = q("""
        SELECT json_extract(extras, '$.endereco_snapshot.cidade') as cidade,
               json_extract(extras, '$.endereco_snapshot.estado') as estado,
               COUNT(*) as total,
               ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos
        WHERE json_extract(extras, '$.endereco_snapshot.cidade') IS NOT NULL
          AND json_extract(extras, '$.endereco_snapshot.cidade') != ''
        GROUP BY cidade, estado
        ORDER BY total DESC
        LIMIT 20
    """)

    por_faixa = q("""
        SELECT
          CASE
            WHEN valor_causa < 10000 THEN 'Até R$10k'
            WHEN valor_causa < 30000 THEN 'R$10k–30k'
            WHEN valor_causa < 60000 THEN 'R$30k–60k'
            WHEN valor_causa < 100000 THEN 'R$60k–100k'
            WHEN valor_causa < 200000 THEN 'R$100k–200k'
            ELSE 'Acima R$200k'
          END as faixa,
          CASE
            WHEN valor_causa < 10000 THEN 1
            WHEN valor_causa < 30000 THEN 2
            WHEN valor_causa < 60000 THEN 3
            WHEN valor_causa < 100000 THEN 4
            WHEN valor_causa < 200000 THEN 5
            ELSE 6
          END as ordem,
          COUNT(*) as total,
          ROUND(AVG(honorarios_percentual), 1) as avg_pct_honor
        FROM extratos
        WHERE valor_causa IS NOT NULL AND valor_causa > 0
        GROUP BY faixa, ordem
        ORDER BY ordem
    """)

    por_mes = q("""
        SELECT strftime('%Y-%m', criado_em) as mes,
               COUNT(*) as novos,
               ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos
        WHERE criado_em IS NOT NULL AND criado_em != ''
        GROUP BY mes
        ORDER BY mes DESC
        LIMIT 12
    """)

    matriz_adm_estado = q("""
        SELECT
          CASE
            WHEN administradora LIKE '%EMBRACON%' THEN 'Embracon'
            WHEN administradora LIKE '%PORTO SEGURO%' THEN 'Porto Seguro'
            WHEN administradora LIKE '%VOLKSWAGEN%' THEN 'Volkswagen'
            WHEN administradora LIKE '%REMAZA%' THEN 'Remaza'
            WHEN administradora LIKE '%BAMAQ%' THEN 'Bamaq'
            WHEN administradora LIKE '%RODOBENS%' THEN 'Rodobens'
            ELSE 'Outras'
          END as adm,
          json_extract(extras, '$.endereco_snapshot.estado') as estado,
          COUNT(*) as total,
          ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos
        WHERE json_extract(extras, '$.endereco_snapshot.estado') IS NOT NULL
          AND administradora IS NOT NULL
        GROUP BY adm, estado
        HAVING total >= 2
        ORDER BY total DESC
        LIMIT 40
    """)

    resultados = q("""
        SELECT
          CASE WHEN resultado_processo IS NULL OR TRIM(resultado_processo) = ''
               THEN 'Em andamento'
               ELSE resultado_processo
          END as resultado,
          COUNT(*) as total,
          ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos
        GROUP BY resultado
        ORDER BY total DESC
    """)

    tempo_ate_acordo_adm = q("""
        SELECT
          CASE
            WHEN administradora LIKE '%EMBRACON%' THEN 'Embracon'
            WHEN administradora LIKE '%PORTO SEGURO%' THEN 'Porto Seguro'
            WHEN administradora LIKE '%VOLKSWAGEN%' THEN 'Volkswagen'
            WHEN administradora LIKE '%REMAZA%' THEN 'Remaza'
            WHEN administradora LIKE '%BAMAQ%' THEN 'Bamaq'
            WHEN administradora LIKE '%RODOBENS%' THEN 'Rodobens'
            WHEN administradora LIKE '%RCI%' THEN 'RCI'
            ELSE SUBSTR(administradora, 1, 20)
          END as adm_nome,
          COUNT(*) as acordos,
          ROUND(AVG(julianday(atualizado_em) - julianday(criado_em)), 0) as avg_dias,
          ROUND(MIN(julianday(atualizado_em) - julianday(criado_em)), 0) as min_dias,
          ROUND(MAX(julianday(atualizado_em) - julianday(criado_em)), 0) as max_dias,
          ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos
        WHERE LOWER(resultado_processo) = 'acordo'
          AND administradora IS NOT NULL AND criado_em IS NOT NULL
        GROUP BY adm_nome
        HAVING acordos >= 2
        ORDER BY avg_dias ASC
    """)

    tempo_ate_acordo_adv = q("""
        SELECT advogado_nome,
               COUNT(*) as acordos,
               ROUND(AVG(julianday(atualizado_em) - julianday(criado_em)), 0) as avg_dias,
               ROUND(MIN(julianday(atualizado_em) - julianday(criado_em)), 0) as min_dias,
               ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos
        WHERE LOWER(resultado_processo) = 'acordo'
          AND advogado_nome IS NOT NULL AND advogado_nome != ''
          AND criado_em IS NOT NULL
        GROUP BY advogado_nome
        HAVING acordos >= 2
        ORDER BY avg_dias ASC
    """)

    dist_tempo_acordo = q("""
        SELECT
          CASE
            WHEN julianday(atualizado_em) - julianday(criado_em) < 30  THEN '< 30 dias'
            WHEN julianday(atualizado_em) - julianday(criado_em) < 60  THEN '30–60 dias'
            WHEN julianday(atualizado_em) - julianday(criado_em) < 90  THEN '60–90 dias'
            WHEN julianday(atualizado_em) - julianday(criado_em) < 120 THEN '90–120 dias'
            ELSE '> 120 dias'
          END as faixa,
          CASE
            WHEN julianday(atualizado_em) - julianday(criado_em) < 30  THEN 1
            WHEN julianday(atualizado_em) - julianday(criado_em) < 60  THEN 2
            WHEN julianday(atualizado_em) - julianday(criado_em) < 90  THEN 3
            WHEN julianday(atualizado_em) - julianday(criado_em) < 120 THEN 4
            ELSE 5
          END as ordem,
          COUNT(*) as acordos
        FROM extratos
        WHERE LOWER(resultado_processo) = 'acordo' AND criado_em IS NOT NULL
        GROUP BY faixa, ordem
        ORDER BY ordem
    """)

    gerente_adv_combos = q("""
        SELECT u.nome as gerente,
               e.advogado_nome,
               COUNT(*) as total,
               SUM(CASE WHEN LOWER(e.resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
               ROUND(100.0 * SUM(CASE WHEN LOWER(e.resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa,
               ROUND(AVG(e.valor_causa), 0) as avg_causa,
               ROUND(AVG(CASE WHEN LOWER(e.resultado_processo) = 'acordo'
                   THEN julianday(e.atualizado_em) - julianday(e.criado_em) END), 0) as avg_dias_acordo
        FROM extratos e
        JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.advogado_nome IS NOT NULL AND e.advogado_nome != ''
        GROUP BY e.usuario_id, e.advogado_nome
        HAVING total >= 5
        ORDER BY taxa DESC, acordos DESC
        LIMIT 15
    """)

    faixa_valor_acordo = q("""
        SELECT
          CASE WHEN valor_causa < 15000 THEN '< R$15k'
               WHEN valor_causa < 30000 THEN 'R$15k–30k'
               WHEN valor_causa < 50000 THEN 'R$30k–50k'
               ELSE '>= R$50k' END as faixa,
          CASE WHEN valor_causa < 15000 THEN 1
               WHEN valor_causa < 30000 THEN 2
               WHEN valor_causa < 50000 THEN 3
               ELSE 4 END as ordem,
          COUNT(*) as total,
          SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
          ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa,
          ROUND(AVG(CASE WHEN LOWER(resultado_processo) = 'acordo'
              THEN julianday(atualizado_em) - julianday(criado_em) END), 0) as avg_dias_acordo,
          ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos WHERE valor_causa > 0
        GROUP BY faixa, ordem
        ORDER BY ordem
    """)

    adm_acordo_perfil = q("""
        SELECT
          CASE WHEN administradora LIKE '%EMBRACON%' THEN 'Embracon'
               WHEN administradora LIKE '%PORTO SEGURO%' THEN 'Porto Seguro'
               WHEN administradora LIKE '%VOLKSWAGEN%' THEN 'Volkswagen'
               WHEN administradora LIKE '%REMAZA%' THEN 'Remaza'
               WHEN administradora LIKE '%BAMAQ%' THEN 'Bamaq'
               WHEN administradora LIKE '%RODOBENS%' THEN 'Rodobens'
               WHEN administradora LIKE '%RCI%' THEN 'RCI'
               ELSE 'Outros' END as adm,
          COUNT(*) as total,
          SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
          ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa,
          ROUND(AVG(CASE WHEN LOWER(resultado_processo) = 'acordo'
              THEN julianday(atualizado_em) - julianday(criado_em) END), 0) as avg_dias_acordo,
          ROUND(AVG(valor_causa), 0) as avg_causa,
          ROUND(AVG(CASE
              WHEN percentual_cobrada_calculado IS NOT NULL AND taxa_adm_contratada_percentual IS NOT NULL
              THEN percentual_cobrada_calculado - taxa_adm_contratada_percentual END), 2) as excesso_taxa_adm
        FROM extratos
        WHERE administradora IS NOT NULL AND administradora != ''
        GROUP BY adm
        HAVING total >= 5
        ORDER BY taxa DESC, total DESC
    """)

    abusividade_vs_acordo = q("""
        SELECT
          CASE WHEN (percentual_cobrada_calculado - taxa_adm_contratada_percentual) > 1
               THEN 'Abusiva (>1pp acima)'
               WHEN (percentual_cobrada_calculado - taxa_adm_contratada_percentual) > 0.1
               THEN 'Levemente acima'
               WHEN percentual_cobrada_calculado IS NULL OR taxa_adm_contratada_percentual IS NULL
               THEN 'Sem dados'
               ELSE 'Dentro do contrato' END as situacao,
          COUNT(*) as total,
          SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
          ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa,
          ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos
        GROUP BY situacao
        ORDER BY taxa DESC
    """)

    advogados_disponiveis = q("""
        SELECT a.id, a.nome_completo, a.oab,
               COUNT(e.id) as total_processos
        FROM advogados a
        LEFT JOIN extratos e ON UPPER(e.advogado_nome) = UPPER(a.nome_completo)
        GROUP BY a.id, a.nome_completo, a.oab
        ORDER BY total_processos ASC, a.nome_completo
    """)

    # Quartile analysis: what separates fast from slow acordos?
    quartis_tempo_acordo = q("""
        SELECT
          CASE
            WHEN dias < 30 THEN 'Rápido (<30d)'
            WHEN dias < 60 THEN 'Normal (30-60d)'
            WHEN dias < 90 THEN 'Lento (60-90d)'
            ELSE 'Muito lento (>90d)'
          END as quartil,
          CASE WHEN dias < 30 THEN 1 WHEN dias < 60 THEN 2 WHEN dias < 90 THEN 3 ELSE 4 END as ord,
          COUNT(*) as n,
          ROUND(AVG(pct_embracon)*100) as pct_embracon,
          ROUND(AVG(honor)) as avg_honor,
          ROUND(AVG(valor_causa)) as avg_causa
        FROM (
          SELECT
            julianday(atualizado_em) - julianday(criado_em) as dias,
            CASE WHEN administradora LIKE '%EMBRACON%' THEN 1.0 ELSE 0 END as pct_embracon,
            honorarios_percentual as honor,
            valor_causa
          FROM extratos
          WHERE LOWER(resultado_processo) = 'acordo'
            AND criado_em IS NOT NULL AND atualizado_em IS NOT NULL
            AND julianday(atualizado_em) - julianday(criado_em) BETWEEN 1 AND 365
        )
        GROUP BY quartil, ord
        ORDER BY ord
    """)

    # ADM x Advogado fastest closing combos (time perspective)
    adm_adv_tempo = q("""
        SELECT
          CASE
            WHEN administradora LIKE '%EMBRACON%' THEN 'Embracon'
            WHEN administradora LIKE '%PORTO SEGURO%' THEN 'Porto Seguro'
            WHEN administradora LIKE '%REMAZA%' THEN 'Remaza'
            ELSE SUBSTR(administradora, 1, 15)
          END as adm,
          TRIM(advogado_nome) as adv,
          COUNT(*) as n,
          ROUND(AVG(julianday(atualizado_em) - julianday(criado_em))) as avg_dias,
          ROUND(MIN(julianday(atualizado_em) - julianday(criado_em))) as min_dias,
          ROUND(100.0 * COUNT(*) / (
            SELECT COUNT(*) FROM extratos e2
            WHERE TRIM(e2.advogado_nome) = TRIM(e.advogado_nome)
              AND e2.administradora = e.administradora
          )) as taxa_pct
        FROM extratos e
        WHERE LOWER(resultado_processo) = 'acordo'
          AND criado_em IS NOT NULL AND atualizado_em IS NOT NULL
          AND julianday(atualizado_em) - julianday(criado_em) BETWEEN 1 AND 365
        GROUP BY adm, adv
        HAVING n >= 3
        ORDER BY avg_dias ASC
        LIMIT 12
    """)

    # Seasonal pattern: month of creation vs avg time to close
    sazonalidade_acordo = q("""
        SELECT
          CAST(strftime('%m', criado_em) AS INTEGER) as mes,
          COUNT(*) as acordos,
          ROUND(AVG(julianday(atualizado_em) - julianday(criado_em))) as avg_dias,
          ROUND(MIN(julianday(atualizado_em) - julianday(criado_em))) as min_dias
        FROM extratos
        WHERE LOWER(resultado_processo) = 'acordo'
          AND criado_em IS NOT NULL AND atualizado_em IS NOT NULL
          AND julianday(atualizado_em) - julianday(criado_em) BETWEEN 1 AND 365
        GROUP BY mes
        ORDER BY mes
    """)

    # Day-of-week distribution of acordos
    dia_semana_acordo = q("""
        SELECT
          CAST(strftime('%w', atualizado_em) AS INTEGER) as dow,
          CASE CAST(strftime('%w', atualizado_em) AS INTEGER)
            WHEN 0 THEN 'Dom' WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter'
            WHEN 3 THEN 'Qua' WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex' WHEN 6 THEN 'Sab'
          END as dia,
          COUNT(*) as acordos
        FROM extratos
        WHERE LOWER(resultado_processo) = 'acordo'
          AND atualizado_em IS NOT NULL
        GROUP BY dow
        ORDER BY dow
    """)

    concentracao_adm_adv = q("""
        SELECT
          CASE
            WHEN administradora LIKE '%EMBRACON%' THEN 'Embracon'
            WHEN administradora LIKE '%PORTO SEGURO%' THEN 'Porto Seguro'
            WHEN administradora LIKE '%VOLKSWAGEN%' THEN 'Volkswagen'
            WHEN administradora LIKE '%REMAZA%' THEN 'Remaza'
            WHEN administradora LIKE '%BAMAQ%' THEN 'Bamaq'
            WHEN administradora LIKE '%RODOBENS%' THEN 'Rodobens'
            ELSE SUBSTR(administradora, 1, 20)
          END as adm_nome,
          advogado_nome,
          COUNT(*) as total
        FROM extratos
        WHERE administradora IS NOT NULL AND administradora != ''
          AND advogado_nome IS NOT NULL AND advogado_nome != ''
        GROUP BY adm_nome, advogado_nome
        HAVING total >= 2
        ORDER BY adm_nome, total DESC
    """)

    por_advogado = q("""
        SELECT advogado_nome,
               COUNT(*) as total,
               SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
               SUM(CASE WHEN resultado_processo IS NULL OR TRIM(resultado_processo) = '' THEN 1 ELSE 0 END) as em_andamento,
               ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa_acordo,
               ROUND(AVG(valor_causa), 0) as avg_causa,
               ROUND(SUM(valor_causa), 0) as sum_causa,
               MIN(criado_em) as primeiro_caso
        FROM extratos
        WHERE advogado_nome IS NOT NULL AND advogado_nome != ''
        GROUP BY advogado_nome
        HAVING total >= 3
        ORDER BY acordos DESC, taxa_acordo DESC
        LIMIT 20
    """)

    por_gerente = q("""
        SELECT u.nome as gerente,
               COUNT(e.id) as total,
               SUM(CASE WHEN LOWER(e.resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
               ROUND(100.0 * SUM(CASE WHEN LOWER(e.resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(e.id), 1) as taxa_acordo,
               ROUND(AVG(e.valor_causa), 0) as avg_causa,
               ROUND(SUM(e.valor_causa), 0) as carteira,
               ROUND(AVG(CASE
                 WHEN e.enviado_em IS NOT NULL AND e.zapsign_signed_at IS NOT NULL
                      AND julianday(e.zapsign_signed_at) > julianday(e.enviado_em)
                 THEN julianday(e.zapsign_signed_at) - julianday(e.enviado_em)
               END), 1) as avg_dias_assinar,
               MIN(e.criado_em) as primeiro_processo
        FROM extratos e
        JOIN usuarios u ON u.id = e.usuario_id
        GROUP BY e.usuario_id, u.nome
        ORDER BY total DESC
    """)

    velocidade_adm = q("""
        SELECT administradora,
               COUNT(*) as total,
               ROUND(AVG(julianday(zapsign_signed_at) - julianday(enviado_em)), 1) as avg_dias,
               SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
               ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa_acordo
        FROM extratos
        WHERE zapsign_signed_at IS NOT NULL AND enviado_em IS NOT NULL
          AND julianday(zapsign_signed_at) > julianday(enviado_em)
          AND administradora IS NOT NULL AND administradora != ''
        GROUP BY administradora
        HAVING total >= 3
        ORDER BY avg_dias ASC
        LIMIT 12
    """)

    velocidade_estado = q("""
        SELECT json_extract(extras, '$.endereco_snapshot.estado') as estado,
               COUNT(*) as total,
               ROUND(AVG(julianday(zapsign_signed_at) - julianday(enviado_em)), 1) as avg_dias,
               SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
               ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa_acordo
        FROM extratos
        WHERE zapsign_signed_at IS NOT NULL AND enviado_em IS NOT NULL
          AND julianday(zapsign_signed_at) > julianday(enviado_em)
          AND json_extract(extras, '$.endereco_snapshot.estado') IS NOT NULL
        GROUP BY estado
        HAVING total >= 5
        ORDER BY avg_dias ASC
        LIMIT 15
    """)

    por_comarca = q("""
        SELECT comarca_escolhida_nome as comarca,
               COUNT(*) as total,
               SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as acordos,
               ROUND(100.0 * SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) / COUNT(*), 1) as taxa_acordo,
               ROUND(AVG(valor_causa), 0) as avg_causa
        FROM extratos
        WHERE comarca_escolhida_nome IS NOT NULL AND comarca_escolhida_nome != ''
        GROUP BY comarca
        ORDER BY total DESC
        LIMIT 15
    """)

    totais = q("""
        SELECT
          COUNT(*) as total_processos,
          ROUND(AVG(valor_causa), 0) as ticket_medio,
          ROUND(SUM(valor_causa), 0) as carteira_total,
          COUNT(DISTINCT administradora) as total_adms,
          COUNT(DISTINCT json_extract(extras, '$.endereco_snapshot.estado')) as total_estados,
          SUM(CASE WHEN LOWER(resultado_processo) = 'acordo' THEN 1 ELSE 0 END) as total_acordos
        FROM extratos
        WHERE valor_causa IS NOT NULL
    """)[0]

    return {
        "totais": totais,
        "por_administradora": por_administradora,
        "por_estado": por_estado,
        "por_cidade": por_cidade,
        "por_faixa": por_faixa,
        "por_mes": por_mes,
        "matriz_adm_estado": matriz_adm_estado,
        "resultados": resultados,
        "por_advogado": por_advogado,
        "por_comarca": por_comarca,
        "concentracao_adm_adv": concentracao_adm_adv,
        "advogados_disponiveis": advogados_disponiveis,
        "gerente_adv_combos": gerente_adv_combos,
        "faixa_valor_acordo": faixa_valor_acordo,
        "adm_acordo_perfil": adm_acordo_perfil,
        "abusividade_vs_acordo": abusividade_vs_acordo,
        "por_gerente": por_gerente,
        "velocidade_adm": velocidade_adm,
        "velocidade_estado": velocidade_estado,
        "tempo_ate_acordo_adm": tempo_ate_acordo_adm,
        "tempo_ate_acordo_adv": tempo_ate_acordo_adv,
        "dist_tempo_acordo": dist_tempo_acordo,
        "quartis_tempo_acordo": quartis_tempo_acordo,
        "adm_adv_tempo": adm_adv_tempo,
        "sazonalidade_acordo": sazonalidade_acordo,
        "dia_semana_acordo": dia_semana_acordo,
    }
