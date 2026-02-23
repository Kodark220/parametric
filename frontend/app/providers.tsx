"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { WalletProvider } from "@/lib/genlayer/WalletProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  // Use useState to ensure QueryClient is only created once per component lifecycle
  // This prevents the client from being recreated on every render
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    // Some wallet extensions conflict and throw an uncaught error:
    // "Cannot redefine property: ethereum".
    // Ignore only this known extension-originated runtime error so app UI remains usable.
    const handleWindowError = (event: ErrorEvent) => {
      const message = event.message || "";
      const source = event.filename || "";
      const isExtensionError = source.startsWith("chrome-extension://");
      const isEthereumRedefine =
        message.includes("Cannot redefine property: ethereum");

      if (isExtensionError && isEthereumRedefine) {
        event.preventDefault();
      }
    };

    window.addEventListener("error", handleWindowError);
    return () => {
      window.removeEventListener("error", handleWindowError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        {children}
      </WalletProvider>
      <Toaster
        position="top-right"
        theme="dark"
        richColors
        closeButton
        offset="80px"
        toastOptions={{
          style: {
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            color: 'hsl(var(--foreground))',
            boxShadow: '0 8px 32px hsl(var(--background) / 0.8)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
