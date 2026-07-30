-- =============================================================================
-- 004 — Qui a le droit de voir mon profil.
--
-- CE FICHIER EST LE PLUS SENSIBLE DU DÉPÔT. La table `profils` contient le
-- pseudo, la couleur, l'emblème et la PHOTO DE VISAGE en base64. Une policy
-- de lecture en `using (true)` la rendrait lisible par n'importe quel compte
-- créé sur le projet — et /auth/v1/signup est ouvert.
--
-- Les policies permissives se COMBINENT EN OU. Ajouter une règle large à côté
-- d'une règle stricte ne restreint rien : ça ouvre tout. D'où le `drop policy
-- if exists` portant le nom EXACT de la production avant le `create`.
-- =============================================================================

-- En `security definer` : la fonction doit lire `abonnements` pour répondre,
-- or la policy d'`abonnements` ne montre que mes propres lignes. `stable` pour
-- que le planificateur ne la rappelle pas à chaque ligne examinée.
create or replace function public.dans_mon_cercle(cible uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select cible = auth.uid()
      or exists (
           select 1 from public.abonnements a
           where (a.suiveur = auth.uid() and a.suivi   = cible)
              or (a.suivi   = auth.uid() and a.suiveur = cible)
         );
$function$;

-- Moi, les gens que je suis, et les gens qui me suivent. Personne d'autre.
drop policy if exists "profils lisibles par mon cercle" on public.profils;
create policy "profils lisibles par mon cercle"
  on public.profils for select to authenticated
  using (public.dans_mon_cercle(user_id));

-- Contrôle après exécution — doit renvoyer exactement une ligne :
--   select policyname, qual from pg_policies
--    where tablename = 'profils' and cmd = 'SELECT';
