import { isRouteErrorResponse, NavLink, Outlet, useNavigation, useRouteError } from "react-router";

const NAV = [
  ["/", "Resumen"],
  ["/movimientos", "Movimientos"],
  ["/presupuesto", "Presupuesto"],
  ["/meses", "Meses"],
  ["/cuentas", "Cuentas"],
  ["/tickets", "Tickets"],
] as const;

export function Layout() {
  const navigation = useNavigation();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">tracky</span>
        <nav>
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>
          ))}
        </nav>
      </header>
      <main className={navigation.state === "loading" ? "loading" : undefined}>
        <Outlet />
      </main>
    </div>
  );
}

export function ErrorPage() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${typeof error.data === "string" ? error.data : error.statusText}`
    : error instanceof Error ? error.message : String(error);
  return (
    <div className="shell">
      <main>
        <h1>No se pudo cargar</h1>
        <p className="muted">{message}</p>
        <p className="muted">¿Está corriendo el servidor (bun start) y coincide ALLOW_TOKEN?</p>
      </main>
    </div>
  );
}
