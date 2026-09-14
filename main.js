'use strict';

/*
 * Heading to Note
 * Extrae la sección de un encabezado (con todo su subárbol) a una nota nueva.
 */

const {
	Plugin,
	PluginSettingTab,
	Setting,
	SuggestModal,
	AbstractInputSuggest,
	Notice,
	TFolder,
	getLanguage,
	normalizePath,
	parseYaml,
	stringifyYaml,
} = require('obsidian');

const DEFAULT_SETTINGS = {
	destinationFolder: '',
	inheritFrontmatter: true,
	excludedKeys: 'id, aliases',
	includeHeading: true,
	linkBack: true,
	linkBackFormat: 'wikilink',
	updateLinks: true,
	openNewNote: true,
};

const MAX_TITLE_LENGTH = 120;
const FENCE_RE = /^[ \t]*(`{3,}|~{3,})/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;

/* ------------------------------------------------------------------ */
/* Textos de la interfaz                                               */
/* ------------------------------------------------------------------ */

/**
 * La interfaz sigue el idioma de Obsidian: español cuando la app está en
 * español, inglés en cualquier otro caso. `getLanguage()` devuelve el código
 * ISO configurado (por ejemplo "es" o "en").
 *
 * Los textos que acaban dentro de una nota (el callout del enlace de vuelta)
 * también salen de aquí, para que la nota y la interfaz hablen igual.
 */
const UI_TEXT = {
	en: {
		cmdPickHeading: 'Convert a heading into a new note',
		cmdCurrentSection: 'Convert the current section into a new note',
		menuExtractSection: 'Convert section into a new note',

		noHeadings: 'This note has no headings.',
		cursorOutsideSection: 'The cursor is not inside a section with a heading.',
		emptySection: 'The section is empty: there is nothing to extract.',
		createFailed: 'Could not create the new note: ',
		sectionMovedTo: 'Section moved to "',
		untitledNote: 'Untitled note',
		extractedTo: 'Extracted to',

		modalPlaceholder: 'Heading to convert into a note…',
		modalEmpty: 'No matching headings',
		modalNavigate: 'To navigate',
		modalExtract: 'To extract',
		modalCancel: 'To cancel',

		noDestinationFolder: 'No folder (next to the source note)',

		groupDestination: 'Destination',
		destinationFolder: 'Destination folder',
		destinationFolderDesc:
			'Folder where extracted notes are created. If left empty, the folder of the source note is used.',
		destinationFolderPlaceholder: 'Zettelkasten',
		openNewNote: 'Open the new note',
		openNewNoteDesc: 'Opens the newly created note in a new tab.',

		groupContent: 'Content',
		inheritFrontmatter: 'Inherit the frontmatter',
		inheritFrontmatterDesc: 'Copies the properties of the source note into the new note.',
		excludedKeys: 'Excluded properties',
		excludedKeysDesc: 'Properties that are not copied, separated by commas.',
		excludedKeysPlaceholder: 'Property names',
		includeHeading: 'Keep the heading line',
		includeHeadingDesc:
			'When off, the new note starts directly with the body of the section, since the title is already the file name.',

		groupSourceNote: 'Source note',
		linkBack: 'Leave a link',
		linkBackDesc: 'Replaces the moved section with a link to the new note.',
		linkBackFormat: 'Link format',
		linkBackFormatDesc: 'How the link left behind in the source note is written.',
		linkBackFormatWikilink: 'Wikilink',
		linkBackFormatCallout: 'Callout',
		updateLinks: 'Update incoming links',
		updateLinksDesc:
			'Rewrites the links that pointed to the moved headings so that they point to the new note.',
	},
	es: {
		cmdPickHeading: 'Convertir un encabezado en nota nueva',
		cmdCurrentSection: 'Convertir la sección actual en nota nueva',
		menuExtractSection: 'Convertir sección en nota nueva',

		noHeadings: 'Esta nota no tiene encabezados.',
		cursorOutsideSection: 'El cursor no está dentro de ninguna sección con encabezado.',
		emptySection: 'La sección está vacía: no hay nada que extraer.',
		createFailed: 'No se pudo crear la nota nueva: ',
		sectionMovedTo: 'Sección movida a "',
		untitledNote: 'Nota sin título',
		extractedTo: 'Extraído a',

		modalPlaceholder: 'Encabezado a convertir en nota…',
		modalEmpty: 'Sin encabezados que coincidan',
		modalNavigate: 'Para navegar',
		modalExtract: 'Para extraer',
		modalCancel: 'Para cancelar',

		noDestinationFolder: 'Sin carpeta (junto a la nota de origen)',

		groupDestination: 'Destino',
		destinationFolder: 'Carpeta destino',
		destinationFolderDesc:
			'Carpeta donde se crean las notas extraídas. Si se deja vacío, se usa la carpeta de la nota de origen.',
		destinationFolderPlaceholder: 'Zettelkasten',
		openNewNote: 'Abrir la nota nueva',
		openNewNoteDesc: 'Abre la nota recién creada en una pestaña nueva.',

		groupContent: 'Contenido',
		inheritFrontmatter: 'Heredar el frontmatter',
		inheritFrontmatterDesc: 'Copia las propiedades de la nota de origen a la nota nueva.',
		excludedKeys: 'Propiedades excluidas',
		excludedKeysDesc: 'Propiedades que no se copian, separadas por comas.',
		excludedKeysPlaceholder: 'Nombres de propiedades',
		includeHeading: 'Conservar la línea del encabezado',
		includeHeadingDesc:
			'Desactivado, la nota nueva empieza directamente en el texto de la sección, ya que el título está en el nombre del archivo.',

		groupSourceNote: 'Nota de origen',
		linkBack: 'Dejar un enlace',
		linkBackDesc: 'Sustituye la sección movida por un enlace a la nota nueva.',
		linkBackFormat: 'Formato del enlace',
		linkBackFormatDesc: 'Cómo se escribe el enlace que queda en la nota de origen.',
		linkBackFormatWikilink: 'Wikilink',
		linkBackFormatCallout: 'Callout',
		updateLinks: 'Actualizar enlaces entrantes',
		updateLinksDesc:
			'Reescribe los enlaces que apuntaban a los encabezados movidos para que apunten a la nota nueva.',
	},
};

/** Textos del idioma configurado en Obsidian. */
function uiText() {
	const code = String(getLanguage() || 'en').toLowerCase();
	return code.startsWith('es') ? UI_TEXT.es : UI_TEXT.en;
}

/* ------------------------------------------------------------------ */
/* Utilidades de texto (puras)                                         */
/* ------------------------------------------------------------------ */

/** Línea (exclusiva) donde termina el frontmatter. 0 si no hay. */
function frontmatterEnd(lines) {
	if (!lines.length || lines[0].trim() !== '---') return 0;
	for (let i = 1; i < lines.length; i++) {
		const t = lines[i].trim();
		if (t === '---' || t === '...') return i + 1;
	}
	return 0;
}

/** Encabezados reales de la nota, ignorando frontmatter y bloques de código. */
function scanHeadings(lines, from = 0) {
	const headings = [];
	let fence = null;
	for (let i = from; i < lines.length; i++) {
		const f = FENCE_RE.exec(lines[i]);
		if (f) {
			const ch = f[1][0];
			if (fence === null) fence = ch;
			else if (fence === ch) fence = null;
			continue;
		}
		if (fence !== null) continue;

		const h = HEADING_RE.exec(lines[i]);
		if (!h) continue;
		const text = h[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
		if (!text) continue;
		headings.push({ line: i, level: h[1].length, text });
	}
	return headings;
}

/** Primera línea (exclusiva) que ya no pertenece a la sección. */
function sectionEnd(lines, startLine, level) {
	let fence = null;
	for (let i = startLine + 1; i < lines.length; i++) {
		const f = FENCE_RE.exec(lines[i]);
		if (f) {
			const ch = f[1][0];
			if (fence === null) fence = ch;
			else if (fence === ch) fence = null;
			continue;
		}
		if (fence !== null) continue;

		const h = HEADING_RE.exec(lines[i]);
		if (h && h[1].length <= level) return i;
	}
	return lines.length;
}

function normalizeHeading(text) {
	return String(text).replace(/\s+/g, ' ').trim();
}

/** Título de archivo válido, sin formato Markdown ni caracteres prohibidos. */
function sanitizeFilename(name) {
	let s = String(name);
	s = s.replace(/\[\[([^[\]|]*)\|([^[\]]*)\]\]/g, '$2'); // [[destino|alias]]
	s = s.replace(/\[\[([^[\]]*)\]\]/g, '$1'); // [[destino]]
	s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // [texto](url)
	s = s.replace(/[*_`~]/g, ''); // énfasis y código
	s = s.replace(/[\\/:*?"<>|#^[\]]/g, ''); // prohibidos en nombres de archivo
	s = s.replace(/\s+/g, ' ').trim();
	s = s.replace(/^\.+/, '').replace(/\.+$/, '').trim();
	if (s.length > MAX_TITLE_LENGTH) s = s.slice(0, MAX_TITLE_LENGTH).trim();
	return s;
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

class HeadingToNotePlugin extends Plugin {
	async onload() {
		await this.loadSettings();

		this.text = uiText();

		this.addSettingTab(new HeadingToNoteSettingTab(this.app, this));

		this.addCommand({
			id: 'extract-heading',
			name: this.text.cmdPickHeading,
			editorCheckCallback: (checking, editor, ctx) => {
				if (!ctx.file) return false;
				const headings = this.headingsOf(editor);
				if (!headings.length) {
					if (!checking) new Notice(this.text.noHeadings);
					return false;
				}
				if (!checking) this.chooseHeading(editor, ctx.file);
				return true;
			},
		});

		this.addCommand({
			id: 'extract-current-section',
			name: this.text.cmdCurrentSection,
			editorCheckCallback: (checking, editor, ctx) => {
				const info = ctx.file ? this.cursorSection(editor) : null;
				if (!info) {
					if (!checking) {
						new Notice(this.text.cursorOutsideSection);
					}
					return false;
				}
				if (!checking) this.extractSection(editor, ctx.file, info);
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const file = view && view.file;
				if (!file) return;
				const info = this.cursorSection(editor);
				if (!info) return;
				menu.addItem((item) =>
					item
						.setTitle(this.text.menuExtractSection)
						.setIcon('file-plus-2')
						.onClick(() => this.extractSection(editor, file, info))
				);
			})
		);
	}

	/* ---------------- lectura del buffer ---------------- */

	headingsOf(editor) {
		const lines = editor.getValue().split('\n');
		return scanHeadings(lines, frontmatterEnd(lines));
	}

	/** Encabezado que contiene la línea del cursor, o null. */
	cursorSection(editor) {
		const lines = editor.getValue().split('\n');
		const headings = scanHeadings(lines, frontmatterEnd(lines));
		const cur = editor.getCursor().line;
		let found = null;
		for (const h of headings) {
			if (h.line <= cur) found = h;
			else break;
		}
		return found;
	}

	chooseHeading(editor, file) {
		const headings = this.headingsOf(editor);
		if (!headings.length) {
			new Notice(this.text.noHeadings);
			return;
		}
		new HeadingSuggestModal(this.app, headings, this.text, (h) =>
			this.extractSection(editor, file, h)
		).open();
	}

	/* ---------------- extracción ---------------- */

	async extractSection(editor, file, heading) {
		const lines = editor.getValue().split('\n');
		const end = sectionEnd(lines, heading.line, heading.level);

		// Sin líneas vacías colgando al final de la sección.
		let last = end;
		while (last > heading.line + 1 && lines[last - 1].trim() === '') last--;

		const includeHeading = this.settings.includeHeading;
		let bodyStart = includeHeading ? heading.line : heading.line + 1;
		if (!includeHeading) {
			while (bodyStart < last && lines[bodyStart].trim() === '') bodyStart++;
		}
		const moved = lines.slice(bodyStart, last);
		if (!includeHeading && !moved.length) {
			new Notice(this.text.emptySection);
			return;
		}

		const title = sanitizeFilename(heading.text) || this.text.untitledNote;
		const folder = await this.resolveFolder(file);
		const path = this.availablePath(folder, title);

		const chunks = [];
		const fm = this.inheritedFrontmatter(lines);
		if (fm) chunks.push(fm);
		chunks.push(moved.join('\n'));
		const content = chunks.join('\n').replace(/[ \t\n]+$/, '') + '\n';

		let newFile;
		try {
			newFile = await this.app.vault.create(path, content);
		} catch (e) {
			console.error('[heading-to-note] no se pudo crear la nota', e);
			new Notice(this.text.createFailed + e.message);
			return;
		}

		// Encabezados que se mueven: sirven para reescribir los enlaces entrantes.
		const subtree = scanHeadings(lines, heading.line).filter((h) => h.line < end);

		this.replaceLines(editor, lines, heading.line, end, this.linkLine(newFile, file));

		// La nota nueva ya está en disco: el origen no puede quedarse sin guardar.
		await this.persistEditor(file);

		if (this.settings.updateLinks) {
			try {
				await this.rewriteLinks(file, newFile, subtree, heading, includeHeading);
			} catch (e) {
				console.error('[heading-to-note] no se pudieron actualizar los enlaces', e);
			}
		}

		if (this.settings.openNewNote) {
			try {
				// Pestaña nueva: la nota de origen queda visible con el enlace.
				await this.app.workspace.getLeaf('tab').openFile(newFile);
			} catch (e) {
				console.error('[heading-to-note] no se pudo abrir la nota nueva', e);
			}
		}

		new Notice(this.text.sectionMovedTo + newFile.path + '"');
	}

	/** Sustituye [from, to) por el enlace de retorno, sin romper el buffer. */
	replaceLines(editor, lines, from, to, linkLine) {
		const isLast = to >= lines.length;
		const replacement = !linkLine ? '' : isLast ? linkLine + '\n' : linkLine + '\n\n';

		let toLine = to;
		let toCh = 0;
		if (isLast) {
			toLine = Math.max(lines.length - 1, from);
			toCh = lines[toLine].length;
		}

		const change = {
			from: { line: from, ch: 0 },
			to: { line: toLine, ch: toCh },
			text: replacement,
		};

		try {
			editor.transaction({ changes: [change] });
		} catch {
			// Fallback para versiones sin transacciones.
			const next = lines.slice();
			next.splice(from, Math.max(to - from, 0), ...(linkLine ? [linkLine] : []));
			editor.setValue(next.join('\n'));
		}

		if (linkLine) editor.setCursor({ line: from, ch: 0 });
	}

	/** Fuerza el guardado del origen, sin esperar al autoguardado diferido. */
	async persistEditor(file) {
		try {
			for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
				const view = leaf.view;
				if (view && view.file && view.file.path === file.path && typeof view.save === 'function') {
					await view.save();
				}
			}
		} catch (e) {
			console.error('[heading-to-note] no se pudo guardar la nota de origen', e);
		}
	}

	linkLine(newFile, sourceFile) {
		if (!this.settings.linkBack) return '';
		const linktext = this.app.metadataCache.fileToLinktext(newFile, sourceFile.path);
		if (this.settings.linkBackFormat === 'callout') {
			return '> [!abstract] ' + this.text.extractedTo + ' [[' + linktext + ']]';
		}
		return '[[' + linktext + ']]';
	}

	/* ---------------- frontmatter ---------------- */

	excludedKeys() {
		return String(this.settings.excludedKeys || '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	inheritedFrontmatter(lines) {
		if (!this.settings.inheritFrontmatter) return '';
		const fmEnd = frontmatterEnd(lines);
		if (fmEnd < 3) return '';
		const raw = lines.slice(1, fmEnd - 1).join('\n').trim();
		if (!raw) return '';

		let obj;
		try {
			obj = parseYaml(raw);
		} catch {
			return '---\n' + raw + '\n---\n';
		}
		if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
			return '---\n' + raw + '\n---\n';
		}
		for (const key of this.excludedKeys()) delete obj[key];
		if (!Object.keys(obj).length) return '';

		let yaml;
		try {
			yaml = stringifyYaml(obj).trimEnd();
		} catch {
			return '---\n' + raw + '\n---\n';
		}
		if (!yaml) return '';
		return '---\n' + yaml + '\n---\n';
	}

	/* ---------------- destino ---------------- */

	async resolveFolder(file) {
		const raw = String(this.settings.destinationFolder || '')
			.trim()
			.replace(/^\/+|\/+$/g, '');
		const sourceFolder = file && file.parent && file.parent.path !== '/' ? file.parent.path : '';
		if (!raw) return sourceFolder;

		const path = normalizePath(raw);
		if (this.app.vault.getAbstractFileByPath(path)) return path;

		let cur = '';
		for (const seg of path.split('/')) {
			cur = cur ? cur + '/' + seg : seg;
			if (this.app.vault.getAbstractFileByPath(cur)) continue;
			try {
				await this.app.vault.createFolder(cur);
			} catch (e) {
				console.error('[heading-to-note] no se pudo crear la carpeta ' + cur, e);
			}
		}
		return path;
	}

	availablePath(folder, title) {
		const base = folder ? folder + '/' + title : title;
		let path = normalizePath(base + '.md');
		let i = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = normalizePath(base + ' ' + i + '.md');
			i++;
		}
		return path;
	}

	/* ---------------- enlaces entrantes ---------------- */

	/**
	 * Reescribe los enlaces que apuntaban a la sección movida para que apunten
	 * a la nota nueva, conservando el fragmento y el alias.
	 */
	async rewriteLinks(sourceFile, newFile, subtree, topHeading, includeHeading) {
		const names = new Set(subtree.map((h) => normalizeHeading(h.text)));
		if (!names.size) return;

		const topName = normalizeHeading(topHeading.text);
		const newLinktext = this.app.metadataCache.fileToLinktext(newFile, sourceFile.path);

		for (const f of this.app.vault.getMarkdownFiles()) {
			if (f.path === newFile.path) continue;

			const original = await this.app.vault.cachedRead(f);
			if (!original.includes('[[')) continue;

			let changed = false;
			const updated = original.replace(/(!?)\[\[([^[\]\n]+)\]\]/g, (full, bang, inner) => {
				const hash = inner.indexOf('#');
				if (hash === -1) return full;

				const target = inner.slice(0, hash);
				const frag = inner.slice(hash + 1);
				const bar = frag.indexOf('|');
				const headingPart = normalizeHeading(
					(bar === -1 ? frag : frag.slice(0, bar)).replace(/\^[^^]*$/, '')
				);
				if (!headingPart || !names.has(headingPart)) return full;

				const dest = this.app.metadataCache.getFirstLinkpathDest(target, f.path);
				if (!dest || dest.path !== sourceFile.path) return full;

				changed = true;
				const dropsFragment = !includeHeading && headingPart === topName;
				const newFrag = dropsFragment ? (bar === -1 ? '' : frag.slice(bar)) : '#' + frag;
				return bang + '[[' + newLinktext + newFrag + ']]';
			});

			if (changed) await this.app.vault.modify(f, updated);
		}
	}

	/* ---------------- ajustes ---------------- */

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

class HeadingSuggestModal extends SuggestModal {
	constructor(app, headings, text, onChoose) {
		super(app);
		this.headings = headings;
		this.text = text;
		this.onChoose = onChoose;
		this.setPlaceholder(text.modalPlaceholder);
		this.emptyStateText = text.modalEmpty;
		this.setInstructions([
			{ command: '↑↓', purpose: text.modalNavigate },
			{ command: '↵', purpose: text.modalExtract },
			{ command: 'esc', purpose: text.modalCancel },
		]);
	}

	getSuggestions(query) {
		const q = String(query || '').toLowerCase().trim();
		if (!q) return this.headings;
		return this.headings.filter((h) => h.text.toLowerCase().includes(q));
	}

	renderSuggestion(heading, el) {
		el.addClass('h2n-suggestion');
		el.createSpan({ cls: 'h2n-level', text: '#'.repeat(heading.level) });
		el.createSpan({ cls: 'h2n-text', text: heading.text });
		el.createSpan({ cls: 'h2n-line', text: 'L' + (heading.line + 1) });
	}

	onChooseSuggestion(heading) {
		this.onChoose(heading);
	}
}

/* ------------------------------------------------------------------ */
/* Autocompletado de carpetas                                          */
/* ------------------------------------------------------------------ */

/**
 * Sugerencias de carpeta para el ajuste "Carpeta destino". La opción vacía
 * significa "junto a la nota de origen", igual que el campo en blanco.
 */
class FolderSuggest extends AbstractInputSuggest {
	constructor(app, inputEl, text) {
		super(app, inputEl);
		this.text = text;
		this.limit = 50;
	}

	getSuggestions(query) {
		const q = String(query || '')
			.trim()
			.replace(/^\/+|\/+$/g, '')
			.toLowerCase();

		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((f) => f instanceof TFolder && f.path !== '/')
			.map((f) => f.path)
			.sort((a, b) => a.localeCompare(b));

		const out = [];
		if (!q) out.push('');
		for (const path of folders) {
			if (!q || path.toLowerCase().includes(q)) out.push(path);
		}
		return out;
	}

	renderSuggestion(value, el) {
		el.setText(value || this.text.noDestinationFolder);
	}

	/**
	 * La implementación base solo avisa al callback: hay que escribir el valor
	 * en el campo y cerrar la lista a mano.
	 */
	selectSuggestion(value, evt) {
		this.setValue(value);
		this.close();
		super.selectSuggestion(value, evt);
	}
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

class HeadingToNoteSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		const s = this.plugin.text;
		containerEl.empty();

		new Setting(containerEl).setName(s.groupDestination).setHeading();

		new Setting(containerEl)
			.setName(s.destinationFolder)
			.setDesc(s.destinationFolderDesc)
			.addText((t) => {
				t.setPlaceholder(s.destinationFolderPlaceholder)
					.setValue(this.plugin.settings.destinationFolder)
					.onChange(async (v) => {
						this.plugin.settings.destinationFolder = v;
						await this.plugin.saveSettings();
					});
				const suggest = new FolderSuggest(this.app, t.inputEl, s);
				suggest.onSelect(async (v) => {
					this.plugin.settings.destinationFolder = v;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName(s.openNewNote)
			.setDesc(s.openNewNoteDesc)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.openNewNote).onChange(async (v) => {
					this.plugin.settings.openNewNote = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName(s.groupContent).setHeading();

		new Setting(containerEl)
			.setName(s.inheritFrontmatter)
			.setDesc(s.inheritFrontmatterDesc)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.inheritFrontmatter).onChange(async (v) => {
					this.plugin.settings.inheritFrontmatter = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(s.excludedKeys)
			.setDesc(s.excludedKeysDesc)
			.addText((t) =>
				t
					.setPlaceholder(s.excludedKeysPlaceholder)
					.setValue(this.plugin.settings.excludedKeys)
					.onChange(async (v) => {
						this.plugin.settings.excludedKeys = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(s.includeHeading)
			.setDesc(s.includeHeadingDesc)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.includeHeading).onChange(async (v) => {
					this.plugin.settings.includeHeading = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName(s.groupSourceNote).setHeading();

		new Setting(containerEl)
			.setName(s.linkBack)
			.setDesc(s.linkBackDesc)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.linkBack).onChange(async (v) => {
					this.plugin.settings.linkBack = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(s.linkBackFormat)
			.setDesc(s.linkBackFormatDesc)
			.addDropdown((d) =>
				d
					.addOption('wikilink', s.linkBackFormatWikilink)
					.addOption('callout', s.linkBackFormatCallout)
					.setValue(this.plugin.settings.linkBackFormat)
					.onChange(async (v) => {
						this.plugin.settings.linkBackFormat = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(s.updateLinks)
			.setDesc(s.updateLinksDesc)
			.addToggle((t) =>
				t.setValue(this.plugin.settings.updateLinks).onChange(async (v) => {
					this.plugin.settings.updateLinks = v;
					await this.plugin.saveSettings();
				})
			);
	}
}

module.exports = HeadingToNotePlugin;
