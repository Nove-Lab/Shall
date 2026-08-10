import { Outlet } from "react-router";

export function ControlLayout() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Outlet />
    </div>
  );
}
