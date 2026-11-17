import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "./components/ui";
import { AppRoutes } from "./routes";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";

export default function App() {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <ToastProvider>
        <BrowserRouter>
          <RouteErrorBoundary>
            <AppRoutes />
          </RouteErrorBoundary>
        </BrowserRouter>
      </ToastProvider>
    </TooltipPrimitive.Provider>
  );
}
