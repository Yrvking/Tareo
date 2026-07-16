import { createContext, useContext, useState, useEffect } from "react";
import {
  supabase,
  hasSupabaseConfig,
  fetchStoredSystemUsers,
  upsertManagedUser,
} from "../utils/supabaseClient";
import {
  getRoleLabel,
  resolveEffectiveRole,
} from "../utils/accessControl";

const AuthContext = createContext();
const isLocalDevHost = typeof window !== "undefined"
  && ["localhost", "127.0.0.1"].includes(window.location.hostname)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLocalDevHost) {
      setUser({
        id: "local-dev-user",
        email: "local@padova.dev",
      });
      setProfile({
        id: "local-dev-user",
        email: "local@padova.dev",
        role: "super_admin",
        roleLabel: getRoleLabel("super_admin"),
      });
      setLoading(false);
      return;
    }

    if (!hasSupabaseConfig || !supabase) {
      setLoading(false);
      return;
    }

    // Escuchar el estado de la sesión
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id, session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id, session.user);
        return;
      }

      // Supabase puede emitir una sesión nula transitoria (p.ej. un refresh de
      // token que falla por una red móvil inestable) sin que el usuario haya
      // cerrado sesión realmente. Antes de tirar abajo toda la UI (y perder
      // lo que el usuario esté llenando), reconfirmamos con getSession().
      const { data: { session: confirmedSession } } = await supabase.auth.getSession();
      if (confirmedSession?.user) {
        setUser(confirmedSession.user);
        fetchProfile(confirmedSession.user.id, confirmedSession.user);
        return;
      }

      setUser(null);
      setProfile(null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId, authUser = null) {
    if (!supabase) {
      setProfile({ role: 'user' });
      setLoading(false);
      return;
    }

    try {
      // Intenta obtener el perfil del usuario (rol) de la tabla 'profiles'
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      const systemUsers = await fetchStoredSystemUsers();
      const currentSystemUser = systemUsers.find((entry) => (
        entry.id === userId ||
        entry.email === String(authUser?.email || "").trim().toLowerCase()
      ));

      const effectiveRole = resolveEffectiveRole({
        email: authUser?.email,
        storedRole: currentSystemUser?.role,
        profileRole: !error && data ? data.role : "user",
      });

      const nextProfile = {
        ...(data || {}),
        id: userId,
        email: authUser?.email || data?.email || "",
        role: effectiveRole,
        roleLabel: getRoleLabel(effectiveRole),
      };

      setProfile(nextProfile);

      await upsertManagedUser({
        id: userId,
        email: nextProfile.email,
        role: effectiveRole,
        displayName: authUser?.user_metadata?.full_name || data?.full_name || "",
        lastSeenAt: new Date().toISOString(),
        source: currentSystemUser?.source || (data?.role ? "profiles" : "app_settings"),
      });
    } catch (err) {
      console.error("Error fetching profile:", err);
      const fallbackRole = resolveEffectiveRole({ email: authUser?.email, storedRole: "user", profileRole: "user" });
      setProfile({ id: userId, email: authUser?.email || "", role: fallbackRole, roleLabel: getRoleLabel(fallbackRole) });
    } finally {
      setLoading(false);
    }
  }

  const login = async (email, password) => {
    if (isLocalDevHost) {
      setUser({
        id: "local-dev-user",
        email: email || "local@padova.dev",
      });
      setProfile({
        id: "local-dev-user",
        email: email || "local@padova.dev",
        role: "super_admin",
        roleLabel: getRoleLabel("super_admin"),
      });
      return { user: { id: "local-dev-user", email: email || "local@padova.dev" } };
    }

    if (!hasSupabaseConfig || !supabase) {
      throw new Error("SUPABASE_CONFIG_MISSING");
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    if (isLocalDevHost) return;
    if (!hasSupabaseConfig || !supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value = {
    user,
    profile,
    loading,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
