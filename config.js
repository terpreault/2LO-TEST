// 2LO TEST V6.0.2 — valeurs publiques uniquement, jamais de secret/service_role.
// Laisser vide pour garder le mode démo local sans communiquer avec Supabase.
window.TWOLO_TEST_MODE = false;
window.GASSIEN_CONFIG = {
  SUPABASE_URL: "https://ieqnticbccxogltdyege.supabase.co", // ex. "https://mon-projet.supabase.co" (Project URL)
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_d4Qy8aS3yiaenT9pGz_lBg_9CQl-z4-", // clé sb_publishable_... de Project Settings / API Keys
  VAPID_PUBLIC_KEY: "" // notifications non activées dans cette version
};
