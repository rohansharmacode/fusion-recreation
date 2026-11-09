// Sample scripts and add-ins shipped with the recreation (written for it, in the style of Fusion's
// JavaScript API samples). They appear under Source > Samples in Scripts and Add-Ins.

const HELLO = `// Hello Design
// Shows a message with information about the active design.

function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    try {
        const design = adsk.fusion.Design.cast(app.activeProduct);
        const root = design.rootComponent;
        const msg = [
            "Design: " + app.activeDocument.name,
            "Bodies: " + root.bRepBodies.count,
            "Sketches: " + root.sketches.count,
            "Timeline features: " + design.timeline.count,
            "User parameters: " + design.userParameters.count,
        ].join("\\n");
        app.log(msg);
        ui.messageBox(msg, "Hello Design");
    } catch (e) {
        ui.messageBox("Failed:\\n" + e.message);
    }
}
`;

const PLATE = `// Mounting Plate
// Builds a parametric mounting plate: user parameters, a centre rectangle with driving
// dimensions, four mounting holes, an extrude and rounded vertical corners.
// (Like the Fusion API, numbers are centimetres; strings are expressions.)

function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    try {
        const design = adsk.fusion.Design.cast(app.activeProduct);
        const root = design.rootComponent;
        const vi = adsk.core.ValueInput;
        const params = design.userParameters;
        const param = (name, expr, comment) => params.itemByName(name) || params.add(name, vi.createByString(expr), "mm", comment);
        param("plate_width", "80 mm", "Plate width");
        param("plate_depth", "50 mm", "Plate depth");
        param("plate_thickness", "6 mm", "Plate thickness");
        param("hole_dia", "6.5 mm", "Mounting hole diameter");

        const sketch = root.sketches.add(root.xYConstructionPlane);
        sketch.name = "Plate Outline";
        const lines = sketch.sketchCurves.sketchLines;
        const rect = lines.addCenterPointRectangle(sketch.originPoint, adsk.core.Point3D.create(4, 2.5, 0));
        const dims = sketch.sketchDimensions;
        const DO = adsk.fusion.DimensionOrientations;
        const w = dims.addDistanceDimension(rect.item(0).startSketchPoint, rect.item(0).endSketchPoint, DO.HorizontalDimensionOrientation, adsk.core.Point3D.create(0, -3, 0));
        w.parameter.expression = "plate_width";
        const d = dims.addDistanceDimension(rect.item(1).startSketchPoint, rect.item(1).endSketchPoint, DO.VerticalDimensionOrientation, adsk.core.Point3D.create(5, 0, 0));
        d.parameter.expression = "plate_depth";

        // four holes 8 mm in from the corners
        const circles = sketch.sketchCurves.sketchCircles;
        for (const [x, y] of [[3.2, 1.7], [-3.2, 1.7], [-3.2, -1.7], [3.2, -1.7]]) {
            const c = circles.addByCenterRadius(adsk.core.Point3D.create(x, y, 0), 0.325);
            dims.addDiameterDimension(c, adsk.core.Point3D.create(x + 0.5, y + 0.5, 0)).parameter.expression = "hole_dia";
        }

        // the plate is the largest profile (the rectangle with the four holes)
        let plate = null;
        for (const p of sketch.profiles) {
            if (!plate || p.areaProperties().area > plate.areaProperties().area) plate = p;
        }
        const extrudes = root.features.extrudeFeatures;
        const ext = extrudes.addSimple(plate, vi.createByString("plate_thickness"), adsk.fusion.FeatureOperations.NewBodyFeatureOperation);
        ext.name = "Plate";
        const body = ext.bodies.item(0);
        body.name = "Mounting Plate";

        // round the four vertical corner edges
        const corners = adsk.core.ObjectCollection.create();
        for (const e of body.edges) {
            const g = e.geometry;
            const vertical = g.curveType === adsk.core.Curve3DTypes.Line3DCurveType && Math.abs(g.startPoint.x - g.endPoint.x) < 1e-6 && Math.abs(g.startPoint.y - g.endPoint.y) < 1e-6;
            if (vertical && Math.abs(Math.abs(g.startPoint.x) - 4) < 1e-6) corners.add(e);
        }
        const fillets = root.features.filletFeatures;
        const input = fillets.createInput();
        input.addConstantRadiusEdgeSet(corners, vi.createByString("4 mm"), true);
        fillets.add(input).name = "Corner Rounds";

        app.log("Plate volume: " + (body.volume * 1000).toFixed(1) + " mm^3");
    } catch (e) {
        ui.messageBox("Failed:\\n" + e.message);
    }
}
`;

const KNOB = `// Revolved Knob
// Sketches a half-section on the XZ plane and revolves it around the Z axis, then chamfers
// the top rim.

function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    try {
        const design = adsk.fusion.Design.cast(app.activeProduct);
        const root = design.rootComponent;
        const P = adsk.core.Point3D.create;
        const sketch = root.sketches.add(root.xZConstructionPlane);
        sketch.name = "Knob Section";
        const lines = sketch.sketchCurves.sketchLines;
        // half-section in sketch coordinates (x = radius, y = height), in centimetres
        const pts = [P(0, 0, 0), P(2.0, 0, 0), P(2.0, 0.8, 0), P(1.5, 1.6, 0), P(0.6, 1.6, 0), P(0.6, 2.6, 0), P(0, 2.6, 0)];
        const first = lines.addByTwoPoints(pts[0], pts[1]);
        let prev = first;
        for (let i = 2; i < pts.length; i++) prev = lines.addByTwoPoints(prev.endSketchPoint, pts[i]);
        lines.addByTwoPoints(prev.endSketchPoint, first.startSketchPoint);

        const revolves = root.features.revolveFeatures;
        const input = revolves.createInput(sketch.profiles.item(0), root.zConstructionAxis, adsk.fusion.FeatureOperations.NewBodyFeatureOperation);
        input.setAngleExtent(false, adsk.core.ValueInput.createByString("360 deg"));
        const rev = revolves.add(input);
        rev.name = "Knob";
        const body = rev.bodies.item(0);
        body.name = "Knob";

        // chamfer the circular edge at the top of the stem
        const top = adsk.core.ObjectCollection.create();
        for (const e of body.edges) {
            const g = e.geometry;
            if (g.curveType === adsk.core.Curve3DTypes.Circle3DCurveType && Math.abs(g.center.z - 2.6) < 1e-6) top.add(e);
        }
        if (top.count) {
            const ch = root.features.chamferFeatures;
            const ci = ch.createInput2();
            ci.chamferEdgeSets.addEqualDistanceChamferEdgeSet(top, adsk.core.ValueInput.createByString("1 mm"), true);
            ch.add(ci);
        }
    } catch (e) {
        ui.messageBox("Failed:\\n" + e.message);
    }
}
`;

const BOLT_CIRCLE = `// Bolt Circle
// Makes a flange disc, cuts one hole near the rim from a sketch on the top face, then
// patterns the hole feature six times around the Z axis.

function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    try {
        const design = adsk.fusion.Design.cast(app.activeProduct);
        const root = design.rootComponent;
        const vi = adsk.core.ValueInput;
        const ops = adsk.fusion.FeatureOperations;

        const base = root.sketches.add(root.xYConstructionPlane);
        base.name = "Flange";
        base.sketchCurves.sketchCircles.addByCenterRadius(base.originPoint, 5);
        base.sketchCurves.sketchCircles.addByCenterRadius(base.originPoint, 1.5);
        // the ring between the two circles
        let ring = null;
        for (const p of base.profiles) if (!ring || p.areaProperties().area > ring.areaProperties().area) ring = p;
        const flange = root.features.extrudeFeatures.addSimple(ring, vi.createByString("12 mm"), ops.NewBodyFeatureOperation);
        flange.bodies.item(0).name = "Flange";

        // one bolt hole, sketched on the top face (model point -> sketch space)
        const top = flange.endFaces.item(0);
        const sk = root.sketches.add(top);
        sk.name = "Bolt Hole";
        const c = sk.modelToSketchSpace(adsk.core.Point3D.create(3.6, 0, 1.2));
        sk.sketchCurves.sketchCircles.addByCenterRadius(c, 0.45);
        let hole = null;
        for (const p of sk.profiles) if (!hole || p.areaProperties().area < hole.areaProperties().area) hole = p;
        const cut = root.features.extrudeFeatures.createInput(hole, ops.CutFeatureOperation);
        cut.setAllExtent(adsk.fusion.ExtentDirections.NegativeExtentDirection);
        const cutFeature = root.features.extrudeFeatures.add(cut);
        cutFeature.name = "Bolt Hole";

        // pattern the hole feature around Z
        const ents = adsk.core.ObjectCollection.create();
        ents.add(cutFeature);
        const pats = root.features.circularPatternFeatures;
        const pi = pats.createInput(ents, root.zConstructionAxis);
        pi.quantity = vi.createByReal(6);
        pi.totalAngle = vi.createByString("360 deg");
        pats.add(pi).name = "Bolt Circle";
    } catch (e) {
        ui.messageBox("Failed:\\n" + e.message);
    }
}
`;

const REPORT = `// Body Report
// Lists every body with its volume, mass and bounding box in the log and a message box.

function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    const design = adsk.fusion.Design.cast(app.activeProduct);
    const um = design.unitsManager;
    const bodies = design.rootComponent.bRepBodies;
    if (bodies.count === 0) {
        ui.messageBox("The design has no bodies yet.", "Body Report");
        return;
    }
    const rows = [];
    for (let i = 0; i < bodies.count; i++) {
        const b = bodies.item(i);
        const bb = b.boundingBox;
        const size = [bb.maxPoint.x - bb.minPoint.x, bb.maxPoint.y - bb.minPoint.y, bb.maxPoint.z - bb.minPoint.z].map((v) => um.formatInternalValue(v, "mm", false));
        const props = b.physicalProperties;
        rows.push(b.name + ": " + (b.volume * 1000).toFixed(2) + " mm^3, " + (props.mass * 1000).toFixed(2) + " g, " + size.join(" x ") + " mm");
    }
    for (const r of rows) app.log(r);
    ui.messageBox(rows.join("\\n"), "Body Report");
}
`;

const PARAM = `// Change Parameter
// Asks for a parameter name and a new expression, then updates the design.
// Shows the asynchronous input box (await ui.inputBoxAsync) of this recreation.

async function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    const design = adsk.fusion.Design.cast(app.activeProduct);
    const names = [];
    for (const p of design.allParameters) names.push(p.name + " = " + p.expression);
    if (!names.length) {
        ui.messageBox("The design has no parameters yet. Run the Mounting Plate sample first.", "Change Parameter");
        return;
    }
    const [name, cancelled] = await ui.inputBoxAsync("Parameter name (" + names.slice(0, 6).join(", ") + (names.length > 6 ? ", ..." : "") + ")", "Change Parameter", names[0].split(" = ")[0]);
    if (cancelled) return;
    const param = design.allParameters.itemByName(name.trim());
    if (!param) {
        ui.messageBox('There is no parameter named "' + name + '".', "Change Parameter");
        return;
    }
    const [expr, cancelled2] = await ui.inputBoxAsync("New expression for " + param.name, "Change Parameter", param.expression);
    if (cancelled2) return;
    param.expression = expr;
    app.log(param.name + " = " + param.expression + " (" + design.unitsManager.formatInternalValue(param.value, param.unit) + ")");
}
`;

const QUICK_BOX = `// Quick Box Add-In
// Adds a "Quick Box" command to UTILITIES > ADD-INS (and the S toolbox search). The command
// dialog has Width / Depth / Height inputs; OK sketches a centre rectangle and extrudes it.
// stop() removes the command again.

const CMD_ID = "QuickBoxAddInCmd";
const PANELS = ["SolidScriptsAddinsPanel", "AutomationScriptsAddinsPanel"];

function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    let def = ui.commandDefinitions.itemById(CMD_ID);
    if (!def) def = ui.commandDefinitions.addButtonDefinition(CMD_ID, "Quick Box", "Creates a box centred on the origin.");
    def.commandCreated.add((args) => {
        const cmd = args.command;
        const inputs = cmd.commandInputs;
        inputs.addValueInput("width", "Width", "mm", adsk.core.ValueInput.createByString("40 mm"));
        inputs.addValueInput("depth", "Depth", "mm", adsk.core.ValueInput.createByString("30 mm"));
        inputs.addValueInput("height", "Height", "mm", adsk.core.ValueInput.createByString("20 mm"));
        cmd.execute.add((e) => {
            const ins = e.command.commandInputs;
            const w = ins.itemById("width").value, d = ins.itemById("depth").value;
            const design = adsk.fusion.Design.cast(app.activeProduct);
            const root = design.rootComponent;
            const sk = root.sketches.add(root.xYConstructionPlane);
            sk.name = "Quick Box Sketch";
            sk.sketchCurves.sketchLines.addCenterPointRectangle(sk.originPoint, adsk.core.Point3D.create(w / 2, d / 2, 0));
            const ext = root.features.extrudeFeatures.addSimple(sk.profiles.item(0), adsk.core.ValueInput.createByString(ins.itemById("height").expression), adsk.fusion.FeatureOperations.NewBodyFeatureOperation);
            ext.name = "Quick Box";
        });
    });
    for (const id of PANELS) {
        const panel = ui.allToolbarPanels.itemById(id);
        if (panel && !panel.controls.itemById(CMD_ID)) panel.controls.addCommand(def);
    }
    if (!context.IsApplicationStartup) app.log("Quick Box is in UTILITIES > ADD-INS");
}

function stop(context) {
    const ui = adsk.core.Application.get().userInterface;
    for (const id of PANELS) {
        const panel = ui.allToolbarPanels.itemById(id);
        const ctl = panel && panel.controls.itemById(CMD_ID);
        if (ctl) ctl.deleteMe();
    }
    const def = ui.commandDefinitions.itemById(CMD_ID);
    if (def) def.deleteMe();
}
`;

const NEW_SCRIPT = (name, desc) => `// ${name}
// ${desc || "Description"}

function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    try {
        const design = adsk.fusion.Design.cast(app.activeProduct);
        const root = design.rootComponent;
        // your code here, for example:
        // const sketch = root.sketches.add(root.xYConstructionPlane);
        // sketch.sketchCurves.sketchCircles.addByCenterRadius(adsk.core.Point3D.create(0, 0, 0), 2);
        ui.messageBox("Hello script");
    } catch (e) {
        ui.messageBox("Failed:\\n" + e.message);
    }
}
`;
const NEW_ADDIN = (name, desc) => `// ${name}
// ${desc || "Description"}

const CMD_ID = "${String(name).replace(/[^\w]/g, "") || "NewAddIn"}Cmd";

function run(context) {
    const app = adsk.core.Application.get();
    const ui = app.userInterface;
    const def = ui.commandDefinitions.itemById(CMD_ID) || ui.commandDefinitions.addButtonDefinition(CMD_ID, "${String(name).replace(/"/g, "")}", "${String(desc || "").replace(/"/g, "")}");
    def.commandCreated.add((args) => {
        args.command.execute.add(() => {
            ui.messageBox("${String(name).replace(/"/g, "")} command executed");
        });
    });
    const panel = ui.allToolbarPanels.itemById("SolidScriptsAddinsPanel");
    if (panel && !panel.controls.itemById(CMD_ID)) panel.controls.addCommand(def);
}

function stop(context) {
    const ui = adsk.core.Application.get().userInterface;
    const panel = ui.allToolbarPanels.itemById("SolidScriptsAddinsPanel");
    const ctl = panel && panel.controls.itemById(CMD_ID);
    if (ctl) ctl.deleteMe();
    const def = ui.commandDefinitions.itemById(CMD_ID);
    if (def) def.deleteMe();
}
`;
export const TEMPLATE = { script: NEW_SCRIPT, addin: NEW_ADDIN };

const S = (id, name, description, source, isAddIn = false) => ({ id: `sample:${id}`, name, description, source, isAddIn, origin: "sample", author: "Fusion Recreation", version: "1.0.0", language: "javascript", targetOS: 2, created: 0, modified: 0 });
export const SAMPLES = [
  S("HelloDesign", "HelloDesign", "Shows a message with information about the active design.", HELLO),
  S("MountingPlate", "MountingPlate", "Builds a parametric mounting plate: user parameters, a dimensioned sketch, an extrude with four holes and corner fillets.", PLATE),
  S("RevolvedKnob", "RevolvedKnob", "Revolves a half-section sketched on the XZ plane around the Z axis and chamfers the top rim.", KNOB),
  S("BoltCircle", "BoltCircle", "Makes a flange, cuts a hole from a sketch on its top face and patterns the hole six times around the Z axis.", BOLT_CIRCLE),
  S("BodyReport", "BodyReport", "Lists every body with its volume, mass and bounding box.", REPORT),
  S("ChangeParameter", "ChangeParameter", "Asks for a parameter and a new expression and updates the design (asynchronous input boxes).", PARAM),
  S("QuickBoxAddIn", "QuickBoxAddIn", "Add-in: adds a Quick Box command with Width / Depth / Height inputs to UTILITIES > ADD-INS.", QUICK_BOX, true),
];
