# Petit Train — Sandbox 3D

## Vision

Démo interactive en Three.js d'un train jouet qui tourne sur un circuit en boucle.
Le projet est un **bac à sable** : on peut modifier la vitesse, ajouter/retirer des wagons,
changer de circuit, passer en mode nuit, et manipuler physiquement les véhicules avec
un système de grab-and-drop et un mode poing (Rapier).

---

## Stack technique

| Outil | Rôle |
|---|---|
| **Vite 8** + **TypeScript** | Bundler & langage |
| **Three.js 0.183** | Rendu 3D (WebGL) |
| **@dimforge/rapier3d-compat 0.19** | Physique rigide (déraillement, throw) |
| **DRACOLoader / GLTFLoader** | Chargement du modèle `train.glb` (mesh Draco) |
| **OrbitControls** | Caméra orbit (désactivée en mode poing / grab) |

Pas de framework UI (React installé mais non utilisé). Tout est vanilla TS dans `src/main.ts`.

---

## Modèle 3D — `train.glb`

Locomotive Blender exportée en glTF 2.0 avec compression **KHR_draco_mesh_compression**.

Structure des nœuds :
- `Cube` — corps principal (scale X ×2.62, longueur ~6.7 u avant mise à l'échelle)
- `Cube.001` — cabine (translation [1.54, 1.97, 0])
- `Cylinder` — cheminée (translation [1.58, 2.97, 0])
- `Circle` × 4 — roues (positions symétriques en Z ±0.7 / ±1.65)

Le modèle est chargé à `scale = 0.28` → longueur effective ≈ 1.9 unités monde.
Le modèle s'étend le long de son axe **+X local**.
Pour que `lookAt` fonctionne (qui oriente le **−Z** du groupe vers la cible),
l'inner scene est pré-rotée de **+π/2 autour de Y** (`inner.rotation.y = Math.PI/2`).

Decoder Draco chargé depuis le CDN gstatic (connexion internet requise) :
```
https://www.gstatic.com/draco/versioned/decoders/1.5.6/
```

---

## Architecture du code (src/main.ts — fichier unique)

### Circuits paramétriques

Trois formes, chacune définie par `fn(t) → {x, z}` avec `t ∈ [0, 1)` :

| # | Nom | Formule |
|---|---|---|
| 0 | Cercle | `x = 4.5·cos(2πt)`, `z = 4.5·sin(2πt)` |
| 1 | Ovale | `x = 7.2·cos(2πt)`, `z = 3.6·sin(2πt)` |
| 2 | Huit ∞ | `x = 4.8·sin(2πt)`, `z = 3.2·sin(4πt)` (Lissajous 1:2) |

La tangente est calculée par différences finies (`D = 0.001`).
Les rails utilisent `TubeGeometry` sur une `CatmullRomCurve3` échantillonnée à 256 pts.
Les traverses (`BoxGeometry`) sont orientées avec `atan2(tangent.x, tangent.z)`.

### Placement sur la courbe

```
t = ((rawAngle / 2π) % 1 + 1) % 1
position = curvePt(t)
orientation = lookAt(curvePt(t + ε))
```

`rawAngle` s'incrémente de `speed × dt` rad/s.

### Wagons

Géométrie procédurale (pas de GLB) :
- Corps `BoxGeometry(1.30, 0.64, 0.62)`, couleur configurable
- Toit blanc, 4 fenêtres (émissives la nuit)
- 4 roues : `CylinderGeometry` avec **`rotation.x = π/2`** → axe le long du Z local de l'inner
  (= direction latérale = essieu correct)
- Spin group : `rotation.z = −wheelRot` → roulement autour de l'essieu

Chaque wagon a un **`angleOffset`** propre (distance angulaire derrière la loco) :
- Wagon 0 : `FIRST_WAGON_ANG = (0.95 + 0.14 + 0.65) / 4.5 ≈ 0.387 rad`
- Wagon n : `FIRST_WAGON_ANG + n × WAGON_INTERVAL_ANG`

L'`angleOffset` individuel permet le **réordonnancement** après re-pose sur les rails.

### Physique Rapier

Initialisé en **async** (`await RAPIER.init()`) avant le premier tick.

- Sol statique : `RigidBodyDesc.fixed()` + `ColliderDesc.cuboid(50, 0.05, 50)` à y = 0
- Véhicule déraillé : `RigidBodyDesc.dynamic()` avec vitesse initiale issue de la courbe
  + impulsion latérale + torque aléatoire modéré
- Sync chaque frame : `body.translation()` / `body.rotation()` → `mesh.position/quaternion`

### Mode Poing (`handMode`)

- Main 3D (fist) suit la souris projetée sur `Plane(Y, −(TRAIN_Y + 0.5))`
- Clic → animation de punch (descente sinusoïdale en 0.55 s)
- Au pic de descente : détection distance vs chaque véhicule → `derailMesh()`
- Forces : loco = 3.5, wagon = 2.5 (réaliste, glissement latéral + léger torque)
- OrbitControls désactivé en mode poing

### Mode Grab-and-Drop *(à implémenter)*

Objectifs :
- `mousedown` sur un véhicule → le soulève (`group.position.y += GRAB_HEIGHT`)
- Drag horizontal sur `Plane(Y, grabbed_height)` avec lerp 0.2
- Historique de positions → vélocité au relâchement
- **Snap** si relâché à < 2 unités du rail → re-rail à l'angle le plus proche
- **Throw** sinon → `RigidBodyDesc.dynamic()` avec vélocité calculée
- Molette pendant le grab → cycle de couleur du wagon
- Ghost translucide au snap point pendant le drag
- Blob d'ombre sous l'objet tenu
- Hover glow (emissive bleu sur le body mesh)
- Curseur CSS `grab` / `grabbing`
- Mode grab et mode poing s'excluent mutuellement

### Mode Nuit

- Sky : `0x061122`, fog identique
- Ambient : `0x334466` @ 0.25, soleil éteint, `DirectionalLight` lune
- 500 étoiles (`THREE.Points`), lune émissive
- 8 poteaux lumineux autour du circuit :
  - Fût + bras pivotant vers la voie
  - `PointLight` intensity 0 (jour) / 1.5 (nuit)
  - Lampe sphère émissive orange
  - Reconstruits à chaque changement de circuit

### UI

Panneau droit fixe, fond verre, 168 px :
- Slider vitesse [0.05 → 3 rad/s]
- Compteur wagons −/+
- Boutons icône : 📯 sifflet, 🌙 nuit, 🔄 reset
- Bouton 🤜 Mode Main
- 3 boutons circuit

Raccourcis clavier :
| Touche | Action |
|---|---|
| `← →` | Vitesse |
| `+ −` | Wagons |
| `Espace` | Sifflet |
| `N` | Nuit |
| `H` | Mode main |
| `R` | Reset |
| `1` `2` `3` | Circuit |

---

## Points d'attention / bugs connus

- **Orientation wagon** : l'`inner` group du wagon doit avoir `rotation.y = π/2` (sinon les wagons
  sont perpendiculaires au rail). Les roues doivent avoir `rotation.x = π/2` (pas `.z`).
- **Decoder Draco** : chargé depuis CDN, un adblock peut le bloquer → charger localement depuis
  `node_modules/three/examples/jsm/libs/draco/` en copiant dans `public/draco/`.
- **Physique async** : `rapierWorld` est `null` jusqu'à la fin de `RAPIER.init()`. Tous les appels
  Rapier doivent vérifier `if (!rapierWorld) return`.
- **Matériaux partagés** : `sharedWheelMat`, `trunkMat`, `tieMat` sont partagés entre instances.
  Ne pas modifier leur couleur pour le recoloriage des wagons ; utiliser `userData.isBody = true`
  sur les meshes à repeindre.
- **Vitesse de roulement** : `wheelRot += speed × dt × REF_R / WHEEL_R`
  Sens de rotation : `spinGroup.rotation.z = −wheelRot` (CW vue de l'extérieur = roulement avant).

---

## Dépendances npm

```json
{
  "three": "^0.183.2",
  "@dimforge/rapier3d-compat": "^0.19.3",
  "typescript": "^6.0.2",
  "vite": "^8.0.1"
}
```

React et gsap sont dans le `package.json` d'origine mais **non utilisés**.

---

## Commandes

```bash
npm install
npm run dev      # dev server http://localhost:5173
npm run build    # build dans dist/
```
