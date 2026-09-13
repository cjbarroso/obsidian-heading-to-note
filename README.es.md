# Heading to Note

Plugin de [Obsidian](https://obsidian.md) que toma un encabezado de una nota y **mueve** su sección
completa —el encabezado y todas sus subsecciones— a una nota nueva, dejando un enlace donde estaba
la sección.

Pensado para un flujo [Zettelkasten](https://es.wikipedia.org/wiki/Zettelkasten) / PKM donde una
sección de una nota larga termina mereciendo nota propia.

## Instalación

### Desde Obsidian, con BRAT (recomendado)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) instala plugins que no están en la tienda de la
comunidad y los mantiene actualizados desde los releases de GitHub.

1. En Obsidian, abre **Ajustes → Plugins de la comunidad → Explorar**.
2. Busca **BRAT** (`Obsidian42 - BRAT`), pulsa **Instalar** y luego **Activar**.
3. Abre la paleta de comandos (`Ctrl/Cmd + P`) y ejecuta
   **`BRAT: Add a beta plugin for testing`**.
4. Pega este repositorio: `cjbarroso/obsidian-heading-to-note`
5. Pulsa **Add Plugin**. BRAT descarga el último release.
6. Ve a **Ajustes → Plugins de la comunidad** y activa **Heading to Note**.

BRAT solo necesita el nombre del repositorio: no hay que compilar ni copiar archivos a mano.

### Instalación manual

1. Descarga `main.js`, `manifest.json` y `styles.css` del
   [último release](https://github.com/cjbarroso/obsidian-heading-to-note/releases/latest).
2. Crea la carpeta `<tu-vault>/.obsidian/plugins/heading-to-note/` si no existe.
3. Copia los tres archivos ahí dentro.
4. Recarga Obsidian (**`Ctrl/Cmd + R`**, o ciérralo y vuelve a abrirlo).
5. Ve a **Ajustes → Plugins de la comunidad → Plugins instalados** y activa **Heading to Note**.

Si el plugin no aparece, revisa que el **Modo restringido** esté desactivado y que la carpeta se
llame exactamente `heading-to-note` (el nombre de la carpeta debe coincidir con el `id` del
`manifest.json`).

### Desde el código

No hay paso de compilación: `main.js` es CommonJS puro y se carga tal cual.

```bash
git clone https://github.com/cjbarroso/obsidian-heading-to-note.git
cp main.js manifest.json styles.css "<tu-vault>/.obsidian/plugins/heading-to-note/"
```

## Uso

Tres formas de dispararlo:

| Dónde | Comando |
|---|---|
| Paleta de comandos | **Convertir un encabezado en nota nueva** — abre una lista buscable con todos los encabezados de la nota |
| Paleta de comandos | **Convertir la sección actual en nota nueva** — usa el encabezado que contiene el cursor |
| Clic derecho en el editor | **Convertir sección en nota nueva** |

## Qué hace exactamente

1. Detecta el encabezado y su subárbol: todo hasta el siguiente encabezado de nivel igual o
   superior. Los encabezados dentro de bloques de código y dentro del frontmatter se ignoran.
2. Crea la nota nueva con el nombre del encabezado. Si el nombre ya existe, añade ` 1`, ` 2`, …
3. Copia el frontmatter de la nota de origen, menos las propiedades excluidas.
4. Sustituye la sección movida en la nota de origen por un enlace a la nota nueva, y guarda el
   archivo de inmediato en vez de esperar al autoguardado diferido de Obsidian.
5. Reescribe los enlaces del vault que apuntaban a los encabezados movidos:
   `[[Origen#Sección]]` → `[[Nota nueva#Sección]]`, conservando alias y referencias de bloque.

## Ajustes

**Ajustes → Heading to Note**

| Ajuste | Por defecto | Qué hace |
|---|---|---|
| Carpeta destino | *(vacío)* | Vacío = la carpeta de la nota de origen. Si la ruta no existe, se crea. El campo autocompleta las carpetas del vault. |
| Abrir la nota nueva | activado | Abre la nota extraída en una pestaña nueva. |
| Heredar el frontmatter | activado | Copia las propiedades de la nota de origen. |
| Propiedades excluidas | `id, aliases` | Propiedades que nunca se copian (evita duplicar el `id` del Zettelkasten). |
| Conservar la línea del encabezado | activado | Desactivado, la nota nueva empieza directamente en el cuerpo de la sección. |
| Dejar un enlace | activado | Desactivado, la sección desaparece sin rastro. |
| Formato del enlace | `[[Nota nueva]]` | O `> [!abstract] Extraído a [[Nota nueva]]`. |
| Actualizar enlaces entrantes | activado | Reescribe los enlaces del resto del vault. |

## Notas y límites

- Solo desde el editor: si la nota está en vista de lectura, los comandos no están disponibles.
- Solo archivos Markdown.
- Los enlaces dentro del texto movido que apuntan a encabezados que se quedaron atrás no se
  reescriben.

## Licencia

[MIT](LICENSE)
