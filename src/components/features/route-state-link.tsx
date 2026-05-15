"use client";

import * as React from "react";

const ROUTE_STATE_CHANGE_EVENT = "boxops:route-state-change";

function shouldUseBrowserNavigation(
  event: React.MouseEvent<HTMLAnchorElement>,
) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.currentTarget.target === "_blank" ||
    event.currentTarget.hasAttribute("download")
  );
}

function isSamePathHref(href: string) {
  try {
    const targetUrl = new URL(href, window.location.href);

    return (
      targetUrl.origin === window.location.origin &&
      targetUrl.pathname === window.location.pathname
    );
  } catch {
    return false;
  }
}

export function pushRouteStateHref(href: string, replace = false) {
  const historyMethod = replace ? "replaceState" : "pushState";

  window.history[historyMethod](window.history.state, "", href);
  window.dispatchEvent(new Event(ROUTE_STATE_CHANGE_EVENT));
}

export type RouteStateLinkProps =
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    replace?: boolean;
  };

// Same-path query state for operational panels. Use this instead of App Router
// navigation when opening/closing block_id or edit_block_id would destroy scroll.
export const RouteStateLink = React.forwardRef<
  HTMLAnchorElement,
  RouteStateLinkProps
>(function RouteStateLink(
  { href, onClick, replace = false, ...props },
  ref,
) {
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);

        if (shouldUseBrowserNavigation(event) || !isSamePathHref(href)) {
          return;
        }

        event.preventDefault();
        pushRouteStateHref(href, replace);
      }}
      ref={ref}
      {...props}
    />
  );
});

export type RouteStateButtonProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    href: string;
    replace?: boolean;
  };

export const RouteStateButton = React.forwardRef<
  HTMLButtonElement,
  RouteStateButtonProps
>(function RouteStateButton(
  { href, onClick, replace = false, type = "button", ...props },
  ref,
) {
  return (
    <button
      data-route-state-href={href}
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        pushRouteStateHref(href, replace);
      }}
      ref={ref}
      type={type}
      {...props}
    />
  );
});

export function useRouteQueryParam({
  initialValue,
  paramName,
  validValues,
}: {
  initialValue: string | null;
  paramName: string;
  validValues: string[];
}) {
  const validValueSet = React.useMemo(
    () => new Set(validValues),
    [validValues],
  );
  const getCurrentValue = React.useCallback(() => {
    const value = new URL(window.location.href).searchParams.get(paramName);

    return value && validValueSet.has(value) ? value : null;
  }, [paramName, validValueSet]);
  const [value, setValue] = React.useState(() =>
    initialValue && validValueSet.has(initialValue) ? initialValue : null,
  );

  React.useEffect(() => {
    const syncValue = () => {
      setValue(getCurrentValue());
    };

    syncValue();
    window.addEventListener("popstate", syncValue);
    window.addEventListener(ROUTE_STATE_CHANGE_EVENT, syncValue);

    return () => {
      window.removeEventListener("popstate", syncValue);
      window.removeEventListener(ROUTE_STATE_CHANGE_EVENT, syncValue);
    };
  }, [getCurrentValue]);

  return value;
}
