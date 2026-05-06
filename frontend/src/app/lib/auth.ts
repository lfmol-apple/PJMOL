// @ts-nocheck
// src/app/lib/auth.ts
// ⚠️ Compatível com App Router. Não executa nada no import; só funções puras.

export function stripDiacritics(input: any): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
export function normalizeRole(raw: any): "admin" | "gerente" | "advogado" | any {
  const p = stripDiacritics(raw);
  if (["admin","administrador","adm","super","root"].includes(p)) return "admin";
  if (["gerente","manager"].includes(p)) return "gerente";
  if (p.startsWith("adv")) return "advogado";
  return p || "advogado";
}
export function pickFromCookies(keys: string[]): string | null {
  const cookie = typeof document !== "undefined" ? document.cookie || "" : "";
  for (const k of keys) {
    const m = cookie.match(new RegExp(`(?:^|; )${k}=([^;]+)`));
    if (m) {
      const v = decodeURIComponent(m[1]);
      return v.startsWith("Bearer ") ? v.replace(/^Bearer\s+/,"") : v;
    }
  }
  return null;
}
function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ================= Modelo do usuário =================
export type LoggedUser = {
  id: number | string | null;
  perfil: string | null;
  nome: string | null;
  email: string | null;
  username: string | null;
  raw?: any;
};

// ============== PAPÉIS (com seus usuários reais) ==============
const ROLE_MAP = {
  admin: {
    ids:     ["5","8","11"] as string[],
    users:   ["leonardo","henrique","henrique mol","henrique de freitas mol","marco antonio","marco antonio faria junior"], // se houver username salvo
    emails:  ["leonardofmol@gmail.com","henriquefmol@yahoo.com.br","marcoafariajunior@hotmail.com"],
  },
  gerente: {
    ids:     [] as string[], // se souber, coloque os IDs de Breno/Marcel
    users:   ["breno","marcel"],
    emails:  ["breno.gontijo@pjmol.com.br","marcel.mol@pjmol.com.br"],
  },
};
function isIn(list: string[] | undefined, value: any) {
  if (!list || value == null) return false;
  const v = stripDiacritics(value);
  return list.map(stripDiacritics).some(x => x === v);
}

// ============== Token (se precisar em fetch) ==============
export function getToken(): string | null {
  const keys = ["token","access_token","accessToken","jwt","authToken","Authorization","authorization"];
  const stores = [typeof localStorage !== "undefined" ? localStorage : null,
                  typeof sessionStorage !== "undefined" ? sessionStorage : null].filter(Boolean) as Storage[];
  for (const store of stores) {
    for (const k of keys) {
      const raw = store.getItem(k);
      if (raw) return raw.startsWith("Bearer ") ? raw.replace(/^Bearer\s+/, "") : raw;
    }
  }
  return pickFromCookies(keys);
}

// ============== Perfil salvo em storage/cookies ==============
function getPerfilFromStorage(): "admin" | "gerente" | "advogado" | null {
  const keys = ["perfil","perfilUsuario","role","papel","tipo","nivel"];
  const stores = [typeof localStorage !== "undefined" ? localStorage : null,
                  typeof sessionStorage !== "undefined" ? sessionStorage : null].filter(Boolean) as Storage[];
  for (const store of stores) {
    for (const k of keys) {
      const v = store.getItem(k);
      if (v) {
        const norm = normalizeRole(v);
        if (["admin","gerente","advogado"].includes(norm)) return norm;
      }
    }
    for (const k of ["user","usuario","currentUser"]) {
      const raw = store.getItem(k);
      if (raw) {
        try {
          const obj = JSON.parse(raw);
          const v = obj?.perfil ?? obj?.perfilUsuario ?? obj?.role ?? obj?.papel ?? obj?.tipo ?? obj?.nivel;
          if (v) {
            const norm = normalizeRole(v);
            if (["admin","gerente","advogado"].includes(norm)) return norm;
          }
        } catch {}
      }
    }
  }
  const cookieVal = pickFromCookies(keys);
  if (cookieVal) {
    const norm = normalizeRole(cookieVal);
    if (["admin","gerente","advogado"].includes(norm)) return norm;
  }
  return null;
}

// ============== Derivar perfil pela whitelist (fallback) ==============
function resolvePerfilByWhitelist(user: Pick<LoggedUser,"id"|"nome"|"email"|"username"> | null): "admin" | "gerente" | "advogado" {
  if (!user) return "advogado";
  const id = user.id != null ? String(user.id) : null;
  const uname = user.username || user.nome || null;
  const email = user.email || null;
  // admin tem prioridade
  if (id && isIn(ROLE_MAP.admin.ids, id)) return "admin";
  if (uname && isIn(ROLE_MAP.admin.users, uname)) return "admin";
  if (email && isIn(ROLE_MAP.admin.emails, email)) return "admin";
  // gerente depois
  if (id && isIn(ROLE_MAP.gerente.ids, id)) return "gerente";
  if (uname && isIn(ROLE_MAP.gerente.users, uname)) return "gerente";
  if (email && isIn(ROLE_MAP.gerente.emails, email)) return "gerente";
  return "advogado";
}

// ============== Identidade do usuário logado ==============
export function getLoggedUser(): LoggedUser {
  const perfilStorage = getPerfilFromStorage();

  const idKeys = ["usuarioId","userId","id","usuario_id"];
  const nameKeys = ["nome","nomeUsuario","nome_completo","nomeCompleto","full_name","fullName"];
  const userObjKeys = ["user","usuario","currentUser","account","profile"];

  let id: number | string | null = null;
  let nome: string | null = null;
  let email: string | null = null;
  let username: string | null = null;
  let raw: any = null;

  const stores = [typeof localStorage !== "undefined" ? localStorage : null,
                  typeof sessionStorage !== "undefined" ? sessionStorage : null].filter(Boolean) as Storage[];

  for (const store of stores) {
    if (id == null) {
      for (const k of idKeys) {
        const val = store.getItem(k);
        if (val != null) { id = safeNum(val) ?? val; break; }
      }
    }
    if (!nome) {
      for (const k of nameKeys) {
        const val = store.getItem(k);
        if (val) { nome = String(val); break; }
      }
    }
    if (!raw) {
      for (const k of userObjKeys) {
        const rawStr = store.getItem(k);
        if (!rawStr) continue;
        try {
          const obj = JSON.parse(rawStr);
          if (obj && typeof obj === "object") { raw = obj; break; }
        } catch {}
      }
    }
  }

  // cookie user={}
  if (!raw) {
    try {
      const cookie = typeof document !== "undefined" ? document.cookie || "" : "";
      const m = cookie.match(/(?:^|; )user=([^;]+)/);
      if (m) raw = JSON.parse(decodeURIComponent(m[1]));
    } catch {}
  }

  if (raw) {
    if (id == null) {
      const candId = raw.id ?? raw.usuario_id ?? raw.user_id ?? raw.usuarioId ?? raw.userId ?? raw?.usuario?.id ?? raw?.profile?.id;
      if (candId != null) id = safeNum(candId) ?? String(candId);
    }
    if (!nome) {
      nome = raw.nome_completo ?? raw.nomeCompleto ?? raw.full_name ?? raw.fullName ?? raw.nome ?? raw.displayName ?? raw?.usuario?.nome ?? raw?.profile?.nome ?? null;
    }
    email = raw.email ?? raw.email_login ?? raw?.usuario?.email ?? raw?.profile?.email ?? email;
    username = raw.username ?? raw.usuario ?? raw.login ?? raw?.usuario?.username ?? raw?.profile?.username ?? username;
  }

  if (!email) {
    const cEmail = pickFromCookies(["email","user_email","usuario_email"]);
    if (cEmail) email = cEmail;
  }
  if (!username) {
    const cUser = pickFromCookies(["username","usuario","login"]);
    if (cUser) username = cUser;
  }

  const whitelistPerfil = resolvePerfilByWhitelist({ id, nome, email, username });
  const finalPerfil = whitelistPerfil === "admin" ? "admin" : (perfilStorage ?? whitelistPerfil);
  return { id, perfil: finalPerfil, nome: nome ?? null, email: email ?? null, username: username ?? null, raw };
}

// ============== Regra de escopo (gerente) ==============
function norm(s: any): string { return stripDiacritics(s); }
function candidateUserStrings(u: LoggedUser): string[] {
  return [u.username, u.email, u.nome].filter(Boolean).map(norm);
}

/** item pertence ao gerente logado?
 * 1) gerente_id -> 2) criado_por_id -> 3) ids aninhados -> 4) fallback textual
 */
export function ownsItem(item: any, user: LoggedUser | null): boolean {
  if (!user) return false;
  const myId = user.id != null ? String(user.id) : null;

  if (myId && item?.gerente_id != null && String(item.gerente_id) === myId) return true;
  if (myId && item?.criado_por_id != null && String(item.criado_por_id) === myId) return true;

  const nestedIds = [
    item?.gerente?.id, item?.usuario_criador_id, item?.usuario_criador?.id, item?.responsavel_id, item?.responsavel?.id
  ].filter((x) => x != null).map((x) => String(x));
  if (myId && nestedIds.includes(myId)) return true;

  const myStrs = candidateUserStrings(user);
  if (myStrs.length) {
    const textCandidates = [
      item.gerente_usuario, item.usuario_criador, item.gerente_email, item.usuario_criador_email,
      item.gerente_login, item.gerente_nome, item.usuario_criador_nome, item.criado_por_nome,
      item.responsavel_nome, item?.gerente?.nome, item?.gerente?.username, item?.gerente?.email,
      item?.usuario_criador?.nome, item?.usuario_criador?.username, item?.usuario_criador?.email,
    ].filter(Boolean).map(norm);

    if (item.gerente_id != null) textCandidates.push(norm(`#${item.gerente_id}`));
    if (item.criado_por_id != null) textCandidates.push(norm(`#${item.criado_por_id}`));

    for (const mine of myStrs) if (textCandidates.includes(mine)) return true;
  }
  return false;
}

export function canSeeAll(perfil?: string | null): boolean {
  return normalizeRole(perfil) === "admin";
}

/** Escopo global: admin vê tudo; gerente só o que é dele; advogado (futuro) */
export function filterByScope<T = any>(items: T[], perfil: string | null | undefined, user: LoggedUser | null): T[] {
  const role = normalizeRole(perfil || (user?.perfil ?? "advogado"));
  if (role === "admin") return items;
  if (role === "gerente") return items.filter((x: any) => ownsItem(x, user));
  return items;
}
