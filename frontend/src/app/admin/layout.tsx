// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLoggedUser } from "@/app/lib/auth";
import Link from "next/link";

/**
 * AdminOnly Gate - Redireciona para dashboard se não for admin
 */
function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const user = getLoggedUser();
      const perfil = (user?.perfil || "").toLowerCase();
      
      if (perfil === "admin") {
        setIsAdmin(true);
      } else {
        // Redireciona se não for admin
        router.replace("/gerencial/processos");
      }
    } catch (err) {
      console.error("AdminGate Error:", err);
      router.replace("/gerencial/processos");
    } finally {
      setLoading(false);
    }
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Admin Navbar
 */
function AdminNavbar() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    try {
      const u = getLoggedUser();
      setUser(u);
    } catch (err) {
      console.error("Error getting user:", err);
    }
  }, []);

  return (
    <nav className="bg-linear-to-r from-blue-700 to-blue-800 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="text-xl font-bold">🔧 Admin Panel</div>
          </div>

          {/* Menu */}
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-blue-100 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/usuarios"
              className="text-blue-100 hover:text-white transition-colors"
            >
              Usuários
            </Link>
            <Link
              href="/admin/advogados"
              className="text-blue-100 hover:text-white transition-colors"
            >
              Advogados
            </Link>
            <Link
              href="/gerencial/processos"
              className="text-blue-100 hover:text-white transition-colors"
            >
              ← Voltar
            </Link>

            {/* User Info */}
            {user && (
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-blue-600">
                <span className="text-sm text-blue-100">{user.nome}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

/**
 * Admin Layout
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGate>
      <AdminNavbar />
      <main className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </AdminGate>
  );
}
