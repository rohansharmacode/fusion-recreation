// ADD-INS panel links: Fusion API (APIHelpCommand) opens Autodesk's public Fusion API reference in a
// new tab and the in-app reference of this recreation's JavaScript script API; Design and Make
// Marketplace (ExchangeAppStoreCommand) opens the public store page (address from the install's
// string table, Link_AppStore_URL).
import { el, esc, palette, openUrl, GL } from "./ui.js";

export const API_URL = "https://help.autodesk.com/cloudhelp/ENU/Fusion-360-API/files/WelcomeToSDK_UM.htm";
export const STORE_URL = "https://apps.autodesk.com/FUSION/en/Home/Index";

// Reference of the supported subset (kept in step with scripts/core.js, scripts/fusion.js, scripts/host.js).
export const REFERENCE = [
  { ns: "adsk", name: "adsk", desc: "Global namespace passed to every script.", members: [
    ["core / fusion", "Namespaces (adsk.core, adsk.fusion)."], ["terminate()", "Ends the script (no-op: scripts end when run() returns)."], ["autoTerminate(bool)", "Kept for compatibility."],
    ["log(message)", "Writes to the Output pane of the code editor."], ["doEvents()", "Returns true."],
  ] },
  { ns: "core", name: "Application", desc: "adsk.core.Application.get() returns the running application.", members: [
    ["activeProduct", "The active Design (cast with adsk.fusion.Design.cast)."], ["activeDocument", "The open design: name, isModified, isSaved, save(description)."],
    ["userInterface", "The UserInterface object."], ["version", "Version string."], ["log(message, level)", "Writes to the Output pane (LogLevels)."], ["currentUser", "displayName / userName."],
  ] },
  { ns: "core", name: "UserInterface", desc: "Message boxes, selections, command definitions and toolbar panels.", members: [
    ["messageBox(text, title, buttons, icon)", "Fusion-styled message box. OK-only boxes do not block and return DialogOK; other button types ask the browser's confirm dialog and return the answer."],
    ["messageBoxAsync(...)", "Recreation extension: await ui.messageBoxAsync(...) for a Fusion-styled box with real button results."],
    ["inputBox(prompt, title, default)", "Browser prompt; returns [value, cancelled] (also .value / .cancelled)."], ["inputBoxAsync(prompt, title, default)", "Recreation extension: Fusion-styled input box (await)."],
    ["activeSelections", "count, item(i).entity, add(entity), clear()."], ["selectEntity(prompt, filter)", "Returns the current canvas selection that matches the filter (e.g. 'Bodies', 'PlanarFaces', 'Edges')."],
    ["selectEntityAsync(prompt, filter)", "Recreation extension: waits for a canvas click (Esc cancels)."], ["commandDefinitions", "addButtonDefinition(id, name, tooltip), itemById(id)."],
    ["allToolbarPanels.itemById(id).controls.addCommand(def)", "Adds an add-in command to a panel dropdown (e.g. 'SolidScriptsAddinsPanel')."], ["workspaces / activeWorkspace", "The Design workspace (toolbarPanels)."],
  ] },
  { ns: "core", name: "Point3D / Vector3D / Matrix3D", desc: "Geometry values in centimetres (Fusion's internal unit).", members: [
    ["Point3D.create(x, y, z)", "copy(), distanceTo(p), vectorTo(p), translateBy(v), transformBy(m), asArray()."], ["Vector3D.create(x, y, z)", "length, normalize(), scaleBy(s), add(v), crossProduct(v), dotProduct(v), angleTo(v)."],
    ["Matrix3D.create()", "setToRotation(angle, axis, origin), translation, transformBy(m), invert(), getCell(r, c)."], ["Point2D / Vector2D / BoundingBox3D", "Also available."],
  ] },
  { ns: "core", name: "ValueInput / ObjectCollection", desc: "Feature inputs and lists.", members: [
    ["ValueInput.createByReal(v)", "A number in internal units (cm, radians)."], ["ValueInput.createByString(expr)", "An expression such as '10 mm', 'width / 2', '30 deg'."],
    ["ObjectCollection.create()", "add(o), item(i), count, contains(o), removeByIndex(i), clear(), asArray()."],
  ] },
  { ns: "core", name: "Enums", desc: "", members: [
    ["DialogResults", "DialogOK, DialogCancel, DialogYes, DialogNo."], ["MessageBoxButtonTypes", "OKButtonType, OKCancelButtonType, YesNoButtonType, YesNoCancelButtonType."],
    ["MessageBoxIconTypes", "NoIconIconType, QuestionIconType, InformationIconType, WarningIconType, CriticalIconType."], ["SurfaceTypes / Curve3DTypes", "Face and edge geometry types."],
  ] },
  { ns: "fusion", name: "Design", desc: "adsk.fusion.Design.cast(app.activeProduct) (the old adsk.fusion.Design(product) form works too).", members: [
    ["rootComponent / activeComponent", "The root Component."], ["userParameters", "add(name, ValueInput, units, comment), itemByName(name), item(i), count."],
    ["allParameters", "User and model parameters (itemByName('d1').expression = '20 mm')."], ["timeline", "count, item(i), markerPosition, moveToBeginning(), moveToEnd()."],
    ["unitsManager", "evaluateExpression(expr, units), formatInternalValue(v, units), defaultLengthUnits, convert(v, from, to)."], ["computeAll()", "Recomputes the timeline."],
  ] },
  { ns: "fusion", name: "Component", desc: "The root component (this recreation has one component).", members: [
    ["sketches", "add(planarEntity) on an origin plane, construction plane or planar BRepFace."], ["features", "extrudeFeatures, revolveFeatures, filletFeatures, chamferFeatures, shellFeatures, holeFeatures, combineFeatures, mirrorFeatures, rectangularPatternFeatures, circularPatternFeatures, moveFeatures."],
    ["bRepBodies", "count, item(i), itemByName(name)."], ["constructionPlanes", "createInput() -> setByOffset(plane, offset) / setByAngle(line, angle, plane) / setByTwoPlanes(a, b); add(input)."],
    ["xYConstructionPlane / xZConstructionPlane / yZConstructionPlane", "Origin planes."], ["xConstructionAxis / yConstructionAxis / zConstructionAxis", "Origin axes."], ["boundingBox / physicalProperties", "Of all bodies."],
  ] },
  { ns: "fusion", name: "Sketch", desc: "Points are in sketch space, centimetres.", members: [
    ["sketchCurves.sketchLines", "addByTwoPoints(p1, p2), addTwoPointRectangle(p1, p2), addCenterPointRectangle(center, corner), addThreePointRectangle(p1, p2, p3)."],
    ["sketchCurves.sketchCircles", "addByCenterRadius(center, radius), addByTwoPoints(p1, p2), addByThreePoints(p1, p2, p3)."],
    ["sketchCurves.sketchArcs", "addByThreePoints(start, mid, end), addByCenterStartSweep(center, start, sweepAngle)."], ["sketchCurves.sketchFittedSplines", "add(ObjectCollection of points)."],
    ["sketchPoints", "add(point)."], ["profiles", "count, item(i); Profile.areaProperties() -> area, centroid, perimeter."],
    ["geometricConstraints", "addHorizontal, addVertical, addParallel, addPerpendicular, addCoincident, addEqual, addTangent, addConcentric, addMidPoint, addCollinear, addSymmetry, addFix."],
    ["sketchDimensions", "addDistanceDimension(p1, p2, orientation, textPoint), addDiameterDimension(circle, textPoint), addRadialDimension, addAngularDimension -> .parameter.expression."],
    ["originPoint, name, isVisible", "Sketch points passed as SketchPoint connect curves."], ["modelToSketchSpace(p) / sketchToModelSpace(p)", "Coordinate conversion."], ["deleteMe()", "Removes the sketch."],
  ] },
  { ns: "fusion", name: "ExtrudeFeatures", desc: "", members: [
    ["addSimple(profile, distance, operation)", "One-side distance extrude."], ["createInput(profile, operation)", "ExtrudeFeatureInput: setDistanceExtent(isSymmetric, distance), setOneSideExtent(extentDef, direction, taper), setTwoSidesExtent(e1, e2), setAllExtent(direction), setSymmetricExtent(d, isFullLength), taperAngle, participantBodies, startExtent (OffsetStartDefinition.create(offset))."],
    ["add(input)", "Creates the feature (a failed compute throws and leaves the timeline unchanged)."], ["ExtrudeFeature", "name, bodies, startFaces, endFaces, sideFaces, timelineObject, healthState, deleteMe()."],
    ["FeatureOperations", "JoinFeatureOperation, CutFeatureOperation, IntersectFeatureOperation, NewBodyFeatureOperation."], ["DistanceExtentDefinition / ThroughAllExtentDefinition", "Extent definitions."],
  ] },
  { ns: "fusion", name: "Other features", desc: "", members: [
    ["revolveFeatures.createInput(profile, axis, operation)", "setAngleExtent(isSymmetric, angle), setTwoSideAngleExtent(a1, a2); add(input). Without an extent the revolve is full."],
    ["filletFeatures.createInput()", "addConstantRadiusEdgeSet(edges, radius, isTangentChain) (or edgeSetInputs.addConstantRadiusEdgeSet); add(input)."],
    ["chamferFeatures.createInput2()", "chamferEdgeSets.addEqualDistanceChamferEdgeSet(edges, distance, isTangentChain); createInput(edges, chain).setToEqualDistance(d)."],
    ["shellFeatures.createInput(faces|bodies, isTangentChain)", "insideThickness / outsideThickness; add(input)."], ["holeFeatures.createSimpleInput(diameter)", "createCounterboreInput, createCountersinkInput; setPositionBySketchPoint(s), setDistanceExtent(depth), setAllExtent(); add(input)."],
    ["combineFeatures.createInput(target, tools)", "operation (Join / Cut / Intersect), isKeepToolBodies; add(input)."], ["mirrorFeatures.createInput(bodies, plane)", "add(input)."],
    ["rectangularPatternFeatures.createInput(entities, dirOne, qty, distance, PatternDistanceType)", "setDirectionTwo(dir, qty, distance); entities may be bodies or features."],
    ["circularPatternFeatures.createInput(entities, axis)", "quantity, totalAngle; add(input)."], ["moveFeatures.createInput2(bodies)", "defineAsTranslateXYZ(x, y, z), defineAsTranslate(v), defineAsRotate(origin axis, angle), defineAsFreeMove(matrix); add(input)."],
  ] },
  { ns: "fusion", name: "BRepBody / BRepFace / BRepEdge", desc: "", members: [
    ["BRepBody", "name, isVisible, volume (cm^3), area, faces, edges, vertices, boundingBox, physicalProperties (mass kg, centerOfMass), material, appearance, deleteMe()."],
    ["BRepFace", "area, centroid, pointOnFace, geometry.surfaceType (normal / radius / axis), edges, body."], ["BRepEdge", "length, pointOnEdge, startVertex, endVertex, geometry.curveType (radius / center), faces, body."],
  ] },
  { ns: "fusion", name: "Parameters", desc: "", members: [
    ["UserParameter", "name, expression (get/set), value (internal units), unit, comment, deleteMe()."], ["ModelParameter", "name, expression (get/set), value, role."],
  ] },
  { ns: "core", name: "Add-ins and commands", desc: "Add-ins keep running after run() until Stop. Commands appear in their panel's dropdown and in the S toolbox.", members: [
    ["CommandDefinition", "id, name, tooltip, commandCreated.add(handler), execute(), deleteMe()."], ["Command", "commandInputs, execute, inputChanged, validateInputs, destroy events; okButtonText."],
    ["CommandInputs", "addValueInput, addBoolValueInput, addStringValueInput, addIntegerSpinnerCommandInput, addFloatSpinnerCommandInput, addDropDownCommandInput (listItems.add), addSelectionInput (addSelectionFilter, setSelectionLimits), addTextBoxCommandInput, addGroupCommandInput, itemById(id)."],
    ["Not available", "executePreview (no live preview of script commands), palettes, custom graphics, C++ / Python."],
  ] },
];

export function openReference(app) {
  const list = el("div", { class: "mg-ref-list" });
  const detail = el("div", { class: "mg-ref-detail" });
  const q = el("input", { type: "search", class: "mg-sm-search", placeholder: "Search the script API", "data-input": "search" });
  const link = el("a", { href: API_URL, target: "_blank", rel: "noopener", class: "mg-link", "data-action": "open-fusion-api" }, "Autodesk Fusion API reference ", el("span", { html: GL.external }));
  let cur = 0;
  const render = () => {
    const t = q.value.trim().toLowerCase();
    list.innerHTML = "";
    REFERENCE.forEach((c, i) => {
      const hit = !t || `${c.name} ${c.desc} ${c.members.map((m) => m.join(" ")).join(" ")}`.toLowerCase().includes(t);
      if (!hit) return;
      const b = el("button", { type: "button", class: `mg-ref-item${i === cur ? " sel" : ""}`, "data-ref": c.name }, el("span", { class: "mg-ref-ns", text: `adsk.${c.ns === "adsk" ? "" : c.ns}`.replace(/\.$/, "") }), el("span", { text: c.name }));
      b.addEventListener("click", () => { cur = i; render(); });
      list.append(b);
    });
    const c = REFERENCE[cur];
    detail.innerHTML = `<h3>${esc(c.name)}</h3>${c.desc ? `<p>${esc(c.desc)}</p>` : ""}<table class="mg-ref-table">${c.members.filter((m) => !t || m.join(" ").toLowerCase().includes(t) || c.name.toLowerCase().includes(t)).map((m) => `<tr><td><code>${esc(m[0])}</code></td><td>${esc(m[1])}</td></tr>`).join("")}</table>`;
  };
  q.addEventListener("input", render);
  const intro = el("div", { class: "mg-ref-intro", html: "Scripts in this recreation are <b>JavaScript</b> and use the Fusion API object model: numbers are centimetres and radians, strings are expressions. Each run is one undo step; the features appear in the timeline and browser like ones made with the toolbar." });
  const body = el("div", { class: "mg-ref" }, el("div", { class: "mg-ref-top" }, q, link), intro, el("div", { class: "mg-ref-main" }, list, detail));
  const p = palette(app, { id: "script-api-reference", title: "Script API Reference", body, width: 780, height: 540, foot: false, className: "mg-ref-pal" });
  render();
  return p;
}

export function registerLinks(app) {
  app.commands.register({
    id: "APIHelpCommand", label: "Fusion API", kind: "ui",
    tooltip: "Opens the reference documentation for the programming interface.",
    run: (a, ctx = {}) => {
      if (!ctx.noTab) openUrl(a, API_URL, "Fusion API reference");
      return openReference(a);
    },
  });
  app.commands.register({
    id: "ExchangeAppStoreCommand", label: "Design and Make Marketplace", kind: "ui",
    tooltip: "Browses apps and add-ins you can install.",
    run: (a) => { if (openUrl(a, STORE_URL, "Design and Make Marketplace")) a.toast("Design and Make Marketplace opened in a new tab", "info", 1800); },
  });
}
