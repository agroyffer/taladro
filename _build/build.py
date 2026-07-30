#!/usr/bin/env python3
"""Arma el HTML de una sola pieza: mete engine.js dentro de shell.html.

    python3 _build/build.py

Deja el resultado en taladro.html y en publicar/index.html, y le pone
un sello de version con la fecha para poder verificar que lo publicado
es lo ultimo.
"""
import datetime
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SHELL = RAIZ / '_build' / 'shell.html'
ENGINE = RAIZ / '_build' / 'engine.js'
SALIDA = RAIZ / 'index.html'

MARCA = '/*__ENGINE__*/'


def revisar_sintaxis(html):
    """Pasa cada <script> del HTML por `node --check`.

    Los tests corren engine.js suelto, asi que un error introducido al pegar
    las piezas no lo agarra nadie: la pagina sale al aire muda y el build dice
    que salio todo bien. Esto lo agarra antes de escribir el archivo.
    """
    import re
    import shutil
    import subprocess
    import tempfile

    if not shutil.which('node'):
        print('  (aviso) sin node, no puedo revisar la sintaxis')
        return

    bloques = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, re.S)
    for i, js in enumerate(bloques, 1):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False,
                                         encoding='utf-8') as tmp:
            tmp.write(js)
            ruta = tmp.name
        r = subprocess.run(['node', '--check', ruta],
                           capture_output=True, text=True)
        pathlib.Path(ruta).unlink(missing_ok=True)
        if r.returncode:
            detalle = (r.stderr or '').strip().splitlines()
            pista = '\n    '.join(detalle[:6])
            sys.exit(f'el script #{i} del HTML no compila:\n    {pista}')
    print(f'  sintaxis ok en {len(bloques)} bloque(s) de script')


def main():
    for f in (SHELL, ENGINE):
        if not f.exists():
            sys.exit(f'falta {f}')

    shell = SHELL.read_text(encoding='utf-8')
    engine = ENGINE.read_text(encoding='utf-8')

    if MARCA not in shell:
        sys.exit(f'shell.html no tiene la marca {MARCA}')

    # El engine va entero: el `if (typeof module !== 'undefined')` del final ya
    # hace que el navegador saltee el module.exports. Cortarlo a mano se comia
    # la llave de cierre y rompia el script completo, en silencio.

    version = datetime.datetime.now().strftime('%Y.%m.%d.%H%M')
    html = shell.replace(MARCA, engine).replace('__BUILD__', version)

    if '__BUILD__' in html or MARCA in html:
        sys.exit('quedaron marcas sin reemplazar')

    # ninguna wallet real puede terminar publicada
    import re
    sospechosas = set(re.findall(r'0x[0-9a-fA-F]{40}', html))
    sospechosas.discard('0x0000000000000000000000000000000000000000')
    if sospechosas:
        sys.exit('hay direcciones en el HTML: ' + ', '.join(sospechosas))

    revisar_sintaxis(html)
    SALIDA.write_text(html, encoding='utf-8')
    print(f'version {version}  ·  {len(html):,} bytes'.replace(',', '.'))
    print(f'  -> {SALIDA.name}')


if __name__ == '__main__':
    main()
