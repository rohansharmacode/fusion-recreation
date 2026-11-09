// Original cross-section schematics for the plastic dialogs (Boss, Lip, Snap Fit): they explain the
// letter labels of the inputs (A, B, ...) like the pictures in Fusion's dialogs. Plain line art.
const W = 236, H = 112;
// each schematic gets its own marker id (one shared id repeated in every SVG is invalid and breaks the
// arrows of the others when the first SVG is hidden)
let markerN = 0;
const wrap = (inner) => (`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" class="pl-schematic">`
  + '<defs><marker id="plArr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L6 3L0 6z" fill="#1f86e0"/></marker></defs>'
  + `<g fill="none" stroke="#5b6773" stroke-width="1">${inner}</g></svg>`).replaceAll("plArr", `plArr${++markerN}`);
const dim = (x1, y1, x2, y2, t, tx, ty) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#1f86e0" marker-start="url(#plArr)" marker-end="url(#plArr)"/>`
  + `<text x="${tx}" y="${ty}" fill="#1f86e0" stroke="none" font-size="10" font-family="Arial" text-anchor="middle">${t}</text>`;
const solid = (d) => `<path d="${d}" fill="#dfe6ee" stroke="#5b6773"/>`;

export const SCHEMATICS = {
  // two walls (top: side 1, bottom: side 2), boss columns meeting at the sketch plane
  boss: wrap(
    solid("M10 8H226V18H130V48H106V18H10Z") + solid("M10 104H226V94H128V64H108V94H10Z")
    + '<path d="M118 6V106" stroke="#9aa5b1" stroke-dasharray="3 2"/><path d="M4 56H232" stroke="#e08a1f" stroke-dasharray="4 2"/>'
    + '<path d="M113 18V48M123 18V48" stroke="#5b6773"/><path d="M114 64V94M122 64V94"/>'
    + dim(106, 52, 130, 52, "D₁", 150, 46) + dim(113, 26, 123, 26, "B₁", 140, 30) + dim(108, 60, 128, 60, "D₂", 150, 70)
    + dim(200, 64, 200, 94, "G₂", 214, 82) + dim(84, 48, 84, 56, "O", 72, 55)
    + '<text x="20" y="34" fill="#5b6773" stroke="none" font-size="9" font-family="Arial">Side 1</text><text x="20" y="84" fill="#5b6773" stroke="none" font-size="9" font-family="Arial">Side 2</text>'
  ),
  // wall section with the lip on the rim (A height, B width) and the mating groove (E clearance)
  lip: wrap(
    solid("M60 104V50H100V30H112V50H120V104Z") + solid("M60 8V44H96V26H116V44H120V8Z")
    + '<path d="M40 50H140" stroke="#e08a1f" stroke-dasharray="4 2"/>'
    + dim(150, 30, 150, 50, "A", 162, 44) + dim(100, 62, 112, 62, "B", 106, 76) + dim(96, 20, 100, 20, "E", 92, 18)
    + '<text x="128" y="96" fill="#5b6773" stroke="none" font-size="9" font-family="Arial">Lip</text><text x="128" y="16" fill="#5b6773" stroke="none" font-size="9" font-family="Arial">Groove</text>'
  ),
  // cantilever beam with the hook at its tip and the groove in the mating wall
  snap: wrap(
    solid("M20 6H120V16H44V86L62 76V70L44 70Z") + solid("M70 50H112V106H70Z")
    + '<path d="M66 40H66" /><path d="M10 40H226" stroke="#e08a1f" stroke-dasharray="4 2"/><path d="M66 62H74V80H66Z" fill="#fff" stroke="#5b6773"/>'
    + dim(32, 22, 32, 86, "B", 24, 58) + dim(36, 18, 44, 18, "A", 40, 30) + dim(44, 94, 62, 94, "F", 53, 106)
    + dim(140, 70, 140, 86, "H", 150, 82) + dim(74, 58, 112, 58, "J", 96, 54)
    + '<text x="150" y="28" fill="#5b6773" stroke="none" font-size="9" font-family="Arial">Hook body</text><text x="150" y="104" fill="#5b6773" stroke="none" font-size="9" font-family="Arial">Groove body</text>'
  ),
};
