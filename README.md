# ServerUI (fork `serverui-reinvent`)

> 🔀 **Ce dépôt est un fork modifié de [rakhechashubham/serverui](https://github.com/rakhechashubham/serverui),
> réalisé par [remygtech-ops](https://github.com/remygtech-ops).**
> Le projet original appartient à son auteur (licence Apache 2.0, voir [LICENSE](LICENSE)).
> Ce fork ajoute des fonctionnalités, un audit de sécurité avec ses correctifs et un
> installeur Windows amélioré. Les ajouts sont détaillés dans
> [Ce que ce fork change](#ce-que-ce-fork-change).

ServerUI est un panneau de contrôle moderne et open source pour gérer vos serveurs depuis
un navigateur ou l'application de bureau native.

Il propose une interface de bureau inspirée de Linux. Vous ajoutez des serveurs SSH, vous
vous connectez à autant de serveurs que vous voulez en même temps, et vous utilisez Fichiers,
Terminal et Moniteur système sur tous depuis un seul bureau. Rien n'est installé sur vos
serveurs : l'interface n'ouvre jamais de connexion SSH, c'est un backend Go qui stocke les
identifiants chiffrés et se connecte à chaque hôte en SSH classique.

![Bureau ServerUI : Fichiers sur web-01 avec le menu serveurs montrant quatre serveurs connectés](docs/images/desktop.jpg)

<table>
  <tr>
    <td width="50%"><img src="docs/images/system-monitor.jpg" alt="Moniteur système avec les métriques en direct de quatre serveurs"><br><sub><b>Moniteur système</b> : tous les serveurs connectés, en direct.</sub></td>
    <td width="50%"><img src="docs/images/copy-between-servers.jpg" alt="Fichiers après la copie d'un dossier de web-01 vers backup-01"><br><sub><b>Copie entre serveurs</b> : glissez un dossier sur un autre serveur dans la barre latérale.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/images/terminal-tabs.jpg" alt="Terminal ouvert dans le dossier copié sur backup-01, avec un second onglet sur web-01"><br><sub><b>Terminal</b> : ouvrez-le depuis n'importe quel dossier, avec un onglet par serveur.</sub></td>
  </tr>
</table>

## Téléchargement

**Installeur Windows (x64) de ce fork :**
[page des Releases](https://github.com/remygtech-ops/serverui-reinvent/releases/latest)
→ téléchargez `ServerUI-<version>-x64-setup.exe`.

L'installeur n'est **pas signé** (pas de certificat de signature de code) : Windows SmartScreen
peut afficher un avertissement au premier lancement. Cliquez sur **Informations complémentaires**
puis **Exécuter quand même**. Vérifiez l'intégrité avec le fichier `SHA256SUMS` de la release
(`certutil -hashfile <fichier> SHA256`).

L'installeur s'installe par utilisateur (pas besoin des droits administrateur), crée un dossier
dans le menu Démarrer, et propose le français ou l'anglais. Sur Windows, l'icône de la barre des
tâches porte une petite **pastille violette** qui distingue cette version.

Les builds macOS et Linux de l'application d'origine restent disponibles sur la
[page des releases du projet original](https://github.com/rakhechashubham/serverui/releases).
Voir [docs/releases.md](docs/releases.md).

## Ce que ce fork change

Toutes les nouveautés reprennent le style visuel de ServerUI et fonctionnent sous Linux et Windows.

### Fonctionnalités ajoutées

| Domaine              | Nouveauté                                                                                                                                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔑 Mots de passe SSH | Case **« Se souvenir du mot de passe »** par serveur : mot de passe chiffré (AES-256-GCM) et conservé après la fermeture. Décochée, il reste en mémoire seulement. Sur le bureau, la clé de chiffrement est stable (trousseau du système, sinon fichier `0600`)                                                                   |
| 🔐 Clés SSH          | Prise en charge des clés privées **protégées par une passphrase**                                                                                                                                                                                                                                                                 |
| 🖥️ Terminal          | Zoom (Ctrl +/-/0, Ctrl + molette), **dix thèmes** appliqués au terminal seul, police et curseur réglables avec **aperçu en direct** dans Paramètres → Terminal, recherche (Ctrl+Maj+F), copie à la sélection, collage au clic droit, **reconnexion automatique**                                                                  |
| 🎨 Invite colorée    | Coloration de la ligne d'invite (`user@hôte:~/...`) faite **dans l'interface** : rien n'est ajouté au shell du serveur                                                                                                                                                                                                            |
| 🗝️ KeyKey            | **Coffre de mots de passe intégré**, chiffré dans le navigateur (AES-256-GCM, mot de passe maître PBKDF2), générateur, effacement automatique du presse-papiers, verrouillage automatique. Paramètres → Sécurité permet de le remplacer par une instance **Bitwarden / Vaultwarden** (lecture seule, via l'API locale `bw serve`) |
| 🔒 Verrouillage      | Écran de verrouillage **optionnel** par code PIN ou phrase secrète, avec verrouillage automatique après inactivité                                                                                                                                                                                                                |
| 📋 Snippets          | Nouvelle application : commandes shell enregistrées, classées par groupes, à insérer ou exécuter dans le terminal ouvert                                                                                                                                                                                                          |
| 🗂️ Groupes           | **Groupes de serveurs** dans la barre latérale                                                                                                                                                                                                                                                                                    |
| ✏️ Éditeur           | **Coloration syntaxique** dans l'éditeur de texte                                                                                                                                                                                                                                                                                 |

### Audit de sécurité et correctifs

Trois passes d'audit ont été menées avec le
[security-audit-skill de Cloudflare](https://github.com/cloudflare/security-audit-skill)
(profil « quick », périmètres ciblés : ce n'est **pas** une certification). Correctifs principaux :

- identifiants enregistrés **liés à leur serveur de destination** (impossible de les réutiliser
  vers un autre hôte) ;
- **épinglage de la clé d'hôte SSH** à la première connexion (TOFU), de façon atomique ;
- mode web : vérification des en-têtes `Origin` / `Host` (anti-CSRF, anti-DNS rebinding),
  `Content-Type: application/json` obligatoire, jeton en paramètre d'URL limité à deux routes ;
- le mode bureau refuse de démarrer sans jeton d'authentification local ;
- téléchargements : les types actifs (HTML, SVG...) ne sont jamais affichés en ligne, en-têtes
  `nosniff` et CSP en bac à sable ;
- analyse des archives `tar` durcie (liens symboliques et liens physiques vers des liens refusés) ;
- ports Docker liés à `127.0.0.1` par défaut, capacités Tauri réduites, workflow de release
  durci (entrées passées par variables d'environnement).

### ⚠️ Changements de comportement à connaître

- **Docker** : les ports sont liés à `127.0.0.1`. Pour un accès depuis le réseau local, définissez
  `BIND_HOST`, `SERVERUI_ALLOWED_HOSTS` et `SERVERUI_ALLOWED_ORIGINS` (voir `.env.example`).
- **Clé d'hôte SSH modifiée** : la connexion est refusée. Pour accepter la nouvelle clé,
  ressaisissez le secret du serveur.
- **Archives** dont un nom de fichier contient un texte ressemblant à une date : refusées par
  précaution.

### Installeur et version

- Version **0.3.1**.
- Installeur NSIS : installation par utilisateur, dossier du menu Démarrer, icône dédiée, langues
  français / anglais.
- Pastille violette sur l'icône de la barre des tâches (Windows uniquement).
- Workflow [Windows Installer](.github/workflows/windows-installer.yml) : compile l'installeur et
  publie une Release GitHub sans avoir à créer de tag à la main.

## Fonctionnalités

Opérationnel dans ce dépôt :

- **Tous vos serveurs sur un seul bureau** : connectez plusieurs serveurs à la fois ; la barre
  du haut affiche l'état de chacun, et chaque application fonctionne sur l'ensemble
- Gestionnaire de serveurs : ajouter, modifier, supprimer, connecter, déconnecter et tester une
  connexion avant d'enregistrer, avec une icône par serveur
- Authentification SSH par mot de passe
- Authentification SSH par clé privée (OpenSSH / PEM, **avec ou sans passphrase**)
- **Moniteur système** : vue d'ensemble de tous les serveurs connectés (CPU, mémoire, disque,
  réseau, tableau comparatif triable), plus le détail par serveur : CPU, mémoire, disque, réseau,
  processus et services systemd
- Inspection des processus et SIGTERM ; démarrage, arrêt et redémarrage des services systemd
- **Terminal** : terminal navigateur via WebSocket → PTY SSH, avec un onglet par serveur ;
  ouverture directe depuis un dossier dans Fichiers
- **Fichiers (SFTP)** : gestionnaire de fichiers façon Finder avec sélection multiple,
  glisser-déposer, copier/couper/coller, envoi, file de téléchargement, compression et extraction
  d'archives (`.zip`, `.tar`, `.tar.gz`/`.tgz`, `.tar.bz2`, `.tar.xz`, `.7z`, exécutées sur le
  serveur avec son propre `tar` / `unzip` / `7z`)
- **Copie entre serveurs** : glissez des fichiers ou dossiers sur un autre serveur connecté dans
  la barre latérale de Fichiers, ou copiez sur un serveur et collez sur un autre
- Aperçu de fichiers (images, vidéo, audio, PDF, texte et code) et éditeur de texte pour les
  fichiers distants, avec coloration syntaxique
- Bureau inspiré de Linux avec dock, gestionnaire de fenêtres, fonds d'écran, raccourcis de
  dossiers, thèmes macOS ou Aura
- Chiffrement AES-256-GCM des identifiants stockés
- Fonctionnalités du fork : mots de passe mémorisables, terminal personnalisable, Snippets,
  coffre KeyKey, verrouillage de l'application, groupes de serveurs (voir
  [Ce que ce fork change](#ce-que-ce-fork-change))

Pas encore implémenté (l'interface peut afficher « Bientôt disponible ») :

- Éditeur de code complet dans le navigateur (l'éditeur actuel est un éditeur de texte simple)
- Gestion des applications, des domaines et des bases de données
- CLI ServerUI
- Agent ServerUI

Les Paramètres (À propos, exécution, raccourcis ; mises à jour du bureau) sont disponibles.

Voir [Limites actuelles](#limites-actuelles).

## Architecture

```
Navigateur / UI
   │
   ▼
Web Next.js
   │  HTTP / WebSocket
   ▼
Serveur API Go
   ├── PostgreSQL (web)  ou  SQLite (bureau)
   └── SSH
        │
        ▼
     Serveur cible
```

L'interface trouve l'API Go grâce à un petit utilitaire d'exécution, ce qui permet au même
client de parler à un backend distant (web) ou local (bureau). Docker est une option de
déploiement pour les installations web / auto-hébergées ; le serveur Go peut aussi tourner
depuis les sources avec PostgreSQL. Le bureau empaqueté utilise SQLite en local et ne nécessite
ni Docker ni PostgreSQL.

Détails : [docs/architecture.md](docs/architecture.md) (inclut l'**architecture d'exécution**
Web / Bureau / Sources). Durcissement du bureau :
[docs/desktop-security.md](docs/desktop-security.md),
[docs/desktop-storage.md](docs/desktop-storage.md). Releases et installeurs :
[docs/releases.md](docs/releases.md). Audit produit / QA manuelle :
[docs/product-audit.md](docs/product-audit.md),
[docs/manual-qa.md](docs/manual-qa.md).

## Fonctionnement

L'interface envoie un `serverId`. Le processus Go charge l'hôte enregistré, déchiffre les
identifiants et utilise un pool SSH par serveur. Fichiers, terminal et métriques sont limités à
cet identifiant.

Le navigateur n'ouvre jamais de connexion SSH. Le processus Go stocke les fiches serveur dans
PostgreSQL (web) ou SQLite local (bureau). Les secrets sont chiffrés au repos avec AES-256-GCM.
Un terminal WebSocket est un PTY sur l'hôte choisi. La navigation dans les fichiers utilise SFTP
sur cette même connexion poolée.

## Structure du projet

```
serverui/
├── apps/
│   ├── web/                 UI Next.js (partagée web + bureau)
│   ├── server/              API Go, SSH, PostgreSQL
│   └── desktop/             Coque de bureau Tauri
├── deploy/
│   └── docker/              Fichiers Compose
├── docs/
│   ├── architecture.md
│   ├── desktop.md
│   ├── product-audit.md
│   ├── manual-qa.md
│   ├── releases.md
│   └── images/
├── scripts/
│   └── pre-commit
├── .githooks/
│   └── pre-commit
├── .github/
│   ├── workflows/ci.yml
│   ├── workflows/desktop.yml
│   ├── workflows/desktop-release.yml
│   ├── workflows/windows-installer.yml
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── Makefile
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── LICENSE
└── .env.example
```

## Prérequis

Vérifiés sur ce dépôt :

| Outil      | Version utilisée en développement  |
| ---------- | ---------------------------------- |
| Git        | toute version récente              |
| Docker     | 28.x (Compose v2)                  |
| Node.js    | 22.x                               |
| npm        | 10.x                               |
| Go         | 1.26                               |
| Rust       | stable (MSRV 1.77+) pour le bureau |
| Make       | GNU Make                           |
| OpenSSL    | pour générer la clé de chiffrement |
| lazydocker | requis pour `make dev`             |

Docker Desktop (ou équivalent) doit être lancé pour `make start` et `make dev`.

lazydocker est requis pour `make dev`, mais pas pour `make start`.
Installation : [lazydocker](https://github.com/jesseduffield/lazydocker).

## Démarrage rapide

```bash
git clone https://github.com/remygtech-ops/serverui-reinvent.git
cd serverui-reinvent
cp .env.example .env
make setup-env
make hooks
make start
```

`make setup-env` copie `.env.example` si `.env` n'existe pas et génère
`SERVERUI_CREDENTIAL_ENCRYPTION_KEY` si la valeur est vide.

`make hooks` est optionnel. Il fait pointer Git vers `.githooks` pour que les commits locaux
lancent format, lint et tests. Les hooks peuvent être contournés ; la CI est la vraie barrière.

Ouvrez ensuite [http://localhost:3000](http://localhost:3000). L'API écoute sur
[http://localhost:8080](http://localhost:8080).

Ajoutez un serveur dans l'interface (nom, hôte, port SSH, utilisateur, mot de passe ou clé
privée). ServerUI teste le SSH depuis le conteneur Go, stocke le secret chiffré et se connecte
quand vous choisissez **Connecter**.

## Configuration de l'environnement

Fichier de référence : `.env.example` (à copier en `.env`). Compose accepte aussi
`deploy/docker/.env`.

| Catégorie       | Variable                             | Rôle                                                                |
| --------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Exécution       | `HTTP_PORT`                          | Port hôte de l'API Go                                               |
| Exécution       | `WEB_PORT`                           | Port hôte de l'interface web                                        |
| Réseau (fork)   | `BIND_HOST`                          | Adresse d'écoute des ports publiés ; `127.0.0.1` par défaut         |
| Sécurité (fork) | `SERVERUI_ALLOWED_HOSTS`             | Noms d'hôte autorisés en mode web (protection DNS rebinding)        |
| Sécurité (fork) | `SERVERUI_ALLOWED_ORIGINS`           | Origines autorisées en mode web                                     |
| Base de données | `POSTGRES_USER`                      | Utilisateur PostgreSQL                                              |
| Base de données | `POSTGRES_PASSWORD`                  | Mot de passe PostgreSQL (local uniquement)                          |
| Base de données | `POSTGRES_DB`                        | Nom de la base                                                      |
| Base de données | `POSTGRES_HOST`                      | Optionnel ; `127.0.0.1` en natif ; Compose utilise `postgres`       |
| Base de données | `DATABASE_URL`                       | DSN optionnel ; `POSTGRES_*` suffit avec Compose                    |
| Identifiants    | `SERVERUI_CREDENTIAL_ENCRYPTION_KEY` | Clé de 32 octets en 64 caractères hexa (backend uniquement)         |
| API (optionnel) | `NEXT_PUBLIC_API_BASE`               | Origine de l'API Go côté navigateur si ce n'est pas la même origine |
| Déploiement     | `SERVER_INTERNAL_URL`                | Cible de réécriture côté serveur Next.js (définie par Compose)      |

Générer une clé :

```bash
openssl rand -hex 32
```

Ne commitez jamais `.env`, des mots de passe ou des clés privées. Les hôtes d'exemple de la
documentation utilisent `203.0.113.10` et l'utilisateur `deploy`. Ne mettez pas la clé de
chiffrement ni des secrets SSH dans les variables d'environnement du frontend.

## Développement

```bash
make dev
```

Lance l'environnement Docker de développement (sources montées, `next dev`, `go run`) et ouvre
LazyDocker automatiquement.

Quand vous quittez LazyDocker, ou avec Ctrl+C, les conteneurs de développement sont supprimés.
Le volume PostgreSQL est conservé : la base locale est réutilisée au prochain `make dev`.

`make docker-tui` ouvre seulement LazyDocker pour des services déjà lancés. Il ne démarre ni
n'arrête la pile.

### Application de bureau

**Installer (recommandé pour les utilisateurs) :** téléchargez l'installeur depuis les
[Releases GitHub](https://github.com/remygtech-ops/serverui-reinvent/releases), vérifiez les
sommes SHA-256, installez et lancez. Aucun PostgreSQL, Docker, Node, Go ni Rust n'est requis pour
le bureau empaqueté : la base SQLite locale est créée automatiquement. Détails :
[docs/releases.md](docs/releases.md), [docs/desktop.md](docs/desktop.md),
[docs/desktop-storage.md](docs/desktop-storage.md).

**Développer depuis les sources :** nécessite Rust/cargo en plus des prérequis web. Le mode
desktop-dev par défaut utilise SQLite local (pas de Postgres) :

```bash
make setup-env
make desktop-dev
```

Test optionnel avec Postgres : `make desktop-db` puis
`SERVERUI_STORAGE=postgres make desktop-dev`.

Tauri charge l'interface Next.js et lance `bin/serverui-server` sur
`127.0.0.1:<port-dynamique>` avec un jeton d'authentification local propre à chaque lancement.
Voir [docs/desktop.md](docs/desktop.md) et [apps/desktop/README.md](apps/desktop/README.md).

```bash
make desktop-build
make desktop-build-macos          # arm64 + x64 → dist/macos/
make desktop-build-windows-x64    # hôte Windows uniquement
make desktop-build-linux-x64      # hôte Linux uniquement
make desktop-build-all            # instructions de release CI (pas de faux cross-build)
```

Produit un bundle Tauri (installeurs selon l'hôte) avec une UI exportée statiquement et le
binaire Go en sidecar. La signature et les signatures de mise à jour demandent des secrets CI ;
les builds locaux ne sont pas signés par défaut. Matrice complète de production :
[docs/releases.md](docs/releases.md).

## Démarrage en production locale

```bash
make start
```

Construit les images de production et lance web, API et Postgres en arrière-plan. La commande
rend la main immédiatement et les services continuent de tourner.

```bash
make docker-ps
make docker-logs
make docker-down
```

`make docker-up` lance la pile Compose de développement en arrière-plan, sans LazyDocker.

Vérifications natives (après `npm install` dans `apps/web`) :

```bash
make test
make lint
make format
make format-check
make build
```

Les sources Go sont dans `apps/server`, l'application web dans `apps/web`.

## Tests

```bash
make test
```

Lance Vitest dans `apps/web` et `go test ./...` dans `apps/server`.

## Lint

```bash
make lint
```

ESLint pour l'application web, `go vet` pour le backend.

## Formatage

```bash
make format         # gofmt + Prettier
make format-check   # échoue si quelque chose changerait
```

## Compilation

```bash
make build
```

Produit un build de production Next.js dans `apps/web/.next` et `bin/serverui-server`. Les
binaires et `.next` sont ignorés par Git.

```bash
make docker-build
```

Construit les images Compose de production sans les lancer. `make start` les construit et les
démarre. Les images de développement sont construites par `make dev` / `make docker-up`.

## Sécurité

Les identifiants sont chiffrés au repos. Les API GET ne renvoient pas les secrets. Voir
[SECURITY.md](SECURITY.md). Le détail de l'audit du fork est résumé dans
[Ce que ce fork change](#ce-que-ce-fork-change).

Signalez les vulnérabilités de ce fork en privé via les
[Security advisories](https://github.com/remygtech-ops/serverui-reinvent/security/advisories/new)
du dépôt. Pour le projet original : [contact@skyrekon.com](mailto:contact@skyrekon.com).
N'attachez jamais de clés ni de mots de passe à une issue.

## Contribuer

ServerUI est open source sous licence Apache 2.0.

- [CONTRIBUTING.md](CONTRIBUTING.md) : mise en place, noms de branches, commits, PR
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Issues : modèles de bug et de fonctionnalité dans `.github/ISSUE_TEMPLATE/`
- CI : `.github/workflows/ci.yml` lance format, lint, tests, build et un build d'image Docker

Les hooks Git locaux (`make hooks`) bloquent les commits si le format, le lint ou les tests
échouent. Ce sont des garde-fous locaux optionnels ; la CI fait foi.

Deux workflows de release existent : `.github/workflows/desktop-release.yml` (déclenché par un
tag, toutes plateformes) et `.github/workflows/windows-installer.yml` (installeur Windows, Release
créée automatiquement). Voir [docs/releases.md](docs/releases.md).

## Feuille de route

Prévu, pas encore disponible :

- Signature de code / notarisation pour tous les canaux de bureau (dépend de secrets)
- Matrice de vérification d'exécution des installeurs plus large
- CLI ServerUI
- Agent d'hôte optionnel
- Éditeur dans le navigateur
- Gestion des applications, des domaines et des bases de données
- Serveur MCP pour Claude Desktop (reporté)

Livré / dans l'arbre :

- Stockage des identifiants dans le trousseau du système pour le bureau
- SQLite local pour le bureau empaqueté (Postgres reste utilisé pour le web)
- Matrice de packaging bureau (macOS arm64+x64, Windows x64, Linux x64) + CI de release
- Paramètres (À propos, exécution, mises à jour du bureau)
- Bureau multi-serveurs, moniteur système global, copie entre serveurs et onglets de terminal (0.3.0)
- Fork : mots de passe mémorisables, terminal personnalisable, KeyKey, verrouillage, Snippets,
  groupes, coloration syntaxique, audit de sécurité, pastille violette (0.3.1)

## FAQ

**Le navigateur se connecte-t-il en SSH à mon VPS ?**  
Non, c'est le serveur Go qui le fait.

**Puis-je ajouter plusieurs serveurs ?**  
Oui, et vous pouvez les garder tous connectés en même temps. Chacun a sa configuration, son
secret chiffré et sa connexion SSH.

**Les fichiers copiés entre serveurs passent-ils directement d'un hôte à l'autre ?**  
Non. Le backend ServerUI lit sur un serveur en SFTP et écrit sur l'autre : les données passent
par la machine qui héberge le backend (votre ordinateur pour l'application de bureau).

**Mes mots de passe sont-ils enregistrés en clair ?**  
Non. Ils sont chiffrés (AES-256-GCM). Vous pouvez aussi décocher « Se souvenir du mot de passe »
pour qu'ils ne restent qu'en mémoire.

**Les Applications / Domaines / Bases de données existent-ils vraiment ?**  
Pas encore. Ces fenêtres sont des espaces réservés « Bientôt disponible ».

**Y a-t-il une CLI ou un agent ?**  
Non. Les cibles Makefile correspondantes ont été retirées car le code n'est pas dans ce dépôt.

## Limites actuelles

- Ce n'est pas un SaaS multi-tenant durci pour la production. Considérez-le comme un panneau de
  contrôle auto-hébergé.
- Vérification de la clé d'hôte SSH en mode **TOFU** : la première clé vue est épinglée, puis un
  changement est refusé tant que vous ne ressaisissez pas le secret du serveur. Il n'y a pas
  d'import d'empreintes ni d'autorité de certification SSH.
- L'application ServerUI elle-même n'a pas de connexion utilisateur, de SSO ni de RBAC. Le
  verrouillage par PIN / phrase est un verrou d'écran local, pas un système de comptes.
- Les Applications, Domaines et Bases de données ne sont pas implémentés. L'éditeur est un éditeur
  de texte simple (fichiers jusqu'à 512 Ko, pas de sudo).
- Les actions sur les processus et services (kill, start/stop/restart) fonctionnent dans le
  Moniteur système d'un serveur (Serveurs → Voir les métriques). Dans le moniteur global ouvert
  depuis le dock, elles n'agissent pas encore.
- Un dépôt sur un autre serveur dans la barre latérale de Fichiers copie dans le dossier personnel
  de ce serveur et n'écrase jamais un élément existant.
- Pas de CLI ni d'agent.
- L'extraction d'archives nécessite `tar` (plus `gzip` / `bzip2` / `xz`), `unzip` Info-ZIP ou `7z`
  sur le serveur. Les archives protégées par mot de passe, les `.rar` et les fichiers compressés
  seuls comme `.gz` ne sont pas pris en charge. Les archives contenant des noms de fichiers qui
  ressemblent à une date de listing sont refusées par précaution.
- KeyKey (coffre natif) est chiffré dans le navigateur ; l'intégration Bitwarden / Vaultwarden est
  en lecture seule.
- Application de bureau : coque Tauri avec installeurs de release. L'installeur Windows de ce fork
  n'est pas signé, et le code Windows de la pastille n'a pas été testé sur une vraie machine avant
  publication.
- L'audit de sécurité du fork est partiel (voir plus haut) et ne remplace pas un audit complet.

## Contact

Fork : [remygtech-ops](https://github.com/remygtech-ops) (issues du dépôt
[serverui-reinvent](https://github.com/remygtech-ops/serverui-reinvent/issues)).

Projet original : [contact@skyrekon.com](mailto:contact@skyrekon.com), pour les rapports de
sécurité, les questions de contribution et tout autre contact.

## Licence

Apache License 2.0. Copyright 2026 Skyrekon Private Limited pour le projet original ; les
modifications de ce fork sont publiées sous la même licence. Voir [LICENSE](LICENSE).
