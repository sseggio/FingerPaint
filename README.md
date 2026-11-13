# FingerPaint 🎨

Coloriage pixel art par numéros — sans pub, sans pay-to-win, qui marche hors-ligne.

- Analyse de marché : [docs/market-analysis.md](docs/market-analysis.md)
- Plan de développement : [docs/dev-plan.md](docs/dev-plan.md)
- Règles pour les agents : [CLAUDE.md](CLAUDE.md)

## Démarrer
```bash
npm install
npx expo start
```

## Pipeline qualité
Chaque feature passe par : développement → scan de vulnérabilités (`.claude/agents/security-scanner.md`) → PR → CI → revue (`.claude/agents/pr-reviewer.md`) → merge automatique si approuvée.
