// Which browser the QA and verify scripts launch through playwright-core.
//   Windows (default): the installed Microsoft Edge, channel "msedge".
//   Other platforms, or QA_BROWSER=chromium: playwright-core's own Chromium. QA_CHROMIUM_PATH sets
//   executablePath; otherwise playwright-core finds the build from `npx playwright-core install chromium`.
//
//   chromium.launch(browserOptions({ headless: true, args: [...] }))
export function browserOptions(extra = {}) {
  const useChromium = process.platform !== "win32" || process.env.QA_BROWSER === "chromium";
  if (!useChromium) return { channel: "msedge", ...extra };
  return process.env.QA_CHROMIUM_PATH ? { executablePath: process.env.QA_CHROMIUM_PATH, ...extra } : { ...extra };
}
