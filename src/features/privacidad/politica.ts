/**
 * Política de Tratamiento de Datos Personales de Kora.
 *
 * Marco legal colombiano: Constitución Política (arts. 15, 20 y 44), Ley 1581
 * de 2012 y Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015),
 * Ley 1098 de 2006 (Código de la Infancia y la Adolescencia) y Ley 1620 de
 * 2013 (convivencia escolar).
 *
 * Al cambiar el texto de forma sustancial, suba VERSION_POLITICA: todos los
 * usuarios deberán aceptarla de nuevo en su siguiente ingreso.
 */
export const VERSION_POLITICA = "2026-11";
export const FECHA_POLITICA = "22 de noviembre de 2026";

export type SeccionPolitica = { id: string; titulo: string; parrafos: string[]; lista?: string[] };

export const SECCIONES_POLITICA: SeccionPolitica[] = [
  {
    id: "responsable",
    titulo: "1. Responsable y encargado del tratamiento",
    parrafos: [
      "El responsable del tratamiento es la institución educativa en la que usted está registrado (su nombre, código DANE y datos de contacto aparecen en la plataforma). Kora actúa como encargado del tratamiento: procesa los datos por cuenta y bajo las instrucciones de la institución, solo para los fines aquí descritos.",
      "Las solicitudes, consultas y reclamos se dirigen a la secretaría o rectoría de la institución, que es la responsable de atenderlos dentro de los plazos legales.",
    ],
  },
  {
    id: "datos",
    titulo: "2. Datos que se tratan",
    parrafos: ["Kora trata únicamente los datos necesarios para la gestión académica y convivencial:"],
    lista: [
      "Identificación: tipo y número de documento, nombres y apellidos.",
      "Contacto del acudiente: teléfono y parentesco.",
      "Académicos: matrícula, grupo, calificaciones, actividades, asistencia, boletines e informes.",
      "Convivencia: nota de convivencia, anotaciones del observador y procesos de la Ley 1620 de 2013. Son datos de acceso restringido.",
      "Técnicos de seguridad: fecha, hora y dirección IP de ingresos, intentos fallidos y aceptación de esta política.",
    ],
  },
  {
    id: "finalidades",
    titulo: "3. Finalidades",
    parrafos: ["Los datos se usan exclusivamente para:"],
    lista: [
      "Registrar y comunicar el proceso evaluativo del estudiante conforme al Decreto 1290 de 2009 y al SIEE de la institución.",
      "Llevar el registro de convivencia escolar y el debido proceso establecido en la Ley 1620 de 2013 y el Manual de Convivencia.",
      "Enviar avisos y comunicados institucionales a estudiantes y acudientes.",
      "Garantizar la seguridad de las cuentas y la trazabilidad de los cambios (auditoría).",
      "Cumplir obligaciones legales con autoridades educativas (por ejemplo, reportes al SIMAT).",
    ],
  },
  {
    id: "menores",
    titulo: "4. Datos de niñas, niños y adolescentes",
    parrafos: [
      "La mayoría de titulares en Kora son menores de edad. Conforme al artículo 7 de la Ley 1581 de 2012 y al artículo 12 del Decreto 1377 de 2013, sus datos se tratan respetando su interés superior y la prevalencia de sus derechos fundamentales (artículo 44 de la Constitución y Ley 1098 de 2006).",
      "La cuenta de un estudiante solo se crea con la autorización previa, expresa e informada de su representante legal (padre, madre o tutor), que la institución registra al momento de la matrícula. La opinión del estudiante se tiene en cuenta según su madurez, autonomía y capacidad para entender el asunto.",
      "Los datos de convivencia de un menor nunca se publican ni se comparten con otros estudiantes o acudientes: solo los ven el estudiante, sus acudientes registrados y el personal autorizado de la institución.",
    ],
  },
  {
    id: "derechos",
    titulo: "5. Derechos de los titulares",
    parrafos: ["Usted (o el representante legal del menor) tiene derecho a:"],
    lista: [
      "Conocer, actualizar y rectificar sus datos personales.",
      "Solicitar prueba de la autorización otorgada.",
      "Ser informado sobre el uso que se ha dado a sus datos.",
      "Revocar la autorización y solicitar la supresión de los datos, cuando no exista un deber legal de conservarlos (por ejemplo, el registro académico que la institución debe conservar).",
      "Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), una vez agotado el trámite ante la institución.",
      "Acceder gratuitamente a sus datos personales.",
    ],
  },
  {
    id: "procedimiento",
    titulo: "6. Consultas y reclamos",
    parrafos: [
      "Las consultas se atienden en un máximo de diez (10) días hábiles y los reclamos en un máximo de quince (15) días hábiles, prorrogables en los términos de los artículos 14 y 15 de la Ley 1581 de 2012. Puede presentarlos por escrito ante la institución. Desde la opción «Privacidad» de su cuenta puede consultar y revocar su autorización.",
    ],
  },
  {
    id: "seguridad",
    titulo: "7. Seguridad y confidencialidad",
    parrafos: [
      "Cada institución opera en un espacio aislado: la base de datos impide que un colegio vea datos de otro. Las contraseñas se guardan cifradas, las sesiones vencen a las 8 horas, los intentos de ingreso fallidos se bloquean y todo cambio de notas queda registrado con su autor.",
      "El personal de la institución solo accede a la información que su rol requiere y está obligado a guardar reserva.",
    ],
  },
  {
    id: "vigencia",
    titulo: "8. Vigencia y cambios",
    parrafos: [
      "Esta política rige desde su publicación. Los datos se conservan mientras exista la relación con la institución y durante el tiempo que exijan las normas de archivo y registro académico. Si la política cambia de forma sustancial, se le pedirá aceptarla nuevamente antes de seguir usando la plataforma.",
    ],
  },
];
