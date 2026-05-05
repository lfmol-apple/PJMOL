// @ts-nocheck
"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function DashboardRelatorioPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/gerencial/processos"
                className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Voltar para Processos</span>
              </Link>
            </div>
            <h1 className="text-xl font-semibold text-slate-900">
              Relatório de Processos
            </h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Saudação */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            Bom dia!
          </h2>
          <p className="text-slate-600">
            Segue o relatório de seus processos (versão teste):
          </p>
        </div>

        {/* Teste de conteúdo simples */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Dashboard funcionando!
          </h3>
          <p className="text-slate-600">
            Esta é uma versão simplificada para teste. Se você conseguir ver esta página,
            o roteamento está funcionando corretamente.
          </p>
        </div>
      </div>
    </div>
  );
}