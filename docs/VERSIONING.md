# Versionado OXXUS — Comercial.OXXUS.Edjouner.Build

Formato: `C.O.E.N`

| Posición | Significado | Valores |
|----------|-------------|---------|
| **C** | Comercial | `0` = beta, `1` = comercial (solo manual) |
| **O** | Contribuyó OXXUS en este release | `0` / `1` |
| **E** | Contribuyó Edjouner en este release | `0` / `1` |
| **N** | Número de publicación (build) | entero; siempre sube |

Fuente de verdad: archivo [`VERSION`](../VERSION) en la raíz del repo.  
Etiqueta Git: `vC.O.E.N` (ej. `v0.0.0.25`).  
UI: etiqueta discreta `v0.0.0.25` en el pie del dashboard.

## Ejemplos (acuerdo con dirección)

- `0.0.0.25` — versión beta actual (línea base).
- `0.1.0.26` — build 26 publicada por OXXUS.
- `0.0.1.26` — build 26 publicada por Edjouner.
- `0.1.1.26` — build 26 con cambios de ambos.
- `1.1.0.XX` — comercial con actualización de OXXUS.
- `1.0.1.XX` — comercial con actualización de Edjouner.

## Mapeo de autores (Git)

**Edjouner**

- Nombre o login que contenga `abloodykpaw` (cualquier email de ese usuario)

**OXXUS**

- `OxxusMaquiavelo`
- Email `oxxuscreative@gmail.com`
- `OXXUS Codex` / cualquier nombre que contenga `OXXUS` (case-insensitive)
- `Cristhyam Aranguren`

Los commits `chore(version): …` del bot de bump **no** cuentan como OXXUS ni Edjouner.

## Automatización

En cada push a `main` (excepto bumps de versión):

1. Se leen los autores de los commits desde el último tag `v*` (o desde el último cambio a `VERSION`).
2. Se calculan flags `O` y `E` solo para ese release.
3. Se incrementa `N`; el bit `C` no se toca.
4. Se actualizan `VERSION`, `lib/oxxus-version.ts`, se crea commit `chore(version): C.O.E.N` y tag `vC.O.E.N`.

Workflow: [`.github/workflows/bump-oxxus-version.yml`](../.github/workflows/bump-oxxus-version.yml)  
Script: `node scripts/bump-oxxus-version.mjs`

### Bit comercial (manual)

```bash
node scripts/set-commercial-flag.mjs 1
# o volver a beta:
node scripts/set-commercial-flag.mjs 0
```

Opcional: añadir `--bump` para también subir `N` al cambiar `C`.

## Publicación del frontend

Este versionado vive en GitHub. El Site en ChatGPT Sites se publica aparte (Work → publicar) para que producción muestre el `VERSION` del commit desplegado.
