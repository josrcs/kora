import "server-only";
import bcrypt from "bcryptjs";

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

/** Hash fijo para comparar cuando el documento no existe: el tiempo de respuesta no revela si la cuenta existe. */
const HASH_SENUELO = bcrypt.hashSync("senuelo-no-es-una-clave", ROUNDS);

export function hashPassword(password: string) {
  return bcrypt.hash(password, ROUNDS);
}

export async function verificarPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? HASH_SENUELO);
  return ok && !!hash;
}

const COMUNES = new Set(["12345678", "123456789", "1234567890", "password", "contraseña", "qwerty123", "colegio123", "abc12345"]);

/** Política de contraseñas. Devuelve el problema o null si es aceptable. */
export function problemaPassword(password: string, documento: string): string | null {
  if (password.length < 8) return "Debe tener al menos 8 caracteres.";
  if (new TextEncoder().encode(password).length > 72) return "Es demasiado larga (máximo 72 caracteres).";
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(password) || !/\d/.test(password)) return "Debe combinar letras y números.";
  if (password.includes(documento)) return "No puede contener su número de documento.";
  if (COMUNES.has(password.toLowerCase())) return "Es demasiado común. Elija otra.";
  return null;
}
