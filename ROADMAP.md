# Roadmap

Este documento lista pendientes y posibles mejoras del CLI. Son ideas y objetivos; no todas las caracteristicas llegaran a la version final.

## Fase 1 - Calidad minima pro (1-2 dias, objetivo 2026-01-23)

- Modo batch por stdin para automatizar comandos
- Flags de aprobacion (por ejemplo `--yes`) para ejecuciones no interactivas
- Reintentos con backoff y mejores mensajes de error HTTP
- Limites por herramienta (timeout y max output)
- Ignorar rutas por configuracion (archivo tipo `.lintcliignore`)

## Fase 2 - UX estilo Codex (2-4 dias, objetivo 2026-02-06)

- Streaming de respuestas del modelo
- Vista previa de diffs antes de aplicar cambios grandes
- Resumen de memoria y recorte inteligente de historial
- Perfilado de modelos (fast/balanced/quality) y presets de temperatura/top-p

## Fase 3 - Robustez y confianza (2-3 dias, objetivo 2026-02-20)

- Modo read-only para bloquear escrituras/ejecucion de comandos
- Tests basicos para comandos internos y herramientas
- Telemetria local opcional (timings, tokens aproximados)
