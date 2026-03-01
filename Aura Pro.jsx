// @target aftereffects
/**
 * Aura Pro v18.5 - Compact UI
 * - Más compacto y responsivo (inspirado en Power Shapes)
 * - Botón Eyedropper: Abre selector de color y agrega a paleta
 * - HEX bloqueado con selección, editable sin selección
 * - Botón Swap: Intercambia Fill/Stroke
 * - Botones de Exportar/Importar añadidos en la barra superior con iconos 📁 y 💾
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

    function pickColor() {
        try {
            var dec = $.colorPicker(parseInt("FFFFFF", 16));
            if (dec === -1) return null;
            return "#" + ("000000" + dec.toString(16)).slice(-6).toUpperCase();
        } catch (e) {
            return null;
        }
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
                var loaded = JSON.parse(app.settings.getSetting(SETTINGS_SECTION, SETTINGS_KEY));
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
                alert("Paletas exportadas con éxito.");
            } catch (e) {
                alert("Error al exportar:\n" + e);
            }
        }
    }

    // ==========================
    // APLICAR / LEER COLOR DE SELECCIÓN
    // ==========================
    function applyColorToSelection(hex, applyStroke) {
        if (!hex) return;
        var rgb = hexToRgb01(hex);
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) return;

        app.beginUndoGroup(SCRIPT_NAME + (applyStroke ? " - Trazo" : " - Relleno"));
        try {
            for (var i = 0; i < comp.selectedLayers.length; i++) {
                var lyr = comp.selectedLayers[i];
                if (lyr instanceof TextLayer) {
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
    win.alignment = ["fill", "fill"];
    win.minimumSize = [MIN_PANEL_WIDTH, 140];
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
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

    var btnEyedropper = hexGroup.add("button", undefined, "◉");
    btnEyedropper.preferredSize = [24, 22];

    var hexInput = hexGroup.add("edittext", undefined, "#FFFFFF");
    hexInput.preferredSize = [65, 22];

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
    paletteLabel.alignment = ["left", "top"];

    var colorGridGroup = swatchesPanel.add("group");
    colorGridGroup.alignment = ["fill", "top"];
    colorGridGroup.orientation = "column";
    colorGridGroup.alignChildren = ["center", "top"]; // Centrado para evitar espacios vacíos laterales
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

    function getDynamicColumns() {
        var w = MIN_PANEL_WIDTH;
        try {
            if (win.size && win.size[0] > 0) w = win.size[0];
            else if (swatchesPanel.size && swatchesPanel.size[0] > 0) w = swatchesPanel.size[0];
        } catch (e) { }

        var marginsVal = 20;
        if (win.margins) {
            if (typeof win.margins === "number") marginsVal = win.margins * 2 + 15;
            else if (win.margins.left !== undefined) marginsVal = win.margins.left + win.margins.right + 15;
        }
        var usableW = w - marginsVal;
        var columns = Math.floor(usableW / (SWATCH_WIDTH + SWATCH_SPACING));
        return Math.max(MIN_COLUMNS, columns);
    }

    function syncHexWithSelection() {
        var color = getColorFromSelection();
        if (color) { lockedHex = color; lockHex = true; hexInput.text = color; }
        else { lockedHex = null; lockHex = false; }
    }

    hexInput.onActivate = function () { syncHexWithSelection(); };
    hexInput.onChanging = function () { if (lockHex && lockedHex) this.text = lockedHex; };
    hexInput.onChange = function () { if (lockHex && lockedHex) this.text = lockedHex; };

    function refreshSwatches() {
        while (colorGridGroup.children.length > 0) colorGridGroup.remove(colorGridGroup.children[0]);
        var idx = allPalettesData.activePaletteIndex;
        var pals = allPalettesData.palettes;
        if (pals.length === 0) return;
        var pal = pals[idx];
        var colors = pal.colors || [];
        paletteLabel.text = pal.name.toUpperCase() + " (" + colors.length + ")";

        var columns = getDynamicColumns();
        var rowGroup = null;

        for (var i = 0; i < colors.length; i++) {
            if (i % columns === 0) {
                rowGroup = colorGridGroup.add("group");
                rowGroup.alignment = ["fill", "top"];
                rowGroup.orientation = "row";
                rowGroup.spacing = SWATCH_SPACING;
            }
            (function (hex, index) {
                var swatchGroup = rowGroup.add("group");
                swatchGroup.orientation = "stack";
                var swatchBtn = swatchGroup.add("button", undefined, "");
                swatchBtn.preferredSize = [SWATCH_WIDTH, SWATCH_HEIGHT];
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
            })(colors[i], i);
        }
        win.layout.layout(true);
    }

    btnEyedropper.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        var picked = pickColor();
        if (picked) {
            allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(picked);
            hexInput.text = picked;
            savePreferences(allPalettesData);
            refreshSwatches();
        }
        clearFocus();
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
        var picked = pickColor();
        if (picked) {
            allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(picked);
            savePreferences(allPalettesData); refreshSwatches();
        }
        clearFocus();
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
        if (jsonFile) {
            try {
                jsonFile.open("r");
                var content = jsonFile.read();
                jsonFile.close();

                var newPalette;
                try {
                    newPalette = JSON.parse(content);
                } catch (e) {
                    // Fallback para JSONs mal formados (comunes en scripts antiguos)
                    newPalette = eval("(" + content + ")");
                }

                if (!newPalette) throw new Error("Archivo vacío o no válido.");

                if (newPalette.palettes && Array.isArray(newPalette.palettes)) {
                    if (confirm("¿Reemplazar todas las paletas con las importadas?\n(Cancelar para añadir al final)")) {
                        allPalettesData = newPalette;
                    } else {
                        for (var k = 0; k < newPalette.palettes.length; k++) {
                            allPalettesData.palettes.push(newPalette.palettes[k]);
                        }
                    }
                } else if (newPalette.name && Array.isArray(newPalette.colors)) {
                    allPalettesData.palettes.push(newPalette);
                } else {
                    alert("Formato .json no válido.");
                    return;
                }

                allPalettesData.activePaletteIndex = allPalettesData.palettes.length - 1;
                savePreferences(allPalettesData);
                populateDropdown();
                if (allPalettesData.palettes.length > 0) {
                    dropdown.selection = allPalettesData.activePaletteIndex;
                }
                refreshSwatches();
                alert("Importación completada.");
            } catch (e) {
                alert("Error procesando archivo .json:\n" + e);
            }
        }
        clearFocus();
    };

    btnExport.onClick = function () {
        exportPalettesToFile(allPalettesData);
        clearFocus();
    };

    btnNew.onClick = function () {
        var newName = prompt("Nombre nueva paleta:", "Paleta " + (allPalettesData.palettes.length + 1));
        if (newName) {
            allPalettesData.palettes.push({ name: newName, colors: [] });
            allPalettesData.activePaletteIndex = allPalettesData.palettes.length - 1;
            savePreferences(allPalettesData); populateDropdown(); refreshSwatches();
        }
        clearFocus();
    };
    btnDel.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        if (confirm("¿Eliminar paleta?")) {
            allPalettesData.palettes.splice(allPalettesData.activePaletteIndex, 1);
            allPalettesData.activePaletteIndex = Math.max(0, allPalettesData.activePaletteIndex - 1);
            savePreferences(allPalettesData); populateDropdown(); refreshSwatches();
        }
        clearFocus();
    };
    btnRen.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        var current = allPalettesData.palettes[allPalettesData.activePaletteIndex].name;
        var newName = prompt("Renombrar:", current);
        if (newName && newName !== current) {
            allPalettesData.palettes[allPalettesData.activePaletteIndex].name = newName;
            savePreferences(allPalettesData); populateDropdown(); refreshSwatches();
        }
        clearFocus();
    };

    var lastColumns = 0;
    win.onResizing = win.onResize = function () {
        try {
            var currentColumns = getDynamicColumns();
            if (currentColumns !== lastColumns) { lastColumns = currentColumns; refreshSwatches(); }
            this.layout.layout(true);
        } catch (e) { }
    };

    allPalettesData = loadPalettes();
    populateDropdown();
    lastColumns = getDynamicColumns();
    refreshSwatches();
    updateStrokeState();
    syncHexWithSelection();

    if (win instanceof Window) { win.center(); win.show(); } else { win.layout.layout(true); }
})(this);