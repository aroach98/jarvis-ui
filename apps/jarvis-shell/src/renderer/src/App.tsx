import { useEffect } from "react";
import type { PanelId } from "@jarvis-ui/shared";
import { TopPanel } from "./panels/TopPanel";
import { LeftPanel } from "./panels/LeftPanel";
import { CorePanel } from "./panels/CorePanel";
import { RightPanel } from "./panels/RightPanel";

const PANEL_COMPONENTS: Record<PanelId, () => JSX.Element> = {
  top: TopPanel,
  left: LeftPanel,
  core: CorePanel,
  right: RightPanel,
};

function resolvePanelFromQuery(): PanelId {
  const panel = new URLSearchParams(window.location.search).get("panel");
  return panel && panel in PANEL_COMPONENTS ? (panel as PanelId) : "core";
}

/**
 * The stylesheet is rem-based against a 10px root; scale the root font-size
 * per display so the portrait flanks and the landscape middles all render
 * readable at desk distance. (Not CSS zoom — zoom multiplies vh lengths too,
 * which made every panel overflow its display.)
 */
function useHudScale(): void {
  useEffect(() => {
    const apply = (): void => {
      // An earlier build scaled via body zoom; a hot-reloaded window keeps that
      // inline style forever unless it's explicitly cleared, and zoom × 100vh
      // pushes the panel off the bottom of the screen.
      (document.body.style as CSSStyleDeclaration & { zoom: string }).zoom = "";
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Tall portrait flanks sit further out on the desk — boost them extra.
      const portraitBoost = Math.max(w, h) / Math.min(w, h) > 2 ? 1.3 : 1;
      const scale = Math.min(2.4, Math.max(1, (Math.min(w, h) / 1000) * portraitBoost));
      document.documentElement.style.fontSize = `${10 * scale}px`;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
}

export function App(): JSX.Element {
  useHudScale();
  const Panel = PANEL_COMPONENTS[resolvePanelFromQuery()];
  return <Panel />;
}
