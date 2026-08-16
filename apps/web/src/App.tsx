import { Navigate, Route, Routes } from "react-router";
import { ControlOverview } from "@/control/ControlOverview";
import { PanelDetail } from "@/control/PanelDetail";
import { ReviewBundlePage } from "@/control/review-queue/ReviewBundlePage";
import { HomeScreen } from "@/home/HomeScreen";
import { SettingsScreen } from "@/settings/SettingsScreen";
import { ControlLayout } from "@/shell/ControlLayout";
import { ShellLayout } from "@/shell/ShellLayout";
import { SpecPlane } from "@/spec/SpecPlane";

/**
 * Everything inside a project is scoped by its id, so a link is enough to put
 * someone on the same panel or node — no hidden "current project" state.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/p/:projectId" element={<ShellLayout />}>
        <Route index element={<Navigate to="control" replace />} />
        <Route path="control" element={<ControlLayout />}>
          <Route index element={<ControlOverview />} />
          {/* THE CARD IS A PAGE OF ITS OWN AND NOT A PANEL STATE, so a bundle
              can be linked to — from another bundle that shares a node, from a
              Spec-plane round trip, from somebody's notes. It is written above
              `:panelId` because it is the more specific of the two; react-router
              would rank it there anyway, and a reader should not have to know
              that to see which route wins. */}
          <Route
            path="review-queue/:bundleId"
            element={<ReviewBundlePage />}
          />
          <Route path=":panelId" element={<PanelDetail />} />
        </Route>
        <Route path="spec" element={<SpecPlane />} />
        <Route path="settings" element={<SettingsScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
