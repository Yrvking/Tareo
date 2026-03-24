import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import projectLogo from "../../LOGO.png";
import "./Login.css";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      await login(email, password);
    } catch (err) {
      if (err?.message === "SUPABASE_CONFIG_MISSING") {
        setError("Configuración incompleta en producción: agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en Railway y vuelve a desplegar.");
      } else {
        setError("Fallo al iniciar sesión: Correo o contraseña incorrectos.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <img
              src={projectLogo}
              alt="Grupo Padova Registro y Tareo de Personal"
            />
          </div>
          <h2>Ingreso al Sistema</h2>
          <p>Control de Horas Hombre - Tareador Padova</p>
        </div>
        
        {error && <div className="login-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Correo Electrónico</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@proyecto.com"
            />
          </div>
          
          <div className="form-group">
            <label>Contraseña</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          
          <button disabled={loading} type="submit" className="login-button">
            {loading ? "Verificando..." : "Entrar a Obra"}
          </button>
        </form>
      </div>
    </div>
  );
}
