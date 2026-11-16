import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "./components/ui";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </TooltipPrimitive.Provider>
  );
}
