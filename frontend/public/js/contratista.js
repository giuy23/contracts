/**
 * OECE / RONIN.SEACE - Cargador Puente para Retrocompatibilidad
 * Carga dinámicamente el módulo modular app.js.
 */
import('/js/contratista/app.js').catch((err) => {
  console.error('[RONIN.SEACE] Error al inicializar módulo de contratista:', err);
});
