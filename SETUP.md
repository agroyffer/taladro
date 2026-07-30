# Cómo publicar

No hace falta instalar git, ni python, ni usar la terminal. **GitHub compila la página solo.** Vos editás dos archivos y apretás un botón.

## La primera vez

**1. Instalá [GitHub Desktop](https://desktop.github.com).** Trae su propio git adentro, así que no necesitás instalar git aparte. Iniciá sesión con tu cuenta.

**2. Traé el repo.** En GitHub Desktop: `File` → `Clone repository` → pestaña `GitHub.com` → elegí `agroyffer/taladro` → guardalo en una carpeta que no se borre, tipo `C:\proyectos`.

> No lo dejes en la carpeta de Cowork: esa tiene un número de sesión adentro y desaparece.

**3. Copiá adentro todo lo que hay en esta carpeta**, pisando lo repetido. Que quede la carpeta oculta `.github` también — sin esa no funciona nada de esto.

**4. Prendé el compilador.** En el navegador, andá al repo en GitHub → `Settings` → `Pages` → donde dice **Source** elegí **GitHub Actions** (hoy dice "Deploy from a branch").

> Este es el único paso que se hace una sola vez y que si te lo salteás no funciona nada. Es un solo desplegable.

**5. Subí.** En GitHub Desktop vas a ver los archivos cambiados a la izquierda. Escribí abajo qué cambiaste, `Commit to main`, y después el botón azul `Push origin`.

## Cada vez que quieras publicar

1. Editá `_build/engine.js` (la lógica) o `_build/shell.html` (la interfaz) en VS Code.
2. En GitHub Desktop: escribí qué cambiaste → `Commit to main` → `Push origin`.
3. Esperá un minuto o dos.
4. Abrí <https://agroyffer.github.io/taladro/> con **Ctrl+Shift+R** y mirá abajo de todo que la versión sea nueva.

Eso es todo. `index.html` lo arma GitHub en cada push: por eso no está en el repo y no tenés que tocarlo nunca.

## Qué hace GitHub cuando subís

En orden, y si algo falla se planta y **la página queda como estaba**:

1. corre los 50 tests
2. junta `engine.js` adentro de `shell.html`
3. le pone versión con la fecha y hora de Buenos Aires
4. chequea que no haya ninguna dirección de wallet en el HTML
5. pasa el javascript por un verificador de sintaxis
6. chequea que el archivo tenga el panel principal y el motor adentro
7. publica

Podés ver todo eso corriendo en la pestaña **Actions** del repo. Si sale una cruz roja, hacé click y el paso que falló te dice por qué.

## Dónde se toca cada cosa

| Archivo | Qué tiene |
|---|---|
| `_build/engine.js` | la lógica: reconstrucción de trades, estadística, hábitos, tilt, repertorio |
| `_build/shell.html` | la interfaz: estilos, HTML, el taladro, el render |
| `_build/test.js` | los 50 tests |
| `_build/build.py` | el compilador |
| `.github/workflows/publicar.yml` | las instrucciones para GitHub |

`index.html` no está en el repo a propósito. Es generado.

## Si querés verlo antes de publicar

Solo si tenés python instalado: doble click en `deploy.bat` compila `index.html` en tu máquina y podés abrirlo con doble click para probarlo sin subir nada. Es opcional; el circuito de arriba no lo necesita.

## Si algo sale mal

**Cruz roja en Actions** — click en la corrida, después en el paso rojo. El sitio sigue con la versión anterior, no rompiste nada.

**La página no cambia** — mirá la versión abajo de todo. Si es la vieja: o Actions todavía está corriendo (fijate la pestaña), o es caché (Ctrl+Shift+R, o ventana de incógnito).

**404 en la página** — te faltó el paso 4, el desplegable de Settings → Pages → Source → GitHub Actions.

**Publicaste algo que no querías** — en GitHub Desktop: `History`, botón derecho sobre el commit, `Revert changes`, y `Push origin`. Vuelve la versión anterior sin borrar el historial.
