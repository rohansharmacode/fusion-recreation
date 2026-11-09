// Original flat icons for the navigation bar (20x20). Not Autodesk artwork: drawn for this
// recreation to sit in the same places/sizes as Fusion's nav bar items (grey line work with a
// blue accent where Fusion uses one).
const G = "#6b6b6b"; // line grey
const D = "#4a4a4a"; // darker grey
const B = "#1f7ae0"; // accent blue
const S = (body, vb = 20) => `<svg class="nb-ico" viewBox="0 0 ${vb} ${vb}" width="20" height="20" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const NAV_ICONS = {
  // ellipse ring around a vertical blue axis
  FreeOrbitCommand: S(`<ellipse cx="10" cy="10.6" rx="7.4" ry="3.6" stroke="${D}" stroke-width="1.4"/>
    <path d="M14.6 6.2l2.1 1.6-2.4 1.1" stroke="${D}" stroke-width="1.3"/>
    <path d="M10 2.2v15.6" stroke="${B}" stroke-width="1.6"/>`),
  ConstrainedOrbitCommand: S(`<ellipse cx="10" cy="10.6" rx="7.4" ry="3.6" stroke="${D}" stroke-width="1.4"/>
    <path d="M14.6 6.2l2.1 1.6-2.4 1.1" stroke="${D}" stroke-width="1.3"/>
    <path d="M10 2.2v15.6" stroke="${B}" stroke-width="1.6" stroke-dasharray="2.2 1.6"/>`),
  // a blue screen in a dark frame with a small tab on top
  LookAtCommand: S(`<path d="M3.6 6.4h3.2l1.2-2.2h3.6" stroke="${D}" stroke-width="1.4"/>
    <rect x="2.6" y="6.6" width="14.8" height="10" rx="0.8" fill="${D}"/>
    <rect x="4.2" y="8.2" width="11.6" height="6.8" fill="${B}"/>`),
  // open hand
  PanCommand: S(`<path d="M6.3 10.6V5.4a1.05 1.05 0 0 1 2.1 0v4.4V3.9a1.05 1.05 0 0 1 2.1 0v5.7V4.7a1.05 1.05 0 0 1 2.1 0v5.3-3.1a1.05 1.05 0 0 1 2.1 0v5.4c0 3.5-2.1 5.8-5 5.8-2.2 0-3.4-1-4.6-3L3.8 11.3c-.5-.8-.2-1.6.5-1.9.6-.3 1.3 0 1.7.6l.3.6" stroke="#8c8c8c" stroke-width="1.1"/>`),
  // magnifier with +/- mark
  ZoomCommand: S(`<circle cx="8" cy="10.6" r="4.6" stroke="${D}" stroke-width="1.4"/>
    <path d="M11.4 14l3.6 3.6" stroke="${D}" stroke-width="2"/>
    <path d="M13.4 3.4h4M15.4 1.4v4M13.6 7.4h3.6" stroke="${D}" stroke-width="1.2"/>`),
  // dashed frame with a magnifier inside
  FitCommand: S(`<rect x="1.8" y="1.8" width="16.4" height="16.4" stroke="${D}" stroke-width="1.1" stroke-dasharray="1.6 1.3"/>
    <circle cx="9.2" cy="9.2" r="5.6" fill="#f2f2f2" stroke="${D}" stroke-width="1.4"/>
    <path d="M13.3 13.3l4.2 4.2" stroke="#8a5a2b" stroke-width="2"/>`),
  ZoomWindowCommand: S(`<rect x="2.2" y="2.2" width="11" height="9.4" stroke="${G}" stroke-width="1.1" stroke-dasharray="1.6 1.4"/>
    <circle cx="11.6" cy="11.6" r="3.8" stroke="${D}" stroke-width="1.4"/>
    <path d="M14.4 14.4l3.2 3.2" stroke="#8a5a2b" stroke-width="2"/>`),
  // monitor
  ViewDisplayCommand: S(`<rect x="1.8" y="3.2" width="16.4" height="11.4" rx="0.8" fill="${D}"/>
    <rect x="3.1" y="4.5" width="13.8" height="8.6" fill="#b9b9b9"/>
    <path d="M10 14.6v2.4M6.4 17.4h7.2" stroke="${D}" stroke-width="1.4"/>`),
  // 3x3 grid
  ViewLayoutGridCommand: S(`<rect x="3" y="3" width="14" height="14" stroke="${D}" stroke-width="1.3"/>
    <path d="M7.7 3v14M12.3 3v14M3 7.7h14M3 12.3h14" stroke="${D}" stroke-width="1.3"/>`),
  // 2x2 viewports
  SplitViewWindowSyncCommand: S(`<rect x="2.4" y="3.4" width="15.2" height="13.2" fill="${G}"/>
    <rect x="3.7" y="4.7" width="5.6" height="4.6" fill="#e2e2e2"/><rect x="10.7" y="4.7" width="5.6" height="4.6" fill="#e2e2e2"/>
    <rect x="3.7" y="10.7" width="5.6" height="4.6" fill="#e2e2e2"/><rect x="10.7" y="10.7" width="5.6" height="4.6" fill="#e2e2e2"/>`),
  fullScreen: `<svg viewBox="0 0 16 16" width="16" height="16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" stroke="#3c3c3c" stroke-width="1.2"/><path d="M1.5 4.6h13" stroke="#3c3c3c" stroke-width="1.2"/><path d="M5.8 7l4.4 4.4M10.2 7 5.8 11.4" stroke="#3c3c3c" stroke-width="1.3"/></svg>`,
  caret: `<svg class="nb-caret-ico" viewBox="0 0 8 8" width="7" height="7"><path d="M1 2.4h6L4 5.8z" fill="currentColor"/></svg>`,
};
