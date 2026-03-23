import { createContext, useContext, useState, useEffect } from "react";
import { supabase, hasSupabaseConfig } from "../utils/supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setLoading(false);
      return;
    }

    // Escuchar el estado de la sesión
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
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
        
      if (!error && data) {
        setProfile(data);
      } else {
        // En un inicio, si el perfil no existe, podemos crearle uno temporal o dejarlo como usuario base
        setProfile({ role: 'user' }); // Fallback temporal hasta que se cree en DB
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
      setProfile({ role: 'user' });
    } finally {
      setLoading(false);
    }
  }

  const login = async (email, password) => {
    if (!hasSupabaseConfig || !supabase) {
      throw new Error("SUPABASE_CONFIG_MISSING");
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
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
