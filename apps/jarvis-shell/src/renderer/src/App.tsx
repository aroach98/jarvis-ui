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

export function App(): JSX.Element {
  const Panel = PANEL_COMPONENTS[resolvePanelFromQuery()];
  return <Panel />;
}
