import { NuqsAdapter } from "nuqs/adapters/react-router/v7"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"

import { Navigation } from "@/components/NavRail"
import { LocaleProvider } from "@/i18n/LocaleProvider"
import type { Locale } from "@/i18n/locale"
import { DashboardPage } from "@/routes/dashboard"
import { OrdersPage } from "@/routes/orders"
import { MenusPage } from "@/routes/menus"
import { RecipesPage } from "@/routes/recipes"
import { ProductionPage } from "@/routes/production"
import { ProcurementPage } from "@/routes/procurement"
import { SettingsPage, ValidationPage } from "@/routes/routes"

/**
 * The app shell, once per locale. `/` is Arabic and `/en` is English — the same
 * section tree mounted under two parents rather than an optional `:lang?`
 * segment, which would match `/menus` as a language and break every unprefixed
 * route.
 */
function LocaleShell({ locale }: { locale: Locale }) {
  return (
    <LocaleProvider locale={locale}>
      {/* RTL row order: the rail sits on the start edge, the page fills the rest. */}
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-background lg:flex-row landscape:flex-row">
        <Navigation />
        <Outlet />
      </div>
    </LocaleProvider>
  )
}

/** The section tree, relative — it resolves under whichever locale mounts it. */
const sections = (locale: Locale) => [
  <Route key={`${locale}-home`} index element={<DashboardPage />} />,
  <Route key={`${locale}-orders`} path="orders" element={<OrdersPage />} />,
  <Route key={`${locale}-order`} path="orders/:orderId" element={<OrdersPage />} />,
  <Route key={`${locale}-menus`} path="menus" element={<MenusPage />} />,
  <Route key={`${locale}-menu`} path="menus/:menuId" element={<MenusPage />} />,
  <Route key={`${locale}-recipes`} path="recipes" element={<RecipesPage />} />,
  <Route key={`${locale}-recipe`} path="recipes/:recipeId" element={<RecipesPage />} />,
  <Route key={`${locale}-production`} path="production" element={<ProductionPage />} />,
  <Route key={`${locale}-procurement`} path="procurement" element={<ProcurementPage />} />,
  <Route key={`${locale}-validation`} path="validation" element={<ValidationPage />} />,
  <Route key={`${locale}-settings`} path="settings" element={<SettingsPage />} />,
]

export default function App() {
  return (
    // Mount under whatever `base` this build was made for ("/" or "/stagging/").
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <NuqsAdapter>
        <Routes>
          <Route path="/" element={<LocaleShell locale="ar" />}>
            {sections("ar")}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="/en" element={<LocaleShell locale="en" />}>
            {sections("en")}
            <Route path="*" element={<Navigate to="/en" replace />} />
          </Route>
        </Routes>
      </NuqsAdapter>
    </BrowserRouter>
  )
}
