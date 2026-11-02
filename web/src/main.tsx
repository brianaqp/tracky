import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import * as accounts from "./routes/accounts";
import * as budget from "./routes/budget";
import * as incomes from "./routes/incomes";
import * as installments from "./routes/installments";
import { ErrorPage, Layout } from "./routes/layout";
import * as overview from "./routes/overview";
import * as tickets from "./routes/tickets";
import * as transactions from "./routes/transactions";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    ErrorBoundary: ErrorPage,
    children: [
      { index: true, loader: overview.loader, Component: overview.default },
      { path: "movimientos", loader: transactions.loader, Component: transactions.default },
      { path: "presupuesto", loader: budget.loader, Component: budget.default },
      { path: "ingresos", loader: incomes.loader, Component: incomes.default },
      { path: "meses", loader: installments.loader, Component: installments.default },
      { path: "cuentas", loader: accounts.loader, Component: accounts.default },
      { path: "tickets", loader: tickets.loader, Component: tickets.default },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
