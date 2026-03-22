import json
import os
import sys

# Script para auditar los payloads enviados por el Asistente IA hacia Google Gemini.
# Este script ayuda a identificar si se está enviando información sensible (S10) sin filtrar.

def audit_log(log_file):
    if not os.path.exists(log_file):
        print(f"Error: No se encontró el archivo de log {log_file}")
        return

    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            logs = f.readlines()
        
        print("=== Auditoría de Tráfico de Datos IA ===")
        print(f"Analizando {len(logs)} entradas...\n")
        
        sensitive_keywords = ["costo", "presupuesto", "total", "dni", "sueldo", "partida"]
        warnings_found = 0
        
        for i, line in enumerate(logs):
            try:
                # Intentar parsear el JSON si el log tiene estructura
                if "{" in line:
                    data = json.loads(line[line.find("{"):])
                    # Buscar en el "context" o "systemPrompt"
                    content = str(data)
                    found_keys = [k for k in sensitive_keywords if k in content.lower()]
                    
                    if found_keys:
                        print(f"[ALERTA {i}] Información potencialmente sensible detectada: {found_keys}")
                        print(f"Payload: {content[:100]}...\n")
                        warnings_found += 1
            except:
                continue
                
        if warnings_found == 0:
            print("Resultado: No se detectaron patrones de fuga de datos obvios.")
        else:
            print(f"Resultado: Se encontraron {warnings_found} posibles fugas de datos.")
            
    except Exception as e:
        print(f"Error crítico en la auditoría: {e}")

if __name__ == "__main__":
    # En un entorno real, este script leería los logs de Railway o la consola del navegador.
    # Por ahora, es un template de auditoría de seguridad.
    print("Iniciando Interceptor de Payloads Antigravity...")
    # audit_log("logs_asistente.txt")
