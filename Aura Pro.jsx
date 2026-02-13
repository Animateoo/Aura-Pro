// @target aftereffects
/**
 * Aura Pro v18.5 - Fixed Save System
 * - Botón Eyedropper: Abre selector de color y agrega a paleta
 * - HEX bloqueado con selección, editable sin selección
 * - Botón Swap: Intercambia Fill/Stroke
 */

(function AuraProV18_5(thisObj) {
    var SCRIPT_NAME = "Aura Pro";
    var SETTINGS_SECTION = "AuraProSettings_v18";
    var SETTINGS_KEY = "palettesDataJSON";
    var SWATCH_WIDTH = 40;
    var SWATCH_SPACING = 4;
    var SWATCH_HEIGHT = 28;
    var MIN_PANEL_WIDTH = 260;
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
    // Guarda internamente en las preferencias de AE para persistencia entre sesiones
    function savePreferences(data) {
        try {
            var strData = JSON.stringify(data);
            if (typeof strData !== "string" || strData.length === 0) return;
            app.settings.saveSetting(SETTINGS_SECTION, SETTINGS_KEY, strData);
        } catch (e) {
            // Silencioso para no molestar en cada clic
        }
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

                // Texto
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

                // Shape layer
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
            // Texto
            if (lyr instanceof TextLayer) {
                var t = lyr.property("Source Text").value;
                if (t.fillColor) return rgb01ToHex(t.fillColor);
            }
            // Shape
            else if (lyr.matchName === "ADBE Vector Layer") {
                var find = function (gr) {
                    for (var i = 1; i <= gr.numProperties; i++) {
                        var p = gr.property(i);
                        if (p.matchName === "ADBE Vector Graphic - Fill")
                            return p.property("Color").value;
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

    // ==========================
    // SWAP FILL/STROKE
    // ==========================
    function swapFillStroke() {
        var comp = app.project.activeItem;
        if (!(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
            alert("Selecciona al menos una capa de texto o forma.");
            return;
        }

        app.beginUndoGroup(SCRIPT_NAME + " - Swap Fill/Stroke");
        try {
            for (var i = 0; i < comp.selectedLayers.length; i++) {
                var lyr = comp.selectedLayers[i];

                // Texto
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

                // Shape layer
                if (lyr.matchName === "ADBE Vector Layer") {
                    var swapColors = function (grp) {
                        var fillColor = null;
                        var strokeColor = null;
                        var fillProp = null;
                        var strokeProp = null;

                        // Buscar Fill y Stroke
                        for (var j = 1; j <= grp.numProperties; j++) {
                            var p = grp.property(j), name = p.matchName;
                            if (name === "ADBE Vector Graphic - Fill") {
                                try {
                                    fillProp = p.property("Color");
                                    fillColor = [fillProp.value[0], fillProp.value[1], fillProp.value[2]];
                                } catch (e) { }
                            } else if (name === "ADBE Vector Graphic - Stroke") {
                                try {
                                    strokeProp = p.property("Color");
                                    strokeColor = [strokeProp.value[0], strokeProp.value[1], strokeProp.value[2]];
                                } catch (e) { }
                            }
                        }

                        // Intercambiar
                        if (fillColor && strokeColor && fillProp && strokeProp) {
                            try {
                                fillProp.setValue(strokeColor);
                                strokeProp.setValue(fillColor);
                            } catch (e) { }
                        }

                        // Recursivo en grupos
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
        } catch (e) {
            alert("Error intercambiando colores:\n" + e);
        }
        app.endUndoGroup();
    }

    // ==========================
    // UI
    // ==========================
    var win = (thisObj instanceof Panel) ?
        thisObj :
        new Window("palette", SCRIPT_NAME, undefined, { resizeable: true });

    win.alignment = ["fill", "fill"];
    win.minimumSize = [MIN_PANEL_WIDTH, 180];
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.spacing = 6;
    win.margins = 8;

    // ---------- TOP BAR: EYEDROPPER + HEX + BOTONES ----------
    var topBar = win.add("group");
    topBar.orientation = "row";
    topBar.spacing = 4;
    topBar.alignment = ["fill", "top"];

    // EYEDROPPER + HEX GROUP
    var hexGroup = topBar.add("group");
    hexGroup.orientation = "row";
    hexGroup.spacing = 2;
    hexGroup.alignment = ["left", "center"];

    var btnEyedropper = hexGroup.add("button", undefined, "◉");
    btnEyedropper.preferredSize = [28, 24];
    btnEyedropper.helpTip = "Cuentagotas: Selecciona color y agrégalo a la paleta";

    var hexLabel = hexGroup.add("statictext", undefined, "HEX");
    hexLabel.preferredSize = [30, 20];

    var hexInput = hexGroup.add("edittext", undefined, "#FFFFFF");
    hexInput.preferredSize = [80, 24];
    hexInput.helpTip = "Muestra el color en HEX.\nCon selección: bloqueado (solo copia).\nSin selección: editable para escribir/pastear HEX.";

    var btnAddHex = hexGroup.add("button", undefined, "+");
    btnAddHex.preferredSize = [28, 24];
    btnAddHex.helpTip = "Añadir color (selección o HEX).";

    // Separador flexible
    topBar.add("panel", undefined, undefined, { borderStyle: "none" }).preferredSize = [1, 20];

    var btnStroke = topBar.add("button", undefined, "◧");
    btnStroke.preferredSize = [32, 28];
    btnStroke.helpTip = "Modo Trazo";

    var btnSwap = topBar.add("button", undefined, "⇄");
    btnSwap.preferredSize = [32, 28];
    btnSwap.helpTip = "Intercambiar Fill/Stroke";

    // ---------- PANEL DE COLORES ----------
    var swatchesPanel = win.add("panel", undefined, "Colores");
    swatchesPanel.alignment = ["fill", "fill"];
    swatchesPanel.minimumSize = [MIN_PANEL_WIDTH - 16, 80];
    swatchesPanel.alignChildren = ["fill", "top"];
    swatchesPanel.margins = 8;

    var colorGridGroup = swatchesPanel.add("group");
    colorGridGroup.alignment = ["fill", "top"];
    colorGridGroup.minimumSize = [MIN_PANEL_WIDTH - 32, 50];
    colorGridGroup.orientation = "column";
    colorGridGroup.alignChildren = ["left", "top"];
    colorGridGroup.spacing = 4;

    // ---------- BOTTOM BAR: PALETAS ----------
    var bottomBar = win.add("group");
    bottomBar.alignment = ["fill", "top"];
    bottomBar.orientation = "row";
    bottomBar.spacing = 4;
    bottomBar.margins = [0, 4, 0, 0];

    var dropdown = bottomBar.add("dropdownlist");
    dropdown.alignment = ["fill", "center"];
    dropdown.preferredSize.width = 100;

    var btnNew = bottomBar.add("button", undefined, "+");
    btnNew.preferredSize = [28, 24];
    btnNew.helpTip = "Nueva paleta";

    var btnDel = bottomBar.add("button", undefined, "−");
    btnDel.preferredSize = [28, 24];
    btnDel.helpTip = "Eliminar paleta";

    var btnRen = bottomBar.add("button", undefined, "✎");
    btnRen.preferredSize = [28, 24];
    btnRen.helpTip = "Renombrar paleta";

    var isStrokeMode = false;

    function updateStrokeState() {
        if (isStrokeMode) {
            btnStroke.text = "◨";
            btnStroke.helpTip = "Modo Trazo ACTIVO";
        } else {
            btnStroke.text = "◧";
            btnStroke.helpTip = "Activar modo Trazo";
        }
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
        var panelWidth;
        try {
            panelWidth = swatchesPanel.size ? swatchesPanel.size[0] : MIN_PANEL_WIDTH;
            if (!panelWidth || panelWidth < 50) {
                panelWidth = win.size ? win.size[0] : MIN_PANEL_WIDTH;
            }
        } catch (e) {
            panelWidth = MIN_PANEL_WIDTH;
        }

        var usableWidth = Math.max(panelWidth - 16, SWATCH_WIDTH + SWATCH_SPACING);
        var columns = Math.floor(usableWidth / (SWATCH_WIDTH + SWATCH_SPACING));
        return Math.max(MIN_COLUMNS, columns);
    }

    // ==========================
    // SYNC HEX CON SELECCIÓN + BLOQUEO
    // ==========================
    function syncHexWithSelection() {
        var color = getColorFromSelection();
        if (color) {
            lockedHex = color;
            lockHex = true;
            hexInput.text = color;
        } else {
            lockedHex = null;
            lockHex = false;
        }
    }

    function updateHexEnabledState() {
        // Truco: mantenemos enabled=true para poder seleccionar/copiar texto
    }

    // HEX: cuando gana foco, sincronizamos con selección
    hexInput.onActivate = function () {
        syncHexWithSelection();
        updateHexEnabledState();
    };

    // Bloquear edición cuando hay selección (lockHex=true)
    hexInput.onChanging = function () {
        if (lockHex && lockedHex) {
            this.text = lockedHex; // revierte cualquier intento de escribir
        }
    };
    hexInput.onChange = function () {
        if (lockHex && lockedHex) {
            this.text = lockedHex;
        }
    };

    // ==========================
    // SWATCHES
    // ==========================
    function refreshSwatches() {
        while (colorGridGroup.children.length > 0)
            colorGridGroup.remove(colorGridGroup.children[0]);

        var idx = allPalettesData.activePaletteIndex;
        var pals = allPalettesData.palettes;
        if (pals.length === 0) return;

        var pal = pals[idx];
        var colors = pal.colors || [];
        swatchesPanel.text = pal.name + " (" + colors.length + ")";

        var columns = getDynamicColumns();
        var rowGroup = null;

        for (var i = 0; i < colors.length; i++) {
            if (i % columns === 0) {
                rowGroup = colorGridGroup.add("group");
                rowGroup.alignment = ["fill", "top"];
                rowGroup.orientation = "row";
                rowGroup.alignChildren = ["left", "top"];
                rowGroup.spacing = SWATCH_SPACING;
            }

            (function (hex, index) {
                var swatchGroup = rowGroup.add("group");
                swatchGroup.orientation = "stack";

                var swatchBtn = swatchGroup.add("button", undefined, "");
                swatchBtn.preferredSize = [SWATCH_WIDTH, SWATCH_HEIGHT];
                swatchBtn.helpTip = hex.toUpperCase();

                swatchBtn.onDraw = function () {
                    var g = this.graphics;
                    var b = g.newBrush(g.BrushType.SOLID_COLOR, hexToRgb01(hex));
                    g.rectPath(0, 0, this.size[0], this.size[1]);
                    g.fillPath(b);
                };

                swatchBtn.onClick = function () {
                    hexInput.text = hex;
                    var ks = ScriptUI.environment.keyboardState;
                    if (ks.shiftKey) {
                        applyColorToSelection(hex, true);
                        isStrokeMode = false;
                        updateStrokeState();
                    } else if (ks.ctrlKey || ks.metaKey) {
                        applyColorToSelection(hex, false);
                        isStrokeMode = false;
                        updateStrokeState();
                    } else {
                        if (isStrokeMode) {
                            applyColorToSelection(hex, true);
                            isStrokeMode = false;
                            updateStrokeState();
                        } else {
                            applyColorToSelection(hex, false);
                        }
                    }
                };

                var delBtn = swatchGroup.add("button", undefined, "×");
                delBtn.preferredSize = [14, 14];
                delBtn.alignment = ["right", "top"];
                delBtn.helpTip = "Eliminar " + hex;
                delBtn.visible = false;

                swatchGroup.addEventListener("mouseover", function () { delBtn.visible = true; });
                swatchGroup.addEventListener("mouseout", function () { delBtn.visible = false; });

                delBtn.onClick = function () {
                    allPalettesData.palettes[idx].colors.splice(index, 1);
                    savePreferences(allPalettesData); // Auto-save interno
                    refreshSwatches();
                };

            })(colors[i], i);
        }

        win.layout.layout(true);
    }

    // ==========================
    // BOTÓN EYEDROPPER (CUENTAGOTAS)
    // ==========================
    btnEyedropper.onClick = function () {
        if (allPalettesData.palettes.length === 0) {
            alert("Crea una paleta primero.");
            return;
        }

        var picked = pickColor();
        if (picked) {
            allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(picked);
            hexInput.text = picked;
            savePreferences(allPalettesData); // Auto-save interno
            refreshSwatches();
        }
    };

    // ==========================
    // BOTÓN "+" (SELECCIÓN > HEX > COLORPICKER)
    // ==========================
    btnAddHex.onClick = function () {
        syncHexWithSelection();
        updateHexEnabledState();

        if (allPalettesData.palettes.length === 0) {
            alert("Crea una paleta primero.");
            return;
        }

        // 1) Si hay selección con color
        if (lockHex && lockedHex) {
            var selColor = lockedHex;
            allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(selColor);
            hexInput.text = selColor;
            savePreferences(allPalettesData);
            refreshSwatches();
            return;
        }

        // 2) NO hay selección → modo HEX manual
        var hexValue = (hexInput.text || "").trim();
        if (hexValue.length > 0) {
            if (hexValue.charAt(0) !== "#")
                hexValue = "#" + hexValue;

            var cleanHex = hexValue.replace(/[^0-9a-f#]/gi, "");
            if (cleanHex.length === 7 || cleanHex.length === 4) {
                if (cleanHex.length === 4) {
                    cleanHex = "#" + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2] + cleanHex[3] + cleanHex[3];
                }
                var normalized = cleanHex.toUpperCase();
                allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(normalized);
                hexInput.text = normalized;
                savePreferences(allPalettesData);
                refreshSwatches();
                return;
            }
        }

        // 3) HEX inválido → colorPicker
        var picked = pickColor();
        if (picked) {
            allPalettesData.palettes[allPalettesData.activePaletteIndex].colors.push(picked);
            hexInput.text = picked;
            savePreferences(allPalettesData);
            refreshSwatches();
        } else {
            alert("Selecciona un objeto con color, escribe un HEX válido o elige un color en el selector.");
        }
    };

    // ==========================
    // EVENTOS CONTROLES INFERIORES
    // ==========================
    dropdown.onChange = function () {
        allPalettesData.activePaletteIndex = dropdown.selection.index;
        savePreferences(allPalettesData);
        refreshSwatches();
    };

    btnStroke.onClick = function () {
        isStrokeMode = !isStrokeMode;
        updateStrokeState();
    };

    btnSwap.onClick = function () {
        swapFillStroke();
    };

    btnNew.onClick = function () {
        var newName = prompt("Nombre nueva paleta:", "Mi Paleta " + (allPalettesData.palettes.length + 1));
        if (newName) {
            allPalettesData.palettes.push({ name: newName, colors: [] });
            allPalettesData.activePaletteIndex = allPalettesData.palettes.length - 1;
            savePreferences(allPalettesData);
            populateDropdown();
            refreshSwatches();
        }
    };

    btnDel.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        var pIndex = allPalettesData.activePaletteIndex;
        if (confirm("¿Eliminar paleta '" + allPalettesData.palettes[pIndex].name + "'?")) {
            allPalettesData.palettes.splice(pIndex, 1);
            allPalettesData.activePaletteIndex = Math.max(0, pIndex - 1);
            savePreferences(allPalettesData);
            populateDropdown();
            refreshSwatches();
        }
    };

    btnRen.onClick = function () {
        if (allPalettesData.palettes.length === 0) return;
        var pIndex = allPalettesData.activePaletteIndex;
        var current = allPalettesData.palettes[pIndex].name;
        var newName = prompt("Renombrar paleta:", current);
        if (newName && newName !== current) {
            allPalettesData.palettes[pIndex].name = newName;
            savePreferences(allPalettesData);
            populateDropdown();
            refreshSwatches();
        }
    };

    // ==========================
    // RESIZE DINÁMICO
    // ==========================
    var lastColumns = 0;
    win.onResizing = win.onResize = function () {
        try {
            var currentColumns = getDynamicColumns();
            if (currentColumns !== lastColumns) {
                lastColumns = currentColumns;
                refreshSwatches();
            }
            this.layout.layout(true);
            this.layout.resize();
        } catch (e) { }
    };

    // ==========================
    // INIT
    // ==========================
    allPalettesData = loadPalettes(); // Intenta cargar de preferencias internas
    populateDropdown();
    lastColumns = getDynamicColumns();
    refreshSwatches();
    updateStrokeState();
    syncHexWithSelection();
    updateHexEnabledState();

    if (win instanceof Window) {
        win.center();
        win.show();
    } else {
        win.layout.layout(true);
    }

})(this);