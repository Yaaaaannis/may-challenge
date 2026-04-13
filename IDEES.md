# Idées d'amélioration — Petit Train

---

## Gameplay

### Réseau ferroviaire
- **Horaires** : chaque train a un horaire, points si on arrive à l'heure, malus si en retard
- **Passagers** : petites silhouettes sur les quais qui attendent, montent dans les wagons, descendent à destination
- **Correspondances** : plusieurs trains sur le même réseau, le joueur gère les priorités aux aiguillages
- **Billets** : système de revenus selon distance parcourue × nombre de passagers
- **Incidents** : retards aléatoires, voie bloquée, météo qui ralentit — il faut s'adapter

### Objectifs & progression
- **Missions** : "Transporte 10 passagers de A à B en moins de 3 minutes", "Passe la tempête sans dérailler"
- **Étoiles** : 1-3 étoiles par circuit selon vitesse, incidents, passages à l'heure
- **Déblocage** : nouveaux circuits, locomotives, wagons selon les étoiles accumulées
- **Record de vitesse** : chrono par circuit, classement local, fantôme (ghost train)
- **Économie** : acheter de nouveaux wagons, améliorer la locomotive, construire des voies

### Interaction
- **Mode Caméra train** : vue embarquée depuis la locomotive, immersif
- **Sifflet interactif** : les animaux / personnages sur le bord réagissent
- **Caméra drone** : vue libre découplée du train pour admirer le paysage
- **Zoom dynamique** : la caméra recule automatiquement à haute vitesse

---

## Environnement & monde

### Faune et flore
- **Animaux** : vaches, moutons, renards qui paissent le long des voies et s'écartent au passage du train
- **Oiseaux** : envolée de moineaux quand le train approche
- **Arbres animés** : swaying trees selon le vent et le biome
- **Fleurs & herbe** : shader de végétation procédurale qui s'écrase sous le vent du train

### Lieux & structures
- **Villages** : maisons low-poly regroupées en bourgs le long des voies, lumières la nuit
- **Gares** : bâtiments avec quai, horloge, panneau de destination
- **Tunnels améliorés** : lumières intérieures, effet de souffle à l'entrée/sortie
- **Ponts** : ponts en pierre, viaducs, pont tournant, pont-levis
- **Châteaux / ruines** : décoration en hauteur visible depuis le train
- **Phares** : pour les circuits côtiers
- **Fermes** : granges, silos, champs de blé / tournesol avec animation

### Géographie & biomes
- **Désert** : sable, dunes, cactus, heat haze shader
- **Montagne** : neige en altitude, conifères, brouillard de vallée
- **Côte** : plage, vagues, goélands, odeur de sel (texte flottant ?)
- **Forêt tropicale** : végétation dense, brouillard, sons exotiques
- **Toundra** : aurora borealis la nuit, glace sur les rails, sol gelé
- **Zone industrielle** : cheminées, entrepôts, wagons de marchandises

### Terrain dynamique
- **Rivières** : shader eau qui coule, reflets, bruits de cascade
- **Lacs** : eau stagnante, réflexions du ciel
- **Érosion** : le terrain change très lentement selon la saison
- **Inondations** : pluie forte = eau qui monte, le train doit aller plus vite

---

## Technique train & physique

### Locomotives
- **Vapeur** : panaches de fumée plus réalistes (volumétrique), sifflement Doppler
- **Diesel** : son moteur low-poly, fumée noire au démarrage
- **Électrique** : pantographe animé, étincelles aux contacts
- **TGV** : locomotive stylisée moderne, circuits dédiés à haute vitesse
- **Monorail** : circuit surélevé spécifique
- **Locomotive à crémaillère** : pour les circuits très pentus

### Wagons
- **Wagon citerne** : cylindre, liquide qui ballotte
- **Wagon plat** : transport de billes géantes / caisses / voitures
- **Wagon réfrigéré** : vapeur froide qui sort
- **Wagon panoramique** : toit vitré, passagers qui regardent le paysage
- **Wagon restaurant** : lumières chaudes, silhouettes attablées
- **Fourgon de queue** : lanterne rouge clignotante

### Physique
- **Couplage réaliste** : petite correction de position wagon/wagon lors des freinages
- **Suspension** : wagons qui oscillent légèrement sur rails inégaux
- **Déraillement amélioré** : effets de débris, poussière, smoke
- **Inertie de chargement** : wagons pleins freinent moins bien

---

## Réseau & voies

### Éditeur de circuit
- **Snap to grid** : aide à l'alignement
- **Courbes de Bézier** : contrôle plus fin que Catmull-Rom
- **Tunnels auto** : creuse le terrain sous les courbes en pente
- **Ponts auto** : place un pont si les rails passent au-dessus du vide
- **Pente maximale** : alerte si trop raide pour la locomotive choisie
- **Import/export JSON** : sauvegarder et partager ses circuits

### Infrastructure
- **Gares de triage** : zones où les wagons peuvent être découplés / réassemblés
- **Dépôts** : lieu où la locomotive "dort" et se recharge
- **Passages à niveau** : barrières animées qui descendent, voitures qui attendent
- **Plaques tournantes** : cercle qui pivote pour changer de voie (physique)
- **Aiguillages multiples** : bifurcation vers 3 ou 4 voies

---

## Audio

- **Ambient dynamique** : sons de la nature selon le biome (vent, oiseaux, pluie, mer)
- **Sons Doppler** : sifflement et cliquetis qui changent de tonalité selon la vitesse
- **Musique adaptative** : thème calme la nuit, plus rythmé en journée, dramatique en tempête
- **Annonces de gare** : voix synthétique "Prochain arrêt : Brumeville"
- **Cliquetis rails** : rythme qui s'accélère avec la vitesse, changement sur aiguillage
- **Écho en tunnel** : reverb dynamique selon la longueur du tunnel

---

## Visuel & rendu

### Effets post-process
- **Profondeur de champ** : flou bokeh sur les bords, focus sur le train
- **Motion blur** : trainée à haute vitesse
- **Lens flare** : reflet lentille sur le soleil et les lampes
- **Aberration chromatique** : légère frange sur les contours à haute vitesse
- **Heat haze** : distorsion thermique derrière la locomotive à vapeur

### Shaders custom
- **Shader rails** : reflet métallique anisotrope sur les rails
- **Shader fumée volumétrique** : vraie fumée 3D (raymarching)
- **Shader neige** : accumulation sur les surfaces horizontales selon la saison
- **Shader eau** : réfractions, caustiques sur le fond, foam sur les bords
- **Shader nuit étoilée** : voie lactée procédurale avec constellation dynamique

### Lumière & atmosphère
- **Cycle solaire complet** : lever/coucher de soleil avec ciel qui vire orange/violet
- **Lune** : phase lunaire, reflet sur l'eau
- **Brouillard volumétrique** : nappes à mi-hauteur dans les vallées
- **God rays** : rayons crépusculaires à travers les arbres
- **Lumières de gare** : halos de couleur la nuit

---

## UI & expérience utilisateur

### Interface
- **Minimap améliorée** : affiche les gares, incidents, trains fantômes
- **HUD vitesse** : aiguille de tachymètre animée
- **Panneaux de bord** : tableau de bord style vintage avec jauge de charbon / carburant
- **Mode plein écran cinématique** : masque tout le HUD, mode photo
- **Replay** : rejouer les 30 dernières secondes depuis n'importe quel angle caméra

### Accessibilité & confort
- **Daltonisme** : palette de couleurs alternative
- **Vitesse du temps** : x0.5, x1, x2, x4 pour le cycle jour/nuit
- **Zoom caméra** : molette + raccourci clavier
- **Aide contextuelle** : tooltip la première fois qu'on survole un contrôle
- **Sauvegarde automatique** : état du circuit, wagons, météo

---

## Multijoueur & social

- **2 joueurs local** : un conduit, l'autre gère les aiguillages
- **Spectateur** : rejoindre la session d'un ami pour regarder le réseau en temps réel
- **Circuits partagés** : uploader un circuit créé avec l'éditeur
- **Défis hebdomadaires** : circuit imposé, meilleur temps mondial
- **Chat / réactions** : émojis ferroviaires 🚂 🚉 🚦 quand un ami passe un cap

---

## Ambiance & narration

- **Carnet de voyage** : le joueur accumule des "souvenirs" (lieux visités, records)
- **Légendes locales** : textes flottants courts selon les lieux traversés — "Ici, un train disparut en 1902..."
- **Mode rêve** : palette pastel, physique douce, musique lo-fi
- **Mode rétro** : filtre sépia, bruit de pellicule, wagons en bois
- **Mode futuriste** : circuits néon, trains magnétiques, ciel cyberpunk

---

## Mobile & plateformes

- **Contrôles tactiles** : swipe pour accélérer/freiner, pinch pour zoomer
- **Mode portrait** : mini-vue adaptée smartphone
- **PWA** : installable depuis le navigateur, mode hors-ligne
- **Sauvegarde cloud** : sync entre appareils via un ID anonyme
sd