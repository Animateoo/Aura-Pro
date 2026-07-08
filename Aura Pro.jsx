/*
Â© Mateo Crespo (Animateo)

Puedes usar este plugin libremente.
No puedes venderlo, redistribuirlo ni publicar versiones modificadas.

Â¿Encontraste una mejora o correcciÃ³n?
Por favor, compÃ¡rtela con el autor.
*/

// @target aftereffects
/**
 * Aura Pro v19.1 - Picker AE sin capas residuales ni ventanas extra
 * - Chip de color: abre el selector REAL de After Effects (Color Control + Edit Value)
 * - Sin sliders HSB ScriptUI (rotos en Windows); fallback HEX + muestreo selección
 * - HEX bloqueado con selección, editable sin selección
 * - Botón Swap: Intercambia Fill/Stroke
 * - Botones de Exportar/Importar añadidos en la barra superior con iconos 📁 y 💾
 * - Integración con Aura Words: color solo en palabras seleccionadas allí
 */

(function AuraProV18_5(thisObj) {
    var SCRIPT_NAME = "Aura Pro";
    var SETTINGS_SECTION = "AuraProSettings_v18";
    var SETTINGS_KEY = "palettesDataJSON";
    var SWATCH_WIDTH = 34;
    var SWATCH_SPACING = 3;
    var SWATCH_HEIGHT = 24;
    var MIN_PANEL_WIDTH = 220;
    var MIN_COLUMNS = 3;
    var AE_VER = parseFloat(app.version) || 0;

    // ==========================
    // JSON POLYFILL (Para persistencia en AE)
    // ==========================
    var JSON = {
        parse: function (s) { try { return eval("(" + s + ")"); } catch (e) { return null; } },
        stringify: (function () {
            var toString = Object.prototype.toString;
            var isArray = Array.isArray || function (a) { return toString.call(a) === '[object Array]'; };
            var escMap = { '"': '\\"', '\\': '\\\\', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
            var escFunc = function (m) { return escMap[m] || '\\u' + (m.charCodeAt(0) + 0x10000).toString(16).substr(1); };
            var escRE = /[\\"\u0000-\u001F\u007F-\u009F\u00AD\u0600-\u0604\u070F\u17B4\u17B5\u200C-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\uFFF0-\uFFFF]/g;
            return function stringify(value) {
                if (value === null) return 'null';
                if (typeof value === 'number') return isFinite(value) ? value.toString() : 'null';
                if (typeof value === 'boolean') return value.toString();
                if (typeof value === 'string') return '"' + value.replace(escRE, escFunc) + '"';
                if (typeof value === 'object') {
                    if (isArray(value)) {
                        var res = '[';
                        for (var i = 0; i < value.length; i++) res += (i ? ', ' : '') + stringify(value[i]);
                        return res + ']';
                    } else if (toString.call(value) === '[object Object]') {
                        var tmp = [];
                        for (var k in value) {
                            if (value.hasOwnProperty(k)) tmp.push(stringify(k) + ': ' + stringify(value[k]));
                        }
                        return '{' + tmp.join(', ') + '}';
                    }
                }
                return 'null';
            };
        })()
    };

    // Estado para bloqueo de HEX
    var lockHex = false;
    var lockedHex = null;

    // Paletas iniciales (por defecto)
    var allPalettesData = {
        activePaletteIndex: 0,
        palettes: [
            {
                name: "DiDi Principal",
                colors: [
                    "#FC4C02", "#F5EDEB", "#3A2932", "#FFBC00", "#0056EF",
                    "#720085", "#3AA537", "#FFFFFF", "#000000"
                ]
            },
            {
                name: "DiDi Card",
                colors: [
                    "#FC4C02", "#FC765B", "#E4572E", "#FFBC00", "#F5EDEB",
                    "#FFC8BD", "#FFE7E4", "#FFF1EF", "#F0F0F0"
                ]
            },
            {
                name: "DiDi Préstamos",
                colors: [
                    "#A9D2A1", "#FC4C02", "#0056EF", "#FFBC00",
                    "#F5EDEB", "#3A2932", "#FFFFFF"
                ]
            }
        ]
    };

    // ==========================
    // HELPERS COLOR
    // ==========================
    function hexToRgb01(hex) {
        var h = (hex || "").replace(/[^0-9a-f]/gi, "");
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (h.length !== 6) return [1, 1, 1];
        return [
            parseInt(h.substr(0, 2), 16) / 255,
            parseInt(h.substr(2, 2), 16) / 255,
            parseInt(h.substr(4, 2), 16) / 255
        ];
    }

    function rgb01ToHex(rgb) {
        function c(n) {
            n = Math.max(0, Math.min(255, Math.round(n * 255)));
            return ("0" + n.toString(16)).slice(-2);
        }
        return ("#" + c(rgb[0]) + c(rgb[1]) + c(rgb[2])).toUpperCase();
    }

    function normalizeHexInput(str) {
        var h = (str || "").replace(/[^0-9a-f]/gi, "");
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return h.length === 6 ? ("#" + h).toUpperCase() : null;
    }

    /** Quita capas temporales del picker si quedaron de un intento anterior. */
    function removeStalePickerLayers(comp) {
        if (!(comp instanceof CompItem)) return;
        var tag = SCRIPT_NAME + " · picker";
        for (var i = comp.numLayers; i >= 1; i--) {
            try {
                if (comp.layer(i).name === tag) comp.layer(i).remove();
            } catch (e) { }
        }
    }

    /**
     * Selector nativo de After Effects (Color Control + Edit Value).
     * Sin beginUndoGroup — evita "Undo group mismatch" con el diálogo modal de AE.
     */
    function pickNativeAEColor(startHex) {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem)) return null;
        removeStalePickerLayers(comp);

        var rgb = hexToRgb01(startHex || "#FFFFFF");
        var tempLayer = null;
        var picked = null;
        try {
            tempLayer = comp.layers.addNull();
            tempLayer.name = SCRIPT_NAME + " · picker";
            tempLayer.enabled = false;
            tempLayer.guideLayer = true;
            tempLayer.shy = true;
            var fx = tempLayer.property("ADBE Effect Parade").addProperty("ADBE Color Control");
            var colorProp = fx.property("ADBE Color Control-0001");
            colorProp.setValue([rgb[0], rgb[1], rgb[2]]);
            colorProp.selected = true;
            try {
                app.executeCommand(app.findMenuCommandId("Edit Value..."));
            } catch (eCmd) {
                app.executeCommand(2240);
            }
            picked = colorProp.value;
        } catch (e) {
            picked = null;
        }
        try {
            if (tempLayer) tempLayer.remove();
        } catch (eR) { }
        removeStalePickerLayers(comp);
        if (!picked || picked.length < 3) return null;
        return rgb01ToHex(picked);
    }

    /** Fallback ligero: HEX + preview (sin sliders). Siempre funciona. */
    function showAuraHexPicker(initialHex, onDone) {
        if (typeof onDone !== "function") return;
        var curHex = normalizeHexInput(initialHex) || "#FFFFFF";

        var dlg = new Window("palette", SCRIPT_NAME + " — Color", undefined, { resizeable: false });
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 8;
        dlg.margins = [12, 12, 12, 12];

        var preview = dlg.add("panel");
        preview.preferredSize = [220, 36];
        preview.alignment = ["fill", "top"];

        function drawPreview() {
            preview.onDraw = function () {
                var g = this.graphics;
                var c = hexToRgb01(curHex);
                var br = g.newBrush(g.BrushType.SOLID_COLOR, c);
                g.rectPath(0, 0, this.size[0], this.size[1]);
                g.fillPath(br);
            };
            try { preview.invalidate(); } catch (eI) { }
        }
        drawPreview();

        var hexRow = dlg.add("group");
        hexRow.orientation = "row";
        hexRow.alignChildren = ["fill", "center"];
        hexRow.add("statictext", undefined, "HEX:");
        var hexEt = hexRow.add("edittext", undefined, curHex);
        hexEt.preferredSize = [120, 24];
        hexEt.alignment = ["fill", "center"];

        hexEt.onChange = function () {
            var t = this.text || "";
            if (t.charAt(0) !== "#") t = "#" + t;
            var n = normalizeHexInput(t);
            if (n) { curHex = n; this.text = n; drawPreview(); }
        };

        var auxRow = dlg.add("group");
        auxRow.orientation = "row";
        auxRow.alignment = ["fill", "top"];
        var btnSample = auxRow.add("button", undefined, "Desde selección");
        btnSample.helpTip = "Usa el color fill de la capa seleccionada";
        btnSample.onClick = function () {
            var c = getColorFromSelection();
            if (c) { curHex = c; hexEt.text = c; drawPreview(); }
            else showAuraMessage(SCRIPT_NAME, "Selecciona una capa con color de relleno.");
        };

        var btnRow = dlg.add("group");
        btnRow.orientation = "row";
        btnRow.alignment = ["right", "top"];
        btnRow.spacing = 8;
        var btnOk = btnRow.add("button", undefined, "Aceptar");
        var btnCancel = btnRow.add("button", undefined, "Cancelar");
        btnOk.preferredSize = btnCancel.preferredSize = [84, 26];

        var finished = false;
        function done(result) {
            if (finished) return;
            finished = true;
            try { onDone(result); } catch (e3) { }
            try { dlg.close(); } catch (e4) { }
        }
        btnOk.onClick = function () { done(normalizeHexInput(hexEt.text) || curHex); };
        btnCancel.onClick = function () { done(null); };
        dlg.onClose = function () { if (!finished) done(null); };

        dlg.layout.layout(true);
        dlg.center();
        try { hexEt.active = true; } catch (eA) { }
        dlg.show();
    }

    /** Con comp abierta: solo picker AE (una ventana). Sin comp: ventana HEX. */
    function pickColorForAura(initialHex, onDone) {
        if (typeof onDone !== "function") return;
        var comp = app.project.activeItem;
        if (comp instanceof CompItem) {
            onDone(pickNativeAEColor(initialHex));
            return;
        }
        showAuraHexPicker(initialHex, onDone);
    }

    // ==========================
    // DIÁLOGOS PROPIOS (sin Script Prompt del sistema)
    // ==========================
    function showAuraInputDialog(title, label, defaultValue, onDone) {
        if (typeof onDone !== "function") return;
        var dlg = new Window("palette", title || SCRIPT_NAME, undefined, { resizeable: false });
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 8;
        dlg.margins = [14, 14, 14, 14];

        dlg.add("statictext", undefined, label || "");
        var et = dlg.add("edittext", undefined, defaultValue || "");
        et.preferredSize = [268, 26];
        et.alignment = ["fill", "center"];

        var row = dlg.add("group");
        row.orientation = "row";
        row.alignment = ["right", "top"];
        row.spacing = 8;
        var btnOk = row.add("button", undefined, "Aceptar");
        var btnCancel = row.add("button", undefined, "Cancelar");
        btnOk.preferredSize = btnCancel.preferredSize = [84, 26];

        var finished = false;
        function finish(val) {
            if (finished) return;
            finished = true;
            try { onDone(val); } catch (e) { }
            try { dlg.close(); } catch (e2) { }
        }
        btnOk.onClick = function () { finish(et.text); };
        btnCancel.onClick = function () { finish(null); };
        dlg.onClose = function () { if (!finished) finish(null); };
        dlg.layout.layout(true);
        dlg.center();
        try { et.active = true; } catch (eA) { }
        dlg.show();
    }

    function showAuraConfirmDialog(title, message, onDone) {
        if (typeof onDone !== "function") return;
        var dlg = new Window("palette", title || SCRIPT_NAME, undefined, { resizeable: false });
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 10;
        dlg.margins = [14, 14, 14, 14];

        var st = dlg.add("statictext", undefined, message || "", { multiline: true });
        st.preferredSize = [268, 40];
        st.alignment = ["fill", "top"];

        var row = dlg.add("group");
        row.orientation = "row";
        row.alignment = ["right", "top"];
        row.spacing = 8;
        var btnYes = row.add("button", undefined, "Sí");
        var btnNo = row.add("button", undefined, "No");
        btnYes.preferredSize = btnNo.preferredSize = [72, 26];

        var finished = false;
        function finish(val) {
            if (finished) return;
            finished = true;
            try { onDone(val); } catch (e) { }
            try { dlg.close(); } catch (e2) { }
        }
        btnYes.onClick = function () { finish(true); };
        btnNo.onClick = function () { finish(false); };
        dlg.onClose = function () { if (!finished) finish(false); };
        dlg.layout.layout(true);
        dlg.center();
        dlg.show();
    }

    function showAuraChoiceDialog(title, message, labelA, labelB, onDone) {
        if (typeof onDone !== "function") return;
        var dlg = new Window("palette", title || SCRIPT_NAME, undefined, { resizeable: false });
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 10;
        dlg.margins = [14, 14, 14, 14];

        var st = dlg.add("statictext", undefined, message || "", { multiline: true });
        st.preferredSize = [280, 44];
        st.alignment = ["fill", "top"];

        var row = dlg.add("group");
        row.orientation = "row";
        row.alignment = ["right", "top"];
        row.spacing = 8;
        var btnA = row.add("button", undefined, labelA || "A");
        var btnB = row.add("button", undefined, labelB || "B");
        var btnCancel = row.add("button", undefined, "Cancelar");
        btnA.preferredSize = btnB.preferredSize = [96, 26];
        btnCancel.preferredSize = [84, 26];

        var finished = false;
        function finish(val) {
            if (finished) return;
            finished = true;
            try { onDone(val); } catch (e) { }
            try { dlg.close(); } catch (e2) { }
        }
        btnA.onClick = function () { finish(0); };
        btnB.onClick = function () { finish(1); };
        btnCancel.onClick = function () { finish(null); };
        dlg.onClose = function () { if (!finished) finish(null); };
        dlg.layout.layout(true);
        dlg.center();
        dlg.show();
    }

    function showAuraMessage(title, message) {
        var dlg = new Window("palette", title || SCRIPT_NAME, undefined, { resizeable: false });
        dlg.orientation = "column";
        dlg.alignChildren = ["fill", "top"];
        dlg.spacing = 10;
        dlg.margins = [14, 14, 14, 14];
        var st = dlg.add("statictext", undefined, message || "", { multiline: true });
        st.preferredSize = [268, 36];
        st.alignment = ["fill", "top"];
        var btn = dlg.add("button", undefined, "OK");
        btn.alignment = ["right", "top"];
        btn.preferredSize = [72, 26];
        btn.onClick = function () { try { dlg.close(); } catch (e) { } };
        dlg.layout.layout(true);
        dlg.center();
        dlg.show();
    }

    // ==========================
    // PREFERENCIAS (AUTO-SAVE)
    // ==========================
    function savePreferences(data) {
        try {
            var strData = JSON.stringify(data);
            if (typeof strData !== "string" || strData.length === 0) return;
            app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY, strData);
        } catch (e) { }
    }

    function loadPalettes() {
        try {
            if (app.settings.haveSetting(SETTINGS_SECTION, SETTINGS_KEY)) {
                var prefString = app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY);
                var loaded = JSON.parse(prefString);
                if (loaded && loaded.palettes && loaded.palettes.length > 0) return loaded;
            }
        } catch (e) { }
        return allPalettesData;
    }

    function exportPalettesToFile(data) {
        var jsonFile = File.saveDialog("Exportar todas las paletas", "Archivo JSON:*.json");
        if (jsonFile) {
            try {
                jsonFile.open("w");
                jsonFile.write(JSON.stringify(data, null, 4));
                jsonFile.close();
                showAuraMessage(SCRIPT_NAME, "Paletas exportadas con éxito.");
            } catch (e) {
                showAuraMessage(SCRIPT_NAME, "Error al exportar:\n" + e);
            }
        }
    }

    // ==========================
    // APLICAR / LEER COLOR DE SELECCIÓN
    // ==========================
    var WORDS_BRIDGE_KEY = "_AURA_WORDS_BRIDGE";

    function getAuraWordsBridge() {
        try {
            if (typeof $ !== "undefined" && $.global && $.global[WORDS_BRIDGE_KEY]) {
                var b = $.global[WORDS_BRIDGE_KEY];
                if (b && b.selected && b.selected.length > 0 && b.words && b.words.length > 0) return b;
            }
        } catch (eB) { }
        return null;
    }

    function layerMatchesWordsBridge(lyr, comp, bridge) {
        if (!bridge || bridge.layerIndex < 1) return false;
        if (bridge.compName && comp.name !== bridge.compName) return false;
        return lyr.index === bridge.layerIndex;
    }

    /** Color solo en palabras elegidas en Aura Words (misma capa). */
    function applyColorToAuraWords(lyr, hex, applyStroke, bridge) {
        var rgb = hexToRgb01(hex);
        var tProp = lyr.property("Source Text");
        var tDoc = tProp.value;
        var applied = false;

        if (typeof tDoc.characterRange === "function" && AE_VER >= 24.3) {
            for (var wi = 0; wi < bridge.selected.length; wi++) {
                var w = bridge.words[bridge.selected[wi]];
                if (!w) continue;
                try {
                    var range = tDoc.characterRange(w.start, w.end);
                    if (applyStroke) {
                        range.strokeColor = rgb;
                        range.applyStroke = true;
                    } else {
                        range.fillColor = rgb;
                        range.applyFill = true;
                    }
                    applied = true;
                } catch (eR) { }
            }
            if (applied) tProp.setValue(tDoc);
            return applied;
        }

        for (var aj = 0; aj < bridge.selected.length; aj++) {
            var word = bridge.words[bridge.selected[aj]];
            if (!word) continue;
            try {
                var textProps = lyr.property("ADBE Text Properties");
                var animators = textProps.property("ADBE Text Animators");
                var anim = animators.addProperty("ADBE Text Animator");
                anim.name = SCRIPT_NAME + " — " + word.text;
                var animProps = anim.property("ADBE Text Animator Properties");
                if (applyStroke) {
                    animProps.addProperty("ADBE Text Stroke Color").setValue(rgb);
                } else {
                    animProps.addProperty("ADBE Text Fill Color").setValue(rgb);
                }
                var selectors = anim.property("ADBE Text Selectors");
                var sel = selectors.addProperty("ADBE Text Selector");
                sel.property("ADBE Text Range Units").setValue(2);
                var startProp = sel.property("ADBE Text Index Start");
                var endProp = sel.property("ADBE Text Index End");
                var esc = word.text.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
                startProp.expression = "var w='" + esc + "'; text.sourceText.indexOf(w);";
                endProp.expression = "var w='" + esc + "'; text.sourceText.indexOf(w)+w.length;";
                applied = true;
            } catch (eA) { }
        }
        return applied;
    }

    function applyColorToSelection(hex, applyStroke) {
        if (!hex) return;
        var rgb = hexToRgb01(hex);
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) return;
        var wordsBridge = getAuraWordsBridge();

        app.beginUndoGroup(SCRIPT_NAME + (applyStroke ? " - Trazo" : " - Relleno"));
        try {
            for (var i = 0; i < comp.selectedLayers.length; i++) {
                var lyr = comp.selectedLayers[i];
                if (lyr instanceof TextLayer) {
                    if (wordsBridge) {
                        if (layerMatchesWordsBridge(lyr, comp, wordsBridge)) {
                            if (applyColorToAuraWords(lyr, hex, applyStroke, wordsBridge)) continue;
                        }
                        continue;
                    }
                    try {
                        var tProp = lyr.property("Source Text");
                        var tDoc = tProp.value;
                        if (applyStroke && tDoc.strokeColor !== undefined) {
                            tDoc.strokeColor = rgb;
                            tDoc.applyStroke = true;
                        } else if (!applyStroke && tDoc.fillColor !== undefined) {
                            tDoc.fillColor = rgb;
                            tDoc.applyFill = true;
                        }
                        tProp.setValue(tDoc);
                    } catch (e) { }
                }
                if (lyr.matchName === "ADBE Vector Layer") {
                    var setColor = function (grp) {
                        for (var j = 1; j <= grp.numProperties; j++) {
                            var p = grp.property(j), name = p.matchName;
                            if (name === "ADBE Vector Graphic - Fill" && !applyStroke) {
                                try { p.property("Color").setValue(rgb); } catch (e) { }
                            } else if (name === "ADBE Vector Graphic - Stroke" && applyStroke) {
                                try { p.property("Color").setValue(rgb); } catch (e) { }
                            } else if ((name === "ADBE Vector Group" || name === "ADBE Root Vectors Group") && p.property("Contents")) {
                                setColor(p.property("Contents"));
                            }
                        }
                    };
                    setColor(lyr.property("Contents"));
                }
            }
        } catch (e) { }
        app.endUndoGroup();
    }

    function getColorFromSelection() {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) return null;
        var lyr = comp.selectedLayers[0];
        try {
            if (lyr instanceof TextLayer) {
                var t = lyr.property("Source Text").value;
                if (t.fillColor) return rgb01ToHex(t.fillColor);
            } else if (lyr.matchName === "ADBE Vector Layer") {
                var find = function (gr) {
                    for (var i = 1; i <= gr.numProperties; i++) {
                        var p = gr.property(i);
                        if (p.matchName === "ADBE Vector Graphic - Fill") return p.property("Color").value;
                        if (p.property("Contents")) {
                            var c = find(p.property("Contents"));
                            if (c) return c;
                        }
                    }
                    return null;
                };
                var c = find(lyr.property("Contents"));
                if (c) return rgb01ToHex(c);
            }
        } catch (e) { }
        return null;
    }

    function swapFillStroke() {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) return;
        app.beginUndoGroup(SCRIPT_NAME + " - Swap Fill/Stroke");
        try {
            for (var i = 0; i < comp.selectedLayers.length; i++) {
                var lyr = comp.selectedLayers[i];
                if (lyr instanceof TextLayer) {
                    try {
                        var tProp = lyr.property("Source Text");
                        var tDoc = tProp.value;
                        if (tDoc.fillColor !== undefined && tDoc.strokeColor !== undefined) {
                            var tempFill = [tDoc.fillColor[0], tDoc.fillColor[1], tDoc.fillColor[2]];
                            tDoc.fillColor = tDoc.strokeColor;
                            tDoc.strokeColor = tempFill;
                            tProp.setValue(tDoc);
                        }
                    } catch (e) { }
                }
                if (lyr.matchName === "ADBE Vector Layer") {
                    var swapColors = function (grp) {
                        var fillColor = null, strokeColor = null, fillProp = null, strokeProp = null;
                        for (var j = 1; j <= grp.numProperties; j++) {
                            var p = grp.property(j), name = p.matchName;
                            if (name === "ADBE Vector Graphic - Fill") {
                                fillProp = p.property("Color");
                                fillColor = [fillProp.value[0], fillProp.value[1], fillProp.value[2]];
                            } else if (name === "ADBE Vector Graphic - Stroke") {
                                strokeProp = p.property("Color");
                                strokeColor = [strokeProp.value[0], strokeProp.value[1], strokeProp.value[2]];
                            }
                        }
                        if (fillColor && strokeColor && fillProp && strokeProp) {
                            fillProp.setValue(strokeColor);
                            strokeProp.setValue(fillColor);
                        }
                        for (var j = 1; j <= grp.numProperties; j++) {
                            var p = grp.property(j);
                            if ((p.matchName === "ADBE Vector Group" || p.matchName === "ADBE Root Vectors Group") && p.property("Contents")) {
                                swapColors(p.property("Contents"));
                            }
                        }
                    };
                    swapColors(lyr.property("Contents"));
                }
            }
        } catch (e) { }
        app.endUndoGroup();
    }

    // ==========================
    // UI
    // ==========================
    var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });
    var isDockedPanel = (win instanceof Panel);
    win.alignment = ["fill", "fill"];
    win.minimumSize = [MIN_PANEL_WIDTH, 72];
    win.orientation = "column";
    win.alignChildren = ["fill", "fill"];
    win.spacing = 4;
    win.margins = 6;

    // Elemento oculto para robar el foco y quitar la selección azul de los botones
    var focusStealer = win.add("edittext", [0, 0, 0, 0], "");
    focusStealer.visible = false;
    function clearFocus() { try { focusStealer.active = true; } catch (e) { } }

    // ---------- TOP BAR ----------
    var topBar = win.add("group");
    topBar.orientation = "row";
    topBar.spacing = 3;
    topBar.alignment = ["fill", "top"];

    var hexGroup = topBar.add("group");
    hexGroup.orientation = "row";
    hexGroup.spacing = 2;
    hexGroup.alignment = ["left", "center"];

    var btnColorChip = hexGroup.add("button", undefined, "");
    btnColorChip.preferredSize = [24, 22];
    btnColorChip.helpTip = "Color — clic: picker de After Effects · Shift+clic: muestrear selección";

    var hexInput = hexGroup.add("edittext", undefined, "#FFFFFF");
    hexInput.preferredSize = [65, 22];

    function refreshColorChip() {
        try { btnColorChip.invalidate(); } catch (eC) { }
    }

    btnColorChip.onDraw = function () {
        var g = this.graphics;
        var w = this.size[0], h = this.size[1];
        var border = g.newPen(g.PenType.SOLID_COLOR, [0.45, 0.45, 0.45], 1);
        g.rectPath(0.5, 0.5, w - 1, h - 1);
        g.strokePath(border);
        var rgb = hexToRgb01(normalizeHexInput(hexInput.text) || "#FFFFFF");
        var br = g.newBrush(g.BrushType.SOLID_COLOR, rgb);
        g.rectPath(3, 3, w - 6, h - 6);
        g.fillPath(br);
    };

    var btnAddHex = hexGroup.add("button", undefined, "+");
    btnAddHex.preferredSize = [24, 22];

    topBar.add("group").alignment = ["fill", "center"]; // Spacer

    var btnStroke = topBar.add("button", undefined, "◧");
    btnStroke.preferredSize = [28, 24];

    var btnSwap = topBar.add("button", undefined, "⇄");
    btnSwap.preferredSize = [28, 24];

    var btnImport = topBar.add("button", undefined, "📁");
    btnImport.preferredSize = [28, 24];
    btnImport.helpTip = "Importar paleta(s) (.json)";

    var btnExport = topBar.add("button", undefined, "💾");
    btnExport.preferredSize = [28, 24];
    btnExport.helpTip = "Exportar todas las paletas (.json)";

    // ---------- COLORES ----------
    var swatchesPanel = win.add("group");
    swatchesPanel.orientation = "column";
    swatchesPanel.alignment = ["fill", "fill"];
    swatchesPanel.spacing = 2;
    swatchesPanel.margins = 0;

    var paletteLabel = swatchesPanel.add("statictext", undefined, "");
    paletteLabel.graphics.font = ScriptUI.newFont("Tahoma", "BOLD", 10);
    paletteLabel.alignment = ["fill", "top"];

    var colorGridGroup = swatchesPanel.add("group");
    colorGridGroup.alignment = ["fill", "fill"];
    colorGridGroup.orientation = "column";
    colorGridGroup.alignChildren = ["fill", "fill"];
    colorGridGroup.spacing = 2;

    // ---------- BOTTOM BAR ----------
    var bottomBar = win.add("group");
    bottomBar.alignment = ["fill", "top"];
    bottomBar.orientation = "row";
    bottomBar.spacing = 2;
    bottomBar.margins = [0, 2, 0, 0];

    var dropdown = bottomBar.add("dropdownlist");
    dropdown.alignment = ["fill", "center"];
    dropdown.preferredSize.width = 110; // Ancho para evitar el "Di..."
    dropdown.preferredSize.height = 22;

    var btnNew = bottomBar.add("button", undefined, "+");
    btnNew.preferredSize = [24, 22];

    var btnDel = bottomBar.add("button", undefined, "−");
    btnDel.preferredSize = [24, 22];

    var btnRen = bottomBar.add("button", undefined, "✎");
    btnRen.preferredSize = [24, 22];

    var isStrokeMode = false;

    function getWinMarginVertical() {
        var top = 6, bottom = 6;
        if (win.margins) {
            if (typeof win.margins === "number") {
                top = bottom = win.margins;
            } else {
                top = win.margins.top || 0;
                bottom = win.margins.bottom || 0;
            }
        }
        return top + bottom;
    }

    function getHorizontalMargins() {
        var left = 6, right = 6;
        if (win.margins) {
            if (typeof win.margins === "number") left = right = win.margins;
            else {
                left = win.margins.left || 0;
                right = win.margins.right || 0;
            }
        }
        return left + right + 4;
    }

    function getChromeHeight() {
        var h = paletteLabel.size ? paletteLabel.size[1] : 14;
        h += topBar.size ? topBar.size[1] : 28;
        h += bottomBar.size ? bottomBar.size[1] : 26;
        h += win.spacing * 2;
        return h + getWinMarginVertical();
    }

    /** Solo ventana flotante: altura mínima al contenido. Panel acoplado: sin bloquear resize. */
    function fitPanelToContent() {
        if (isDockedPanel) return;
        try {
            win.layout.layout(true);
            var contentH = getChromeHeight();
            var rows = colorGridGroup.children.length;
            if (rows > 0 && colorGridGroup.children[0].size) {
                contentH += rows * (colorGridGroup.children[0].size[1] || SWATCH_HEIGHT);
                contentH += Math.max(0, rows - 1) * SWATCH_SPACING;
            } else {
                contentH += SWATCH_HEIGHT;
            }
            var h = Math.max(72, Math.ceil(contentH));
            var w = Math.max(MIN_PANEL_WIDTH, win.size[0] || MIN_PANEL_WIDTH);
            win.size = [w, h];
        } catch (eFit) { }
    }

    function getDynamicLayout(colorCount) {
        var count = colorCount || 1;
        var panelW = MIN_PANEL_WIDTH;
        var panelH = 120;
        try {
            if (win.size && win.size[0] > 0) panelW = win.size[0];
            if (win.size && win.size[1] > 0) panelH = win.size[1];
        } catch (e) { }

        var usableW = Math.max(80, panelW - getHorizontalMargins());
        var columns = Math.max(MIN_COLUMNS, Math.floor((usableW + SWATCH_SPACING) / (SWATCH_WIDTH + SWATCH_SPACING)));
        var swatchW = Math.floor((usableW - (columns - 1) * SWATCH_SPACING) / columns);
        swatchW = Math.max(22, swatchW);

        var rows = Math.max(1, Math.ceil(count / columns));
        var usableH = Math.max(24, panelH - getChromeHeight());
        var swatchH = Math.floor((usableH - (rows - 1) * SWATCH_SPACING) / rows);
        swatchH = Math.max(18, swatchH);

        return { columns: columns, swatchW: swatchW, swatchH: swatchH, rows: rows };
    }

    function getDynamicColumns() {
        return getDynamicLayout(1).columns;
    }

    function updateStrokeState() {
        btnStroke.text = isStrokeMode ? "◨" : "◧";
        btnStroke.helpTip = isStrokeMode ? "Modo Trazo ACTIVO" : "Activar modo Trazo";
    }

    function populateDropdown() {
        dropdown.removeAll();
        for (var i = 0; i < allPalettesData.palettes.length; i++)
            dropdown.add("item", allPalettesData.palettes[i].name);
        if (allPalettesData.palettes.length > 0) {
            if (allPalettesData.activePaletteIndex >= allPalettesData.palettes.length)
                allPalettesData.activePaletteIndex = 0;
            dropdown.selection = allPalettesData.activePaletteIndex;
        }
    }

    function syncHexWithSelection() {
        var color = getColorFromSelection();
        if (color) { lockedHex = color; lockHex = true; hexInput.text = color; }
        else { lockedHex = null; lockHex = false; }
        refreshColorChip();
    }

    hexInput.onActivate = function () { syncHexWithSelection(); };
    hexInput.onChanging = function () { if (lockHex && lockedHex) this.text = lockedHex; };
    hexInput.onChange = function () {
        if (lockHex && lockedHex) this.text = lockedHex;
        refreshColorChip();
    };

    function guessHexFromField() {
        var hexValue = (hexInput.text || "").trim();
        if (hexValue.length > 0) {
            if (hexValue.charAt(0) !== "#") hexValue = "#" + hexValue;
            var cleanHex = hexValue.replace(/[^0-9a-f#]/gi, "");
            if (cleanHex.length === 7 || cleanHex.length === 4) return cleanHex.toUpperCase();
        }
        return "#FFFFFF";
    }

    function refreshSwatches() {
        while (colorGridGroup.children.length > 0) colorGridGroup.remove(colorGridGroup.children[0]);
        var idx = allPalettesData.activePaletteIndex;
        var pals = allPalettesData.palettes;
        if (pals.length === 0) return;
        var pal = pals[idx];
        var colors = pal.colors || [];
        paletteLabel.text = pal.name.toUpperCase() + " (" + colors.length + ")";

        var layout = getDynamicLayout(colors.length || 1);
        var columns = layout.columns;
        var swW = layout.swatchW;
        var swH = layout.swatchH;
        var rowGroup = null;

        for (var i = 0; i < colors.length; i++) {
            if (i % columns === 0) {
                rowGroup = colorGridGroup.add("group");
                rowGroup.alignment = ["fill", "fill"];
                rowGroup.orientation = "row";
                rowGroup.alignChildren = ["fill", "fill"];
                rowGroup.spacing = SWATCH_SPACING;
            }
            (function (hex, index, w, h) {
                var swatchGroup = rowGroup.add("group");
                swatchGroup.orientation = "stack";
                swatchGroup.alignment = ["fill", "fill"];
                var swatchBtn = swatchGroup.add("button", undefined, "");
                swatchBtn.preferredSize = [w, h];
                swatchBtn.alignment = ["fill", "fill"];
                swatchBtn.onDraw = function () {
                    var g = this.graphics;
                    var b = g.newBrush(g.BrushType.SOLID_COLOR, hexToRgb01(hex));
                    g.rectPath(0, 0, this.size[0], this.size[1]);
                    g.fillPath(b);
                };
                swatchBtn.onClick = function () {
                    hexInput.text = hex;
                    var ks = ScriptUI.environment.keyboardState;
                    var applyStroke = ks.shiftKey || isStrokeMode;
                    applyColorToSelection(hex, applyStroke);
                    if (isStrokeMode) { isStrokeMode = false; updateStrokeState(); }
                };
                var delBtn = swatchGroup.add("button", undefined, "×");
                delBtn.preferredSize = [12, 12];
                delBtn.alignment = ["right", "top"];
                delBtn.visible = false;
                swatchGroup.addEventListener("mouseover", function () { delBtn.visible = true; });
                swatchGroup.addEventListener("mouseout", function () { delBtn.visible = false; });
                delBtn.onClick = function () {
                    allPalettesData.palettes[idx].colors.splice(index, 1);
                    savePreferences(allPalettesData);
                    refreshSwatches();
                };
            })(colors[i], i, swW, swH);
        }
        try { win.layout.layout(true); } catch (eL) { }
        try { win.layout.resize(); } catch (eR) { }
        fitPanelToContent();
    }

    btnColorChip.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        var ks = ScriptUI.environment.keyboardState;
        if (ks.shiftKey) {
            var sampled = getColorFromSelection();
            if (sampled) {
                hexInput.text = sampled;
                refreshColorChip();
                allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(sampled);
                savePreferences(allPalettesData);
                refreshSwatches();
            } else showAuraMessage(SCRIPT_NAME, "Selecciona una capa con color de relleno.");
            clearFocus();
            return;
        }
        pickColorForAura(guessHexFromField(), function (picked) {
            if (picked) {
                allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(picked);
                hexInput.text = picked;
                refreshColorChip();
                savePreferences(allPalettesData);
                refreshSwatches();
            }
            clearFocus();
        });
    };

    btnAddHex.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        syncHexWithSelection();
        if (lockHex && lockedHex) {
            allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(lockedHex);
            savePreferences(allPalettesData); refreshSwatches(); clearFocus(); return;
        }
        var hexValue = (hexInput.text || "").trim();
        if (hexValue.length > 0) {
            if (hexValue.charAt(0) !== "#") hexValue = "#" + hexValue;
            var cleanHex = hexValue.replace(/[^0-9a-f#]/gi, "");
            if (cleanHex.length === 7 || cleanHex.length === 4) {
                var normalized = cleanHex.toUpperCase();
                allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(normalized);
                savePreferences(allPalettesData); refreshSwatches(); clearFocus(); return;
            }
        }
        pickColorForAura(guessHexFromField(), function (picked) {
            if (picked) {
                allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(picked);
                savePreferences(allPalettesData);
                refreshSwatches();
            }
            clearFocus();
        });
    };

    dropdown.onChange = function () {
        allPalettesData.activePaletteIndex = dropdown.selection.index;
        savePreferences(allPalettesData);
        refreshSwatches();
    };

    btnStroke.onClick = function () { isStrokeMode = !isStrokeMode; updateStrokeState(); clearFocus(); };
    btnSwap.onClick = function () { swapFillStroke(); clearFocus(); };

    btnImport.onClick = function () {
        var jsonFile = File.openDialog("Selecciona archivo .json", "*.json");
        if (!jsonFile) { clearFocus(); return; }

        function processImport(newPalette, mode) {
            try {
                if (!newPalette) throw new Error("Archivo vacío o no válido.");
                if (newPalette.palettes && Array.isArray(newPalette.palettes)) {
                    if (mode === 0) {
                        allPalettesData = newPalette;
                    } else if (mode === 1) {
                        for (var k = 0; k < newPalette.palettes.length; k++) {
                            allPalettesData.palettes.push(newPalette.palettes[k]);
                        }
                    } else return;
                } else if (newPalette.name && Array.isArray(newPalette.colors)) {
                    allPalettesData.palettes.push(newPalette);
                } else {
                    showAuraMessage(SCRIPT_NAME, "Formato .json no válido.");
                    return;
                }
                allPalettesData.activePaletteIndex = allPalettesData.palettes.length - 1;
                savePreferences(allPalettesData);
                populateDropdown();
                if (allPalettesData.palettes.length > 0) {
                    dropdown.selection = allPalettesData.activePaletteIndex;
                }
                refreshSwatches();
                showAuraMessage(SCRIPT_NAME, "Importación completada.");
            } catch (e) {
                showAuraMessage(SCRIPT_NAME, "Error procesando archivo .json:\n" + e);
            }
            clearFocus();
        }

        try {
            jsonFile.open("r");
            var content = jsonFile.read();
            jsonFile.close();
            var newPalette;
            try { newPalette = JSON.parse(content); }
            catch (e) { newPalette = eval("(" + content + ")"); }

            if (newPalette && newPalette.palettes && Array.isArray(newPalette.palettes)) {
                showAuraChoiceDialog(
                    SCRIPT_NAME,
                    "¿Cómo importar las paletas del archivo?",
                    "Reemplazar todas",
                    "Añadir al final",
                    function (choice) { processImport(newPalette, choice); }
                );
            } else {
                processImport(newPalette, 1);
            }
        } catch (e) {
            showAuraMessage(SCRIPT_NAME, "Error leyendo archivo:\n" + e);
            clearFocus();
        }
    };

    btnExport.onClick = function () {
        exportPalettesToFile(allPalettesData);
        clearFocus();
    };

    btnNew.onClick = function () {
        showAuraInputDialog(SCRIPT_NAME, "Nombre nueva paleta:", "Paleta " + (allPalettesData.palettes.length + 1), function (newName) {
            if (newName && String(newName).replace(/\s/g, "").length > 0) {
                allPalettesData.palettes.push({ name: String(newName), colors: [] });
                allPalettesData.activePaletteIndex = allPalettesData.palettes.length - 1;
                savePreferences(allPalettesData);
                populateDropdown();
                refreshSwatches();
            }
            clearFocus();
        });
    };
    btnDel.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        showAuraConfirmDialog(SCRIPT_NAME, "¿Eliminar la paleta actual?", function (yes) {
            if (yes) {
                allPalettesData.palettes.splice(allPalettesData.activePaletteIndex, 1);
                allPalettesData.activePaletteIndex = Math.max(0, allPalettesData.activePaletteIndex - 1);
                savePreferences(allPalettesData);
                populateDropdown();
                refreshSwatches();
            }
            clearFocus();
        });
    };
    btnRen.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        var current = allPalettesData.palettes[allPalettesData.activePaletteIndex].name;
        showAuraInputDialog(SCRIPT_NAME, "Renombrar paleta:", current, function (newName) {
            if (newName && newName !== current) {
                allPalettesData.palettes[allPalettesData.activePaletteIndex].name = newName;
                savePreferences(allPalettesData);
                populateDropdown();
                refreshSwatches();
            }
            clearFocus();
        });
    };

    var lastColumns = 0;
    var lastPanelW = 0;
    var lastPanelH = 0;
    win.onResizing = win.onResize = function () {
        try {
            var pw = this.size[0] || 0;
            var ph = this.size[1] || 0;
            var cols = getDynamicColumns();
            if (cols !== lastColumns || Math.abs(pw - lastPanelW) > 6 || Math.abs(ph - lastPanelH) > 6) {
                lastColumns = cols;
                lastPanelW = pw;
                lastPanelH = ph;
                refreshSwatches();
            } else {
                this.layout.resize();
            }
        } catch (e) { }
    };

    allPalettesData = loadPalettes();
    populateDropdown();
    lastColumns = getDynamicColumns();
    refreshSwatches();
    updateStrokeState();
    syncHexWithSelection();
    refreshColorChip();

    fitPanelToContent();
    if (win instanceof Window) { win.center(); win.show(); } else { try { win.layout.layout(true); win.layout.resize(); } catch (eInit) { } }
})(this);