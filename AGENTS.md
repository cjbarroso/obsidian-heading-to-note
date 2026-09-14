# AGENTS.md

Guía para agentes (y para mí dentro de seis meses) que vayan a tocar este repo.

## Qué es esto

Plugin de Obsidian **Heading to Note**: toma un encabezado de una nota y mueve su sección
(el encabezado y todo su subárbol) a una nota nueva, dejando un enlace donde estaba.

- **Sin build.** `main.js` es CommonJS y Obsidian lo carga tal cual. No hay `package.json`,
  ni TypeScript, ni bundler, ni dependencias fuera de `require('obsidian')`.
- **Sin tests automatizados.** La verificación es manual, contra Obsidian en vivo (ver
  [Probar](#probar)). Si añades lógica pura, considera exponerla para poder probarla.

## Mapa del repo

| Archivo | Qué es |
|---|---|
| `main.js` | Todo el plugin. Es el único archivo que importa. |
| `manifest.json` | Metadatos para Obsidian. `id` **debe** coincidir con el nombre de la carpeta de instalación (`heading-to-note`). |
| `styles.css` | Estilos del modal de selección de encabezado. |
| `versions.json` | Mapa versión → `minAppVersion`. Lo usa la tienda de la comunidad; BRAT no. |
| `README.md` / `README.es.md` | Documentación pública (inglés / español). |
| `assets/heading-picker.png` | Captura del modal, incrustada en los dos README. |
| `.github/workflows/release.yml` | Al empujar un tag, comprueba que el tag coincide con `version` y crea el release con los tres assets y su attestation. Es idempotente. |
| `eslint.config.mjs` | **No existe en el repo a propósito.** El linter oficial se ejecuta en un directorio aparte (ver [Linter](#linter)); añadirlo aquí invitaría al escáner de la tienda a buscar un paso de build. |

## Cómo llega el plugin a Obsidian

Hay tres copias y conviene no confundirlas:

1. **Este repo** (`~/src/Personal/obsidian-heading-to-note`) — la fuente de verdad.
2. **El release de GitHub** — lo que se distribuye (`main.js`, `manifest.json`, `styles.css`).
3. **La copia instalada** en el vault, en `.obsidian/plugins/heading-to-note/`, gestionada por
   **BRAT** (`obsidian42-brat`). No se edita a mano: BRAT la sobrescribe al actualizar.

Consecuencias prácticas:

- Editar `main.js` en el vault **no sirve de nada**: el siguiente update de BRAT lo pisa.
- BRAT reescribe `manifest.json` en JSON compacto y sin newline final. Comparar checksums
  contra el repo dará diferencia **de formato, no de contenido**.
- BRAT solo instala esos tres archivos. Un `README.md` dentro de la carpeta del plugin
  desaparece en la siguiente actualización.
- BRAT compara el `version` del manifest instalado con el del release. **Si no subes la
  versión, no actualiza.**

## Restricciones del proyecto

- **CommonJS, sin build.** Nada de `import`/`export`, TypeScript ni empaquetadores: el release
  sube `main.js` literal. Cambiar esto obliga a cambiar el workflow.
- **Cero dependencias.** Solo `require('obsidian')`.
- **Tabulaciones** para indentar, como el resto de `main.js`.
- **Idioma:** todos los textos de UI viven en la tabla `UI_TEXT` (`en` / `es`), y `uiText()` elige
  tabla según `getLanguage()`: inglés por defecto, español si la app está en español. Añadir un
  texto es añadir la clave en **las dos** tablas. Comentarios en español; nombres de funciones en
  inglés; `README.md` y la descripción del manifest en inglés (cara pública), `README.es.md` en
  español.
- El plugin es **solo-editor**: los comandos se declaran con `editorCheckCallback` y se
  deshabilitan si no hay `ctx.file`.

## Mapa de `main.js`

```
Textos de UI
  UI_TEXT                    tablas en/es: comandos, avisos, ajustes y el callout del enlace
  uiText()                   elige la tabla según getLanguage()

Utilidades puras
  frontmatterEnd(lines)          línea exclusiva donde acaba el frontmatter (0 si no hay)
  scanHeadings(lines, from)      encabezados reales: ignora frontmatter y bloques de código
  sectionEnd(lines, start, lvl)  primera línea que ya no es de la sección
  normalizeHeading(text)         colapsa espacios, para comparar títulos de enlace
  sanitizeFilename(name)         título → nombre de archivo válido

HeadingToNotePlugin
  onload()                  2 comandos + ítem de menú contextual del editor
  headingsOf(editor)        encabezados del buffer
  cursorSection(editor)     encabezado que contiene el cursor
  chooseHeading()           abre el modal
  extractSection()          el núcleo: crea la nota, edita el origen, reescribe enlaces
  persistEditor(file)       fuerza el guardado del origen
  replaceLines()            sustituye el rango por el enlace, sin romper el buffer
  linkLine()                texto del enlace de retorno (wikilink o callout)
  excludedKeys()            ajuste `excludedKeys` → array
  inheritedFrontmatter()    frontmatter del origen menos las claves excluidas
  resolveFolder(file)       carpeta destino (la crea si no existe)
  availablePath(folder, t)  ruta libre: añade " 1", " 2", … si el nombre está tomado
  rewriteLinks()            reescribe los enlaces entrantes a los encabezados movidos

HeadingSuggestModal        lista buscable de encabezados
FolderSuggest              autocompletado de carpetas para "Carpeta destino"
HeadingToNoteSettingTab    ajustes
```

## Invariantes: lo que no se puede romper

Estas son las trampas que ya costaron tiempo. Cada una tiene su motivo.

1. **`frontmatterEnd()` antes de `scanHeadings()`.** Un comentario YAML (`# nota`) tiene la
   forma de un H1. Sin saltarse el frontmatter, el modal lista basura y la extracción corta
   en el sitio equivocado.

2. **Las vallas de código se ignoran en las dos funciones.** `scanHeadings` y `sectionEnd`
   comparten la lógica de vallas (triple backtick o triple tilde): un `# comentario` dentro de
   un bloque de código no es un encabezado. Si tocas una, toca la otra.

3. **El subárbol es `<= level` en `sectionEnd`.** Extraer un `##` se lleva sus `###` y para
   en el siguiente `##`. Cambiar a `<` rompe las subsecciones.

4. **Índices de línea.** `editor.getValue().split('\n')` deja un último elemento vacío si el
   archivo termina en newline. Pasar `{line: lines.length}` a `editor.transaction` está fuera
   de rango: `replaceLines` recorta a la última línea real. Es el bug más fácil de reintroducir.

5. **Líneas en blanco en `replaceLines`.** `enlace + '\n\n'` si queda contenido detrás,
   `enlace + '\n'` si la sección llega al final del archivo. Sin esto el enlace se pega al
   siguiente encabezado o se acumulan líneas vacías.

6. **Orden dentro de `extractSection`.** Primero `vault.create` (nunca perder contenido si
   falla la edición), después editar el origen, después `persistEditor()`, y **solo entonces**
   `rewriteLinks()`. Motivo: `vault.cachedRead()` lee de disco, no del buffer del editor y no
   del autoguardado diferido (2 s). Si el origen aún no está guardado, `rewriteLinks` no ve
   los enlaces que apuntan a sus encabezados, y el `vault.modify` posterior resucitaría la
   sección movida.

7. **`rewriteLinks` resuelve cada destino** con `metadataCache.getFirstLinkpathDest(target, f.path)`
   y solo reescribe si el destino es exactamente el archivo de origen. Sin esa comprobación se
   reescriben enlaces homónimos de otras notas.

8. **Al reescribir se conserva el alias y el bloque** (`|alias`, `^block`). Si `includeHeading`
   está desactivado, el fragmento del encabezado superior se elimina, porque ese encabezado ya
   no existe en la nota nueva.

9. **`getLeaf('tab')`, nunca `getLeaf(false)`** para abrir la nota nueva: con `false` la nota
   nueva sustituye a la de origen en la misma pestaña y se pierde de vista el enlace recién
   dejado.

10. **`editor.transaction()`, no `editor.setValue()`.** `setValue` destruye el historial de
    deshacer; queda solo como fallback si `transaction` no existe.

## Probar

Requiere **Obsidian abierto** con el plugin instalado. El CLI `obsidian` habla con la app en
vivo, no hay forma de probar esto sin ella.

```bash
VAULT="$HOME/Documents/CharlieOS"   # el vault donde está instalado el plugin
```

Ciclo tras editar `main.js`:

```bash
obsidian plugin:reload id=heading-to-note
obsidian dev:errors        # debe responder "No errors captured."
```

Si el cambio está en `manifest.json` y no se refleja, `obsidian reload` (recarga el vault).

El listado `obsidian commands` no muestra los comandos de plugins; compruébalos así:

```bash
obsidian eval code="Object.keys(app.commands.commands).filter(k=>k.startsWith('heading-to-note'))"
```

### Prueba funcional

Crea un fixture en una carpeta desechable del vault, ejecútalo y **bórralo al terminar**.
Nunca uses notas reales.

```bash
mkdir -p "$VAULT/_tmp_test"
cat > "$VAULT/_tmp_test/fixture.md" <<'EOF'
---
type: proyecto
id: 7b
---
# Prueba

## Sección

Contenido.

### Subsección

Detalle.
EOF
```

```bash
obsidian eval code="(async()=>{
  const p = app.plugins.plugins['heading-to-note'];
  const f = app.vault.getAbstractFileByPath('_tmp_test/fixture.md');
  const l = app.workspace.getLeaf('tab');
  await l.openFile(f);
  const e = l.view.editor;
  await p.extractSection(e, f, p.headingsOf(e).find(h=>h.text==='Sección'));
  return { origen: e.getValue() };
})()"
```

Para probar por el comando real (incluye `editorCheckCallback` y los avisos), pon el cursor
con `eval` y luego ejecuta el comando:

```bash
obsidian command id=heading-to-note:extract-current-section
```

**Cuidado:** `obsidian command` devuelve el control **antes** de que termine el trabajo
asíncrono del plugin, y el origen tarda ~2 s en autoguardarse. Si lees el archivo justo
después, ves el estado anterior aunque todo haya ido bien. Para comprobaciones deterministas,
usa `eval` con `await` como arriba.

Captura del modal (útil para revisar CSS): abre el modal en un `eval` que se quede esperando
unos segundos y lanza la captura en paralelo; si no, el modal ya no está cuando dispara.

```bash
obsidian dev:screenshot path="_tmp_test/modal.png"
```

### Qué comprobar en cada caso

| Caso | Resultado esperado |
|---|---|
| `##` con `###` dentro | La nota nueva se lleva el subárbol; para en el siguiente `##` |
| `# falso` dentro de un bloque de código | No aparece en el modal ni corta la sección |
| `# comentario` en el frontmatter | No aparece en el modal |
| Frontmatter con `id` | Se hereda todo menos `id` (y lo que diga `excludedKeys`) |
| Nombre ya existente | Se crea `Nombre 1.md` |
| Carpeta destino inexistente | Se crea la jerarquía |
| Sección vacía + `includeHeading` off | Aviso, no se crea archivo |
| `[[origen#sub]]` en otra nota | Se reescribe a `[[nueva#sub]]` conservando alias |
| `[[otra#mismo título]]` | No se toca |
| Sección al final del archivo | Sin líneas vacías colgando, archivo termina en newline |

## Linter

El repo **no lleva `package.json` a propósito**: el escáner de la tienda usa el primer script que
encuentre entre `build`, `build:plugin` y `compile`, y aquí no queremos que haya ninguno. El linter
oficial se ejecuta en un directorio aparte:

```bash
mkdir -p /tmp/h2n-lint && cd /tmp/h2n-lint
cp <repo>/{main.js,manifest.json,styles.css,LICENSE,README.md} .
# package.json privado con: eslint, eslint-plugin-obsidianmd, typescript, obsidian
npm install --cache /tmp/h2n-lint/.npm-cache   # la caché global de npm puede tener basura de root
npx eslint main.js                             # sin salida = limpio
```

El `eslint.config.mjs` de ese directorio tiene que ser explícito o el resultado es ruido:

- `sourceType: 'commonjs'` y `@typescript-eslint/no-require-imports` desactivado (el plugin es
  CommonJS y no hay bundler).
- `no-implicit-globals` y `no-redeclare` desactivados: asumen un script de navegador y marcan las
  declaraciones de nivel superior, y el `Plugin` importado, como si fueran globales.
- El `ui/sentence-case` marca **error** en cualquier texto cuyo primer carácter sea signo de
  puntuación y la primera palabra vaya en mayúscula (`[[Nota]]` → quiere `[[nota]]`), así que los
  textos que empiezan por `[[` o `>` no pueden llevar la primera palabra capitalizada.

**Ojo con la tabla de textos.** `obsidianmd/ui/sentence-case` solo inspecciona literales pasados
directamente a `setName`/`setDesc`/`new Notice`, así que todo lo que sale de `UI_TEXT` se libra del
linter. Para comprobarla de verdad hay que generar un archivo que pase cada texto a un `Setting` y
pasarle el linter a ese archivo; si no, la tabla se puede degradar sin que nadie avise.

```bash
# extrae UI_TEXT cargando main.js con un require('obsidian') simulado
node /tmp/h2n-probe/loader.cjs
```

## Publicar una versión

Hay dos destinos (BRAT y la tienda de la comunidad) y los dos se alimentan del mismo release de
GitHub.

1. Sube `version` en `manifest.json` (semver `x.y.z`) y añade la entrada en `versions.json`.
   Sube `minAppVersion` si usas APIs nuevas: `getLanguage()` exige **1.8.7** y
   `AbstractInputSuggest`, 1.4.10. `versions.json` permite que una app antigua instale la última
   versión compatible, pero **solo si existe un release con ese tag**.
2. Crea el tag **sin `v`**. El tag tiene que ser idéntico al `version` del manifest: Obsidian busca
   el release por ese nombre. Un `v1.1.0` apunta a un release que Obsidian nunca encuentra.

```bash
cd ~/src/Personal/obsidian-heading-to-note
# 1. editar main.js
# 2. subir "version" en manifest.json y añadir la entrada en versions.json
git commit -am "feat: ..."
git tag 1.1.0
git push origin main 1.1.0         # el workflow aborta si el tag no coincide con version
gh run watch                       # crea el release con los 3 assets y su attestation
```

Comprobación de que el release sirve para instalar (esto es lo que hacen Obsidian y BRAT):

```bash
gh release download 1.1.0 --repo cjbarroso/obsidian-heading-to-note --dir /tmp/check
# deben estar main.js, manifest.json y styles.css, con el id y la version correctos
```

En Obsidian, BRAT lo recoge al arrancar (`updateAtStartup: true`) o con el comando
`BRAT: Check for updates to all beta plugins`.

### Tienda de la comunidad

La entrada se envía **una sola vez** en <https://community.obsidian.md> (cuenta de Obsidian con
GitHub conectado); a partir de ahí basta con publicar releases. La revisión es automática y cubre
manifest, releases, código y build; se puede previsualizar con **Review branch** antes de crear el
tag. Lo que ya está resuelto aquí: descripción del manifest (≤250 caracteres, inglés, termina en
punto), licencia que GitHub reconoce como MIT, los tres assets en el release, sin `innerHTML`, sin
estilos en línea, sin atajos por defecto, sin `app` global, sin telemetría. Con `minAppVersion`
≥ 1.13.0 la tienda recomienda además `getSettingDefinitions()` para que los ajustes aparezcan en el
buscador; por debajo de 1.13.0 `display()` sigue siendo obligatorio.

## Trampas

- **No edites `main.js` dentro de `.obsidian/plugins/`** esperando que dure: BRAT lo pisa.
- **No cambies el `id` del manifest** sin renombrar también la carpeta de instalación; Obsidian
  exige que coincidan.
- **No introduzcas un paso de build** sin actualizar el workflow: hoy el release publica
  `main.js` tal cual sale del repo.
- **No añadas dependencias**: un plugin sin bundler no puede resolver `node_modules`.
- **`AbstractInputSuggest` no rellena el campo por su cuenta.** Su `selectSuggestion` base solo
  llama al callback de `onSelect`: sin sobrescribirlo, el campo se queda con lo tecleado y la
  lista abierta (ver `FolderSuggest.selectSuggestion`).
- **`dev:screenshot` puede capturar un fotograma viejo.** Con el modal abierto suele salir la
  ventana sin él. `obsidian dev:cdp method=Page.captureScreenshot params='{"format":"png"}'`
  devuelve un PNG en base64 dentro de un JSON y sí captura el estado actual; recorta luego con
  `magick -crop`.
- La UI es bilingüe (`UI_TEXT`); cualquier texto nuevo tiene que entrar en las dos tablas.
