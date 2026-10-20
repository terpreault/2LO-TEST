2LO TEST V6.0.2 — TEST DE SYNCHRONISATION (NE PAS PUBLIER EN PRODUCTION)

DANS CETTE ARCHIVE :
- Apparence et jauges de V6.0.1 préservées, trois univers.
- Version locale hors ligne avec file d’attente des modifications.
- Authentification par Magic Link Supabase, seulement pour les comptes existants.
- Synchronisation avec three_worlds_logs et three_worlds_settings uniquement.
- Anciennes tables hydration_logs et hydration_settings NON UTILISÉES.
- Pas de notification réelle : stage séparé.

CONFIGURATION (sur le ZIP / dépôt TEST seulement) :
Dans config.js, Project URL et Publishable key publiques sont déjà renseignées.
Ne JAMAIS renseigner une Secret key ni service_role. La Publishable key est conçue pour les clients publics,
mais la sécurité repose sur les politiques RLS du projet.
Cette version TEST est configurée pour le projet existant, mais la synchronisation
réelle et la connexion Magic Link doivent encore être validées sur iPhone et Mac.

IMPORTANT SUR LES DONNÉES :
- Les anciennes prises fictives de la V6.0.1 restent dans leur stockage local
  d’origine, elles ne sont PAS importées automatiquement dans Supabase.
- Chaque utilisateur connecté a son propre stockage local.
- Une consommation ajoutée hors ligne est enregistrée immédiatement
  et envoyée avec le même UUID lorsqu’une connexion revient.
- Les suppressions utilisent deleted_at et se répercutent après la reconnexion.
- Déconnexion bloquée si des modifications sont en attente.
- Une mauvaise réponse réseau ne remplace jamais l’état local par une liste vide.

AVANT VALIDATION :
Tester iPhone installée / Safari / Mac, retour du lien magique, synchronisation
bi-directionnelle, modification hors ligne et reconnexion, suppression hors ligne,
absence de doublons. Tests réels obligatoires : Supabase n’était pas configuré
dans le ZIP source et l’environnement de préparation est hors ligne.

Note : iOS peut ouvrir un Magic Link dans Safari, et la session Safari peut être
différente de celle de la PWA installée. Ce parcours doit être validé avant
de déclarer l’authentification iPhone terminée.
