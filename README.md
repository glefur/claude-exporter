# Claude Export — Extension Firefox

Exporte la conversation Claude.ai courante au format Markdown (`.md`).

## Installation (mode développeur)

1. Ouvrir Firefox et aller sur `about:debugging`
2. Cliquer sur **"This Firefox"** (ou "Ce Firefox")
3. Cliquer sur **"Load Temporary Add-on…"**
4. Sélectionner le fichier `manifest.json` dans ce dossier
5. L'extension apparaît dans la barre d'outils Firefox

## Utilisation

1. Naviguer vers une conversation sur [claude.ai](https://claude.ai)
2. Cliquer sur l'icône de l'extension dans la barre d'outils
3. Cliquer sur **"Télécharger .md"**
4. Le fichier `.md` est téléchargé dans le dossier Téléchargements

## Structure

```
claude-export/
├── manifest.json     # Manifeste de l'extension (MV2)
├── content.js        # Script injecté dans claude.ai pour extraire la conversation
├── popup.html        # Interface du popup
├── popup.js          # Logique du popup
└── icons/
    ├── icon48.svg
    └── icon96.svg
```

## Format de sortie

Le fichier Markdown généré contient :
- Le titre de la conversation
- La date d'export
- Les messages alternés **Vous** / **Claude** avec mise en forme préservée
  (titres, code, listes, tableaux, gras/italique…)
