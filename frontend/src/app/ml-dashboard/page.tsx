"use client";

import { useEffect } from 'react';
import { EstatisticasMLDetalhada } from '@/components/EstatisticasML';
import { useMLAprendizado } from '@/hooks/useMLAprendizado';
import Link from 'next/link';

export default function MLDashboardPage() {
  const { obterEstatisticas, obterStatus } = useMLAprendizado();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link 
            href="/"
            className="text-purple-600 hover:text-purple-800 mb-4 inline-flex items-center"
          >
            ← Voltar para o Dashboard
          </Link>
          
          <h1 className="text-4xl font-bold text-gray-900 mt-4 mb-2">
            🤖 Machine Learning Dashboard
          </h1>
          <p className="text-gray-600">
            Acompanhe o aprendizado automático do sistema e veja como ele está automatizando a extração de dados
          </p>
        </div>

        {/* Estatísticas principais */}
        <div className="mb-8">
          <EstatisticasMLDetalhada />
        </div>

        {/* Cards informativos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Como funciona */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <span className="mr-2">💡</span>
              Como Funciona
            </h2>
            <div className="space-y-3 text-gray-700">
              <div className="flex items-start">
                <span className="mr-2">1️⃣</span>
                <p>Você faz upload de um extrato</p>
              </div>
              <div className="flex items-start">
                <span className="mr-2">2️⃣</span>
                <p>O sistema extrai dados automaticamente</p>
              </div>
              <div className="flex items-start">
                <span className="mr-2">3️⃣</span>
                <p>Você corrige campos se necessário</p>
              </div>
              <div className="flex items-start">
                <span className="mr-2">4️⃣</span>
                <p>ML aprende com suas correções</p>
              </div>
              <div className="flex items-start">
                <span className="mr-2">5️⃣</span>
                <p>Próximos extratos vêm pré-preenchidos!</p>
              </div>
            </div>
          </div>

          {/* Benefícios */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <span className="mr-2">✨</span>
              Benefícios
            </h2>
            <div className="space-y-3 text-gray-700">
              <div className="flex items-start">
                <span className="mr-2 text-green-500">✓</span>
                <p><strong>Economia de tempo:</strong> Reduz preenchimento manual</p>
              </div>
              <div className="flex items-start">
                <span className="mr-2 text-green-500">✓</span>
                <p><strong>Precisão:</strong> Aprende padrões específicos</p>
              </div>
              <div className="flex items-start">
                <span className="mr-2 text-green-500">✓</span>
                <p><strong>Evolução:</strong> Melhora automaticamente</p>
              </div>
              <div className="flex items-start">
                <span className="mr-2 text-green-500">✓</span>
                <p><strong>Inteligente:</strong> Adapta-se a cada administradora</p>
              </div>
              <div className="flex items-start">
                <span className="mr-2 text-green-500">✓</span>
                <p><strong>Transparente:</strong> Você vê o que foi automatizado</p>
              </div>
            </div>
          </div>
        </div>

        {/* Campos automatizáveis */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            📋 Campos que o ML pode Automatizar
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              'Nome do Consorciado',
              'Número do Grupo',
              'Número da Cota',
              'Valor do Bem',
              'Prazo em Meses',
              'Número do Contrato',
              'Endereço Completo',
              'Valor Total Pago',
              'Data 1ª Assembleia',
              'Data Encerramento',
              'Comarca'
            ].map((campo) => (
              <div 
                key={campo}
                className="bg-purple-50 text-purple-700 px-3 py-2 rounded-lg text-sm font-medium"
              >
                {campo}
              </div>
            ))}
          </div>
        </div>

        {/* Guia rápido */}
        <div className="bg-blue-50 rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            🚀 Guia Rápido
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900 mb-2">
                Para treinar o ML:
              </h3>
              <p className="text-gray-700">
                Sempre que você corrigir um campo em um extrato, o sistema aprende automaticamente. 
                Quanto mais você usar, mais inteligente o sistema fica!
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">
                Mensagens de aprendizado:
              </h3>
              <p className="text-gray-700">
                Quando o ML preenche campos automaticamente, você verá mensagens como:
                <span className="block mt-2 bg-white px-3 py-2 rounded border-l-4 border-purple-500 text-sm">
                  🤖 ML preencheu automaticamente: nome
                </span>
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900 mb-2">
                Confiabilidade:
              </h3>
              <p className="text-gray-700">
                O sistema sempre preserva seus dados. O ML apenas ajuda a preencher campos vazios, 
                nunca substitui valores que já estão corretos.
              </p>
            </div>
          </div>
        </div>

        {/* Informação técnica */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Sistema de Machine Learning versão 1.0 • 
            Desenvolvido para automatizar extração de dados • 
            Última atualização: 29/10/2025
          </p>
        </div>
      </div>
    </div>
  );
}